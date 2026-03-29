// ══ REPORTS ══

// ══════════════════════════════════════════════════════
// DEPOSIT MONTH LOGIC — SINGLE SOURCE OF TRUTH
// Rule: deposit belongs to the ENTRY month of the tenant.
//
// Entry month = month(start_date), BUT:
// If start_date is the LAST DAY of a month → entry is NEXT month.
// Rule: each deposit row counted in month(deposit_received_date)
// ══════════════════════════════════════════════════════

function _pickDepositForReport(depRows, monYM) {
  // Each deposit counted in its deposit_received_date month
  // RULE: refunded deposits are EXCLUDED (they went back to tenant)
  var rows = Array.isArray(depRows) ? depRows : [];
  return rows.reduce(function(s, d) {
    if(d.status === 'refunded') return s;        // مُرتجع → لا يُحتسب
    var rd = String(d.deposit_received_date || '').slice(0, 7);
    return rd === monYM ? s + (Number(d.amount) || 0) : s;
  }, 0);
}

// ══════════════════════════════════════════════════════
// MONTHLY REPORT
// Collected = rent paid + deposit paid this month
// Uncollected = rent only (deposit is extra, not rent)
// ══════════════════════════════════════════════════════

async function loadMonthly(btn) {
  // Auto-fill current month if empty
  var rpmEl = document.getElementById('rpm');
  if(rpmEl && !rpmEl.value) {
    var now = new Date();
    rpmEl.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  var mon = rpmEl ? rpmEl.value : '';
  if(!mon){toast(LANG==='ar'?'اختر الشهر':'Choose month','err');return;}
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    // Parallel fetch — only needed fields for performance
    var monStart = (mon||'').slice(0,7)+'-01';
    var monEnd   = window.monthEnd((mon||'').slice(0,7));
    var [unitsRes, paysRes, expsRes, ownsRes, pendingMovesRes, depsRes, refundedDepsRes] = await Promise.all([
      sb.from('units').select('id,apartment,room,monthly_rent,tenant_name,tenant_name2,is_vacant,start_date,deposit').eq('is_vacant',false).order('apartment'),
      // ACCRUAL: filter rent by payment_month (when rent is DUE)
      sb.from('rent_payments').select('unit_id,amount,apartment,room,payment_month,payment_date,payment_method,notes,tenant_num').like('payment_month', mon + '%'),
      sb.from('expenses').select('amount,category,description,receipt_no,period_month').eq('period_month', monStart),
      sb.from('owner_payments').select('amount,period_month,method').eq('period_month', monStart),
      // Pending future bookings for this month
      sb.from('moves').select('unit_id,new_tenant_name,tenant_name,new_start_date,move_date,new_rent,status').eq('type','arrive').eq('status','pending'),
      // Deposits received this month
      sb.from('deposits').select('unit_id,amount,deposit_received_date,status,refund_date,tenant_name,apartment,room')
        .gte('deposit_received_date', monStart).lte('deposit_received_date', monEnd),
      // Refunded deposits this month — by refund_date
      sb.from('deposits').select('unit_id,amount,refund_amount,refund_date,tenant_name,apartment,room')
        .gt('refund_amount', 0)
        .gte('refund_date', monStart)
        .lte('refund_date', monEnd)
    ]);
    var units        = unitsRes.data||[];
    var pendingMoves = pendingMovesRes ? (pendingMovesRes.data||[]) : [];
    // Build map: unit_id → pending move (for future tenant name)
    var pendingMoveMap = {};
    pendingMoves.forEach(function(m){
      if(m.unit_id) pendingMoveMap[m.unit_id] = m;
    });
    // Determine effective tenant name per unit for this month
    units = units.map(function(u){
      var pm = pendingMoveMap[u.id];
      if(pm) {
        var moveDate = pm.new_start_date || pm.move_date;
        var moveMon = moveDate ? moveDate.slice(0,7) : null;
        var reportMon = mon.slice(0,7);
        if(moveMon && moveMon <= reportMon) {
          // New tenant takes over this month
          return Object.assign({}, u, {
            tenant_name: pm.new_tenant_name || pm.tenant_name,
            monthly_rent: pm.new_rent || u.monthly_rent,
            _pendingTenant: true
          });
        }
      }
      return u;
    });
    var pays         = paysRes.data||[];
    var exps         = expsRes.data||[];
    var owns         = ownsRes.data||[];
    var deps         = depsRes.data||[];
    var refundedDeps = refundedDepsRes.data||[];
    var monYM = mon.slice(0,7);

    // ── Maps ──
    // paidMap: rent paid this month per unit
    var paidMap = {};
    pays.forEach(function(p){ paidMap[p.unit_id]=(paidMap[p.unit_id]||0)+(p.amount||0); });

    // depRawMap: all deposit rows per unit
    var depRawMap = {};
    deps.forEach(function(d){
      if(!d.unit_id) return;
      if(!depRawMap[d.unit_id]) depRawMap[d.unit_id]=[];
      depRawMap[d.unit_id].push(d);
    });

    // depMap: deposit counts in the month of unit.start_date
    // depMap: deposits received (deposit_received_date) in this month
    // Uses _pickDepositForReport which checks deposit_received_date — correct
    var depMap = {};
    units.forEach(function(u){
      var amt = _pickDepositForReport(depRawMap[u.id]||[], monYM);
      if(amt > 0) depMap[u.id] = amt;
    });

    // isNewForMonth: used ONLY for UI icon display (🆕) — does NOT affect deposit calculation
    // Deposit is NEVER included because of isNew — only deposit_received_date controls that
    function isNewForMonth(startDate) {
      if(!startDate) return false;
      if(startDate.slice(0,7) === monYM) return true;
      var monStart = new Date(monYM+'-01');
      var prev = new Date(monStart); prev.setDate(prev.getDate()-1);
      var prevStr = prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0')+'-'+String(prev.getDate()).padStart(2,'0');
      return startDate.slice(0,10) === prevStr;
    }

    // ── Grand Totals ──
    var totalRent=0, totalRentColl=0, totalDeps=0, totalExp=0, totalOwner=0;
    units.forEach(function(u){
      totalRent     += u.monthly_rent||0;
      totalRentColl += paidMap[u.id]||0;   // rent collected only
      totalDeps     += depMap[u.id]||0;    // deposit collected this month
    });
    // المُرتجعات في هذا الشهر — query منفصلة بـ refund_date
    var totalRefunds = refundedDeps.reduce(function(s,d){ return s+(Number(d.refund_amount)||0); }, 0);
    exps.forEach(function(e){ totalExp   += e.amount||0; });
    owns.forEach(function(o){ totalOwner += o.amount||0; });

    // totalColl = rent + deposit (total money received this month)
    var totalColl = totalRentColl + totalDeps;

    // ── Group by apartment ──
    // apt.coll = rent + deposit (what was actually received)
    var apts = {};
    units.forEach(function(u){
      var apt = String(u.apartment);
      if(!apts[apt]) apts[apt]={units:[],rent:0,rentColl:0,coll:0,deps:0};
      apts[apt].units.push({...u, _isNew: isNewForMonth(u.start_date||'')});
      apts[apt].rent     += u.monthly_rent||0;
      apts[apt].rentColl += paidMap[u.id]||0;           // rent only
      apts[apt].coll     += (paidMap[u.id]||0) + (depMap[u.id]||0); // rent + deposit
      apts[apt].deps     += depMap[u.id]||0;
    });

    // ── Group by floor ──
    var floors = {};
    Object.keys(apts).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
      var fl = String(Math.floor(Number(apt)/100));
      if(!floors[fl]) floors[fl]={apts:[],rent:0,rentColl:0,coll:0,deps:0};
      floors[fl].apts.push(apt);
      floors[fl].rent     += apts[apt].rent;
      floors[fl].rentColl += apts[apt].rentColl;
      floors[fl].coll     += apts[apt].coll;
      floors[fl].deps     += apts[apt].deps;
    });

    // ── Table header ──
    var TH = function(t,c){
      return '<th style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border);font-size:.72rem;font-weight:700;white-space:nowrap;background:var(--surf3)'+(c?';color:'+c:';color:var(--text2)')+'">'+t+'</th>';
    };
    var tableHead = '<thead><tr style="background:var(--surf2)">'
      +TH(LANG==='ar'?'غرفة':'Room')
      +TH(LANG==='ar'?'المستأجر':'Tenant')
      +TH(LANG==='ar'?'الإيجار':'Rent')
      +TH(LANG==='ar'?'تأمين':'Deposit','var(--accent)')
      +TH(LANG==='ar'?'مدفوع':'Paid','var(--green)')
      +TH(LANG==='ar'?'إجمالي':'Total','var(--green)')
      +TH(LANG==='ar'?'متبقي':'Rem','var(--red)')
      +'<th style="padding:6px;text-align:center;border-bottom:1px solid var(--border);font-size:.72rem">#</th>'
      +'</tr></thead>';

    var floorKeys = Object.keys(floors).sort(function(a,b){return Number(a)-Number(b);});
    // Month label for report
    var monthLabel = new Date(monYM+'-15').toLocaleDateString(LANG==='ar'?'ar-AE':'en-GB',{month:'long',year:'numeric'});
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'      +'<div>'      +'<div style="font-size:.7rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">📋 تقرير الاستحقاق</div>'      +'<div style="font-size:1rem;font-weight:800;color:var(--text);margin-top:2px">'+monthLabel+'</div>'      +'</div>'      +'<div style="text-align:end">'      +'<div style="font-size:.72rem;font-weight:700;color:var(--green)">'+totalRentColl.toLocaleString()+' AED</div>'      +'<div style="font-size:.62rem;color:var(--muted)">من '+totalRent.toLocaleString()+'</div>'      +'</div>'      +'</div>';

    floorKeys.forEach(function(floorKey){
      var fl = floors[floorKey];
      // floor color based on rent collection (not deposit)
      var rentColl = fl.rentColl;  // directly tracked, not derived
      var flColor  = rentColl>=fl.rent?'var(--green)':rentColl>0?'var(--amber)':'var(--red)';
      var flLabel  = LANG==='ar'?'الدور '+floorKey:'Floor '+floorKey;

      // Floor header — show rent collected + deposit separately
      html += '<div style="background:var(--accent)22;border-right:4px solid var(--accent);border-radius:10px;padding:9px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-size:.9rem;font-weight:800">🏬 '+flLabel+'</span>'
        +'<span style="font-size:.78rem;display:flex;gap:10px;flex-wrap:wrap">'
        +'<span style="color:var(--green);font-weight:700">✅ '+rentColl+'</span>'
        +(fl.deps>0?'<span style="color:var(--accent);font-weight:700">🔒 '+fl.deps+'</span>':'')
        +'<span style="color:var(--green);font-weight:800">= '+fl.coll+' AED</span>'
        +(fl.rent-rentColl>0?'<span style="color:var(--red);font-weight:700">❌ '+(fl.rent-rentColl)+' AED</span>':'')
        +'</span></div>';

      fl.apts.forEach(function(apt){
        var g = apts[apt];
        var aptRentColl = g.rentColl;  // directly tracked, not derived
        var aptColor    = aptRentColl>=g.rent?'var(--green)':aptRentColl>0?'var(--amber)':'var(--red)';
        var aptLabel    = (LANG==='ar'?'شقة ':'Apt ')+apt;

        var rows = g.units.slice().sort(function(a,b){return Number(a.room)-Number(b.room);}).map(function(u){
          var dep      = depMap[u.id]||0;
          var rentPaid = paidMap[u.id]||0;
          var isNew    = u._isNew;
          var showDep  = dep > 0; // show if deposit was received this month (regardless of isNew)
          var rem      = Math.max(0,(u.monthly_rent||0)-rentPaid);
          var fullPaid = !isNew && rentPaid>=(u.monthly_rent||0)&&(u.monthly_rent||0)>0;
          var partPaid = !isNew && !fullPaid && rentPaid>0;
          // Status badge
          var stBg = isNew?'var(--accent)':fullPaid?'var(--green)':partPaid?'var(--amber)':'var(--red)';
          var stTx = isNew?(dep>0?'🆕':'🆕'):fullPaid?'✅':partPaid?'⚠️':'❌';
          var stBadge = '<span style="display:inline-block;background:'+stBg+'33;color:'+stBg+';border:1px solid '+stBg+'55;border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:800">'+stTx+'</span>';
          // Paid cell — strong green or red bg
          var paidCell = rentPaid>0
            ? '<span style="background:var(--green)22;color:var(--green);border-radius:6px;padding:2px 7px;font-size:.78rem;font-weight:800">'+rentPaid.toLocaleString()+'</span>'
            : (u.monthly_rent&&!isNew?'<span style="background:var(--red)22;color:var(--red);border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:700">0</span>':'<span style="color:var(--muted)">—</span>');
          // Remaining cell
          var remCell = rem>0
            ? '<span style="background:var(--red)22;color:var(--red);border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:700">'+rem.toLocaleString()+'</span>'
            : '<span style="color:var(--green);font-size:.75rem">—</span>';
          // Deposit cell
          var depCell = showDep
            ? '<span style="background:var(--accent)22;color:var(--accent);border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:700">'+dep.toLocaleString()+'</span>'
            : '<span style="color:var(--muted)">—</span>';
          // Row highlight for unpaid
          var rowBg = partPaid?'background:rgba(245,183,49,.04);':(!isNew&&rem>0&&rentPaid===0?'background:rgba(240,85,85,.05);':'');
          return '<tr style="'+rowBg+'">'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;font-size:.8rem;font-weight:700;color:var(--text)">'+u.room+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;font-size:.75rem;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis">'+(u.tenant_name||'—')+(u.tenant_name2?'<div style="font-size:.65rem;color:var(--amber)">+'+u.tenant_name2+'</div>':'')+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;font-size:.75rem;color:var(--muted)">'+(u.monthly_rent||0).toLocaleString()+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22">'+depCell+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22">'+paidCell+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;font-size:.75rem;color:var(--green);font-weight:800">'+(dep>0?'<b>'+(rentPaid+dep).toLocaleString()+'</b>':'<span style="color:var(--muted)">—</span>')+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22">'+remCell+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;text-align:center">'+stBadge+'</td>'
            +'</tr>';
        }).join('');

        var aptDeps = g.units.reduce(function(s,u){return s+(depMap[u.id]||0);},0);

        html += '<div style="margin-bottom:12px;margin-right:8px" data-apt-block>'
          // Apt header
          +'<div style="display:flex;justify-content:space-between;align-items:center;background:var(--surf2);border-radius:10px 10px 0 0;padding:7px 12px;border-right:3px solid '+aptColor+'">'
          +'<span style="font-weight:700;font-size:.82rem">🏢 '+aptLabel+'</span>'
          +'<span style="font-size:.75rem;display:flex;gap:8px">'
          +'<span style="color:var(--green)">محصّل: '+aptRentColl+'</span>'
          +(aptDeps>0?'<span style="color:var(--accent)"> | تأمين: '+aptDeps+'</span>':'')
          +(aptDeps>0?'<span style="color:var(--green);font-weight:800"> | إجمالي: '+(aptRentColl+aptDeps)+'</span>':'')
          +(g.rent-aptRentColl>0?'<span style="color:var(--red)"> | متبقي: '+(g.rent-aptRentColl)+'</span>':'')
          +'</span></div>'
          // Table
          +'<div style="overflow-x:auto;border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px">'
          +'<table style="width:100%;border-collapse:collapse">'+tableHead
          +'<tbody>'+rows+'</tbody>'
          +'<tfoot><tr style="background:var(--surf2)">'
          +'<td colspan="2" style="padding:6px 8px;font-weight:700;font-size:.75rem">'+(LANG==='ar'?'إجمالي الشقة':'Apt Total')+'</td>'
          +'<td style="padding:6px 8px;font-weight:700;font-size:.75rem">'+g.rent+'</td>'
          +'<td style="padding:6px 8px;font-weight:700;font-size:.75rem;color:var(--accent)">'+aptDeps+'</td>'
          +'<td style="padding:6px 8px;font-weight:700;font-size:.75rem;color:var(--green)">'+aptRentColl+'</td>'
          +'<td style="padding:6px 8px;font-weight:800;font-size:.75rem;color:var(--green);border-bottom:none">'+(aptDeps>0?(aptRentColl+aptDeps):'—')+'</td>'
          +'<td style="padding:6px 8px;font-weight:700;font-size:.75rem;color:var(--red)">'+(g.rent-aptRentColl)+'</td>'
          +'<td></td></tr></tfoot>'
          +'</table></div></div>';
      });

      // Floor subtotal
      var flRentColl2 = fl.rentColl;  // directly tracked
      html += '<div style="background:var(--surf2);border-radius:10px;padding:8px 14px;margin-bottom:16px;display:flex;justify-content:space-between;font-size:.8rem;border-right:4px solid '+flColor+'">'
        +'<span style="font-weight:800">'+(LANG==='ar'?'إجمالي '+flLabel:'Total '+flLabel)+'</span>'
        +'<span style="display:flex;gap:10px;flex-wrap:wrap">'
        +'<span>'+(LANG==='ar'?'الإيجار:':'Rent:')+' <b>'+fl.rent+'</b></span>'
        +'<span style="color:var(--green)">'+(LANG==='ar'?'محصّل:':'Paid:')+' <b>'+flRentColl2+'</b></span>'
        +(fl.deps>0?'<span style="color:var(--accent)">'+(LANG==='ar'?'تأمين:':'Dep:')+' <b>'+fl.deps+'</b></span>':'')
        +(fl.deps>0?'<span style="color:var(--green);font-weight:800">'+(LANG==='ar'?'إجمالي:':'Total:')+' <b>'+fl.coll+'</b></span>':'')
        +(fl.rent-flRentColl2>0?'<span style="color:var(--red)">'+(LANG==='ar'?'متبقي:':'Rem:')+' <b>'+(fl.rent-flRentColl2)+'</b></span>':'')
        +'</span></div>';
    });

    // ── Grand Total — clear colored summary ──
    var netTotal = totalColl - totalRefunds - totalExp - totalOwner;
    var collPct  = totalRent > 0 ? Math.round(totalRentColl / totalRent * 100) : 0;
    var pctColor = collPct>=90?'var(--green)':collPct>=60?'var(--amber)':'var(--red)';

    var sumRow = function(icon, label, val, col, isBold){
      var rowBg  = isBold ? 'background:var(--surf2);' : '';
      var fsize  = isBold ? '.9rem' : '.83rem';
      var fweight= isBold ? '800' : '700';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)22;'+rowBg+'">'
        +'<span style="font-size:.78rem;color:var(--muted)">'+icon+' '+label+'</span>'
        +'<b style="font-size:'+fsize+';font-weight:'+fweight+';color:'+(col||'var(--text2)')+'">'+val+' AED</b>'
        +'</div>';
    };

    html += '<div class="card" data-grand style="padding:0;overflow:hidden;margin-top:8px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:var(--surf2);border-bottom:2px solid var(--border)">'
        +'<div style="font-weight:800;font-size:.88rem">📊 '+(LANG==='ar'?'ملخص الشهر':'Month Summary')+'</div>'
        +'<div style="background:'+pctColor+'22;border:1.5px solid '+pctColor+'55;border-radius:20px;padding:3px 12px;font-size:.8rem;font-weight:800;color:'+pctColor+'">'+collPct+'%</div>'
      +'</div>'
      +sumRow('🎯', LANG==='ar'?'الإيجار المستهدف':'Target Rent',        totalRent.toLocaleString(),             'var(--text2)')
      +sumRow('✅', LANG==='ar'?'إيجار محصّل':'Rent Collected',           totalRentColl.toLocaleString(),         'var(--green)')
      +(totalDeps>0?sumRow('🔒', LANG==='ar'?'تأمينات محصّلة':'Deposits',totalDeps.toLocaleString(),             'var(--accent)'):'')
      +(totalRefunds>0?sumRow('↩️', LANG==='ar'?'تأمينات مُرتجعة':'Dep. Refunded','- '+totalRefunds.toLocaleString(), 'var(--red)'):'')
      +sumRow('💵', LANG==='ar'?'إجمالي الكاش':'Total Cash',             totalColl.toLocaleString(),             'var(--green)', true)
      +sumRow('❌', LANG==='ar'?'إيجار غير محصّل':'Uncollected',         (totalRent-totalRentColl).toLocaleString(),'var(--red)')
      +(totalExp>0?sumRow('💸', LANG==='ar'?'المصاريف':'Expenses',        totalExp.toLocaleString(),              'var(--amber)'):'')
      +(totalOwner>0?sumRow('👤', LANG==='ar'?'دُفع للمالك':'Paid to Owner',totalOwner.toLocaleString(),         'var(--muted)'):'')
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:13px 14px;background:var(--surf3);border-top:2px solid var(--border)">'
        +'<span style="font-weight:800;font-size:.9rem">🏦 '+(LANG==='ar'?'الإجمالي الصافي':'Net Total')+'</span>'
        +'<b style="font-size:1.1rem;font-weight:800;color:'+(netTotal>=0?'var(--green)':'var(--red)')+'">'+netTotal.toLocaleString()+' AED</b>'
      +'</div>'
      +'</div>';

    // ── Month Comparison ──
    var prevDate2 = new Date(monYM+'-01');
    prevDate2.setMonth(prevDate2.getMonth()-1);
    var prevYM2 = prevDate2.getFullYear()+'-'+String(prevDate2.getMonth()+1).padStart(2,'0');

    // ACCRUAL comparison: use payment_month
    var { data: prevPays2 } = await sb.from('rent_payments')
      .select('amount').like('payment_month', prevYM2 + '%');
    var prevColl2 = (prevPays2||[]).reduce(function(s,p){return s+(p.amount||0);},0);
    var collDiff  = totalRentColl - prevColl2;
    var collDiffPct = prevColl2>0 ? Math.round(Math.abs(collDiff)/prevColl2*100) : 0;
    var collDiffColor = collDiff>=0?'var(--green)':'var(--red)';
    var collDiffArrow = collDiff>=0?'↑':'↓';

    if(prevColl2 > 0) {
      html += '<div style="background:var(--surf2);border-radius:12px;padding:12px 14px;margin-bottom:12px;'
        +'display:flex;justify-content:space-between;align-items:center">'
        +'<div><div style="font-size:.68rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">📊 مقارنة بـ '+prevYM2+'</div>'
        +'<div style="font-size:.75rem;color:var(--muted);margin-top:3px">محصّل الشهر الماضي: <b>'+prevColl2.toLocaleString()+' AED</b></div>'
        +'<div style="font-size:.75rem;color:var(--muted)">محصّل هذا الشهر: <b>'+totalRentColl.toLocaleString()+' AED</b></div>'
        +'</div>'
        +'<div style="text-align:center;padding:8px 14px;background:'+collDiffColor+'18;border-radius:10px;border:1px solid '+collDiffColor+'33">'
        +'<div style="font-weight:800;font-size:1.1rem;color:'+collDiffColor+'">'+collDiffArrow+' '+collDiffPct+'%</div>'
        +'<div style="font-size:.65rem;color:'+collDiffColor+'">'+(collDiff>=0?'+':'')+collDiff.toLocaleString()+' AED</div>'
        +'</div></div>';
    }

    window._lastPDFMon = mon;
    html = '<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn bg" style="font-size:.78rem;flex:1;touch-action:manipulation" onclick="exportPDF(\'monthly\',window._lastPDFMon)">📄 PDF</button></div>' + html;
    document.getElementById('rMonOut').innerHTML = html;

  } catch(e){ toast(e.message,'err'); console.error('loadMonthly:',e); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

// ══════════════════════════════════════════════════════
// EXPENSES REPORT
// ══════════════════════════════════════════════════════

async function loadExpRpt(btn) {
  var mon = document.getElementById('rem').value;
  if(!mon){toast(LANG==='ar'?'اختر الشهر':'Choose month','err');return;}
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var { data: exps } = await sb.from('expenses').select('*').eq('period_month', (mon||'').slice(0,7)+'-01').order('period_month',{ascending:false});
    if(!exps) exps=[];
    var total = exps.reduce(function(s,e){return s+e.amount;},0);
    // Per-category summary
    var catTotals = {};
    exps.forEach(function(e){ catTotals[e.category]=(catTotals[e.category]||0)+(e.amount||0); });
    var cats = Object.keys(catTotals).sort();
    var catSummary = '';
    if(cats.length > 1) {
      catSummary = '<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">';
      cats.forEach(function(cat){
        var pct = total>0?Math.round(catTotals[cat]/total*100):0;
        catSummary += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
          +'<span style="font-size:.72rem;color:var(--muted);width:55px;flex-shrink:0">'+cat+'</span>'
          +'<div style="flex:1;background:var(--surf3);border-radius:3px;height:8px;overflow:hidden">'
            +'<div style="height:100%;background:var(--amber);width:'+pct+'%;border-radius:3px"></div>'
          +'</div>'
          +'<span style="font-size:.72rem;font-weight:700;width:52px;text-align:end">'+catTotals[cat].toLocaleString()+'</span>'
          +'</div>';
      });
      catSummary += '</div>';
    }

    document.getElementById('rExpOut').innerHTML = exps.length
      ? '<div class="card" style="padding:0;overflow:hidden">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:var(--surf2);border-bottom:2px solid var(--border)">'
          +'<span style="font-weight:800;font-size:.88rem">💸 المصاريف</span>'
          +'<b style="color:var(--amber)">'+total.toLocaleString()+' AED</b>'
        +'</div>'
        +'<div style="padding:12px 14px">'+catSummary
        +exps.map(function(e){
          var esc2=function(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)22">'
            +'<div style="flex:1"><div style="font-size:.8rem;font-weight:600">'+esc2(e.category)+'</div>'
            +(e.description?'<div style="font-size:.68rem;color:var(--muted)">'+esc2(e.description)+'</div>':'')+'</div>'
            +'<div style="display:flex;align-items:center;gap:6px">'
            +'<b style="color:var(--amber)">'+Number(e.amount||0).toLocaleString()+' AED</b>'
            +'<button onclick="editExpense('+e.id+')" style="padding:4px 8px;background:var(--accent)22;border:1px solid var(--accent);border-radius:7px;color:var(--accent);font-size:.7rem;cursor:pointer;font-family:inherit">✏️</button>'
            +'<button onclick="deleteExpense('+e.id+',this)" style="padding:4px 8px;background:var(--red)22;border:1px solid var(--red);border-radius:7px;color:var(--red);font-size:.7rem;cursor:pointer;font-family:inherit">🗑️</button>'
            +'</div>'
            +'</div>';
        }).join('')
        +'</div></div>'
      : '<div style="text-align:center;padding:30px;color:var(--muted)">📭 لا توجد مصاريف</div>';
  } catch(e){ toast(e.message,'err'); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

// ══════════════════════════════════════════════════════
// DEPOSIT REPORT — 2 Modes
// Mode A: All held deposits (current state)
// Mode B: Deposits received this specific month
// ══════════════════════════════════════════════════════

async function loadDepRpt(btn) {
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    // Detect mode: check if month filter exists
    var monEl = document.getElementById('rdep-month');
    var filterMon = monEl ? (monEl.value||'').slice(0,7) : '';
    var modeThisMonth = !!filterMon;

    var { data: units } = await sb.from('units')
      .select('id,apartment,room,tenant_name,tenant_name2,is_vacant,deposit,start_date')
      .eq('is_vacant', false)
      .order('apartment', {ascending:true});

    // Fetch all deposits with amount > 0
    // Fetch ALL deposits (for "already registered" check)
    var { data: allDeps } = await sb.from('deposits').select('*').gt('amount',0);
    if(!allDeps) allDeps=[];

    // For display: filter by month if needed
    var deps = allDeps;
    if(modeThisMonth) {
      deps = allDeps.filter(function(d) {
        var rd = String(d.deposit_received_date || '').slice(0, 7);
        return rd === filterMon;
      });
    }
    if(!units) units=[];

    // Build map with fallback priority:
    // 1) exact unit_id
    // 2) apartment-room from deposit row itself
    // This prevents losing names / apartment numbers for orphan deposit rows.
    var unitById = {};
    var unitByKey = {};
    (units||[]).forEach(function(u){
      unitById[u.id] = u;
      unitByKey[String(u.apartment)+'-'+String(u.room)] = u;
    });

    var seenDepIds = new Set();
    var groups = {};
    var grandTotal = 0;

    deps.forEach(function(d){
      if(seenDepIds.has(d.id)) return;
      seenDepIds.add(d.id);

      var linkedUnit = null;
      if(d.unit_id && unitById[d.unit_id]) linkedUnit = unitById[d.unit_id];
      if(!linkedUnit){
        var depKey = String(d.apartment||'') + '-' + String(d.room||'');
        if(unitByKey[depKey]) linkedUnit = unitByKey[depKey];
      }

      var aptVal = linkedUnit ? linkedUnit.apartment : (d.apartment || '—');
      var roomVal = linkedUnit ? linkedUnit.room : (d.room || '—');
      var tenantVal = (d.tenant_name || (linkedUnit && (linkedUnit.tenant_name || linkedUnit.tenant_name2)) || '—');
      var apt = String(aptVal || '—');
      if(!groups[apt]) groups[apt] = { items: [], total: 0 };

      groups[apt].items.push({
        unit: linkedUnit,
        apt: aptVal,
        room: roomVal,
        tenant: tenantVal,
        dep: d
      });
      groups[apt].total += Number(d.amount || 0);
      grandTotal += Number(d.amount || 0);
    });

    var html = '';

    // Mode label
    if(modeThisMonth) {
      html += '<div style="background:var(--accent)22;border:1px solid var(--accent);border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:.78rem;color:var(--accent2);font-weight:600">🗓️ '
        +(LANG==='ar'?'تأمينات شهر ':'Deposits for month ')+filterMon+'</div>';
    }

    Object.keys(groups).sort(function(a,b){
      var na = Number(a), nb = Number(b);
      if(!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    }).forEach(function(apt){
      var g = groups[apt];
      html += '<div style="margin-bottom:14px">'
        +'<div style="background:var(--surf2);border-radius:10px 10px 0 0;padding:8px 12px;border-right:3px solid var(--accent);display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-weight:700;font-size:.85rem">🏢 '+(LANG==='ar'?'شقة':'Apt')+' '+escapeHtml(apt)+'</span>'
        +'<span style="font-size:.8rem;color:var(--accent);font-weight:700">'+g.total+' AED</span>'
        +'</div>'
        +'<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px">';

      g.items.forEach(function(item){
        var d = item.dep;
        var sCol = d.status==='held'?'var(--amber)':d.status==='refunded'?'var(--green)':'var(--red)';
        var sTxt = d.status==='held'?(LANG==='ar'?'محتجز':'Held')
                 : d.status==='refunded'?(LANG==='ar'?'مُرتجع':'Refunded')
                 : (LANG==='ar'?'مُصادر':'Forfeited');
        var rdStr = (d.deposit_received_date||'').slice(0,10);
        var unitText = (LANG==='ar'?'شقة ':'Apt ') + escapeHtml(String(item.apt||'—')) + ' — ' + (LANG==='ar'?'غرفة ':'Room ') + escapeHtml(String(item.room||'—'));
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border)22;gap:8px">'
          +'<div>'
          +'<div style="font-size:.82rem;font-weight:600">'+unitText+'</div>'
          +'<div style="font-size:.76rem;color:var(--text)">'+escapeHtml(item.tenant||'—')+'</div>'
          +(rdStr?'<div style="font-size:.7rem;color:var(--muted)">📅 '+rdStr+'</div>':'')
          +(d.deduction_amount?'<div style="font-size:.7rem;color:var(--muted)">'+(LANG==='ar'?'خصم:':'Ded:')+' '+d.deduction_amount+' AED</div>':'')
          +(d.notes?'<div style="font-size:.7rem;color:var(--muted)">'+escapeHtml(d.notes)+'</div>':'')
          +'</div>'
          +'<div style="text-align:left;min-width:84px">'
          +'<div style="font-weight:700;color:var(--accent)">'+d.amount+' AED</div>'
          +'<div style="font-size:.7rem;color:'+sCol+';font-weight:600">'+sTxt+'</div>'
          +(d.refund_amount>0 && d.status!=='refunded'?'<div style="font-size:.68rem;color:var(--red);font-weight:600">↩️ '+(LANG==='ar'?'مُرجَع:':'Refunded:')+' '+d.refund_amount+' AED</div>':'')
          +(d.refund_amount>0 && d.status!=='refunded'?'<div style="font-size:.65rem;color:var(--green);font-weight:600">'+(LANG==='ar'?'متبقي:':'Remaining:')+' '+(d.amount-d.refund_amount)+' AED</div>':'')
          +(d.refund_date && d.refund_amount>0 && d.status!=='refunded'?'<div style="font-size:.63rem;color:var(--muted)">📅 '+d.refund_date.slice(0,10)+'</div>':'')
          +'</div>'
          +'</div>';
      });

      html += '</div></div>';
    });


    // ── Missing deposits (reference only) ──
    if(!modeThisMonth) {
      // Use ALL deposits (not filtered) to determine if unit is "registered"
      var allDepUids = new Set(allDeps.filter(function(d){return d.status!=='refunded';}).map(function(d){return d.unit_id;}));
      var missing = (units||[]).filter(function(u){ return (u.deposit||0)>0 && !allDepUids.has(u.id); });
      if(missing.length > 0) {
        var mTotal = missing.reduce(function(s,u){return s+(u.deposit||0);},0);
        var mGroups={};
        missing.forEach(function(u){ var a=String(u.apartment); if(!mGroups[a])mGroups[a]={items:[],total:0}; mGroups[a].items.push(u); mGroups[a].total+=u.deposit||0; });
        html += '<div style="margin-top:14px">';
        html += '<div style="background:var(--amber)22;border:1px solid var(--amber)44;border-radius:10px;padding:9px 13px;margin-bottom:8px">';
        html += '<div style="font-weight:700;font-size:.82rem;color:var(--amber)">⚠️ تأمينات مرجعية غير مسجّلة (' +missing.length+ ' وحدة)</div>';
        html += '<div style="font-size:.7rem;color:var(--muted);margin-top:2px">عندها deposit في بيانات الوحدة بس مش في جدول التأمينات</div></div>';
        Object.keys(mGroups).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
          var mg=mGroups[apt];
          html += '<div style="margin-bottom:8px">'
            +'<div style="background:var(--surf2);border-radius:8px 8px 0 0;padding:7px 12px;border-right:3px solid var(--amber);display:flex;justify-content:space-between">'
            +'<b style="font-size:.82rem">شقة '+apt+'</b><span style="color:var(--amber);font-weight:700">'+mg.total+' AED</span></div>'
            +'<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px">';
          mg.items.forEach(function(u){
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border)22">'
              +'<div><div style="font-size:.8rem;font-weight:600">غرفة '+u.room+' — '+(u.tenant_name||'—')+'</div>'
              +'<div style="font-size:.68rem;color:var(--amber)">مرجعي — يحتاج تسجيل</div></div>'
              +'<div style="display:flex;align-items:center;gap:8px">'
              +'<b style="color:var(--amber)">'+(u.deposit||0)+' AED</b>'
              +'<button onclick="window._qrd={apt:'+u.apartment+',room:\''+u.room+'\',amt:'+(u.deposit||0)+',name:\''+escapeHtml(u.tenant_name||'')+'\',startDate:\''+((u.start_date||'').slice(0,10))+'\'};quickRegisterDeposit('+u.apartment+',\''+u.room+'\','+(u.deposit||0)+',\''+escapeHtml(u.tenant_name||'')+'\')" '
              +'style="padding:4px 10px;background:var(--green)22;border:1px solid var(--green);border-radius:8px;color:var(--green);font-size:.7rem;font-family:var(--font);cursor:pointer">＋ سجّل</button>'
              +'</div></div>';
          });
          html += '</div></div>';
        });
        html += '<div style="background:var(--amber)18;border-radius:8px;padding:9px 14px;display:flex;justify-content:space-between">'
          +'<b style="color:var(--amber)">إجمالي غير المسجّل</b>'
          +'<b style="color:var(--amber)">'+mTotal+' AED</b></div>';
        html += '</div>';
      }
    }

    // Grand total
    html += '<div style="background:var(--surf2);border-radius:10px;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;margin-top:4px">'
      +'<span style="font-weight:700">'+(LANG==='ar'?'إجمالي التأمينات':'Total Deposits')+'</span>'
      +'<span style="font-weight:700;color:var(--accent);font-size:1rem">'+grandTotal+' AED</span>'
      +'</div>';

    document.getElementById('rDepOut').innerHTML = grandTotal > 0 ? html
      : '<div style="text-align:center;padding:20px;color:var(--muted)">'+(LANG==='ar'?'لا توجد تأمينات':'No deposits')+'</div>';

  } catch(e){ toast(e.message,'err'); console.error('loadDepRpt:',e); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}


