// ══ WAHDATI DASHBOARD v2 ══
// Features: Smart Dashboard, Collection Report, Quick Payment,
//           Late Payers, Forecast, Month Comparison

// ══════════════════════════════════════════════════════
// QUICK SWITCH TAB — works without needing tab button context
// ══════════════════════════════════════════════════════
function quickSwitchTab(tabId) {
  var tabBtn = document.querySelector('[data-tab-target="'+tabId+'"]');
  if(tabBtn && window.switchTab) {
    window.switchTab(tabId, tabBtn);
  } else {
    var panel = document.getElementById(tabId);
    if(!panel) return;
    var parent = panel.closest('.card') || panel.parentElement;
    if(parent) {
      parent.querySelectorAll('.tpanel').forEach(function(p){ p.classList.remove('active'); });
      parent.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    }
    panel.classList.add('active');
  }
  setTimeout(function(){
    var panel = document.getElementById(tabId);
    if(panel) {
      var inp = panel.querySelector('input:not([type=hidden]):not([disabled])');
      if(inp) inp.focus();
    }
  }, 100);
}
window.quickSwitchTab = quickSwitchTab;

// ══════════════════════════════════════════════════════
// SMART DASHBOARD — full status breakdown + comparison
// ══════════════════════════════════════════════════════


function getUnitStatusKey(u) {
  var st = String((u && u.unit_status) || '').trim();
  if(st) return st;
  return u && u.is_vacant ? 'available' : 'occupied';
}
function isDashboardOccupied(u) {
  var st = getUnitStatusKey(u);
  return st !== 'available' && st !== 'reserved' && st !== 'maintenance';
}

async function loadSmartDash(ym) {
  try {
    var prevDate = new Date(ym+'-01');
    prevDate.setMonth(prevDate.getMonth()-1);
    var prevYM = prevDate.getFullYear()+'-'+String(prevDate.getMonth()+1).padStart(2,'0');

    // Parallel fetch
    // cash: uses payment_date (actual receipt)
    // accrual: uses payment_month (who paid this month's rent)
    var [cashPaysRes, accrualPaysRes, depsRes, unitsRes, prevCashRes, prevAccrualRes, departRes, expRes, ownerRes, refDepsSmartRes] = await Promise.all([
      // CASH — for dashboard "collected" KPI
      sb.from('rent_payments').select('amount,unit_id').gte('payment_date',ym+'-01').lte('payment_date',monthEnd(ym)),
      // ACCRUAL — for "remaining" / unit status badges
      sb.from('rent_payments').select('amount,unit_id').like('payment_month', ym + '%'),
      sb.from('deposits').select('amount,deposit_received_date,status').gte('deposit_received_date',ym+'-01').lte('deposit_received_date',monthEnd(ym)),
      sb.from('units').select('id,apartment,room,monthly_rent,is_vacant,unit_status,start_date'),
      // Previous month cash (for comparison)
      sb.from('rent_payments').select('amount').gte('payment_date',prevYM+'-01').lte('payment_date',monthEnd(prevYM)),
      // Previous month accrual (for comparison)
      sb.from('rent_payments').select('amount').like('payment_month', prevYM + '%'),
      sb.from('moves').select('unit_id').eq('type','depart').gte('move_date',ym+'-01').lte('move_date',monthEnd(ym)),
      sb.from('expenses').select('amount').eq('period_month', (ym||'').slice(0,7)+'-01'),
      sb.from('owner_payments').select('amount').eq('period_month', (ym||'').slice(0,7)+'-01'),
      // Refunded deposits this month by refund_date
      sb.from('deposits').select('amount,refund_amount,refund_date,apartment,room,tenant_name,deposit_received_date')
        .eq('status','refunded')
    ]);

    var cashPays     = cashPaysRes.data||[];
    var accrualPays  = accrualPaysRes.data||[];
    var deps         = depsRes.data||[];
    var allRefSmartData = refDepsSmartRes.data||[];
    function refEffMonth(d) {
      var dt = (d.refund_date && d.refund_date !== '0001-01-01') ? d.refund_date : (d.deposit_received_date||'');
      return (dt||'').slice(0,7);
    }
    var refDepsSmart = allRefSmartData.filter(function(d){ return refEffMonth(d) === ym; });
    var units        = unitsRes.data||[];
    var prevCash     = prevCashRes.data||[];
    var prevAccrual  = prevAccrualRes.data||[];
    var departs      = departRes.data||[];
    var exps         = expRes.data||[];
    var owners       = ownerRes.data||[];
    var departSet    = new Set((departs||[]).map(function(d){ return d.unit_id; }));

    // Accrual paidMap — for unit status (green/red badges)
    var accrualPaidMap = {};
    accrualPays.forEach(function(p){ accrualPaidMap[p.unit_id]=(accrualPaidMap[p.unit_id]||0)+(p.amount||0); });

    // Status counts
    var occupied    = units.filter(function(u){ return isDashboardOccupied(u); });
    var vacant      = units.filter(function(u){ return getUnitStatusKey(u)==='available'; });
    var reserved    = units.filter(function(u){ return getUnitStatusKey(u)==='reserved'; });
    var maintenance = units.filter(function(u){ return getUnitStatusKey(u)==='maintenance'; });
    var leaving     = occupied.filter(function(u){ return departSet.has(u.id) || getUnitStatusKey(u)==='leaving_soon'; });
    var newThisMonth= occupied.filter(function(u){ return u.start_date && u.start_date.slice(0,7)===ym; });

    // CASH totals (payment_date based)
    var totalCashRent = cashPays.reduce(function(s,p){return s+(p.amount||0);},0);
    var totalDeps        = deps.reduce(function(s,d){ return s+(d.amount||0); },0);
    var totalRefundSmart = refDepsSmart.reduce(function(s,d){ return s+(d.amount||0); },0);
    var cashTotal     = totalCashRent + totalDeps;
    var totalExpenses = exps.reduce(function(s,e){return s+(e.amount||0);},0);
    var totalOwner    = owners.reduce(function(s,o){return s+(o.amount||0);},0);
    var cashOut       = totalExpenses + totalOwner;
    var net           = cashTotal - totalRefundSmart - cashOut;
    var prevCashTotal = prevCash.reduce(function(s,p){return s+(p.amount||0);},0);

    // ACCRUAL totals (payment_month based)
    var accrualPaid  = accrualPays.reduce(function(s,p){return s+(p.amount||0);},0);
    var prevAccrualTotal = prevAccrual.reduce(function(s,p){return s+(p.amount||0);},0);

    // Expected = sum of occupied units monthly_rent
    var expected  = occupied.reduce(function(s,u){return s+(u.monthly_rent||0);},0);
    // Remaining = accrual based (who OWES this month's rent)
    var remaining = expected - accrualPaid;

    // Dashboard comparison:
    // pct = accrual paid / expected (same basis — who paid THIS month's rent)
    // diff = cash difference (actual money in vs prev month)
    var pct       = expected>0 ? Math.round(accrualPaid/expected*100) : 0;
    var diff      = cashTotal - prevCashTotal;
    var diffPct   = prevCashTotal>0 ? Math.round(Math.abs(diff)/prevCashTotal*100) : 0;
    var diffColor = diff>=0?'var(--green)':'var(--red)';
    var diffArrow = diff>=0?'↑':'↓';

    var el = function(id){ return document.getElementById(id); };

    // KPI Cards
    if(el('dash-collected-cmp') && prevCashTotal>0) el('dash-collected-cmp').innerHTML = '<span style="color:'+diffColor+'">'+diffArrow+' '+diffPct+'% عن الشهر الماضي</span>';

    if(el('dash-pct'))         { el('dash-pct').textContent = pct+'%'; el('dash-pct').style.color = pct>=90?'var(--green)':pct>=60?'var(--amber)':'var(--red)'; }
    if(el('dash-pct-cmp') && prevCashTotal>0) el('dash-pct-cmp').innerHTML = '<span style="color:'+diffColor+'">'+diffArrow+' '+Math.abs(diff).toLocaleString()+' AED</span>';
    // Progress bar
    var pb = el('dash-progress-bar');
    if(pb) {
      pb.style.width = Math.min(pct,100)+'%';
      pb.style.background = pct>=90?'var(--green)':pct>=60?'var(--amber)':'var(--red)';
    }
    // AED suffix on collected
    if(el('dash-collected')) el('dash-collected').textContent = (cashTotal>=1000?(cashTotal/1000).toFixed(1)+'k':cashTotal.toLocaleString())+' AED';
    if(el('dash-expected'))  el('dash-expected').textContent  = (expected>=1000?(expected/1000).toFixed(1)+'k':expected.toLocaleString())+' AED';
    if(el('dash-expected-pct')) el('dash-expected-pct').textContent = (LANG==='ar'?'محصّل فعلياً: ':'Paid: ')+accrualPaid.toLocaleString()+' AED';
    if(el('dash-remaining')) {
      el('dash-remaining').textContent = (remaining>0?remaining.toLocaleString():'0')+' AED';
      el('dash-remaining').style.color = remaining>0?'var(--red)':'var(--green)';
    }
    if(el('dash-expenses'))  el('dash-expenses').textContent  = totalExpenses.toLocaleString()+' AED';
    if(el('dash-owner'))     el('dash-owner').textContent     = totalOwner.toLocaleString()+' AED';
    if(el('dash-cashout'))   el('dash-cashout').textContent   = cashOut.toLocaleString()+' AED';
    if(el('dash-net')) { el('dash-net').textContent = net.toLocaleString()+' AED'; el('dash-net').style.color = net>=0?'var(--green)':'var(--red)'; }

    // Unit status grid
    if(el('dash-occupied'))    el('dash-occupied').textContent    = occupied.length;
    if(el('dash-vacant'))      el('dash-vacant').textContent      = vacant.length;
    if(el('dash-leaving'))     el('dash-leaving').textContent     = leaving.length;
    if(el('dash-new'))         el('dash-new').textContent         = newThisMonth.length;
    if(el('dash-reserved'))    el('dash-reserved').textContent    = reserved.length;
    if(el('dash-maintenance')) el('dash-maintenance').textContent = maintenance.length;

  } catch(e) {
    console.error('loadSmartDash:', e);
    // Show error state on dashboard cards
    ['dash-collected','dash-expected','dash-remaining','dash-pct'].forEach(function(id){
      var el = document.getElementById(id);
      if(el && el.textContent === '—' || el && !el.textContent) el.textContent = '—';
    });
  }
}