window.loadDepRpt = loadDepRpt;

// ══════════════════════════════════════════════════════
// FINANCIAL SUMMARY REPORT
// ══════════════════════════════════════════════════════
function _finAmt(v){ return 'AED ' + Number(v||0).toLocaleString(); }

async function getFinancialSummaryData(monYM){
  var start = monthStart(monYM);
  var end = monthEnd(monYM);
  var [rentR, depR, expR, ownerR] = await Promise.all([
    sb.from('rent_payments').select('amount').gte('payment_date', start).lte('payment_date', end),
    sb.from('deposits').select('amount,status').gte('deposit_received_date', start).lte('deposit_received_date', end),
    sb.from('expenses').select('amount').eq('period_month', (monYM||'').slice(0,7)+'-01'),
    sb.from('owner_payments').select('amount').eq('period_month', (monYM||'').slice(0,7)+'-01')
  ]);
  var rent = (rentR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  var deps = (depR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  var exps = (expR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  var owner = (ownerR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  var cashIn = rent + deps;
  var cashOut = exps + owner;
  return { month: monYM, rent: rent, deposits: deps, cashIn: cashIn, expenses: exps, ownerPayments: owner, cashOut: cashOut, net: cashIn - cashOut };
}

function renderFinancialSummaryBox(x){
  var netColor = x.net >= 0 ? 'var(--green)' : 'var(--red)';
  return ''
    +'<div class="card" style="padding:14px">'
    +'<div style="font-size:.82rem;color:var(--muted);margin-bottom:10px">💼 ملخص مالي — '+escapeHtml(x.month)+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="sum"><span>إجمالي الإيجار</span><b>'+_finAmt(x.rent)+'</b></div>'
    +'<div class="sum"><span>إجمالي التأمينات</span><b>'+_finAmt(x.deposits)+'</b></div>'
    +'<div class="sum sum-highlight"><span>إجمالي الداخل</span><b>'+_finAmt(x.cashIn)+'</b></div>'
    +'<div class="sum"><span>إجمالي المصاريف</span><b>'+_finAmt(x.expenses)+'</b></div>'
    +'<div class="sum"><span>مدفوعات المالك</span><b>'+_finAmt(x.ownerPayments)+'</b></div>'
    +'<div class="sum sum-highlight"><span>إجمالي الخارج</span><b>'+_finAmt(x.cashOut)+'</b></div>'
    +'</div>'
    +'<div style="margin-top:12px;padding:14px;border-radius:12px;background:'+netColor+'18;border:1px solid '+netColor+'55;display:flex;justify-content:space-between;align-items:center">'
    +'<span style="font-size:.9rem;font-weight:800;color:'+netColor+'">صافي النتيجة</span>'
    +'<span style="font-size:1.1rem;font-weight:900;color:'+netColor+'">'+_finAmt(x.net)+'</span>'
    +'</div>'
    +'</div>';
}

async function loadFinSummary(btn){
  var mon = (document.getElementById('rfin-month').value||'').slice(0,7) || new Date().toISOString().slice(0,7);
  var orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try{
    var data = await getFinancialSummaryData(mon);
    document.getElementById('rFinOut').innerHTML = renderFinancialSummaryBox(data);
  } catch(e){ toast('خطأ: '+e.message,'err'); console.error('loadFinSummary', e); }
  finally{ btn.disabled = false; btn.innerHTML = orig; }
}
window.loadFinSummary = loadFinSummary;

async function printFinancialSummary(monYM){
  try{
    var data = await getFinancialSummaryData(monYM);
    var html = '<html dir="rtl"><head><meta charset="utf-8"><title>ملخص مالي</title>'
      +'<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{color:#163b73;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #d8deea;padding:12px;text-align:right}th{background:#163b73;color:#fff}.net{font-size:22px;font-weight:800;color:'+(data.net>=0?'#14804a':'#c13f35')+'}.muted{color:#666}</style>'
      +'</head><body>'
      +'<h1>Wahdati — ملخص مالي</h1><div class="muted">'+escapeHtml(monYM)+'</div>'
      +'<table><tbody>'
      +'<tr><th>إجمالي الإيجار</th><td>'+_finAmt(data.rent)+'</td></tr>'
      +'<tr><th>إجمالي التأمينات</th><td>'+_finAmt(data.deposits)+'</td></tr>'
      +'<tr><th>إجمالي الداخل</th><td>'+_finAmt(data.cashIn)+'</td></tr>'
      +'<tr><th>إجمالي المصاريف</th><td>'+_finAmt(data.expenses)+'</td></tr>'
      +'<tr><th>مدفوعات المالك</th><td>'+_finAmt(data.ownerPayments)+'</td></tr>'
      +'<tr><th>إجمالي الخارج</th><td>'+_finAmt(data.cashOut)+'</td></tr>'
      +'<tr><th>صافي النتيجة</th><td class="net">'+_finAmt(data.net)+'</td></tr>'
      +'</tbody></table></body></html>';
    var w = window.open('', '_blank');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function(){ try{ w.print(); }catch(_e){} }, 250);
  } catch(e){ toast('خطأ: '+e.message,'err'); }
}
window.printFinancialSummary = printFinancialSummary;

// ══════════════════════════════════════════════════════
// ANNUAL REPORT
// ══════════════════════════════════════════════════════

async function loadAnnual(btn) {
  var year = document.getElementById('r-year').value || new Date().getFullYear();
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var prevYear = parseInt(year) - 1;
    // ACCRUAL annual: filter by payment_month — fetch current + prev year in parallel
    var [pR, eR, oR, dR, ppR] = await Promise.all([
      sb.from('rent_payments').select('amount,payment_month'),
      sb.from('expenses').select('amount,period_month'),
      sb.from('owner_payments').select('amount,period_month'),
      sb.from('deposits').select('amount,deposit_received_date,status'),
      // Previous year rent (for YoY comparison)
      sb.from('rent_payments').select('amount,payment_month')
    ]);
    var pays=pR.data||[], exps=eR.data||[], owns=oR.data||[], deps=dR.data||[], prevPays=ppR.data||[];

    var months = Array.from({length:12},function(_,i){return String(i+1).padStart(2,'0');});
    var mNames   = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var mNamesEN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    var mNamesShort = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    // Build prevYear map for YoY
    var prevMap = {};
    (prevPays||[]).forEach(function(p){ var m=(p.payment_month||'').slice(5,7); if(m) prevMap[m]=(prevMap[m]||0)+(p.amount||0); });
    var rows_data = [];  // for chart
    var rows = months.map(function(m,i){
      var prefix = year+'-'+m;
      var rent  = pays.filter(function(p){return p.payment_month&&p.payment_month.startsWith(prefix);}).reduce(function(s,p){return s+p.amount;},0);
      var dep   = deps.filter(function(d){ if(d.status==='refunded') return false; return String(d.deposit_received_date||'').slice(0,7)===prefix; }).reduce(function(s,d){return s+(d.amount||0);},0);
      var coll  = rent + dep;
      var exp   = exps.filter(function(e){return String(e.period_month||'').startsWith(prefix);}).reduce(function(s,e){return s+e.amount;},0);
      var own   = owns.filter(function(o){return String(o.period_month||'').startsWith(prefix);}).reduce(function(s,o){return s+o.amount;},0);
      var net   = coll - exp - own;
      var prevRent = prevMap[m]||0;
      var yoyDiff  = rent - prevRent;
      rows_data.push({m:m, rent:rent, dep:dep, coll:rent+dep, exp:exp, net:net, prevRent:prevRent, yoyDiff:yoyDiff});
      return '<tr>'        +'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem">'+(LANG==='ar'?mNames[i]:mNamesEN[i])+'</td>'
        +'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--green)">'+rent.toLocaleString()+'</td>'
        +(yoyDiff!==0
          ?'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.72rem;color:'+(yoyDiff>0?'var(--green)':'var(--red)')+';">'+(yoyDiff>0?'↑':'↓')+Math.abs(yoyDiff).toLocaleString()+'</td>'
          :'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.72rem;color:var(--muted)">—</td>')
        +(dep>0?'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--accent)">'+dep+'</td>':'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--muted)">—</td>')
        +'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--amber)">'+exp+'</td>'
        +'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--muted)">'+own+'</td>'
        +'<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:.78rem;font-weight:700;color:'+(net>0?'var(--green)':'var(--red)')+'">'+net+'</td>'
        +'</tr>';
    }).join('');

    var tRent = pays.reduce(function(s,p){return s+(p.amount||0);},0);
    var tDep  = deps.filter(function(d){ if(d.status==='refunded') return false; return String(d.deposit_received_date||'').startsWith(String(year)); }).reduce(function(s,d){return s+(d.amount||0);},0);
    var tExp  = exps.reduce(function(s,e){return s+e.amount;},0);
    var tOwn  = owns.reduce(function(s,o){return s+o.amount;},0);
    var tNet  = tRent + tDep - tExp - tOwn;

    // Mini bar chart
    var allCollValues = rows_data.map(function(r){return r.coll;});
    var maxColl = Math.max.apply(null, allCollValues.concat([1]));
    var chartBars = rows_data.map(function(r,i){
      var w = maxColl>0?Math.round(r.coll/maxColl*100):0;
      var col = r.net>0?'var(--green)':'var(--red)';
      return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0">'
        +'<div style="font-size:.6rem;color:var(--muted);width:28px;text-align:end">'+mNamesShort[i]+'</div>'
        +'<div style="flex:1;background:var(--surf3);border-radius:3px;height:14px;overflow:hidden">'
          +'<div style="height:100%;background:'+col+';width:'+w+'%;border-radius:3px"></div>'
        +'</div>'
        +'<div style="font-size:.62rem;color:var(--muted);width:52px;text-align:end">'+r.coll.toLocaleString()+'</div>'
        +'</div>';
    }).join('');

    document.getElementById('rAnnOut').innerHTML =
      '<div class="card" style="margin-bottom:8px">'
      +'<div style="font-size:.68rem;color:var(--muted);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">📊 '+year+' — التحصيل الشهري</div>'
      +chartBars
      +'</div>'
      +'<div class="card" style="overflow-x:auto;margin-bottom:8px">'
      +'<table style="width:100%;border-collapse:collapse;font-size:.75rem">'
      +'<thead><tr style="background:var(--surf2)">'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border)">'+(LANG==='ar'?'الشهر':'Month')+'</th>'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border);color:var(--green)">'+(LANG==='ar'?'إيجار':'Rent')+'</th>'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border);color:var(--muted);font-size:.65rem">'+(prevYear)+'↔'+(year)+'</th>'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border);color:var(--accent)">'+(LANG==='ar'?'تأمين':'Dep')+'</th>'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border);color:var(--amber)">'+(LANG==='ar'?'مصاريف':'Exp')+'</th>'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border)">'+(LANG==='ar'?'للمالك':'Owner')+'</th>'
      +'<th style="padding:7px;text-align:right;border-bottom:1px solid var(--border)">'+(LANG==='ar'?'صافي':'Net')+'</th>'
      +'</tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'</table></div>'
      +'<div class="card" style="padding:0;overflow:hidden">'
      +'<div style="padding:11px 14px;background:var(--surf2);border-bottom:2px solid var(--border);font-weight:800;font-size:.88rem">📅 إجمالي سنة '+year+'</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)22"><span style="font-size:.8rem;color:var(--muted)">✅ إجمالي الإيجار</span><b style="color:var(--green)">'+tRent.toLocaleString()+' AED</b></div>'
      +(tDep>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)22"><span style="font-size:.8rem;color:var(--muted)">🔒 إجمالي التأمينات</span><b style="color:var(--accent)">'+tDep.toLocaleString()+' AED</b></div>':'')
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)22"><span style="font-size:.8rem;color:var(--muted)">💸 إجمالي المصاريف</span><b style="color:var(--amber)">'+tExp.toLocaleString()+' AED</b></div>'
      +(tOwn>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)22"><span style="font-size:.8rem;color:var(--muted)">👤 دُفع للمالك</span><b>'+tOwn.toLocaleString()+' AED</b></div>':'')
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:13px 14px;background:'+(tNet>=0?'var(--green)':'var(--red)')+'">'
        +'<span style="font-size:.9rem;font-weight:800;color:#fff">🏦 الصافي السنوي</span>'
        +'<b style="font-size:1.1rem;font-weight:800;color:#fff">'+tNet.toLocaleString()+' AED</b>'
      +'</div>'
      +'</div>';

  } catch(e){ toast(e.message,'err'); console.error('loadAnnual:',e); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

// ══════════════════════════════════════════════════════
// PDF EXPORT
// Uses same deposit logic as loadMonthly
// ══════════════════════════════════════════════════════

async function exportPDF(type, mon) {
  var outEl = document.getElementById('rMonOut');
  if(!outEl) return;
  try {
    // Parallel fetch for PDF
    var [unitsRes2, paysRes2, expsRes2, ownsRes2, depsRes2] = await Promise.all([
      sb.from('units').select('id,apartment,room,monthly_rent,tenant_name,tenant_name2,start_date,deposit').eq('is_vacant',false).order('apartment'),
      // ACCRUAL PDF: payment_month
      sb.from('rent_payments').select('unit_id,amount,apartment,room,payment_month,payment_date,payment_method,tenant_num').like('payment_month', mon + '%'),
      sb.from('expenses').select('amount,category,period_month').eq('period_month', (mon||'').slice(0,7)+'-01'),
      sb.from('owner_payments').select('amount,period_month').eq('period_month', (mon||'').slice(0,7)+'-01'),
      sb.from('deposits').select('unit_id,amount,deposit_received_date,status')
    ]);
    var units = unitsRes2.data||[];
    var pays  = paysRes2.data||[];
    var exps  = expsRes2.data||[];
    var owns  = ownsRes2.data||[];
    var deps  = depsRes2.data||[];

    var monYM = mon.slice(0,7);

    var paidMap = {};
    pays.forEach(function(p){ paidMap[p.unit_id]=(paidMap[p.unit_id]||0)+(p.amount||0); });

    var depRawMap = {};
    deps.forEach(function(d){
      if(!d.unit_id) return;
      if(!depRawMap[d.unit_id]) depRawMap[d.unit_id]=[];
      depRawMap[d.unit_id].push(d);
    });

    var depMap = {};
    units.forEach(function(u){
      var amt = _pickDepositForReport(depRawMap[u.id]||[], monYM);
      if(amt>0) depMap[u.id] = amt;
    });

    var totalRent=0, totalRentColl=0, totalDeps=0, totalExp=0, totalOwner=0;
    units.forEach(function(u){
      totalRent     += u.monthly_rent||0;
      totalRentColl += paidMap[u.id]||0;
      totalDeps     += depMap[u.id]||0;
    });
    var totalColl = totalRentColl + totalDeps;
    exps.forEach(function(e){ totalExp   += e.amount||0; });
    owns.forEach(function(o){ totalOwner += o.amount||0; });

    // Group by apartment
    var apts = {};
    units.forEach(function(u){
      var apt = String(u.apartment);
      if(!apts[apt]) apts[apt]={units:[],rent:0,rentColl:0,deps:0};
      apts[apt].units.push(u);
      apts[apt].rent     += u.monthly_rent||0;
      apts[apt].rentColl += paidMap[u.id]||0;
      apts[apt].deps     += depMap[u.id]||0;
    });

    var floors = {};
    Object.keys(apts).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
      var fl = String(Math.floor(Number(apt)/100));
      if(!floors[fl]) floors[fl]={apts:[],rent:0,rentColl:0,deps:0};
      floors[fl].apts.push(apt);
      floors[fl].rent     += apts[apt].rent;
      floors[fl].rentColl += apts[apt].rentColl;
      floors[fl].deps     += apts[apt].deps;
    });

    var TH = function(t){ return '<th style="padding:6px 8px;text-align:right;background:#f0f0f0;border:1px solid #ccc;font-size:11px;color:#111;font-weight:700">'+t+'</th>'; };
    var TD = function(t,s){ return '<td style="padding:5px 8px;text-align:right;border:1px solid #ddd;font-size:11px;color:#222'+(s?';'+s:'')+'">'+((t===undefined||t===null)?'—':t)+'</td>'; };

    var aptHTML = '';
    Object.keys(floors).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(fl){
      var fg = floors[fl];
      var flRentColl = fg.rentColl;
      var flStatus   = flRentColl>=fg.rent?'#1a7a4a':flRentColl>0?'#b07400':'#c0392b';

      aptHTML += '<tr><td colspan="7" style="background:#e0e0e0;color:#111;padding:7px 10px;font-weight:700;font-size:12px;border:none">'
        +'🏬 الدور '+fl
        +'<span style="float:left;font-size:11px;color:'+flStatus+'">'
        +'محصّل: '+(fg.rentColl+fg.deps)+' | متبقي: '+(fg.rent-fg.rentColl)
        +'</span></td></tr>';

      fg.apts.forEach(function(apt){
        var g = apts[apt];
        var aptStatus = g.rentColl>=g.rent?'#1a7a4a':g.rentColl>0?'#b07400':'#c0392b';

        aptHTML += '<tr><td colspan="7" style="background:#e8e8e8;padding:5px 10px;font-weight:700;font-size:11px;color:#111;border-bottom:1px solid #ccc;border-top:2px solid #999">'
          +'شقة '+apt
          +' &nbsp;&nbsp; <span style="color:'+aptStatus+'">محصّل: '+g.rentColl+(g.deps>0?' | تأمين: '+g.deps:'')+' | متبقي: '+(g.rent-g.rentColl)+'</span>'
          +'</td></tr>';

        g.units.slice().sort(function(a,b){return Number(a.room)-Number(b.room);}).forEach(function(u){
          var dep  = depMap[u.id]||0;
          var got  = paidMap[u.id]||0;
          var rem  = Math.max(0,(u.monthly_rent||0)-got);
          var st   = got>=(u.monthly_rent||0)&&(u.monthly_rent||0)>0?'✅':got>0?'⚠️':'❌';
          aptHTML += '<tr>'
            +TD(u.room)
            +TD(u.tenant_name||(u.tenant_name2?u.tenant_name2:'—'))
            +TD(u.monthly_rent||0)
            +TD(dep>0?dep:'—', dep>0?'color:#2456d3;font-weight:700':'color:#888')
            +TD(got, got>0?'color:#1a7a4a;font-weight:700':'color:#c0392b')
            +TD(rem, rem>0?'color:#c0392b;font-weight:700':'color:#1a7a4a')
            +'<td style="padding:5px 8px;text-align:center;border:1px solid #ddd;font-size:12px">'+st+'</td>'
            +'</tr>';
        });

        aptHTML += '<tr style="background:#f0f0f0">'
          +'<td colspan="2" style="padding:5px 8px;font-weight:700;font-size:11px;border:1px solid #ddd;text-align:right">إجمالي شقة '+apt+'</td>'
          +TD(g.rent,'font-weight:700')
          +TD(g.deps>0?g.deps:'—','font-weight:700;color:#2456d3')
          +TD(g.rentColl,'font-weight:700;color:#1a7a4a')
          +TD(g.rent-g.rentColl,'font-weight:700;color:'+(g.rent-g.rentColl>0?'#c0392b':'#1a7a4a'))
          +'<td style="border:1px solid #ddd"></td></tr>';
      });

      aptHTML += '<tr style="background:#f0f0f0;color:#111">'
        +'<td colspan="2" style="padding:6px 10px;font-weight:700;font-size:12px;border:1px solid #ddd;text-align:right;color:#111">إجمالي الدور '+fl+'</td>'
        +TD(fg.rent,'font-weight:700')
        +TD(fg.deps>0?fg.deps:'—','font-weight:700;color:#2456d3')
        +TD(fg.rentColl,'font-weight:700;color:#1a7a4a')
        +TD(fg.rent-fg.rentColl,'font-weight:700;color:'+(fg.rent-fg.rentColl>0?'#ffaaaa':'#7defa7'))
        +'<td style="border:1px solid #ddd"></td></tr>';
    });

    document.getElementById('pdf-content').innerHTML =
      '<div class="hd">'
    var pdfPct = totalRent>0?Math.round(totalColl/totalRent*100):0;
    document.getElementById('pdf-content').innerHTML =
      '<div class="hd">'
      +'<div>'
      +'<div style="font-size:1.15rem;font-weight:700">Wahdati — تقرير الاستحقاق</div>'
      +'<div style="font-size:.8rem;color:#555;margin-top:2px">'+mon+' · نسبة التحصيل: <b style="color:'+(pdfPct>=90?'#1a7a4a':pdfPct>=60?'#b07400':'#c0392b')+'">'+pdfPct+'%</b></div>'
      +'</div>'
      +'<div style="font-size:.75rem;color:#666">'+new Date().toLocaleDateString()+'</div>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'
      +'<thead><tr>'+TH('غرفة')+TH('المستأجر')+TH('الإيجار')+TH('تأمين')+TH('مدفوع')+TH('متبقي')+'<th style="padding:6px 8px;text-align:center;background:#f0f0f0;border:1px solid #ddd;font-size:11px">#</th></tr></thead>'
      +'<tbody>'+aptHTML+'</tbody>'
      +'</table>'
      +'<div style="border-top:2px solid #333;padding-top:12px;margin-top:4px">'
      +'<div style="font-size:11px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">ملخص الشهر</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px;border-radius:4px">'
        +'<span style="font-size:11px;color:#555">🎯 الإيجار المستهدف</span>'
        +'<b style="font-size:12px;color:#333">'+totalRent.toLocaleString()+' AED</b>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px;background:#e8f5ee;border-radius:4px">'
        +'<span style="font-size:11px;color:#555">✅ إيجار محصّل</span>'
        +'<b style="font-size:12px;color:#1a7a4a">'+totalRentColl.toLocaleString()+' AED</b>'
      +'</div>'
      +(totalDeps>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px;background:#e8eeff;border-radius:4px">'
        +'<span style="font-size:11px;color:#555">🔒 تأمينات محصّلة</span>'
        +'<b style="font-size:12px;color:#2456d3">'+totalDeps.toLocaleString()+' AED</b>'
        +'</div>':'')
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 8px;margin-bottom:2px;background:#d4edda;border-radius:4px;border:1px solid #1a7a4a44">'
        +'<span style="font-size:11px;color:#555;font-weight:600">💵 إجمالي الكاش</span>'
        +'<b style="font-size:13px;color:#1a7a4a;font-weight:800">'+totalColl.toLocaleString()+' AED</b>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px;background:#ffeaea;border-radius:4px">'
        +'<span style="font-size:11px;color:#555">❌ إيجار غير محصّل</span>'
        +'<b style="font-size:12px;color:#c0392b">'+(totalRent-totalRentColl).toLocaleString()+' AED</b>'
      +'</div>'
      +(totalExp>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px;background:#fff8e1;border-radius:4px">'
        +'<span style="font-size:11px;color:#555">💸 المصاريف</span>'
        +'<b style="font-size:12px;color:#b07400">'+totalExp.toLocaleString()+' AED</b>'
        +'</div>':'')
      +(totalOwner>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:4px">'
        +'<span style="font-size:11px;color:#555">👤 دُفع للمالك</span>'
        +'<b style="font-size:12px;color:#555">'+totalOwner.toLocaleString()+' AED</b>'
        +'</div>':'')
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:6px">'
        +'<span style="font-size:11px;color:#555">📊 نسبة التحصيل</span>'
        +'<b style="font-size:12px;color:'+(pdfPct>=90?'#1a7a4a':pdfPct>=60?'#b07400':'#c0392b')+'">'+pdfPct+'%</b>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:'+(( totalColl-totalExp-totalOwner)>=0?'#1a7a4a':'#c0392b')+';border-radius:6px;color:#fff">'
        +'<span style="font-size:12px;font-weight:700">🏦 الإجمالي الصافي</span>'
        +'<b style="font-size:15px;font-weight:800">'+(totalColl-totalExp-totalOwner).toLocaleString()+' AED</b>'
      +'</div>'
      +'</div>';

    document.getElementById('pdfOverlay').style.display='flex';
  } catch(e){ toast('خطأ PDF: '+e.message,'err'); console.error('exportPDF:',e); }
}

// ══════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════

async function loadStats(btn) {
  var orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try {
    // Stats: fetch all units (including vacant for occupancy rate)
    var { data: units } = await sb.from('units').select('id,apartment,room,monthly_rent,is_vacant,unit_status');
    // Stats chart: cash trend uses payment_date (correct — shows when money arrived)
    var { data: pays }  = await sb.from('rent_payments').select('amount,payment_date,payment_month').order('payment_date');
    var { data: exps }  = await sb.from('expenses').select('amount,period_month');
    if(!units) units=[]; if(!pays) pays=[]; if(!exps) exps=[];

    function normUnitStatus(u){
      if(u.unit_status) return String(u.unit_status);
      return u.is_vacant ? 'available' : 'occupied';
    }
    var total = units.length;
    var occUnits = units.filter(function(u){ var st = normUnitStatus(u); return st !== 'available' && st !== 'reserved' && st !== 'maintenance'; });
    var occupied = occUnits.length;
    var vacant   = units.filter(function(u){ return normUnitStatus(u) === 'available'; }).length;
    var avgRent  = occupied>0 ? Math.round(occUnits.reduce(function(s,u){return s+(u.monthly_rent||0);},0)/occupied) : 0;
    var totalRentMonthly = occUnits.reduce(function(s,u){return s+(u.monthly_rent||0);},0);

    var monthMap = {};
    pays.forEach(function(p){ var m=(p.payment_date||'').slice(0,7); if(m) monthMap[m]=(monthMap[m]||0)+(p.amount||0); });
    var expMap = {};
    exps.forEach(function(e){ var m=(e.period_month||'').slice(0,7); if(m) expMap[m]=(expMap[m]||0)+(e.amount||0); });
    var months = Object.keys(monthMap).sort().slice(-6);

    var aptMap = {};
    units.forEach(function(u){
      var apt=String(u.apartment);
      if(!aptMap[apt]) aptMap[apt]={total:0,occupied:0};
      aptMap[apt].total++;
      if(normUnitStatus(u) !== 'available' && normUnitStatus(u) !== 'reserved' && normUnitStatus(u) !== 'maintenance') aptMap[apt].occupied++;
    });

    var occPct = total>0 ? Math.round(occupied/total*100) : 0;

    var html = '<div class="card" style="margin-bottom:12px">'
      +'<div style="font-weight:800;font-size:.9rem;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--border)">📊 نظرة عامة</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      +'<div style="background:var(--surf2);border-radius:12px;padding:14px;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--accent)">'+occPct+'%</div><div style="font-size:.72rem;color:var(--muted);margin-top:4px">نسبة الإشغال</div><div style="font-size:.75rem;margin-top:4px">'+occupied+' مشغولة / '+total+' إجمالي</div></div>'
      +'<div style="background:var(--surf2);border-radius:12px;padding:14px;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--green)">'+avgRent+'</div><div style="font-size:.72rem;color:var(--muted);margin-top:4px">متوسط الإيجار (AED)</div><div style="font-size:.75rem;margin-top:4px">إجمالي: '+totalRentMonthly+' AED/شهر</div></div>'
      +'<div style="background:var(--surf2);border-radius:12px;padding:14px;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--green)">'+occupied+'</div><div style="font-size:.72rem;color:var(--muted);margin-top:4px">وحدات مشغولة</div></div>'
      +'<div style="background:var(--surf2);border-radius:12px;padding:14px;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--red)">'+vacant+'</div><div style="font-size:.72rem;color:var(--muted);margin-top:4px">وحدات شاغرة</div></div>'
      +'</div></div>';

    if(months.length > 0) {
      var maxIncome = Math.max.apply(null, months.map(function(m){return monthMap[m]||0;}).concat([1]));
      html += '<div class="card" style="margin-bottom:12px"><div style="font-weight:800;font-size:.9rem;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)">📈 الدخل الشهري (آخر 6 أشهر)</div><div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding-bottom:4px">';
      months.forEach(function(m){
        var income=monthMap[m]||0;
        var pct=Math.round(income/maxIncome*100);
        var shortM=m.slice(5,7)+'/'+m.slice(2,4);
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px">'
          +'<div style="font-size:.55rem;color:var(--muted);margin-bottom:1px">'+(income>=1000?(income/1000).toFixed(0)+'k':income>0?String(income):'')+'</div>'
          +'<div style="width:100%;height:'+Math.max(pct,4)+'%;background:var(--accent);border-radius:4px 4px 0 0;min-height:4px"></div>'
          +'<div style="font-size:.6rem;color:var(--muted);white-space:nowrap;margin-top:2px">'+shortM+'</div>'
          +'</div>';
      });
      html += '</div></div>';
    }

    html += '<div class="card" style="margin-bottom:12px"><div style="font-weight:800;font-size:.9rem;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)">🏢 إشغال الشقق</div>';
    Object.keys(aptMap).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
      var d=aptMap[apt];
      var pct=Math.round(d.occupied/d.total*100);
      var col=pct===100?'var(--green)':pct>50?'var(--amber)':'var(--red)';
      html += '<div style="margin-bottom:10px">'
        +'<div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px"><span style="font-weight:600">شقة '+apt+'</span><span style="color:'+col+'">'+d.occupied+'/'+d.total+' ('+pct+'%)</span></div>'
        +'<div style="background:var(--surf2);border-radius:4px;height:8px"><div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:4px;transition:.3s"></div></div>'
        +'</div>';
    });
    html += '</div>';

    // Unit performance (last 3 months)
    if(window.loadUnitPerformance) {
      html += '<div class="card" style="margin-bottom:12px"><div style="font-weight:800;font-size:.9rem;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border)">🏆 أداء الوحدات (آخر 3 أشهر)</div><div id="unit-perf-placeholder"><div style="text-align:center;padding:10px"><span class="spin"></span></div></div></div>';
    }



    document.getElementById('statsOut').innerHTML = html;

    // Load unit performance async
    if(window.loadUnitPerformance) {
      window.loadUnitPerformance().then(function(ranked) {
        var el = document.getElementById('unit-perf-placeholder');
        if(!el) return;
        if(!ranked.length) { el.innerHTML = '<div style="color:var(--muted);font-size:.78rem;text-align:center">لا بيانات</div>'; return; }
        var perfHTML = '';
        ranked.slice(0,10).forEach(function(r,i) {
          var col = r.rate===100?'var(--green)':r.rate>=60?'var(--amber)':'var(--red)';
          var medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
          perfHTML += '<div style="margin-bottom:10px">'            +'<div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:3px">'            +'<span>'+medal+' <b>شقة '+r.u.apartment+'–'+r.u.room+'</b> '+(r.u.tenant_name?'<span style="color:var(--muted)">'+r.u.tenant_name+'</span>':'')+'</span>'            +'<span style="color:'+col+';font-weight:700">'+r.rate+'%</span></div>'            +'<div style="background:var(--surf2);border-radius:4px;height:6px">'            +'<div style="width:'+Math.min(r.rate,100)+'%;height:100%;background:'+col+';border-radius:4px;transition:.4s"></div></div>'            +'<div style="font-size:.65rem;color:var(--muted);margin-top:2px">محصّل: '+r.collected.toLocaleString()+' / '+r.expected.toLocaleString()+' AED</div>'            +'</div>';
        });
        el.innerHTML = perfHTML;
      }).catch(function(){});
    }
  } catch(e){ toast('خطأ: '+e.message,'err'); console.error('loadStats:',e); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

// ══════════════════════════════════════════════════════
// CSV EXPORT
// Fixed: deps variable now properly scoped
// ══════════════════════════════════════════════════════

async function exportCSV() {
  // Use XLSX if available, fallback to CSV
  if(typeof XLSX !== 'undefined') {
    return exportXLSX();
  }
  // CSV fallback
  toast(LANG==='ar'?'جاري التصدير...':'Exporting...','');
  try {
    var [unitsRes, paysRes, depsRes, expsRes, ownsRes] = await Promise.all([
      sb.from('units').select('*').order('apartment').order('room'),
      sb.from('rent_payments').select('*').order('payment_date',{ascending:false}),
      sb.from('deposits').select('*').order('deposit_received_date',{ascending:false}),
      sb.from('expenses').select('*').order('period_month'),
      sb.from('owner_payments').select('*').order('period_month')
    ]);
    var units=unitsRes.data||[], pays=paysRes.data||[], deps=depsRes.data||[], exps=expsRes.data||[], owns=ownsRes.data||[];
    var unitMap={}; units.forEach(function(u){unitMap[u.id]=u;});
    deps = deps.map(function(d){ var u = d.unit_id ? unitMap[d.unit_id] : null; return Object.assign({}, d, { apartment: d.apartment || (u && u.apartment) || '', room: d.room || (u && u.room) || '', tenant_name: d.tenant_name || (u && (u.tenant_name || u.tenant_name2)) || '' }); });
    var q=function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';};
    var today=new Date().toISOString().slice(0,10);
    var csv='\uFEFF'+'رقم,شقة,غرفة,اسم المستأجر,قيمة الإيجار,قيمة التحصيل,شهر الاستحقاق,تاريخ الاستلام,طريقة الدفع\n';
    pays.forEach(function(p,i){var u=unitMap[p.unit_id]||{};csv+=[i+1,p.apartment||u.apartment||'',p.room||u.room||'',u.tenant_name||'',u.monthly_rent||0,p.amount||0,(p.payment_month||'').slice(0,7),(p.payment_date||'').slice(0,10),p.payment_method||''].map(q).join(',')+'\n';});
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download='الدفعات_'+today+'.csv'; a.style.display='none'; document.body.appendChild(a); a.click(); setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},300);
    toast('تم التصدير ✓','ok');
  } catch(e){toast('خطأ: '+e.message,'err');}
}