// ══════════════════════════════════════════════════════
// COLLECTION REPORT — cash basis (payment_date)
// ══════════════════════════════════════════════════════

async function loadCollReport(btn) {
  // Auto-fill current month if empty
  var monEl = document.getElementById('rcoll-month');
  if(monEl && !monEl.value) {
    var now = new Date();
    monEl.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  var mon = monEl ? monEl.value : '';
  if(!mon){ toast(LANG==='ar'?'اختر الشهر':'Choose month','err'); return; }
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try {
    var monYM = mon.slice(0,7);

    // Prev month for comparison
    var prevD = new Date(monYM+'-01'); prevD.setMonth(prevD.getMonth()-1);
    var prevYM = prevD.getFullYear()+'-'+String(prevD.getMonth()+1).padStart(2,'0');

    var [paysRes, depsRes, expsRes, ownsRes, prevRes, unitsRes, refDepsRes] = await Promise.all([
      sb.from('rent_payments')
        .select('unit_id,apartment,room,amount,payment_date,payment_method,payment_month,tenant_num')
        .gte('payment_date',monYM+'-01').lte('payment_date',monthEnd(monYM)).order('apartment').order('room'),
      sb.from('deposits')
        .select('unit_id,apartment,room,amount,deposit_received_date,tenant_name,status,refund_date')
        .gte('deposit_received_date',monYM+'-01').lte('deposit_received_date',monthEnd(monYM)),
      sb.from('expenses').select('amount,category,description').eq('period_month', (monYM||'').slice(0,7)+'-01'),
      sb.from('owner_payments').select('amount').gte('payment_date',monYM+'-01').lte('payment_date',monthEnd(monYM)),
      sb.from('rent_payments').select('amount').gte('payment_date',prevYM+'-01').lte('payment_date',monthEnd(prevYM)),
      sb.from('units').select('id,apartment,room,tenant_name,tenant_name2,monthly_rent').eq('is_vacant',false),
      // Refunded deposits this month by refund_date
      sb.from('deposits').select('unit_id,apartment,room,amount,refund_date,tenant_name')
        .eq('status','refunded').gte('refund_date',monYM+'-01').lte('refund_date',monthEnd(monYM))
    ]);

    var pays    = paysRes.data||[];
    var deps    = depsRes.data||[];
    var exps    = expsRes.data||[];
    var owns    = ownsRes.data||[];
    var prevC   = (prevRes.data||[]).reduce(function(s,p){return s+(p.amount||0);},0);
    var units   = unitsRes.data||[];
    var allRefCollData = refDepsRes.data||[];
    function refEffMonthColl(d) {
      var dt = (d.refund_date && d.refund_date !== '0001-01-01') ? d.refund_date : (d.deposit_received_date||'');
      return (dt||'').slice(0,7);
    }
    var refDeps = allRefCollData.filter(function(d){ return refEffMonthColl(d) === monYM; });
    var unitMap = {};
    units.forEach(function(u){ unitMap[u.id]=u; });
    deps = deps.map(function(d){ var u = d.unit_id ? unitMap[d.unit_id] : null; return Object.assign({}, d, { apartment: d.apartment || (u && u.apartment) || '—', room: d.room || (u && u.room) || '—', tenant_name: d.tenant_name || (u && (u.tenant_name || u.tenant_name2)) || '—' }); });

    // Build unit lookup
    var unitMap = {};
    units.forEach(function(u){ unitMap[u.id]=u; });

    // Totals
    var totalRent  = pays.reduce(function(s,p){return s+(p.amount||0);},0);
    var totalDep   = deps.reduce(function(s,d){ if(d.status==='refunded') return s; return s+(d.amount||0); },0);
    // المُرتجعات في هذا الشهر بـ refund_date
    // المرتجعات — من query منفصلة بـ refund_date (تشمل تأمينات استُلمت في شهور سابقة)
    var refundedThisMonth = refDeps;
    var totalRefund = refundedThisMonth.reduce(function(s,d){return s+(d.amount||0);},0);
    var totalCash  = totalRent + totalDep;
    var totalExp   = exps.reduce(function(s,e){return s+(e.amount||0);},0);
    var totalOwner = owns.reduce(function(s,o){return s+(o.amount||0);},0);
    var net        = totalCash - totalRefund - totalExp - totalOwner;

    // Group payments by apartment
    var aptGroups = {};
    pays.forEach(function(p){
      var apt = String(p.apartment||'?');
      if(!aptGroups[apt]) aptGroups[apt]={rooms:{}, total:0};
      var room = String(p.room||'?');
      if(!aptGroups[apt].rooms[room]) {
        var u = unitMap[p.unit_id]||{};
        aptGroups[apt].rooms[room] = {
          room:p.room, pays:[], total:0,
          tenant: u.tenant_name||(p.tenant_num===2?(u.tenant_name2||'—'):'—'),
          rent: u.monthly_rent||0
        };
      }
      aptGroups[apt].rooms[room].pays.push(p);
      aptGroups[apt].rooms[room].total += p.amount||0;
      aptGroups[apt].total += p.amount||0;
    });

    var html = '';

    // ── KPI summary bar ──
    var pct = totalCash>0 && (totalRent+totalDep)>0 ? 100 : 0;
    var diff = totalCash - prevC;
    var diffPct = prevC>0?Math.round(Math.abs(diff)/prevC*100):0;
    var diffCol = diff>=0?'var(--green)':'var(--red)';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
    html += '<div style="background:var(--green-bg);border-radius:12px;padding:11px 13px;border-right:3px solid var(--green)">'
      +'<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">💵 إيجار محصّل</div>'
      +'<div style="font-weight:800;font-size:.95rem;color:var(--green)">'+totalRent.toLocaleString()+' AED</div>'
      +'<div style="font-size:.62rem;color:var(--muted);margin-top:1px">'+pays.length+' دفعة</div></div>';
    html += '<div style="background:var(--accent-glow);border-radius:12px;padding:11px 13px;border-right:3px solid var(--accent)">'
      +'<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">🔒 تأمينات محصّلة</div>'
      +'<div style="font-weight:800;font-size:.95rem;color:var(--accent)">'+totalDep.toLocaleString()+' AED</div>'
      +'<div style="font-size:.62rem;color:var(--muted);margin-top:1px">'+deps.length+' تأمين</div></div>';
    if(totalRefund>0) html += '<div style="background:var(--red-bg);border-radius:12px;padding:11px 13px;border-right:3px solid var(--red)">'
      +'<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">↩️ تأمين مُرتجع</div>'
      +'<div style="font-weight:800;font-size:.95rem;color:var(--red)">- '+totalRefund.toLocaleString()+' AED</div>'
      +'<div style="font-size:.62rem;color:var(--muted);margin-top:1px">'+refundedThisMonth.length+' مُرتجع</div></div>';
    html += '<div style="background:var(--surf2);border-radius:12px;padding:11px 13px;border-right:3px solid var(--amber)">'
      +'<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">💰 إجمالي الكاش</div>'
      +'<div style="font-weight:800;font-size:.95rem;color:var(--amber)">'+totalCash.toLocaleString()+' AED</div>'
      +(prevC>0?'<div style="font-size:.62rem;color:'+diffCol+';margin-top:1px">'+(diff>=0?'↑':'↓')+diffPct+'% عن الشهر الماضي</div>':'')
      +'</div>';
    html += '<div style="background:var(--surf2);border-radius:12px;padding:11px 13px;border-right:3px solid '+(net>=0?'var(--green)':'var(--red)')+'">'
      +'<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">📊 الصافي</div>'
      +'<div style="font-weight:800;font-size:.95rem;color:'+(net>=0?'var(--green)':'var(--red)')+'">'+net.toLocaleString()+' AED</div>'
      +(totalExp||totalOwner?'<div style="font-size:.62rem;color:var(--muted);margin-top:1px">بعد '+(totalExp?'مصاريف '+totalExp.toLocaleString():'')+(totalExp&&totalOwner?' + ':'')+(totalOwner?'مالك '+totalOwner.toLocaleString():'')+'</div>':'')
      +'</div>';
    html += '</div>';

    // ── PDF button ──
    // Action buttons
    html += '<div style="display:flex;gap:8px;margin-bottom:14px">'
      +'<button onclick="exportCollPDF(\''+monYM+'\')" style="flex:1;padding:12px;background:var(--surf2);border:1.5px solid var(--border);border-radius:12px;color:var(--text);font-family:var(--font);font-size:.82rem;font-weight:700;cursor:pointer">📄 PDF</button>'
      +'<button onclick="goPanel(\'units\');setTimeout(function(){setFilter(\'unpaid\',document.querySelector(\'[data-filter=unpaid]\'));},150);" style="flex:1;padding:12px;background:var(--red)18;border:1.5px solid var(--red)44;border-radius:12px;color:var(--red);font-family:var(--font);font-size:.82rem;font-weight:700;cursor:pointer">⚠️ غير مدفوعة</button>'
      +'</div>';

    // ── Per apartment groups ──
    if(pays.length > 0) {
      Object.keys(aptGroups).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
        var ag = aptGroups[apt];
        var rooms = Object.values(ag.rooms).sort(function(a,b){
          return Number(String(a.room).replace(/\D/g,''))-Number(String(b.room).replace(/\D/g,''));
        });

        html += '<div class="card" style="margin-bottom:10px;padding:0;overflow:hidden">';

        // Apt header
        html += '<div style="display:flex;justify-content:space-between;align-items:center;'
          +'padding:10px 14px;background:var(--surf2);border-bottom:1px solid var(--border)">'
          +'<div style="font-weight:700;font-size:.85rem">🏢 شقة '+apt+'</div>'
          +'<div style="font-weight:800;font-size:.85rem;color:var(--green)">'+ag.total.toLocaleString()+' AED</div>'
          +'</div>';

        // Room rows
        rooms.forEach(function(r){
          var lastDate = r.pays.length>0?(r.pays[r.pays.length-1].payment_date||'').slice(0,10):'';
          var method   = r.pays.length>0?(r.pays[0].payment_method||''):'';
          var isPaid   = r.rent>0 && r.total>=r.rent;

          html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)22">'
            // Status dot
            +'<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+(isPaid?'var(--green)':r.total>0?'var(--amber)':'var(--red)')+'"></div>'
            // Room + tenant
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:.8rem;font-weight:600">غرفة '+r.room
            +(r.tenant&&r.tenant!=='—'?' <span style="font-weight:400;color:var(--muted);font-size:.72rem">'+escapeHtml(r.tenant)+'</span>':'')
            +'</div>'
            +(lastDate?'<div style="font-size:.67rem;color:var(--muted);margin-top:1px">📅 '+lastDate+(method?' · '+method:'')+'</div>':'')
            +'</div>'
            // Amount
            +'<div style="text-align:end;flex-shrink:0">'
            +'<div style="font-weight:700;font-size:.85rem;color:var(--green)">'+r.total.toLocaleString()+' AED</div>'
            +(r.rent>0?'<div style="font-size:.65rem;color:var(--muted)">من '+r.rent.toLocaleString()+'</div>':'')
            +'</div>'
            +'</div>';
        });

        html += '</div>';
      });
    }

    // ── Deposits section ──
    if(deps.length > 0) {
      html += '<div class="card" style="margin-bottom:10px;padding:0;overflow:hidden">'
        +'<div style="padding:10px 14px;background:var(--surf2);border-bottom:1px solid var(--border);font-weight:700;font-size:.85rem">🔒 تأمينات محصّلة ('+deps.length+')</div>';
      deps.forEach(function(d){
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)22">'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:.8rem;font-weight:600">'+escapeHtml(d.tenant_name||'—')+'</div>'
          +'<div style="font-size:.67rem;color:var(--muted);margin-top:1px">شقة '+(d.apartment||'')+'–'+(d.room||'')+' 📅'+(d.deposit_received_date||'').slice(0,10)+'</div>'
          +'</div>'
          +'<div style="font-weight:700;font-size:.85rem;color:var(--accent)">'+(d.amount||0).toLocaleString()+' AED</div>'
          +'</div>';
      });
      html += '</div>';
    }

    // قسم التأمينات المُرتجعة
    if(refundedThisMonth.length > 0) {
      html += '<div style="background:var(--red-bg);border:1px solid var(--red)44;border-radius:12px;padding:0;overflow:hidden;margin-bottom:10px">'        +'<div style="padding:10px 14px;border-bottom:1px solid var(--red)33;font-weight:700;font-size:.85rem">↩️ تأمينات مُرتجعة ('+refundedThisMonth.length+')</div>';      refundedThisMonth.forEach(function(d){        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)55">'          +'<div>'            +'<div style="font-size:.78rem;font-weight:700">'+d.apartment+' — '+d.room+'</div>'            +'<div style="font-size:.68rem;color:var(--muted)">'+( d.tenant_name||'—')+'</div>'            +(d.refund_date?'<div style="font-size:.65rem;color:var(--muted)">↩️ '+(d.refund_date||'').slice(0,10)+'</div>':'')          +'</div>'          +'<div style="font-weight:800;color:var(--red);font-size:.9rem">- '+(d.amount||0).toLocaleString()+' AED</div>'          +'</div>';      });      html += '</div>';    }

    if(!pays.length && !deps.length) {
      html = '<div style="text-align:center;padding:40px 20px;color:var(--muted)">'
        +'<div style="font-size:2rem;margin-bottom:8px">📭</div>'
        +'<div style="font-weight:600">لا توجد مدفوعات في '+monYM+'</div></div>';
    }

    document.getElementById('rCollOut').innerHTML = html;

  } catch(e){ toast(e.message,'err'); console.error('loadCollReport:',e); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}
// ══════════════════════════════════════════════════════
// QUICK PAYMENT UX
// ══════════════════════════════════════════════════════

var _lastPaymentData = null;

async function loadLastPayment() {
  try {
    var bar = document.getElementById('quick-pay-bar');
    if(!bar) return;
    // Pre-fill from last session (localStorage)
    try {
      var la = localStorage.getItem('lastPayApt');
      var lr = localStorage.getItem('lastPayRoom');
      var ae = document.getElementById('r-apt');
      var re = document.getElementById('r-room');
      if(la && ae && !ae.value) ae.value = la;
      if(lr && re && !re.value) re.value = lr;
      if(la && lr && window.autoFillRent) setTimeout(autoFillRent, 100);
    } catch(e) {}
    var { data: last } = await sb.from('rent_payments').select('*').order('payment_date',{ascending:false}).limit(1);
    if(!last||!last[0]) return;
    var p = last[0];
    _lastPaymentData = p;
    bar.style.display = 'block';
    var info = document.getElementById('quick-pay-info');
    if(info) info.innerHTML = '<b>شقة '+p.apartment+' — '+p.room+'</b>'
      +' <span style="color:var(--green);font-weight:700">'+(p.amount||0).toLocaleString()+' AED</span>'
      +' <span style="color:var(--muted);font-size:.7rem"> · '+(p.payment_date?p.payment_date.slice(0,10):'')+'</span>';
  } catch(e) { /* silent */ }
}
async function repeatLastPayment() {
  if(!_lastPaymentData) return;
  var p = _lastPaymentData;
  var fill = function(id, val){ var el=document.getElementById(id); if(el) el.value=val; };
  fill('r-apt',  p.apartment||'');
  fill('r-room', p.room||'');
  fill('r-amt',  p.amount||'');
  var methEl = document.getElementById('r-meth');
  if(methEl) methEl.value = p.payment_method||'Cash';
  var monEl = document.getElementById('r-month');
  if(monEl && !monEl.value) {
    var now = new Date();
    monEl.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  var pdEl = document.getElementById('r-pdate');
  if(pdEl && !pdEl.value) pdEl.value = new Date().toISOString().slice(0,10);
  var amtEl = document.getElementById('r-amt');
  if(amtEl){ amtEl.focus(); amtEl.select(); }
  toast(LANG==='ar'?'تم ملء البيانات — راجع وحفظ':'Data filled — review and save','ok');
}

// ══════════════════════════════════════════════════════
// LATE PAYERS PANEL + BULK WHATSAPP
// ══════════════════════════════════════════════════════

async function openLatePayersPanel() {
  try {
    var now = new Date();
    var ym  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

    var [unitsRes, paysRes] = await Promise.all([
      sb.from('units').select('id,apartment,room,tenant_name,phone,monthly_rent,is_vacant,start_date,language').eq('is_vacant',false),
      // LATE PAYERS: use payment_month to find who has not paid this month's rent (accrual)
      sb.from('rent_payments').select('unit_id,amount').like('payment_month', ym + '%')
    ]);

    var units = unitsRes.data||[];
    var paidMap = {};
    (paysRes.data||[]).forEach(function(p){ paidMap[p.unit_id]=(paidMap[p.unit_id]||0)+(p.amount||0); });

    var late = units.filter(function(u){
      if(u.start_date && u.start_date.slice(0,7)===ym) return false;
      var paid = paidMap[u.id]||0;
      return paid < (u.monthly_rent||0) && (u.monthly_rent||0)>0;
    }).map(function(u){
      return {...u, paid:paidMap[u.id]||0, rem:(u.monthly_rent||0)-(paidMap[u.id]||0)};
    }).sort(function(a,b){ return b.rem-a.rem; });

    if(!late.length){ toast('✅ '+(LANG==='ar'?'الجميع دفعوا!':'Everyone paid!'),'ok'); return; }

    var modal = document.createElement('div');
    modal.id = 'late-payers-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:600;display:flex;align-items:flex-end;justify-content:center;padding:0';

    var totalRem = late.reduce(function(s,u){return s+u.rem;},0);
    var rows = late.map(function(u){
      var col  = u.paid>0?'var(--amber)':'var(--red)';
      var stat = u.paid>0?(LANG==='ar'?'جزئي':'Partial'):(LANG==='ar'?'لم يدفع':'Unpaid');
      var safePhone = (u.phone||'').replace(/['"/\\]/g,'');
      var safeName  = (u.tenant_name||'').replace(/['"/\\]/g,'');
      var safeApt   = String(u.apartment||'').replace(/['"/\\]/g,'');
      var safeRoom  = String(u.room||'').replace(/['"/\\]/g,'');
      var waBtn = u.phone
        ? '<button onclick="sendLateWA(\'' + safePhone + '\',\'' + safeName + '\',' + u.rem + ',\'' + safeApt + '\',\'' + safeRoom + '\',\'' + (u.language||'ar') + '\')" '
          +'style="padding:5px 12px;background:var(--green)22;border:1px solid var(--green);border-radius:8px;color:var(--green);font-size:.7rem;cursor:pointer;font-family:inherit">💬 WA</button>'
        : '<span style="font-size:.65rem;color:var(--muted)">لا هاتف</span>';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)22">'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:.8rem;font-weight:600">شقة '+u.apartment+'–'+u.room+' <span style="font-weight:400;color:var(--muted)">'+escapeHtml(u.tenant_name||'—')+'</span></div>'
        +'<div style="font-size:.7rem;color:'+col+'">'+stat+' · متبقي: <b>'+u.rem.toLocaleString()+'</b> AED</div>'
        +'</div>'
        +'<div style="flex-shrink:0;margin-right:8px">'+waBtn+'</div>'
        +'</div>';
    }).join('');

    modal.innerHTML = '<div style="background:var(--surf);border-radius:20px 20px 0 0;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;padding:20px 16px 32px">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
      +'<div><div style="font-weight:800;font-size:1rem">⚠️ المتأخرون — '+ym+'</div>'
      +'<div style="font-size:.72rem;color:var(--muted);margin-top:2px">'+late.length+' وحدة · متبقي إجمالي: '+totalRem.toLocaleString()+' AED</div></div>'
      +'<button onclick="document.getElementById(\'late-payers-modal\').remove()" style="background:var(--surf2);border:1px solid var(--border);border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:1.1rem;flex-shrink:0">✕</button>'
      +'</div>'
      +'<button onclick="sendBulkLateWA()" style="width:100%;padding:12px;background:var(--green);border:none;border-radius:12px;color:#fff;font-family:var(--font);font-size:.85rem;font-weight:700;cursor:pointer;margin-bottom:12px">💬 إرسال تذكير للجميع عبر WhatsApp</button>'
      +'<div>'+rows+'</div></div>';

    window._latePayers = late;
    modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e){ toast('خطأ: '+e.message,'err'); }
}

function sendLateWA(phone, name, rem, apt, room, unitLang) {
  var lang = unitLang || LANG;  // use unit language if available
  var now = new Date();
  var monthStr = now.toLocaleDateString(lang==='ar'?'ar-AE':'en-GB', {month:'long', year:'numeric'});
  var msg = lang==='ar'
    ? 'السلام عليكم ' + name + ' 👋\n'
      + 'تذكير بخصوص إيجار شهر ' + monthStr + '\n'
      + 'الوحدة: شقة ' + apt + ' — غرفة ' + room + '\n'
      + 'المبلغ المتبقي: *' + rem + ' AED*\n'
      + 'نرجو السداد في أقرب وقت 🙏'
    : 'Hi ' + name + ' 👋\n'
      + 'Rent reminder for ' + monthStr + '\n'
      + 'Unit: Apt ' + apt + ' — Room ' + room + '\n'
      + 'Amount due: *' + rem + ' AED*\n'
      + 'Please settle at your earliest convenience 🙏';
  var clean = phone.replace(/\D/g,'');
  if(clean.startsWith('0')) clean = '971'+clean.slice(1);
  if(!clean.startsWith('971') && clean.length === 9) clean = '971' + clean;
  window.open('https://wa.me/'+clean+'?text='+encodeURIComponent(msg));
}

async function sendBulkLateWA() {
  var late = window._latePayers||[];
  var withPhone = late.filter(function(u){ return u.phone; });
  if(!withPhone.length){ toast(LANG==='ar'?'لا توجد أرقام':'No phone numbers','err'); return; }
  withPhone.forEach(function(u,i){
    setTimeout(function(){ sendLateWA(u.phone,u.tenant_name||'',u.rem,u.apartment,u.room); }, i*1500);
  });
  toast(LANG==='ar'?'جاري الفتح... '+withPhone.length+' رسالة':'Opening '+withPhone.length+' chats...','');
}

// ══════════════════════════════════════════════════════
// RENT FORECAST
// ══════════════════════════════════════════════════════

async function loadRentForecast() {
  try {
    var now = new Date();
    var nextM = new Date(now); nextM.setMonth(nextM.getMonth()+1);
    var nextYM = nextM.getFullYear()+'-'+String(nextM.getMonth()+1).padStart(2,'0');

    var [unitsRes, departRes] = await Promise.all([
      sb.from('units').select('id,apartment,room,monthly_rent,tenant_name,phone,is_vacant').eq('is_vacant',false),
      sb.from('moves').select('unit_id').eq('type','depart').gte('move_date',nextYM+'-01').lte('move_date',monthEnd(nextYM))
    ]);

    var units    = unitsRes.data||[];
    var leavingSet = new Set((departRes.data||[]).map(function(d){ return d.unit_id; }));
    var leaving  = units.filter(function(u){ return leavingSet.has(u.id); });
    var staying  = units.filter(function(u){ return !leavingSet.has(u.id); });
    var current  = units.reduce(function(s,u){ return s+(u.monthly_rent||0); },0);
    var forecast = staying.reduce(function(s,u){ return s+(u.monthly_rent||0); },0);

    return { forecast, current, leaving:leaving.length, staying:staying.length, nextYM, leavingUnits:leaving };
  } catch(e){ console.error('loadRentForecast:',e); return null; }
}

async function showForecast() {
  var modal = document.createElement('div');
  modal.id = 'forecast-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = '<div style="background:var(--surf);border-radius:20px;width:100%;max-width:420px;padding:22px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    +'<div style="font-weight:800;font-size:1rem">📈 توقعات الشهر القادم</div>'
    +'<button onclick="document.getElementById(\'forecast-modal\').remove()" style="background:var(--surf2);border:1px solid var(--border);border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:1rem">✕</button>'
    +'</div><div id="forecast-body" style="text-align:center;padding:16px"><span class="spin"></span></div></div>';
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
  document.body.appendChild(modal);

  var f = await loadRentForecast();
  var body = document.getElementById('forecast-body');
  if(!body) return;
  if(!f){ body.innerHTML = '<div style="color:var(--muted)">لا بيانات</div>'; return; }

  var diff = f.forecast - f.current;
  var diffColor = diff>=0?'var(--green)':'var(--red)';

  var leavingHtml = '';
  if(f.leavingUnits.length > 0) {
    leavingHtml = '<div style="margin-top:10px">'
      + f.leavingUnits.map(function(u){
          var waBtn = u.phone
            ? '<a href="https://wa.me/'+u.phone.replace(/\D/g,'')+'" target="_blank" onclick="event.stopPropagation()" style="padding:3px 8px;background:var(--green)22;border:1px solid var(--green)55;border-radius:6px;color:var(--green);font-size:.65rem;text-decoration:none">💬</a>'
            : '';
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)22;font-size:.78rem">'
            + '<div><b>شقة '+u.apartment+'–'+u.room+'</b>'
            + '<div style="font-size:.68rem;color:var(--muted)">'+escapeHtml(u.tenant_name||'—')+'</div></div>'
            + '<div style="display:flex;align-items:center;gap:6px">'+waBtn
            + '<span style="color:var(--amber);font-size:.72rem;font-weight:700">'+(u.monthly_rent||0).toLocaleString()+' AED</span></div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
    +'<div style="background:var(--surf2);border-radius:12px;padding:14px;text-align:center">'
    +'<div style="font-size:.62rem;color:var(--muted);margin-bottom:4px">هذا الشهر</div>'
    +'<div style="font-weight:800;font-size:1.1rem;color:var(--accent)">'+f.current.toLocaleString()+'</div>'
    +'<div style="font-size:.62rem;color:var(--muted)">AED</div></div>'
    +'<div style="background:var(--surf2);border-radius:12px;padding:14px;text-align:center">'
    +'<div style="font-size:.62rem;color:var(--muted);margin-bottom:4px">'+f.nextYM+'</div>'
    +'<div style="font-weight:800;font-size:1.1rem;color:var(--green)">'+f.forecast.toLocaleString()+'</div>'
    +'<div style="font-size:.62rem;color:var(--muted)">AED</div></div>'
    +'</div>'
    +(f.leaving>0
      ? '<div style="background:var(--amber)15;border:1px solid var(--amber)44;border-radius:10px;padding:10px 12px;font-size:.78rem;color:var(--amber);margin-bottom:8px">'
        +'📤 '+f.leaving+' وحدة مغادرة'+(diff<0?' · نقص: <b>'+Math.abs(diff).toLocaleString()+' AED</b>':'')
        +leavingHtml+'</div>'
      : '<div style="background:var(--green)15;border:1px solid var(--green)33;border-radius:10px;padding:10px 12px;font-size:.78rem;color:var(--green)">✅ لا مغادرات متوقعة</div>'
    )
    +'<div style="font-size:.72rem;color:var(--muted);text-align:center;margin-top:8px">'+f.staying+' وحدة متوقع بقاؤها</div>';
}

// ══════════════════════════════════════════════════════
// UNIT CODE GENERATOR
// ══════════════════════════════════════════════════════

function generateUnitCode(apartment, room, building) {
  var b = building ? building.toUpperCase().replace(/\s/g,'') : '';
  var a = String(apartment||'').replace(/\s/g,'');
  var r = String(room||'').replace(/\s/g,'').toUpperCase();
  return (b?b+'-':'')+'APT'+a+'-'+r;
}

// ══════════════════════════════════════════════════════
// AUTO INIT
// ══════════════════════════════════════════════════════

function initDashboard() {
  var now = new Date();
  var ym  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // Set default month inputs
  ['rpm','rcoll-month','rem','rdep-month'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && !el.value) el.value = ym;
  });
  var yearEl = document.getElementById('r-year');
  if(yearEl && !yearEl.value) yearEl.value = now.getFullYear();

  loadSmartDash(ym);
}

document.addEventListener('appReady', function(){ initDashboard(); });
setTimeout(function(){ if(document.getElementById('smart-dash')) initDashboard(); }, 2000);

// ══════════════════════════════════════════════════════
// PATCH GOPANEL & LOADHOME
// ══════════════════════════════════════════════════════

var _dashOrigGoPanel = window.goPanel;
window.goPanel = function(p) {
  if(_dashOrigGoPanel) _dashOrigGoPanel(p);
  if(p === 'pay') setTimeout(loadLastPayment, 200);
};

var _dashOrigLoadHome = window.loadHome;
window.loadHome = async function(btn, force) {
  if(_dashOrigLoadHome) await _dashOrigLoadHome(btn, force);
  var now = new Date();
  var ym  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  loadSmartDash(ym);
  if(!window._appReadyFired){ window._appReadyFired=true; document.dispatchEvent(new Event('appReady')); }
};

// ══════════════════════════════════════════════════════
// PDF PER APARTMENT — from collection report
// ══════════════════════════════════════════════════════

async function exportCollPDF(monYM) {
  try {
    toast(LANG==='ar'?'جاري التحضير...':'Preparing...','');

    var [paysRes, unitsRes, depsRes] = await Promise.all([
      sb.from('rent_payments')
        .select('unit_id,apartment,room,amount,payment_date,payment_method,payment_month')
        .gte('payment_date',monYM+'-01').lte('payment_date',monthEnd(monYM))
        .order('apartment').order('room'),
      sb.from('units')
        .select('id,apartment,room,tenant_name,tenant_name2,monthly_rent,unit_code,building_name')
        .eq('is_vacant',false).order('apartment').order('room'),
      sb.from('deposits').select('unit_id,amount,status')
    ]);

    var pays  = paysRes.data||[];
    var units = unitsRes.data||[];
    var deps  = depsRes.data||[];

    // Maps
    var paidMap = {};
    pays.forEach(function(p){
      var key = String(p.apartment)+'-'+String(p.room);
      if(!paidMap[key]) paidMap[key]={total:0,rows:[],unit_id:p.unit_id};
      paidMap[key].total += p.amount||0;
      paidMap[key].rows.push(p);
    });

    var depHeldMap = {};
    deps.forEach(function(d){
      if(d.unit_id && d.status==='held')
        depHeldMap[d.unit_id]=(depHeldMap[d.unit_id]||0)+(d.amount||0);
    });

    // Group units by apartment
    var aptGroups = {};
    units.forEach(function(u){
      var apt = String(u.apartment);
      if(!aptGroups[apt]) aptGroups[apt]=[];
      aptGroups[apt].push(u);
    });

    var totalCollected = pays.reduce(function(s,p){return s+(p.amount||0);},0);
    var totalTarget    = units.reduce(function(s,u){return s+(u.monthly_rent||0);},0);
    var pct = totalTarget>0?Math.round(totalCollected/totalTarget*100):0;
    var date = new Date().toLocaleDateString('ar-AE');

    var TH = function(t){ return '<th style="background:#1a3a6a;color:#fff;padding:6px 8px;text-align:right;font-size:11px;border:1px solid #ccc">'+t+'</th>'; };
    var TD = function(t,s){ return '<td style="padding:5px 8px;border:1px solid #e0e0e0;font-size:11px;'+(s||'')+'">'+t+'</td>'; };

    var bodyHTML = '<style>'
      +'body{font-family:Arial,Helvetica,sans-serif;direction:rtl;font-size:12px;color:#111;margin:0;padding:0}'
      +'table{width:100%;border-collapse:collapse}'
      +'th{font-size:11px;font-weight:700;text-align:right;padding:8px 10px;color:#444}'
      +'td{font-size:11px;padding:7px 10px;text-align:right;border-bottom:1px solid #f0f0f0}'
      +'</style>'
      +'<div style="font-family:Arial,Helvetica,sans-serif;direction:rtl;background:#fff;padding:20px;max-width:820px;margin:0 auto">';

    // Header
    bodyHTML += '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1a3a6a;padding-bottom:14px;margin-bottom:20px">'
      +'<div>'
      +'<div style="font-size:20px;font-weight:800;color:#1a3a6a">Wahdati — تسوية شهرية</div>'
      +'<div style="font-size:13px;color:#555;margin-top:3px;font-weight:600">'+monYM+'</div>'
      +'<div style="font-size:11px;color:#888;margin-top:2px">تاريخ الطباعة: '+date+'</div>'
      +'</div>'
      +'<div style="text-align:left">'
      +'<div style="font-size:22px;font-weight:800;color:'+(pct>=90?'#166534':pct>=60?'#92400e':'#991b1b')+'">'+pct+'%</div>'
      +'<div style="font-size:10px;color:#888">نسبة التحصيل</div>'
      +'</div>'
      +'</div>';

    // Summary bar — 4 KPI cards
    bodyHTML += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">'
      +'<div style="background:#f0faf5;border:1.5px solid #a7d7bc;border-radius:10px;padding:12px;text-align:center">'
        +'<div style="font-size:17px;font-weight:800;color:#166534">'+totalCollected.toLocaleString()+'</div>'
        +'<div style="font-size:10px;color:#555;margin-top:2px">محصّل (AED)</div></div>'
      +'<div style="background:#f5f7ff;border:1.5px solid #c0d0f0;border-radius:10px;padding:12px;text-align:center">'
        +'<div style="font-size:17px;font-weight:800;color:#2456d3">'+totalTarget.toLocaleString()+'</div>'
        +'<div style="font-size:10px;color:#555;margin-top:2px">مستهدف (AED)</div></div>'
      +'<div style="background:#fff8f8;border:1.5px solid #f0a0a0;border-radius:10px;padding:12px;text-align:center">'
        +'<div style="font-size:17px;font-weight:800;color:#c0392b">'+(totalTarget-totalCollected).toLocaleString()+'</div>'
        +'<div style="font-size:10px;color:#555;margin-top:2px">متبقي (AED)</div></div>'
      +'<div style="background:'+(pct>=90?'#f0faf5':pct>=60?'#fef9ec':'#fff8f8')+';border:1.5px solid '+(pct>=90?'#a7d7bc':pct>=60?'#f6cc7c':'#f0a0a0')+';border-radius:10px;padding:12px;text-align:center">'
        +'<div style="font-size:17px;font-weight:800;color:'+(pct>=90?'#166534':pct>=60?'#92400e':'#c0392b')+'">'+pct+'%</div>'
        +'<div style="font-size:10px;color:#555;margin-top:2px">نسبة التحصيل</div></div>'
      +'</div>';

    // Per apartment tables
    Object.keys(aptGroups).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
      var aptUnits = aptGroups[apt];
      var aptColl=0, aptTarget=0;

      bodyHTML += '<div style="margin-top:16px;border:1px solid #e8eef8;border-radius:10px;overflow:hidden">'
        +'<div style="background:#1a3a6a;color:#fff;padding:9px 14px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-size:13px;font-weight:800">🏢 شقة '+apt+'</span>'
        +'</div>';
      bodyHTML += '<table style="margin:0"><thead><tr style="background:#f0f4ff">'
        +TH('غرفة')+TH('المستأجر')+TH('الإيجار')+TH('تأمين')+TH('مدفوع')+TH('التاريخ')+TH('الحالة')
        +'</tr></thead><tbody>';

      aptUnits.forEach(function(u){
        var key  = String(u.apartment)+'-'+String(u.room);
        var pg   = paidMap[key];
        var paid = pg?pg.total:0;
        var dep  = depHeldMap[u.id]||0;
        var dates= pg?pg.rows.map(function(p){return(p.payment_date||'').slice(0,10);}).filter(Boolean).join(', '):'—';
        var status = paid>=(u.monthly_rent||0)&&(u.monthly_rent||0)>0?'✅ مدفوع':paid>0?'⚠️ جزئي':'❌ لم يدفع';
        var sc = paid>=(u.monthly_rent||0)?'#166534':paid>0?'#92400e':'#991b1b';
        var rowBg = paid>=(u.monthly_rent||0)?'':'background:#fffbf0';
        aptColl   += paid;
        aptTarget += u.monthly_rent||0;

        bodyHTML += '<tr style="'+rowBg+'">'
          +TD('<b>'+u.room+'</b>')
          +TD((u.tenant_name||'—')+(u.tenant_name2?' &amp; '+u.tenant_name2:''))
          +TD((u.monthly_rent||0).toLocaleString()+' AED')
          +TD(dep>0?dep.toLocaleString()+' AED':'—','color:#2456d3')
          +TD(paid>0?'<b>'+paid.toLocaleString()+' AED</b>':'—','color:'+(paid>0?'#166534':'#991b1b'))
          +TD(dates,'font-size:10px;color:#777')
          +TD(status,'color:'+sc+';font-weight:700;font-size:11px')
          +'</tr>';
      });

      var aptPct = aptTarget>0?Math.round(aptColl/aptTarget*100):0;
      bodyHTML += '<tr style="background:#e8f0e8;border-top:2px solid #a7d7bc">'
        +TD('<b>إجمالي شقة '+apt+'</b>','font-size:11px;background:#e8f0e8')+TD('')
        +TD(aptTarget.toLocaleString()+' AED','font-weight:700;background:#e8f0e8')
        +TD('')
        +TD('<b>'+aptColl.toLocaleString()+' AED</b>','color:#166534;font-weight:700;background:#e8f0e8')
        +TD('')
        +TD('<b>'+aptPct+'%</b>','color:'+(aptPct>=90?'#166534':aptPct>=60?'#92400e':'#991b1b')+';font-weight:800;background:#e8f0e8')
        +'</tr></tbody></table></div>';
    });

    // Grand total bar
    bodyHTML += '<div style="background:#1a3a6a;color:#fff;padding:12px 16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-top:16px">'
      +'<span style="font-weight:700;font-size:13px">الإجمالي الكلي للتحصيل</span>'
      +'<span><b style="font-size:15px">'+totalCollected.toLocaleString()+' AED</b>'
      +' <span style="font-size:11px;opacity:.85">من '+totalTarget.toLocaleString()+' ('+pct+'%)</span></span>'
      +'</div>'
      +'</div>'; // close main wrapper

    // Use pdfOverlay — same as monthly report (works on iOS)
    var el = document.getElementById('pdf-content');
    if(!el){ toast('خطأ: pdf-content غير موجود','err'); return; }
    el.innerHTML = bodyHTML;
    var overlay = document.getElementById('pdfOverlay');
    if(overlay) overlay.style.display='flex';

  } catch(e){ toast('خطأ PDF: '+e.message,'err'); console.error('exportCollPDF:',e); }
}
function escapeHtml2(v) {
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
window.escapeHtml2 = escapeHtml2;
window.exportCollPDF = exportCollPDF;

// Exports
window.loadCollReport      = loadCollReport;
window.loadSmartDash       = loadSmartDash;
window.repeatLastPayment   = repeatLastPayment;
window.loadLastPayment     = loadLastPayment;
window.generateUnitCode    = generateUnitCode;
window.openLatePayersPanel = openLatePayersPanel;
window.sendLateWA          = sendLateWA;
window.sendBulkLateWA      = sendBulkLateWA;
window.loadRentForecast    = loadRentForecast;
window.showForecast        = showForecast;