async function exportXLSX() {
  toast(LANG==='ar'?'جاري تحضير ملف Excel...':'Preparing Excel...','');
  try {
    var [unitsRes, paysRes, depsRes, expsRes, ownsRes] = await Promise.all([
      sb.from('units').select('*').order('apartment').order('room'),
      sb.from('rent_payments').select('*').order('payment_date',{ascending:false}),
      sb.from('deposits').select('*').order('deposit_received_date',{ascending:false}),
      sb.from('expenses').select('*').order('period_month'),
      sb.from('owner_payments').select('*').order('period_month')
    ]);
    var units=unitsRes.data||[], pays=paysRes.data||[], deps=depsRes.data||[], exps=expsRes.data||[], owns=ownsRes.data||[];
    var unitMap={}; units.forEach(function(u){unitMap[u.id]=u;});
    deps = deps.map(function(d){ var u = d.unit_id ? unitMap[d.unit_id] : null; return Object.assign({}, d, { apartment: d.apartment || (u && u.apartment) || '', room: d.room || (u && u.room) || '', tenant_name: d.tenant_name || (u && (u.tenant_name || u.tenant_name2)) || '' }); });
    var depHeld={};
    deps.forEach(function(d){if(d.unit_id&&d.status==='held')depHeld[d.unit_id]=(depHeld[d.unit_id]||0)+(d.amount||0);});

    var wb = XLSX.utils.book_new();

    // Sheet 1: الدفعات
    var paysData = [['رقم','شقة','غرفة','المستأجر','الإيجار الشهري','المبلغ المحصّل','شهر الاستحقاق','تاريخ الاستلام','طريقة الدفع']];
    pays.forEach(function(p,i){
      var u=unitMap[p.unit_id]||{};
      paysData.push([i+1, p.apartment||u.apartment||'', p.room||u.room||'', u.tenant_name||'', u.monthly_rent||0, p.amount||0, (p.payment_month||'').slice(0,7), (p.payment_date||'').slice(0,10), p.payment_method||'']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paysData), 'الدفعات');

    // Sheet 2: الوحدات
    var unitsData = [['رقم','شقة','غرفة','المستأجر','الهاتف','الإيجار','تأمين محتجز','تاريخ الدخول','الحالة']];
    units.forEach(function(u,i){
      unitsData.push([i+1, u.apartment, u.room, u.tenant_name||'', u.phone||'', u.monthly_rent||0, depHeld[u.id]||0, (u.start_date||'').slice(0,10), u.is_vacant?'شاغرة':'مشغولة']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(unitsData), 'الوحدات');

    // Sheet 3: التأمينات
    var depsData = [['رقم','شقة','غرفة','المستأجر','المبلغ','تاريخ الاستلام','الحالة']];
    deps.forEach(function(d,i){
      depsData.push([i+1, d.apartment||'', d.room||'', d.tenant_name||'', d.amount||0, (d.deposit_received_date||'').slice(0,10), d.status==='held'?'محتجز':d.status==='refunded'?'مُرتجع':'مُصادر']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(depsData), 'التأمينات');

    // Sheet 4: المصاريف
    var expsData = [['رقم','الشهر','الفئة','المبلغ','الوصف']];
    exps.forEach(function(e,i){
      expsData.push([i+1, (e.period_month||'').slice(0,7), e.category||'', e.amount||0, e.description||'']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expsData), 'المصاريف');

    // Sheet 5: للمالك
    var ownsData = [['رقم','الشهر','المبلغ','طريقة الدفع','رقم الحوالة','ملاحظات']];
    owns.forEach(function(o,i){
      ownsData.push([i+1, (o.period_month||'').slice(0,7), o.amount||0, o.method||'', o.reference||'', o.notes||'']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ownsData), 'للمالك');

    var today = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, 'Wahdati_Export_'+today+'.xlsx');
    toast(LANG==='ar'?'تم تصدير Excel ✓ (5 صفحات)':'Excel exported ✓ (5 sheets)','ok');
  } catch(e){toast('خطأ: '+e.message,'err');console.error('exportXLSX:',e);}
}
window.exportXLSX = exportXLSX;

// ══════════════════════════════════════════════════════
// FULL BACKUP — exports all data as JSON
// ══════════════════════════════════════════════════════
async function exportFullBackup() {
  toast(LANG==='ar'?'جاري تحضير النسخة الاحتياطية...':'Preparing backup...','');
  try {
    var [uR,pR,dR,eR,oR,hR] = await Promise.all([
      sb.from('units').select('*').order('apartment').order('room'),
      sb.from('rent_payments').select('*').order('payment_date',{ascending:false}),
      sb.from('deposits').select('*').order('deposit_received_date',{ascending:false}),
      sb.from('expenses').select('*').order('period_month'),
      sb.from('owner_payments').select('*').order('period_month'),
      sb.from('unit_history').select('*').order('end_date',{ascending:false})
    ]);
    var backup = {
      exported_at: new Date().toISOString(),
      app: 'Wahdati v2',
      tables: {
        units: uR.data||[],
        rent_payments: pR.data||[],
        deposits: dR.data||[],
        expenses: eR.data||[],
        owner_payments: oR.data||[],
        unit_history: hR.data||[]
      },
      summary: {
        units_count: (uR.data||[]).length,
        payments_count: (pR.data||[]).length,
        deposits_count: (dR.data||[]).length,
        total_collected: (pR.data||[]).reduce(function(s,p){return s+(p.amount||0);},0)
      }
    };
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], {type:'application/json;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var today = new Date().toISOString().slice(0,10);
    a.href=url; a.download='Wahdati_Backup_'+today+'.json';
    a.style.display='none'; document.body.appendChild(a); a.click();
    setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},300);
    toast(LANG==='ar'?'✅ تم تصدير النسخة الاحتياطية':'✅ Backup exported','ok');
  } catch(e){ toast('خطأ: '+e.message,'err'); }
}
window.exportFullBackup = exportFullBackup;
window.exportCSV = exportCSV;


function exportAnnualCSV() {
  var wrap = document.getElementById('rAnnOut');
  if(!wrap) return toast('لا يوجد تقرير سنوي للتصدير','err');
  var table = wrap.querySelector('table');
  if(!table) return toast('لا يوجد جدول للتصدير','err');
  var rows = Array.from(table.querySelectorAll('tr')).map(function(tr){
    return Array.from(tr.querySelectorAll('th,td')).map(function(cell){
      return '"' + String((cell.textContent||'').trim()).replace(/"/g,'""') + '"';
    }).join(',');
  }).join('\n');
  var blob = new Blob(['﻿' + rows], { type:'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'annual-report-' + ((document.getElementById('r-year')||{}).value || new Date().getFullYear()) + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

window.loadMonthly=loadMonthly; window.loadExpRpt=loadExpRpt; window.loadDepRpt=loadDepRpt; window.loadAnnual=loadAnnual; window.exportPDF=exportPDF; window.loadStats=loadStats; window.exportAnnualCSV=exportAnnualCSV;

// ══════════════════════════════════════════════════════
// APARTMENT COMPARISON REPORT
// ══════════════════════════════════════════════════════
async function loadAptCompare(btn) {
  var yearEl = document.getElementById('rcmp-year');
  var year   = (yearEl && yearEl.value) ? parseInt(yearEl.value) : new Date().getFullYear();
  if(yearEl && !yearEl.value) yearEl.value = year;

  var orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  var outEl = document.getElementById('rCompareOut');
  if(!outEl) return;

  try {
    var [uR, pR, dR] = await Promise.all([
      sb.from('units').select('id,apartment,room,monthly_rent,tenant_name,is_vacant').order('apartment').order('room'),
      sb.from('rent_payments').select('unit_id,amount,payment_month'),
      sb.from('deposits').select('unit_id,amount,deposit_received_date').gte('deposit_received_date',year+'-01-01').lte('deposit_received_date',year+'-12-31')
    ]);

    var units   = uR.data||[];
    var pays    = pR.data||[];
    var deps    = dR.data||[];

    // Group by apartment
    var aptData = {};
    units.forEach(function(u) {
      var apt = String(u.apartment);
      if(!aptData[apt]) aptData[apt] = { apt, rooms:0, occupied:0, expectedYearly:0, collected:0, deposits:0 };
      aptData[apt].rooms++;
      if(!u.is_vacant) {
        aptData[apt].occupied++;
        aptData[apt].expectedYearly += (u.monthly_rent||0)*12;
      }
    });

    pays.forEach(function(p) {
      var u = units.find(function(u){ return u.id===p.unit_id; });
      if(!u) return;
      var apt = String(u.apartment);
      if(aptData[apt]) aptData[apt].collected += (p.amount||0);
    });

    deps.forEach(function(d) {
      var u = units.find(function(u){ return u.id===d.unit_id; });
      if(!u) return;
      var apt = String(u.apartment);
      if(aptData[apt]) aptData[apt].deposits += (d.amount||0);
    });

    // Sort by collected descending
    var sorted = Object.values(aptData).sort(function(a,b){ return b.collected - a.collected; });
    var maxColl = sorted.length ? sorted[0].collected : 1;

    var html = '<div style="font-size:.68rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">🏆 أداء الشقق — '+year+'</div>';

    sorted.forEach(function(d, i) {
      var rate    = d.expectedYearly>0 ? Math.round(d.collected/d.expectedYearly*100) : 0;
      var barW    = maxColl>0 ? Math.round(d.collected/maxColl*100) : 0;
      var col     = rate>=90?'var(--green)':rate>=60?'var(--amber)':'var(--red)';
      var medal   = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';

      html += '<div style="background:var(--surf2);border-radius:14px;padding:12px 14px;margin-bottom:8px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          +'<div>'
            +'<span style="font-size:.85rem;font-weight:800">'+medal+' شقة '+d.apt+'</span>'
            +'<span style="font-size:.68rem;color:var(--muted);margin-right:6px">'+d.occupied+'/'+d.rooms+' غرف</span>'
          +'</div>'
          +'<div style="text-align:end">'
            +'<div style="font-size:.88rem;font-weight:800;color:'+col+'">'+rate+'%</div>'
            +'<div style="font-size:.62rem;color:var(--muted)">'+d.collected.toLocaleString()+' AED</div>'
          +'</div>'
        +'</div>'
        // Bar
        +'<div style="background:var(--surf3);border-radius:4px;height:10px;overflow:hidden;margin-bottom:6px">'
          +'<div style="height:100%;background:'+col+';width:'+barW+'%;border-radius:4px;transition:width .5s ease"></div>'
        +'</div>'
        // Stats row
        +'<div style="display:flex;gap:12px;font-size:.68rem;color:var(--muted)">'
          +'<span>🎯 مستهدف: '+d.expectedYearly.toLocaleString()+'</span>'
          +(d.deposits>0?'<span>🔒 تأمين: '+d.deposits.toLocaleString()+'</span>':'')
          +'<span style="color:'+(d.expectedYearly-d.collected>0?'var(--red)':'var(--green)')+'">متبقي: '+(Math.max(0,d.expectedYearly-d.collected)).toLocaleString()+'</span>'
        +'</div>'
        +'</div>';
    });

    // Grand total bar
    var totalColl = sorted.reduce(function(s,d){return s+d.collected;},0);
    var totalExp  = sorted.reduce(function(s,d){return s+d.expectedYearly;},0);
    var totalRate = totalExp>0?Math.round(totalColl/totalExp*100):0;
    var totalCol  = totalRate>=90?'var(--green)':totalRate>=60?'var(--amber)':'var(--red)';

    html += '<div style="background:var(--surf3);border-radius:14px;padding:13px 14px;border:1.5px solid var(--border)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-weight:800;font-size:.88rem">📊 إجمالي '+year+'</span>'
        +'<div style="text-align:end"><div style="font-size:1rem;font-weight:800;color:'+totalCol+'">'+totalRate+'%</div><div style="font-size:.68rem;color:var(--muted)">'+totalColl.toLocaleString()+' / '+totalExp.toLocaleString()+' AED</div></div>'
      +'</div>'
      +'</div>';

    outEl.innerHTML = html;
  } catch(e) {
    outEl.innerHTML = '<div style="color:var(--red)">خطأ: '+e.message+'</div>';
    console.error('loadAptCompare:', e);
  } finally {
    btn.disabled=false; btn.innerHTML=orig;
  }
}
window.loadAptCompare = loadAptCompare;

// ══════════════════════════════════════════════════════
// RECEIPTS SEARCH — Supabase
// ══════════════════════════════════════════════════════
var _rcptSearchTimer = null;
async function searchReceipts(q) {
  clearTimeout(_rcptSearchTimer);
  _rcptSearchTimer = setTimeout(async function() {
    var outEl = document.getElementById('receipts-result');
    if(!outEl) return;

    q = (q||'').trim();
    if(!q) {
      outEl.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--muted);font-size:.82rem">'+(LANG==='ar'?'اكتب للبحث في الإيصالات':'Type to search receipts')+'</div>';
      return;
    }

    outEl.innerHTML = '<div style="text-align:center;padding:20px"><span class="spin"></span></div>';

    try {
      var query = sb.from('receipts')
        .select('receipt_no,apartment,room,tenant_name,amount,payment_month,payment_date,payment_method,lang,created_at')
        .order('created_at', {ascending:false})
        .limit(50);

      // بحث ذكي حسب نوع الإدخال
      if(q.startsWith('W-') || q.startsWith('w-')) {
        query = query.ilike('receipt_no', q+'%');
      } else if(/^\d+$/.test(q) && q.length <= 4) {
        // رقم شقة أو غرفة
        query = query.or('apartment.eq.'+q+',room.eq.'+q);
      } else {
        // اسم مستأجر
        query = query.ilike('tenant_name', '%'+q+'%');
      }

      var { data, error } = await query;
      if(error) throw error;

      if(!data || !data.length) {
        outEl.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--muted);font-size:.82rem">📭 '+(LANG==='ar'?'لا توجد نتائج':'No results found')+'</div>';
        return;
      }

      var esc = function(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
      var methAr = {cash:'نقداً', Cash:'نقداً', transfer:'تحويل', 'Bank Transfer':'تحويل', cheque:'شيك', Cheque:'شيك'};

      outEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:8px">'+data.length+' '+(LANG==='ar'?'نتيجة':'results')+'</div>'
        + data.map(function(r) {
            var isEn = r.lang === 'en';
            var meth = isEn ? (r.payment_method||'') : (methAr[r.payment_method] || r.payment_method || '');
            return '<div style="background:var(--surf2);border:1px solid var(--border);border-radius:12px;padding:13px 14px;margin-bottom:8px">'              +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'                +'<span style="font-family:monospace;font-size:.82rem;font-weight:700;color:var(--accent);background:var(--accent-glow);padding:2px 8px;border-radius:6px">'+esc(r.receipt_no)+'</span>'                +'<span style="font-size:1rem;font-weight:800;color:var(--green)">'+Number(r.amount||0).toLocaleString()+' AED</span>'              +'</div>'              +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.75rem">'                +'<div><span style="color:var(--muted)">'+(LANG==='ar'?'الشقة / الغرفة':'Apt / Room')+'</span><br><b>'+esc(r.apartment)+' — '+esc(r.room)+'</b></div>'                +(r.tenant_name?'<div><span style="color:var(--muted)">'+(LANG==='ar'?'المستأجر':'Tenant')+'</span><br><b>'+esc(r.tenant_name)+'</b></div>':'')                +'<div><span style="color:var(--muted)">'+(LANG==='ar'?'الشهر':'Month')+'</span><br><b>'+esc(r.payment_month||'')+'</b></div>'                +'<div><span style="color:var(--muted)">'+(LANG==='ar'?'التاريخ':'Date')+'</span><br><b>'+(r.payment_date||'').slice(0,10)+'</b></div>'                +(meth?'<div><span style="color:var(--muted)">'+(LANG==='ar'?'الطريقة':'Method')+'</span><br><b>'+esc(meth)+'</b></div>':'')              +'</div>'              +'</div>';
          }).join('');

    } catch(e) {
      outEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);font-size:.8rem">خطأ: '+e.message+'</div>';
    }
  }, 400);
}
window.searchReceipts = searchReceipts;
