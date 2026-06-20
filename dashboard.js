// ══ WAHDATI DASHBOARD v2 ══
// Features: Smart Dashboard, Collection Report, Quick Payment,
//           Late Payers, Forecast, Month Comparison

// helper مشترك — نفسه في reports.js
function calcEffectiveRent(u, discMap, adjustMap, monYM) {
  var adj = adjustMap && adjustMap[u.id];
  if(adj) {
    if(adj.type === 'override')  return Math.max(0, Number(adj.amount||0));
    if(adj.type === 'surcharge') return Math.max(0, Number(u.monthly_rent||0) + Number(adj.amount||0) - Number((discMap&&discMap[u.id])||0));
    if(adj.type === 'discount')  return Math.max(0, Number(u.monthly_rent||0) - Number(adj.amount||0) - Number((discMap&&discMap[u.id])||0));
  }
  var base = Number(u.monthly_rent || 0);
  if(monYM && u.start_date && String(u.start_date).slice(0,7) === monYM && u.first_month_rent) {
    base = Number(u.first_month_rent || base);
  }
  return Math.max(0, base - Number((discMap&&discMap[u.id])||0));
}

// helpers مشتركة — نفسهم في reports.js (Boundary Rule)
function getEffectiveStartMonth(start_date) {
  if(!start_date) return null;
  var d  = String(start_date).slice(0,10);
  var ym = d.slice(0,7);
  if(d === window.monthEnd(ym)) {
    var dt = new Date(ym+'-01'); dt.setMonth(dt.getMonth()+1);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  }
  return ym;
}

function getVacancyMonth(end_date) {
  if(!end_date) return null;
  var d  = String(end_date).slice(0,10);
  var ym = d.slice(0,7);
  if(d === window.monthEnd(ym)) {
    var dt = new Date(ym+'-01'); dt.setMonth(dt.getMonth()+1);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  }
  return ym;
}

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
    var monStart = ym+'-01';
    var monEnd = monthEnd(ym);
    var monNext2Start = (function(){
      var d=new Date(ym+'-01'); d.setMonth(d.getMonth()+2);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
    })();
    var _today = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();

    // ── Fetch all data ──
    // ── Fetch data ──
    var [
      snapResult,
      accrualPaysRes,
      cashPaysRes, depsRes, refDepsRes,
      prevCashRes, departRes, expRes, ownerRes
    ] = await Promise.all([
      buildMonthSnapshot(ym),
      sb.from('rent_payments').select('amount,unit_id').like('payment_month', ym+'%'),
      sb.from('rent_payments').select('amount,unit_id').gte('payment_date',monStart).lte('payment_date',monEnd),
      sb.from('deposits').select('amount').gte('deposit_received_date',monStart).lte('deposit_received_date',monEnd),
      sb.from('deposits').select('refund_amount').gt('refund_amount',0).gte('refund_date',monStart).lte('refund_date',monEnd),
      sb.from('rent_payments').select('amount').gte('payment_date',prevYM+'-01').lte('payment_date',monthEnd(prevYM)),
      sb.from('moves').select('unit_id').eq('type','depart').eq('status','pending').lte('move_date',monEnd),
      sb.from('expenses').select('amount').eq('period_month', ym+'-01'),
      sb.from('owner_payments').select('amount').eq('period_month', ym+'-01')
    ]);

    // buildMonthSnapshot يرجع {units, discMap, adjustMap, monStart, monEnd}
    var allInMonth = snapResult.units    || [];
    var discMap    = snapResult.discMap  || {};
    var adjustMap  = snapResult.adjustMap|| {};

    var allUnits    = (await sb.from('units').select('id,monthly_rent,is_vacant,unit_status,start_date,tenant_name')).data || [];
    var accrualPays = accrualPaysRes.data||[];
    var cashPays    = cashPaysRes.data||[];
    var deps        = depsRes.data||[];
    var refDeps     = refDepsRes.data||[];
    var prevCash    = prevCashRes.data||[];
    var departs     = departRes.data||[];
    var exps        = expRes.data||[];
    var owners      = ownerRes.data||[];


    // ── Unit counts للشهر ──
    var allUnitsCount   = allUnits.length;
    var occupiedInMonth = allInMonth.length;
    var reservedCount    = allUnits.filter(function(u){ return getUnitStatusKey(u)==='reserved'; }).length;
    var maintenanceCount = allUnits.filter(function(u){ return getUnitStatusKey(u)==='maintenance'; }).length;
    var vacantInMonth   = allUnitsCount - occupiedInMonth - reservedCount - maintenanceCount;

    var departSet   = new Set((departs||[]).map(function(d){ return d.unit_id; }));
    var currentOccupied = allUnits.filter(function(u){ return isDashboardOccupied(u) && (u.start_date||'').slice(0,7) <= ym; });
    var leaving     = currentOccupied.filter(function(u){ return departSet.has(u.id) || getUnitStatusKey(u)==='leaving_soon'; });
    var newThisMonth= allInMonth.filter(function(u){ return getEffectiveStartMonth(u.start_date) === ym; });
    var reserved    = allUnits.filter(function(u){ return getUnitStatusKey(u)==='reserved'; });
    var maintenance = allUnits.filter(function(u){ return getUnitStatusKey(u)==='maintenance'; });

    // ── EXPECTED ──
    var expected = allInMonth.reduce(function(s,u){
      return s + calcEffectiveRent(u, discMap, adjustMap, ym);
    }, 0);

    // ── CASH totals ──
    var cashRent    = cashPays.reduce(function(s,p){ return s+(p.amount||0); },0);
    var cashDeps    = deps.reduce(function(s,d){ return s+(d.amount||0); },0);
    var cashRefunds = refDeps.reduce(function(s,d){ return s+(Number(d.refund_amount)||0); },0);
    var accrualPaid = accrualPays.reduce(function(s,p){ return s+(p.amount||0); },0);
    var cashTotal   = accrualPaid + cashDeps;
    var totalExp    = exps.reduce(function(s,e){ return s+(e.amount||0); },0);
    var totalOwner  = owners.reduce(function(s,o){ return s+(o.amount||0); },0);
    var cashOut     = totalExp + totalOwner;
    var net         = cashTotal - cashRefunds - cashOut;
    var prevCashTot = prevCash.reduce(function(s,p){ return s+(p.amount||0); },0);

    // ── Remaining & pct ──
    var accrualPaidMap = {};
    accrualPays.forEach(function(p){ accrualPaidMap[p.unit_id]=(accrualPaidMap[p.unit_id]||0)+(p.amount||0); });

    var actualUnpaid = 0, overpaid = 0;
    allInMonth.forEach(function(u){
      var eff  = calcEffectiveRent(u, discMap, adjustMap, ym);
      var paid = accrualPaidMap[u.id] || 0;
      if(paid < eff) actualUnpaid += eff - paid;
      if(paid > eff) overpaid     += paid - eff;
    });
    var netRemaining = Math.max(0, expected - accrualPaid);
    var remaining    = netRemaining; // backward compat
    var pct          = expected>0 ? Math.round(accrualPaid/expected*100) : 0;
    var diff         = cashRent - prevCashTot;
    var diffPct      = prevCashTot>0 ? Math.round(Math.abs(diff)/prevCashTot*100) : 0;
    var diffColor    = diff>=0?'var(--green)':'var(--red)';
    var diffArrow    = diff>=0?'↑':'↓';
    var paidCount=0, partCount=0, unpaidCount=0;
    allInMonth.forEach(function(u){
      var got  = accrualPaidMap[u.id]||0;
      var rent = calcEffectiveRent(u, discMap, adjustMap, ym);
      if(rent === 0) return;
      if(got >= rent) paidCount++;
      else if(got > 0) partCount++;
      else unpaidCount++;
    });

    // ── Update UI ──
    var el = function(id){ return document.getElementById(id); };
    var fmt = function(n){ return n>=1000?(n/1000).toFixed(1)+'k':n.toLocaleString(); };
    var pctColor = pct>=90?'var(--green)':pct>=60?'var(--amber)':'var(--red)';

    // نسبة التحصيل
    if(el('dash-pct')){ el('dash-pct').textContent=pct+'%'; el('dash-pct').style.color=pctColor; }
    if(el('dash-pct-cmp')) el('dash-pct-cmp').innerHTML = prevCashTot>0?'<span style="color:'+diffColor+'">'+diffArrow+' '+diffPct+'%</span>':'';
    var pb=el('dash-progress-bar'); if(pb){ pb.style.width=Math.min(pct,100)+'%'; pb.style.background=pctColor; }

    // الملخص المالي — المستهدف بالإيجار الاستحقاقي
    if(el('dash-expected'))     el('dash-expected').textContent    = fmt(expected)+' AED';
    if(el('dash-expected-sub')) el('dash-expected-sub').textContent= LANG==='ar'?'إيجار الشهر':'Monthly target';
    if(el('dash-collected'))    el('dash-collected').textContent   = fmt(accrualPaid)+' AED';
    if(el('dash-collected-cmp'))el('dash-collected-cmp').innerHTML = prevCashTot>0?'<span style="color:'+diffColor+'">'+diffArrow+' '+diffPct+'% من الماضي</span>':'';
    if(el('dash-remaining'))    { el('dash-remaining').textContent=(netRemaining>0?netRemaining.toLocaleString():'0')+' AED'; el('dash-remaining').style.color=netRemaining>0?'var(--red)':'var(--green)'; }
    if(el('dash-remaining-sub')) el('dash-remaining-sub').textContent = LANG==='ar'?'متبقي فعلي: '+(actualUnpaid.toLocaleString())+' | زيادات: '+(overpaid.toLocaleString()):'Unpaid: '+actualUnpaid.toLocaleString()+' | Over: '+overpaid.toLocaleString();
    if(el('dash-expected-pct')) el('dash-expected-pct').textContent= LANG==='ar'?'استحقاق الشهر':'Accrual basis';

    // الكاش الصافي
    if(el('dash-cash'))     el('dash-cash').textContent     = fmt(cashTotal)+' AED';
    if(el('dash-cash-sub')) el('dash-cash-sub').textContent = accrualPaid.toLocaleString()+' + '+cashDeps.toLocaleString()+' تأمين';
    if(el('dash-net'))      { el('dash-net').textContent=net.toLocaleString()+' AED'; el('dash-net').style.color=net>=0?'var(--green)':'var(--red)'; }
    if(el('dash-net-sub'))  el('dash-net-sub').textContent  = cashOut>0?'- '+cashOut.toLocaleString()+' مصاريف':(LANG==='ar'?'لا مصاريف':'No expenses');

    // حالة الوحدات
    if(el('dash-occupied')) el('dash-occupied').textContent = occupiedInMonth;
    if(el('dash-vacant'))   el('dash-vacant').textContent   = vacantInMonth;
    if(el('dash-leaving'))  el('dash-leaving').textContent  = leaving.length;
    if(el('dash-new'))      el('dash-new').textContent      = newThisMonth.length;

    // حالة الدفع
    if(el('dash-paid-count'))    el('dash-paid-count').textContent    = paidCount;
    if(el('dash-partial-count')) el('dash-partial-count').textContent = partCount;
    if(el('dash-unpaid-count'))  el('dash-unpaid-count').textContent  = unpaidCount;

    // مقارنة بالشهر السابق
    if(el('dash-compare') && prevCashTot>0){
      el('dash-compare').innerHTML = '📊 '+(LANG==='ar'?'مقارنة: الماضي ':'vs last: ')
        +prevCashTot.toLocaleString()+' ← '+accrualPaid.toLocaleString()
        +' <b style="color:'+diffColor+'">'+diffArrow+diffPct+'%</b>';
    }

    // زر تدقيق الشهر — يعرض الشهر الحالي المختار
    if(el('dash-audit-btn')){
      el('dash-audit-btn').onclick = function(){
        loadDashboardAudit(ym);
      };
    }

    var { data: pendingBookings }  = await sb.from('moves').select('id').eq('type','arrive').eq('status','pending');
    var { data: pendingTransfers } = await sb.from('internal_transfers').select('id').like('notes','%مجدوله%');
    if(el('dash-pending-bookings'))  el('dash-pending-bookings').textContent  = (pendingBookings||[]).length;
    if(el('dash-pending-transfers')) el('dash-pending-transfers').textContent = (pendingTransfers||[]).length;
    if(el('dash-reserved'))          el('dash-reserved').textContent          = reserved.length;
    if(el('dash-maintenance'))       el('dash-maintenance').textContent       = maintenance.length;

  } catch(e) {
    console.error('loadSmartDash:', e);
    ['dash-collected','dash-expected','dash-remaining','dash-pct'].forEach(function(id){
      var el2 = document.getElementById(id); if(el2) el2.textContent = '—';
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

    var monStart = monYM+'-01';
    var monEnd2  = monthEnd(monYM);

    // ── استخدام buildMonthSnapshot كـ Source of Truth ──
    var [snapResult, paysRes, depsRes, expsRes, ownsRes, prevRes, refDepsRes] = await Promise.all([
      buildMonthSnapshot(monYM),
      sb.from('rent_payments')
        .select('unit_id,apartment,room,amount,payment_date,payment_method,payment_month,tenant_num')
        .gte('payment_date',monStart).lte('payment_date',monEnd2).order('apartment').order('room'),
      sb.from('deposits')
        .select('unit_id,apartment,room,amount,deposit_received_date,tenant_name,status,refund_date')
        .gte('deposit_received_date',monStart).lte('deposit_received_date',monEnd2),
      sb.from('expenses').select('amount,category,description').eq('period_month', monYM+'-01'),
      sb.from('owner_payments').select('amount').eq('period_month', monYM+'-01'),
      sb.from('rent_payments').select('amount').gte('payment_date',prevYM+'-01').lte('payment_date',monthEnd(prevYM)),
      sb.from('deposits').select('unit_id,apartment,room,amount,refund_amount,refund_date,tenant_name,deposit_received_date,status')
        .gt('refund_amount', 0)
    ]);

    var pays    = paysRes.data||[];
    var deps    = depsRes.data||[];
    var exps    = expsRes.data||[];
    var owns    = ownsRes.data||[];
    var prevC   = (prevRes.data||[]).reduce(function(s,p){return s+(p.amount||0);},0);
    var allRefCollData = refDepsRes.data||[];

    // units من buildMonthSnapshot — Source of Truth
    var units   = snapResult.units;

    // بناء tenantInMonth من snapshot مباشرة
    var tenantInMonth = {};
    units.forEach(function(u){
      var uid = String(u.id).split('_f')[0]; // strip former tenant suffix
      if(!tenantInMonth[uid]) tenantInMonth[uid] = u.tenant_name || '—';
    });
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
    var totalRefund = refundedThisMonth.reduce(function(s,d){return s+(Number(d.refund_amount)||0);},0);
    var totalCash  = totalRent + totalDep;
    var totalExp   = exps.reduce(function(s,e){return s+(e.amount||0);},0);
    var totalOwner = owns.reduce(function(s,o){return s+(o.amount||0);},0);
    var net        = totalCash - totalRefund - totalExp - totalOwner;

    // بناء خريطة apartment-room من snapshot
    var snapRoomMap = {};
    units.forEach(function(u){
      var k = String(u.apartment)+'-'+String(u.room);
      snapRoomMap[k] = u;
    });

    // Group payments by apartment — مع اسم المستأجر الصح في الشهر المختار
    var aptGroups = {};
    var unknownPays = []; // دفعات لوحدات مش في snapshot
    pays.forEach(function(p){
      var apt = String(p.apartment||'?');
      var room = String(p.room||'?');
      var roomKey = apt+'-'+room;

      // تحقق لو الوحدة في snapshot
      var snapUnit = snapRoomMap[roomKey];
      var inSnapshot = !!snapUnit;

      if(!inSnapshot) {
        // دفعة لوحدة مش في snapshot — عرضها منفصلة
        unknownPays.push({
          apt: apt, room: room,
          amount: p.amount||0,
          payment_date: p.payment_date||'',
          payment_month: (p.payment_month||'').slice(0,7),
          is_advance: (p.payment_month||'').slice(0,7) > monYM,
          is_late: (p.payment_month||'').slice(0,7) < monYM
        });
        return;
      }

      if(!aptGroups[apt]) aptGroups[apt]={rooms:{}, total:0};
      if(!aptGroups[apt].rooms[room]) {
        var u = snapUnit;
        var correctTenant = u.tenant_name || tenantInMonth[p.unit_id] || '—';
        aptGroups[apt].rooms[room] = {
          room:p.room, pays:[], total:0,
          tenant: correctTenant,
          rent: u.monthly_rent||0
        };
      }
      // كل دفعة سطر منفصل — مش نجمعهم
      aptGroups[apt].rooms[room].pays.push({
        amount: p.amount||0,
        payment_date: p.payment_date||'',
        payment_month: (p.payment_month||'').slice(0,7),
        is_advance: (p.payment_month||'').slice(0,7) > monYM,
        is_late: (p.payment_month||'').slice(0,7) < monYM && (p.payment_month||'').slice(0,7) !== ''
      });
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
      +'<button onclick="exportCollPDF(\''+monYM+'\')" style="flex:1;padding:12px;background:var(--surf2);border:1.5px solid #ddd;border-radius:12px;color:var(--text);font-family:var(--font);font-size:.82rem;font-weight:700;cursor:pointer">📄 PDF</button>'
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

          // header الغرفة
          html += '<div style="padding:9px 14px;border-bottom:1px solid var(--border)22;display:flex;align-items:center;gap:10px">'
            +'<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+(isPaid?'var(--green)':r.total>0?'var(--amber)':'var(--red)')+'"></div>'
            +'<div style="flex:1;font-size:.82rem;font-weight:700">غرفة '+r.room
            +(r.tenant&&r.tenant!=='—'?' <span style="font-weight:400;color:var(--muted);font-size:.72rem">'+escapeHtml(r.tenant)+'</span>':'')
            +'</div>'
            +'<div style="font-weight:700;font-size:.85rem;color:var(--green)">'+r.total.toLocaleString()+' AED</div>'
            +'</div>';

          // كل دفعة على سطر منفصل
          r.pays.forEach(function(pay){
            var pmBadge = '';
            if(pay.is_advance) pmBadge = '<span style="font-size:.6rem;background:var(--amber)22;color:var(--amber);border-radius:4px;padding:1px 5px;margin-right:4px">مقدمًا '+pay.payment_month+'</span>';
            else if(pay.is_late) pmBadge = '<span style="font-size:.6rem;background:var(--red)22;color:var(--red);border-radius:4px;padding:1px 5px;margin-right:4px">متأخر '+pay.payment_month+'</span>';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 14px 5px 30px;border-bottom:1px solid var(--border)11">'
              +'<div style="font-size:.7rem;color:var(--muted)">'
              +pmBadge
              +'📅 '+pay.payment_date.slice(0,10)+'</div>'
              +'<div style="font-size:.78rem;font-weight:700;color:var(--green)">'+pay.amount.toLocaleString()+' AED</div>'
              +'</div>';
          });
        });

        html += '</div>';
      });
    }

    // ── Unknown Payments (دفعات لوحدات مش في snapshot) ──
    if(unknownPays.length > 0) {
      var unknownTotal = unknownPays.reduce(function(s,p){return s+p.amount;},0);
      html += '<div class="card" style="margin-bottom:10px;padding:0;overflow:hidden;border:1.5px solid var(--amber)44">'
        +'<div style="padding:10px 14px;background:var(--amber)15;border-bottom:1px solid var(--border);font-weight:700;font-size:.85rem;color:var(--amber)">'
        +'⚠️ دفعات بدون مستأجر نشط في الشهر ('+unknownPays.length+') — '+unknownTotal.toLocaleString()+' AED</div>';
      unknownPays.forEach(function(p){
        var pmBadge = p.is_advance
          ? '<span style="font-size:.6rem;background:var(--amber)22;color:var(--amber);border-radius:4px;padding:1px 5px;margin-left:4px">مقدمًا '+p.payment_month+'</span>'
          : p.is_late
          ? '<span style="font-size:.6rem;background:var(--red)22;color:var(--red);border-radius:4px;padding:1px 5px;margin-left:4px">متأخر '+p.payment_month+'</span>'
          : '';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)22">'
          +'<div>'
          +'<div style="font-size:.8rem;font-weight:700">شقة '+escapeHtml(p.apt)+'–'+escapeHtml(p.room)+'</div>'
          +'<div style="font-size:.7rem;color:var(--muted)">📅 '+p.payment_date.slice(0,10)+' '+pmBadge+'</div>'
          +'</div>'
          +'<div style="font-weight:700;color:var(--amber)">'+p.amount.toLocaleString()+' AED</div>'
          +'</div>';
      });
      html += '</div>';
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
      html += '<div style="background:var(--red-bg);border:1px solid var(--red)44;border-radius:12px;padding:0;overflow:hidden;margin-bottom:10px">'        +'<div style="padding:10px 14px;border-bottom:1px solid var(--red)33;font-weight:700;font-size:.85rem">↩️ تأمينات مُرتجعة ('+refundedThisMonth.length+')</div>';      refundedThisMonth.forEach(function(d){        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)55">'          +'<div>'            +'<div style="font-size:.78rem;font-weight:700">'+d.apartment+' — '+d.room+'</div>'            +'<div style="font-size:.68rem;color:var(--muted)">'+( d.tenant_name||'—')+'</div>'            +(d.refund_date?'<div style="font-size:.65rem;color:var(--muted)">↩️ '+(d.refund_date||'').slice(0,10)+'</div>':'')          +'</div>'          +'<div style="font-weight:800;color:var(--red);font-size:.9rem">- '+(d.refund_amount||0).toLocaleString()+' AED</div>'          +'</div>';      });      html += '</div>';    }

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
    var { data: last } = await activateReservedUnits();
  await sb.from('rent_payments').select('*').order('payment_date',{ascending:false}).limit(1);
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
    var ym  = getActiveMonth();

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
    var ym  = getActiveMonth();

  // Set default month inputs
  ['rpm','rcoll-month','rem','rdep-month','o-month','rfin-month','rrefund-month','rdeduct-month','rvacant-month','raccrual-month'].forEach(function(id){
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
    var ym  = getActiveMonth();
  loadSmartDash(ym);
  if(!window._appReadyFired){ window._appReadyFired=true; document.dispatchEvent(new Event('appReady')); }
};

// ══════════════════════════════════════════════════════
// PDF PER APARTMENT — from collection report
// ══════════════════════════════════════════════════════

async function exportCollPDF(monYM) {
  try {
    toast(LANG==='ar'?'جاري التحضير...':'Preparing...','');

    var _todayForDisc = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
    var _pdfNextMonthEnd = (function(){ var d=new Date(monYM+'-01'); d.setMonth(d.getMonth()+2); d.setDate(0); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
    var [paysRes, unitsRes, depsRes, discRes, histPdfRes] = await Promise.all([
      sb.from('rent_payments')
        .select('unit_id,apartment,room,amount,payment_date,payment_method,payment_month')
        .gte('payment_date',monYM+'-01').lte('payment_date',monthEnd(monYM))
        .order('apartment').order('room'),
      sb.from('units')
        .select('id,apartment,room,tenant_name,tenant_name2,monthly_rent,unit_code,building_name')
        .eq('is_vacant',false).order('apartment').order('room'),
      sb.from('deposits').select('unit_id,amount,status'),
      sb.from('unit_discounts').select('unit_id,discount_amount')
        .lte('start_date', _todayForDisc).gte('end_date', _todayForDisc),
      sb.from('unit_history').select('unit_id,monthly_rent,start_date,end_date,snapshot_type')
        .gte('end_date', monYM+'-01').lte('end_date', _pdfNextMonthEnd)
    ]);

    var pays  = paysRes.data||[];
    var units = unitsRes.data||[];
    var deps  = depsRes.data||[];
    var discMap = {};
    (discRes.data||[]).forEach(function(d){ discMap[d.unit_id]=(d.discount_amount||0); });

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
    var totalTarget    = units.reduce(function(s,u){
      if(u.start_date && u.start_date.slice(0,7) === monYM) return s;
      return s+Math.max(0,(u.monthly_rent||0)-(discMap[u.id]||0));
    },0);
    // أضف إيجارات المستأجرين السابقين
    var histPdf = histPdfRes.data||[];
    var pdfOccupiedIds = new Set(units.map(function(u){ return u.id; }));
    histPdf.forEach(function(h){
      if(h.snapshot_type === 'internal_transfer_out' && (h.end_date||'').slice(0,7) === monYM) return;
      if(h.snapshot_type === 'internal_transfer_in') return;
      if((h.end_date||'').slice(0,7) === monYM && (h.end_date||'').slice(8,10) === '01') return;
      if(h.start_date && h.start_date.slice(0,7) === monYM) return;
      if(!pdfOccupiedIds.has(h.unit_id)) {
        totalTarget += (h.monthly_rent||0);
      } else {
        var cu = units.find(function(u){ return u.id === h.unit_id; });
        if(cu && cu.start_date && cu.start_date.slice(0,7) >= monYM) {
          totalTarget += (h.monthly_rent||0);
        }
      }
    });
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

// ══ AUTO-ACTIVATE RESERVED UNITS ══
async function activateReservedUnits() {
  if(window._activatingUnits) return;
  window._activatingUnits = true;
  try {
    // daily check — مرة واحدة في اليوم بس
    var _ld = new Date(); var today0 = _ld.getFullYear()+'-'+String(_ld.getMonth()+1).padStart(2,'0')+'-'+String(_ld.getDate()).padStart(2,'0');
    var lastRun = localStorage.getItem('_lastActivationRun');
    // لو اشتغلت النهارده قبل كده — اخرج بدون ما تعمل حاجة
    // بس لو عندنا pending departures نشغّل دايماً
    var forceRun = false;
    try {
      // شوف لو في مغادرات أو حجوزات pending متأخرة
      var { count: depCount } = await sb.from('moves').select('id',{count:'exact',head:true})
        .eq('type','depart').eq('status','pending').lte('move_date', today0);
      var { count: arrCount } = await sb.from('moves').select('id',{count:'exact',head:true})
        .eq('type','arrive').eq('status','pending').lte('move_date', today0);
      if((depCount||0) > 0 || (arrCount||0) > 0) forceRun = true;
    } catch(e) {}
    if(!forceRun && lastRun === today0) { window._activatingUnits = false; return; }
    localStorage.setItem('_lastActivationRun', today0);
    var _ld2 = new Date(); var today = _ld2.getFullYear()+'-'+String(_ld2.getMonth()+1).padStart(2,'0')+'-'+String(_ld2.getDate()).padStart(2,'0');
    // Find reserved units whose start_date has arrived
    var { data: toActivate } = await sb.from('units')
      .select('id,apartment,room,start_date')
      .eq('unit_status','reserved')
      .lte('start_date', today);

    if(!toActivate || !toActivate.length) return;

    for(var i=0; i<toActivate.length; i++) {
      await sb.from('units').update({ unit_status: 'occupied' }).eq('id', toActivate[i].id);
    }
    if(toActivate.length > 0) {
      toast('✅ تم تفعيل '+toActivate.length+' وحدة محجوزة', 'ok');
    }

    var _ld3 = new Date(); var today2 = _ld3.getFullYear()+'-'+String(_ld3.getMonth()+1).padStart(2,'0')+'-'+String(_ld3.getDate()).padStart(2,'0');

    // ── Auto-execute مغادرات pending لو بدأ شهر جديد ──
    // لو move_date في الشهر الماضي أو أقدم → ننفّذها تلقائياً
    var now          = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);

    var { data: dueDepartures } = await sb.from('moves')
      .select('*')
      .eq('type','depart').eq('status','pending')
      .lte('move_date', today2);  // كل المغادرات اللي وصل أو فات تاريخها

    if(dueDepartures && dueDepartures.length) {
      var doneCount = 0;
      for(var s=0; s<dueDepartures.length; s++) {
        var sd = dueDepartures[s];
        if(!sd.unit_id) {
          await sb.from('moves').update({ status: 'done' }).eq('id', sd.id);
          doneCount++;
          continue;
        }
        // استخدام Database Function — transaction كاملة
        // لو history insert فشل → مش هيتفرّغ الوحدة (rollback تلقائي)
        var { data: result } = await sb.rpc('execute_departure', {
          p_move_id:   sd.id,
          p_unit_id:   sd.unit_id,
          p_move_date: sd.move_date
        });
        if(result && result.success) {
          doneCount++;
        } else {
          console.warn('execute_departure failed:', sd.apartment, sd.room, result && result.error);
        }
      }
      if(doneCount > 0) {
        toast('✅ تم تنفيذ ' + doneCount + ' مغادرة تلقائياً', 'ok');
      }
    }
    // Auto-confirm pending bookings (arrive) whose date has arrived
    var { data: pendingArrivals } = await sb.from('moves')
      .select('*').eq('type','arrive').eq('status','pending')
      .lte('move_date', today2);
    if(pendingArrivals && pendingArrivals.length) {
      for(var j=0; j<pendingArrivals.length; j++) {
        var mv = pendingArrivals[j];
        if(!mv.unit_id) continue;

        // احفظ snapshot للمستأجر الحالي قبل الكتابة عليه
        var { data: currentUnit } = await sb.from('units').select('*').eq('id', mv.unit_id).single();
        if(currentUnit && currentUnit.tenant_name) {
          await sb.from('unit_history').insert({
            unit_id:       currentUnit.id,
            apartment:     currentUnit.apartment,
            room:          currentUnit.room,
            tenant_name:   currentUnit.tenant_name,
            tenant_name2:  currentUnit.tenant_name2 || null,
            phone:         currentUnit.phone || null,
            phone2:        currentUnit.phone2 || null,
            monthly_rent:  parseFloat(currentUnit.monthly_rent||0),
            rent1:         parseFloat(currentUnit.rent1||0),
            rent2:         parseFloat(currentUnit.rent2||0),
            deposit:       parseFloat(currentUnit.deposit||0),
            persons_count: currentUnit.persons_count || 1,
            start_date:    currentUnit.start_date || null,
            end_date:      mv.move_date || new Date().toISOString().slice(0,10),
            snapshot_type: 'departure',
            recorded_by:   (ME||{}).id || null
          });
        }

        // Update unit with new tenant
        await sb.from('units').update({
          tenant_name: mv.new_tenant_name || mv.tenant_name,
          phone: mv.new_phone || mv.phone,
          monthly_rent: mv.new_rent || 0,
          rent1: mv.new_rent || 0,
          deposit: mv.new_deposit || 0,
          persons_count: mv.new_persons || mv.persons_count || 1,
          start_date: mv.new_start_date || mv.move_date,
          is_vacant: false,
          unit_status: 'occupied',
          language: (mv.notes && mv.notes.indexOf('lang:AR')>-1) ? 'AR' : 'EN'
        }).eq('id', mv.unit_id);
        // Mark move as done
        await sb.from('moves').update({ status: 'done' }).eq('id', mv.id);
        // Delete duplicate deposit (عربون حجز) if confirmation deposit was added
        await sb.from('deposits').delete()
          .eq('unit_id', mv.unit_id)
          .like('notes','%عربون حجز%');
        // سجّل التأمين في deposits لو موجود في الحجز
        if(mv.new_deposit && parseFloat(mv.new_deposit) > 0) {
          var { data: existingDep } = await sb.from('deposits')
            .select('id').eq('unit_id', mv.unit_id)
            .eq('tenant_name', mv.new_tenant_name || mv.tenant_name)
            .eq('status','held').maybeSingle();
          if(!existingDep) {
            await sb.from('deposits').insert({
              unit_id:               mv.unit_id,
              apartment:             String(mv.apartment||''),
              room:                  String(mv.room||''),
              tenant_name:           mv.new_tenant_name || mv.tenant_name,
              amount:                parseFloat(mv.new_deposit),
              status:                'held',
              deposit_received_date: mv.new_start_date || mv.move_date,
              notes:                 'مسجّل عند تأكيد الحجز'
            });
          }
        }
      }
      toast('✅ تم تأكيد '+pendingArrivals.length+' حجز تلقائياً', 'ok');
    }

    // Auto-execute scheduled internal transfers whose date has arrived
    var { data: pendingTransfers } = await sb.from('internal_transfers')
      .select('*').like('notes','%مجدوله%')
      .lte('transfer_date', today2);
    if(pendingTransfers && pendingTransfers.length) {
      for(var k=0; k<pendingTransfers.length; k++) {
        var tr = pendingTransfers[k];
        var f = tr.from_snapshot || {};
        var t = tr.to_snapshot || {};
        // Update toUnit with fromUnit tenant
        await sb.from('units').update({
          tenant_name: f.tenant_name, tenant_name2: f.tenant_name2,
          phone: f.phone, phone2: f.phone2, language: f.language,
          persons_count: f.persons_count, monthly_rent: f.monthly_rent,
          rent1: f.rent1||0, rent2: f.rent2||0, deposit: f.deposit||0,
          start_date: tr.transfer_date,
          is_vacant: false, unit_status: 'occupied'
        }).eq('id', tr.to_unit_id);
        // Clear fromUnit
        await sb.from('units').update({
          tenant_name: null, tenant_name2: null, phone: null, phone2: null,
          monthly_rent: 0, rent1: 0, rent2: 0, deposit: 0,
          start_date: null, is_vacant: true, unit_status: 'available'
        }).eq('id', tr.from_unit_id);
        // Transfer deposit
        await sb.from('deposits').update({
          unit_id: tr.to_unit_id,
          apartment: String(t.apartment),
          room: String(t.room)
        }).eq('unit_id', tr.from_unit_id).eq('status','held');
        // Mark as executed
        await sb.from('internal_transfers').update({
          notes: 'تم التنفيذ تلقائياً في '+today2
        }).eq('id', tr.id);
      }
      toast('✅ تم تنفيذ '+pendingTransfers.length+' نقل داخلي تلقائياً', 'ok');
    }



  } catch(e) { /* silent */ }
  finally { window._activatingUnits = false; }
}

// ══════════════════════════════════════════════════════
// DASHBOARD AUDIT — زر "تدقيق الشهر"
// ══════════════════════════════════════════════════════
async function loadDashboardAudit(monYM) {
  var btn = document.getElementById('dash-audit-btn');
  var origTxt = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }

  try {
    // ── جلب البيانات ──
    var [audit, snap, paysRes, depsRes, refDepsRes, expRes, ownerRes] = await Promise.all([
      buildMonthAudit(monYM),
      buildMonthSnapshot(monYM),
      sb.from('rent_payments').select('unit_id,amount').like('payment_month', monYM+'%'),
      sb.from('deposits').select('amount').gte('deposit_received_date', monYM+'-01').lte('deposit_received_date', window.monthEnd(monYM)),
      sb.from('deposits').select('refund_amount').gt('refund_amount',0).gte('refund_date', monYM+'-01').lte('refund_date', window.monthEnd(monYM)),
      sb.from('expenses').select('amount').eq('period_month', monYM+'-01'),
      sb.from('owner_payments').select('amount').eq('period_month', monYM+'-01')
    ]);

    var snap_units  = snap.units || [];
    var discMap     = snap.discMap || {};
    var adjustMap   = snap.adjustMap || {};
    var pays        = paysRes.data||[];
    var deps        = depsRes.data||[];
    var refDeps     = refDepsRes.data||[];
    var exps        = expRes.data||[];
    var owners      = ownerRes.data||[];

    // ── حسابات مالية ──
    var paidMap = {};
    pays.forEach(function(p){ if(p.unit_id) paidMap[p.unit_id]=(paidMap[p.unit_id]||0)+(p.amount||0); });

    var targetRent   = snap_units.reduce(function(s,u){ return s+calcEffectiveRent(u,discMap,adjustMap,monYM); },0);
    var collectedRent= pays.reduce(function(s,p){ return s+(p.amount||0); },0);
    var totalDeps    = deps.reduce(function(s,d){ return s+(d.amount||0); },0);
    var totalRefunds = refDeps.reduce(function(s,d){ return s+(Number(d.refund_amount)||0); },0);
    var totalExp     = exps.reduce(function(s,e){ return s+(e.amount||0); },0);
    var totalOwner   = owners.reduce(function(s,o){ return s+(o.amount||0); },0);
    var cashTotal    = collectedRent + totalDeps;
    var netTotal     = cashTotal - totalRefunds - totalExp - totalOwner;

    var actualUnpaid=0, overpaidAmt=0;
    snap_units.forEach(function(u){
      var eff=calcEffectiveRent(u,discMap,adjustMap,monYM);
      var paid=paidMap[u.id]||0;
      if(paid<eff) actualUnpaid+=eff-paid;
      if(paid>eff) overpaidAmt +=paid-eff;
    });

    // ── أعداد الوحدات ──
    var occupied   = audit.occupiedDuringMonthRows.length;
    var vacant     = audit.vacantActualRows.length;
    var leaving    = audit.endOfMonthLeaverRows.length;
    var transfers  = audit.internalTransferRows.length;
    var newTenants = audit.newTenantRows.length;

    // ── Consistency Checks ──
    var checks = [];
    var issues = [];

    // 1. مجموع المشغول + الشاغر معقول؟
    var allUnitsCount = (await sb.from('units').select('id',{count:'exact',head:true})).count||0;
    var occupiedPlusVacant = occupied + vacant;
    if(occupiedPlusVacant <= allUnitsCount) {
      checks.push({ok:true, label:'المشغول + الشاغر ≤ إجمالي الوحدات ('+allUnitsCount+')'});
    } else {
      checks.push({ok:false, label:'المشغول + الشاغر ('+occupiedPlusVacant+') > إجمالي الوحدات ('+allUnitsCount+')'});
      issues.push('عدد الوحدات المحسوبة ('+occupiedPlusVacant+') يتجاوز الإجمالي الفعلي ('+allUnitsCount+')');
    }

    // 2. الجدد مش موجودين في النقل الداخلي؟
    var newInternalOverlap = audit.newTenantRows.filter(function(n){
      return n.source === 'internal_transfer_in';
    }).length;
    if(newInternalOverlap === 0) {
      checks.push({ok:true, label:'لا يوجد تداخل بين الجدد والنقل الداخلي'});
    } else {
      checks.push({ok:false, label:'فيه '+newInternalOverlap+' مستأجر محسوب كـ "جديد" و"نقل داخلي" في نفس الوقت'});
      issues.push(newInternalOverlap+' مستأجر مكرر بين الجدد والنقل الداخلي');
    }

    // 3. الإيجار المحصّل ≤ المستهدف + 10%؟
    var collPct = targetRent>0 ? Math.round(collectedRent/targetRent*100) : 0;
    if(collectedRent <= targetRent*1.2) {
      checks.push({ok:true, label:'الإيجار المحصّل ('+collPct+'%) في النطاق المعقول'});
    } else {
      checks.push({ok:false, label:'الإيجار المحصّل أعلى من المستهدف بأكثر من 20%'});
      issues.push('إيجار محصّل ('+collectedRent.toLocaleString()+') يتجاوز المستهدف ('+targetRent.toLocaleString()+') بكثير');
    }

    // 4. المغادرون آخر الشهر لازم يكونوا كانوا مشغولين خلاله؟
    var leavingApts = audit.endOfMonthLeaverRows.map(function(r){ return String(r.apartment)+'|'+String(r.room); });
    var occupiedSet = new Set(audit.occupiedDuringMonthRows.map(function(r){ return String(r.apartment)+'|'+String(r.room); }));
    var leavingNotInOccupied = leavingApts.filter(function(k){ return !occupiedSet.has(k); });
    if(leavingNotInOccupied.length === 0) {
      checks.push({ok:true, label:'المغادرون آخر الشهر ('+leaving+') كلهم موجودون في Snapshot الشهر'});
    } else {
      checks.push({ok:false, label:leavingNotInOccupied.length+' وحدة مغادِرة غير موجودة في Snapshot — تحقق من end_date أو start_date'});
      issues.push(leavingNotInOccupied.length+' وحدة مغادِرة لم تُحسب ضمن مشغولي الشهر: '+leavingNotInOccupied.slice(0,3).join(', '));
    }

    // ── Audit Status ──
    var passed = issues.length === 0;
    var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    // ── Build HTML ──
    var html = '';

    // Status Banner
    html += '<div style="border-radius:10px;padding:14px 16px;margin-bottom:16px;background:'+(passed?'#e8f5e9':'#fdecea')+';border:2px solid '+(passed?'#43a047':'#e53935')+';display:flex;align-items:center;gap:12px">'
      +'<div style="font-size:1.6rem">'+(passed?'🟢':'🔴')+'</div>'
      +'<div><div style="font-weight:800;font-size:.95rem;color:'+(passed?'#2e7d32':'#c62828')+'">'+(passed?'Audit Passed — كل الأرقام متطابقة':'Audit Failed — '+issues.length+' مشكلة تحتاج مراجعة')+'</div>'
      +'<div style="font-size:.7rem;color:#666;margin-top:2px">'+monYM+' | Snapshot: '+snap_units.length+' وحدة</div></div>'
      +'</div>';

    // Section 1: Unit Status Cards
    html += '<div style="font-weight:700;font-size:.8rem;color:#555;margin-bottom:8px;letter-spacing:.05em">📋 حالة الوحدات</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">';
    var cards = [
      {label:'مشغولة', val:occupied,   color:'var(--accent)', key:'occupied'},
      {label:'شاغرة فعلياً', val:vacant,    color:'var(--red)',    key:'vacant'},
      {label:'خروج آخر الشهر', val:leaving,   color:'var(--amber)',  key:'leaving'},
      {label:'نقل داخلي', val:transfers, color:'var(--accent)', key:'transfers'},
      {label:'مستأجرين جدد', val:newTenants,color:'var(--green)',  key:'new'},
      {label:'Snapshot', val:snap_units.length, color:'var(--muted)', key:'snap'}
    ];
    cards.forEach(function(c){
      var _hc = c.color.replace('var(--accent)','#1565c0').replace('var(--red)','#c62828').replace('var(--amber)','#e65100').replace('var(--green)','#2e7d32').replace('var(--muted)','#555');
      html += '<div onclick="window._auditShowDetail(\''+c.key+'\')" style="background:#f8f9fa;border:2px solid '+_hc+'66;border-radius:10px;padding:10px;text-align:center;cursor:pointer">'
        +'<div style="font-size:1.5rem;font-weight:800;color:'+_hc+'">'+c.val+'</div>'
        +'<div style="font-size:.65rem;color:#555;margin-top:2px">'+c.label+'</div>'
        +'</div>';
    });
    html += '</div>';

    // Section 2: Financial Summary
    html += '<div style="font-weight:700;font-size:.8rem;color:var(--muted);margin-bottom:8px;letter-spacing:.05em">💰 التحقق المالي</div>';
    html += '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:16px;border:1px solid #e5e5e5">';
    var finRows = [
      {label:'🎯 الإيجار المستهدف',   val:targetRent.toLocaleString()+' AED',   color:'var(--text2)'},
      {label:'✅ الإيجار المحصّل',     val:collectedRent.toLocaleString()+' AED', color:'var(--green)'},
      {label:'❌ متبقي فعلي',          val:actualUnpaid.toLocaleString()+' AED',  color:'var(--red)'},
      {label:'↪️ زيادات / مقدم',      val:overpaidAmt.toLocaleString()+' AED',   color:'var(--accent)'},
      {label:'🔒 تأمينات محصّلة',     val:totalDeps.toLocaleString()+' AED',     color:'var(--accent)'},
      {label:'↩️ تأمينات مُرتجعة',   val:totalRefunds.toLocaleString()+' AED',  color:'var(--red)'},
      {label:'💵 إجمالي الكاش',       val:cashTotal.toLocaleString()+' AED',     color:'var(--green)', bold:true},
      {label:'🏦 الصافي',             val:netTotal.toLocaleString()+' AED',      color:netTotal>=0?'var(--green)':'var(--red)', bold:true}
    ];
    finRows.forEach(function(r){
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">'
        +'<span style="font-size:.75rem;color:var(--muted)">'+r.label+'</span>'
        +'<span style="font-size:.8rem;font-weight:'+(r.bold?'800':'600')+';color:'+r.color+'">'+r.val+'</span>'
        +'</div>';
    });
    html += '</div>';

    // Section 3: Consistency Checks
    html += '<div style="font-weight:700;font-size:.8rem;color:var(--muted);margin-bottom:8px;letter-spacing:.05em">🔎 فحص التناسق</div>';
    html += '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:16px;border:1px solid #e5e5e5">';
    checks.forEach(function(c){
      html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">'
        +'<span style="font-size:.85rem">'+(c.ok?'✅':'❌')+'</span>'
        +'<span style="font-size:.73rem;color:'+(c.ok?'var(--text2)':'var(--red)')+'">'+esc(c.label)+'</span>'
        +'</div>';
    });
    html += '</div>';

    // Section 4: Issues (if any)
    if(issues.length) {
      html += '<div style="font-weight:700;font-size:.8rem;color:var(--red);margin-bottom:8px;letter-spacing:.05em">⚠️ المشاكل المكتشفة</div>';
      html += '<div style="background:#fff5f5;border:1px solid #ffcdd2;border-radius:10px;padding:12px;margin-bottom:16px">';
      issues.forEach(function(iss){
        html += '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--red)22">'
          +'<span>⚠️</span><span style="font-size:.73rem;color:var(--red)">'+esc(iss)+'</span></div>';
      });
      html += '</div>';
    }

    // Section 4b: UI Cross-Check (compare audit with loaded report results)
    var uiChecks = [];
    function uiCrossCheck(winResults, winMonth, auditRows, reportName, keyFn) {
      if(!window[winResults] || window[winMonth] !== monYM) {
        uiChecks.push({status:'skip', label:reportName+' — لم يُفتح بعد لهذا الشهر'});
        return;
      }
      var uiRows  = window[winResults];
      var auditSet = new Set(auditRows.map(keyFn));
      var uiSet    = new Set(uiRows.map(keyFn));
      var missingInUI  = auditRows.filter(function(r){ return !uiSet.has(keyFn(r)); });
      var extraInUI    = uiRows.filter(function(r){ return !auditSet.has(keyFn(r)); });
      if(missingInUI.length === 0 && extraInUI.length === 0) {
        uiChecks.push({status:'ok', label:reportName+' — متطابق مع Audit ('+auditRows.length+')'});
      } else {
        var msg = reportName+': Audit='+auditRows.length+' | UI='+uiRows.length;
        if(missingInUI.length) msg += ' | ناقص في UI: '+missingInUI.slice(0,3).map(function(r){ return r.apartment+'/'+r.room+(r.tenant||r.lastTenant?(' '+(r.tenant||r.lastTenant)):''); }).join(', ');
        if(extraInUI.length)   msg += ' | زيادة في UI: '+extraInUI.slice(0,3).map(function(r){ return r.apartment+'/'+r.room+(r.tenant||r.lastTenant?(' '+(r.tenant||r.lastTenant)):''); }).join(', ');
        uiChecks.push({status:'err', label:msg});
      }
    }
    uiCrossCheck('_newTenantsResults',       '_newTenantsMonth',       audit.newTenantRows,        '👥 الجدد',             function(r){ return String(r.apartment)+'|'+String(r.room)+'|'+(r.tenant||r.tenant_name||'').toLowerCase()+'|'+(r.startDate||r.start_date||'').slice(0,10); });
    uiCrossCheck('_vacantActualResults',     '_vacantActualMonth',     audit.vacantActualRows,     '🏚️ الشاغر الفعلي',    function(r){ return String(r.apartment)+'|'+String(r.room)+'|'+(r.lastTenant||'').toLowerCase()+'|'+(r.vacantFrom||'').slice(0,10); });
    uiCrossCheck('_endOfMonthResults',       '_endOfMonthMonth',       audit.endOfMonthLeaverRows, '📤 خروج آخر الشهر',   function(r){ return String(r.apartment)+'|'+String(r.room)+'|'+(r.tenant||'').toLowerCase()+'|'+(r.endDate||'').slice(0,10); });
    uiCrossCheck('_internalTransfersResults','_internalTransfersMonth',audit.internalTransferRows, '🔄 النقل الداخلي',    function(r){ return (r.tenant||'').toLowerCase()+'|'+String(r.fromApt||r.fromApartment||'')+'|'+String(r.fromRoom||'')+'|'+(r.transferDate||'').slice(0,10); });

    var uiChecksPassed = uiChecks.filter(function(c){ return c.status==='ok'; }).length;
    var uiChecksSkipped = uiChecks.filter(function(c){ return c.status==='skip'; }).length;
    var uiChecksErr = uiChecks.filter(function(c){ return c.status==='err'; }).length;

    html += '<div style="font-weight:700;font-size:.8rem;color:var(--muted);margin-bottom:8px;letter-spacing:.05em">🔗 مقارنة UI (التقارير المفتوحة)</div>';
    html += '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:16px;border:1px solid #e5e5e5">';
    if(uiChecksSkipped === uiChecks.length) {
      html += '<div style="color:var(--muted);font-size:.73rem;text-align:center;padding:6px">افتح التقارير أولاً ثم أعد تدقيق الشهر للمقارنة</div>';
    } else {
      uiChecks.forEach(function(c){
        var icon = c.status==='ok'?'✅':c.status==='skip'?'⏭️':'❌';
        var color = c.status==='ok'?'var(--text2)':c.status==='skip'?'var(--muted)':'var(--red)';
        html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">'
          +'<span style="font-size:.85rem">'+icon+'</span>'
          +'<span style="font-size:.72rem;color:'+color+'">'+esc(c.label)+'</span>'
          +'</div>';
      });
    }
    html += '</div>';

    // Section 5: Detail Buttons + Ledger
    html += '<div style="font-weight:700;font-size:.8rem;color:var(--muted);margin-bottom:8px;letter-spacing:.05em">📂 التفاصيل (عند الطلب)</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">';
    var detailBtns = [
      {key:'vacant',    label:'📋 الشاغر الفعلي',          color:'var(--red)'},
      {key:'leaving',   label:'🚪 خروج آخر الشهر',         color:'var(--amber)'},
      {key:'transfers', label:'🔄 النقل الداخلي',           color:'var(--accent)'},
      {key:'new',       label:'👥 المستأجرين الجدد',        color:'var(--green)'},
      {key:'occupied',  label:'🏢 المشغولون خلال الشهر',   color:'var(--accent)'},
      {key:'ledger',    label:'📒 دفتر الشهر (Ledger)',     color:'var(--amber)'}
    ];
    detailBtns.forEach(function(b){
      html += '<button onclick="window._auditShowDetail(\''+b.key+'\')" style="background:var(--panel2);border:2px solid '+b.color+'66;border-radius:8px;padding:8px;font-size:.73rem;font-weight:700;color:'+b.color+';cursor:pointer">'+b.label+'</button>';
    });
    html += '</div>';

    // Detail area (lazy loaded)
    html += '<div id="auditDetailArea" style="margin-top:12px"></div>';


    // ── Show Modal ──
    var modal = document.getElementById('dashAuditModal');
    if(modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'dashAuditModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto';

    // Close on overlay click
    modal.addEventListener('click', function(e){ if(e.target === modal) modal.remove(); });
    // Close on ESC
    var _escHandler = function(e){ if(e.key==='Escape'){ modal.remove(); document.removeEventListener('keydown',_escHandler); } };
    document.addEventListener('keydown', _escHandler);

    modal.innerHTML =
      '<div style="background:#fff;color:#111;border-radius:16px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.35)">'
      // Sticky header
      +'<div id="dashAuditHeader" style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:2px solid #e5e5e5;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-radius:16px 16px 0 0">'
        +'<div style="font-weight:800;font-size:.95rem;color:#111">🔍 تدقيق الشهر — '+monYM+'</div>'
        +'<div style="display:flex;gap:6px">'
          +'<button onclick="window._auditPrint()" style="background:#f5f5f5;border:1px solid #ddd;color:#333;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:.75rem;font-weight:700">🖨️ طباعة</button>'
          +'<button onclick="window._auditExportPDF()" style="background:#f5f5f5;border:1px solid #ddd;color:#333;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:.75rem;font-weight:700">📄 PDF / طباعة</button>'
          +'<button onclick="document.getElementById(\'dashAuditModal\').remove()" style="background:#fff;border:2px solid #111;color:#111;border-radius:8px;padding:5px 14px;cursor:pointer;font-size:.8rem;font-weight:800">✕ إغلاق</button>'
        +'</div>'
      +'</div>'
      +'<div id="dashAuditContent" style="padding:16px;direction:rtl"></div>'
      +'</div>';

    document.body.appendChild(modal);
    document.getElementById('dashAuditContent').innerHTML = html;

    // ── Print / PDF ──
    window._auditPrint = function(){
      var content = document.getElementById('dashAuditContent');
      if(!content) return;
      var w = window.open('','_blank','width=900,height=700');
      w.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>تدقيق الشهر — '+monYM+'</title>'
        +'<style>body{font-family:Arial,sans-serif;direction:rtl;padding:24px;color:#111;background:#fff}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border:1px solid #ccc;text-align:right}th{background:#f0f0f0;font-weight:700}@media print{button{display:none}}</style>'
        +'</head><body>'+content.innerHTML+'</body></html>');
      w.document.close();
      w.focus();
      setTimeout(function(){ w.print(); }, 400);
    };
    window._auditExportPDF = function(){ window._auditPrint(); };

    // ── Detail loader (lazy) ──
    var _auditData = audit;
    var esc2 = esc;
    window._auditShowDetail = function(key) {
      var area = document.getElementById('auditDetailArea');
      if(!area) return;
      function makeTable(rows, cols) {
        if(!rows||!rows.length) return '<div style="color:var(--muted);padding:10px;text-align:center;font-size:.75rem">لا يوجد بيانات</div>';
        var h='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.72rem"><thead><tr style="background:var(--panel2)">'
          +cols.map(function(c){ return '<th style="padding:5px 7px;text-align:right">'+c.label+'</th>'; }).join('')
          +'</tr></thead><tbody>';
        rows.forEach(function(r){ h+='<tr style="border-bottom:1px solid var(--border)">'+cols.map(function(c){ return '<td style="padding:5px 7px">'+esc2(String(r[c.key]||'—'))+'</td>'; }).join('')+'</tr>'; });
        return h+'</tbody></table></div>';
      }
      var configs = {
        vacant:    {title:'📋 الشاغر الفعلي',          rows:_auditData.vacantActualRows,        cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'آخر مستأجر',key:'lastTenant'},{label:'شاغرة من',key:'vacantFrom'},{label:'أيام',key:'daysVacant'},{label:'إيجار ضائع',key:'lostRent'}]},
        leaving:   {title:'🚪 خروج آخر الشهر',         rows:_auditData.endOfMonthLeaverRows,    cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant'},{label:'الإيجار',key:'rent'},{label:'تاريخ الخروج',key:'endDate'},{label:'متاح من',key:'availableFrom'}]},
        transfers: {title:'🔄 النقل الداخلي',           rows:_auditData.internalTransferRows,    cols:[{label:'المستأجر',key:'tenant'},{label:'من',key:'fromApt'},{label:'غرفة',key:'fromRoom'},{label:'إلى',key:'toApt'},{label:'غرفة',key:'toRoom'},{label:'تاريخ النقل',key:'transferDate'}]},
        new:       {title:'👥 المستأجرين الجدد',        rows:_auditData.newTenantRows,           cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant'},{label:'تاريخ الدخول',key:'startDate'},{label:'الإيجار',key:'monthlyRent'},{label:'التأمين',key:'depositPaid'}]},
        occupied:  {title:'🏢 المشغولون خلال الشهر',   rows:_auditData.occupiedDuringMonthRows, cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant_name'},{label:'الإيجار',key:'monthly_rent'}]},
        snap:      {title:'📊 Snapshot التفاصيل',       rows:snap_units,                         cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant_name'},{label:'الإيجار',key:'monthly_rent'}]}
      };

      // Ledger — lazy load from Supabase
      if(key === 'ledger') {
        area.innerHTML = '<div style="text-align:center;color:#666;padding:16px;font-size:.75rem"><span class="spin"></span> جاري تحميل دفتر الشهر...</div>';
        Promise.all([
          sb.from('rent_payments').select('unit_id,apartment,room,tenant_name,amount,payment_date,payment_month,payment_method,notes').like('payment_month', monYM+'%'),
          sb.from('deposits').select('unit_id,apartment,room,tenant_name,amount,deposit_received_date,status').gte('deposit_received_date',monYM+'-01').lte('deposit_received_date',window.monthEnd(monYM)),
          sb.from('deposits').select('unit_id,apartment,room,tenant_name,amount,refund_amount,refund_date,status').gt('refund_amount',0).gte('refund_date',monYM+'-01').lte('refund_date',window.monthEnd(monYM)),
          sb.from('expenses').select('category,description,amount,period_month').eq('period_month',monYM+'-01'),
          sb.from('owner_payments').select('amount,period_month,method').eq('period_month',monYM+'-01')
        ]).then(function(results){
          var ledgerPays=results[0].data||[], ledgerDeps=results[1].data||[], ledgerRefunds=results[2].data||[], ledgerExp=results[3].data||[], ledgerOwner=results[4].data||[];
          var totPays=ledgerPays.reduce(function(s,r){ return s+(r.amount||0); },0);
          var totDeps=ledgerDeps.reduce(function(s,r){ return s+(r.amount||0); },0);
          var totRef=ledgerRefunds.reduce(function(s,r){ return s+(Number(r.refund_amount)||0); },0);
          var totExp=ledgerExp.reduce(function(s,r){ return s+(r.amount||0); },0);
          var totOwn=ledgerOwner.reduce(function(s,r){ return s+(r.amount||0); },0);
          var cashTotalL=totPays+totDeps;
          var ledgerNet=cashTotalL-totRef-totExp-totOwn;
          var S=function(n){ return Number(n||0).toLocaleString(); };
          function getFloor(apt){ return Math.floor(Number(apt)/100); }
          // floors
          var floors={};
          function getF(f){ if(!floors[f]) floors[f]={target:0,collected:0,deps:0,refunds:0}; return floors[f]; }
          snap_units.forEach(function(u){ getF(getFloor(u.apartment)).target+=calcEffectiveRent(u,discMap,adjustMap,monYM); });
          ledgerPays.forEach(function(p){ getF(getFloor(p.apartment)).collected+=(p.amount||0); });
          ledgerDeps.forEach(function(d){ getF(getFloor(d.apartment)).deps+=(d.amount||0); });
          ledgerRefunds.forEach(function(d){ getF(getFloor(d.apartment)).refunds+=(Number(d.refund_amount)||0); });
          var floorNums=Object.keys(floors).map(Number).sort(function(a,b){return a-b;});
          // new by floor
          var newByFloor={};
          (_auditData.newTenantRows||[]).forEach(function(r){ var f=getFloor(r.apartment); if(!newByFloor[f]) newByFloor[f]={count:0,rent:0,deps:0}; newByFloor[f].count++; newByFloor[f].rent+=(r.monthlyRent||0); newByFloor[f].deps+=(r.depositPaid||0); });
          // leavers by floor
          var leaveByFloor={};
          (_auditData.endOfMonthLeaverRows||[]).forEach(function(r){ var f=getFloor(r.apartment); if(!leaveByFloor[f]) leaveByFloor[f]={count:0,rent:0}; leaveByFloor[f].count++; leaveByFloor[f].rent+=(r.rent||0); });
          var th=function(t){ return '<th style="padding:6px 10px;background:#1a3a6a;color:#fff;text-align:right;font-size:.72rem">'+t+'</th>'; };
          var td=function(v,b){ return '<td style="padding:6px 10px;border:1px solid #ddd;font-size:.73rem'+(b?';font-weight:800':'')+'">'+String(v===null||v===undefined?'—':v)+'</td>'; };
          var lhtml='<div id="ledgerContent" style="background:#fff;color:#111;direction:rtl">'
            +'<div style="text-align:center;padding:10px 0 6px;border-bottom:3px solid #1a3a6a;margin-bottom:12px"><div style="font-size:1.1rem;font-weight:800;color:#1a3a6a">📒 دفتر الشهر — '+monYM+'</div></div>'
            +'<div style="background:#f0f4ff;border:1px solid #c5cae9;border-radius:10px;padding:12px;margin-bottom:14px">'
              +'<div style="font-weight:700;font-size:.8rem;color:#1a3a6a;margin-bottom:8px">📊 ملخص عام</div>'
              +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
          [{l:'💵 إجمالي الكاش',v:cashTotalL,c:'#1a7a4a'},{l:'✅ إيجار محصّل',v:totPays,c:'#2e7d32'},{l:'🔒 تأمينات مستلمة',v:totDeps,c:'#1565c0'},{l:'↩️ تأمينات مرتجعة',v:totRef,c:'#c62828'},{l:'💸 المصاريف',v:totExp,c:'#e65100'},{l:'👤 دُفع للمالك',v:totOwn,c:'#555'},{l:'🎯 إيجار مستهدف',v:targetRent,c:'#333'},{l:'🏦 الصافي',v:ledgerNet,c:ledgerNet>=0?'#2e7d32':'#c62828'}].forEach(function(item){
            lhtml+='<div style="background:#fff;border-radius:8px;padding:8px;display:flex;justify-content:space-between;align-items:center;border:1px solid #e0e0e0"><span style="font-size:.72rem;color:#555">'+item.l+'</span><span style="font-size:.82rem;font-weight:800;color:'+item.c+'">'+S(item.v)+' AED</span></div>';
          });
          lhtml+='</div></div>';
          // floors table
          lhtml+='<div style="font-weight:700;font-size:.8rem;color:#1a3a6a;margin-bottom:6px">🏢 ملخص الأدوار</div>'
            +'<div style="overflow-x:auto;margin-bottom:14px"><table style="width:100%;border-collapse:collapse"><thead><tr>'+th('الدور')+th('مستهدف')+th('محصّل')+th('متبقي')+th('تأمينات')+th('مرتجعات')+th('الصافي')+'</tr></thead><tbody>';
          var tot={t:0,c:0,d:0,r:0};
          floorNums.forEach(function(f){ var fl=floors[f]; var rem=fl.target-fl.collected; var net=fl.collected+fl.deps-fl.refunds; tot.t+=fl.target;tot.c+=fl.collected;tot.d+=fl.deps;tot.r+=fl.refunds;
            lhtml+='<tr style="background:'+(f%2?'#f9f9f9':'#fff')+'">'+td('الدور '+f,true)+td(S(fl.target))+td(S(fl.collected))+'<td style="padding:6px 10px;border:1px solid #ddd;font-size:.73rem;color:'+(rem>0?'#c62828':'#2e7d32')+'">'+S(rem)+'</td>'+td(S(fl.deps))+td(S(fl.refunds))+'<td style="padding:6px 10px;border:1px solid #ddd;font-size:.73rem;font-weight:700;color:'+(net>=0?'#2e7d32':'#c62828')+'">'+S(net)+'</td></tr>';
          });
          lhtml+='<tr style="background:#1a3a6a;color:#fff;font-weight:800"><td style="padding:6px 10px;font-size:.73rem">الإجمالي</td><td style="padding:6px 10px;font-size:.73px">'+S(tot.t)+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(tot.c)+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(tot.t-tot.c)+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(tot.d)+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(tot.r)+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(tot.c+tot.d-tot.r)+'</td></tr></tbody></table></div>';
          // vacant actual by floor
          var vacByFloor={};
          (_auditData.vacantActualRows||[]).forEach(function(r){ var f=getFloor(r.apartment); if(!vacByFloor[f]) vacByFloor[f]={count:0,lostRent:0,days:0}; vacByFloor[f].count++; vacByFloor[f].lostRent+=(r.lostRent||0); vacByFloor[f].days+=(r.daysVacant||0); });
          var vf=Object.keys(vacByFloor).map(Number).sort(function(a,b){return a-b;});
          if(vf.length){ var vt={count:0,lostRent:0};
            lhtml+='<div style="font-weight:700;font-size:.8rem;color:#c62828;margin-bottom:6px">🏚️ الشاغر الفعلي</div><div style="overflow-x:auto;margin-bottom:6px"><table style="width:100%;border-collapse:collapse"><thead><tr>'+th('الدور')+th('عدد الوحدات')+th('الإيجار الضائع')+th('متوسط أيام')+'</tr></thead><tbody>';
            vf.forEach(function(f){ var v=vacByFloor[f]; vt.count+=v.count;vt.lostRent+=v.lostRent; var avgDays=v.count?Math.round(v.days/v.count):0;
              lhtml+='<tr style="background:'+(f%2?'#f9f9f9':'#fff')+'">'+td('الدور '+f,true)+td(v.count)+td(S(v.lostRent))+td(avgDays)+'</tr>';
            });
            lhtml+='<tr style="background:#c62828;color:#fff;font-weight:800"><td style="padding:6px 10px;font-size:.73rem">الإجمالي</td><td style="padding:6px 10px;font-size:.73rem">'+vt.count+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(vt.lostRent)+' AED</td><td style="padding:6px 10px;font-size:.73rem">—</td></tr></tbody></table></div>'
            +'<button onclick="window._ledgerDetail(\'vacant\')" style="background:#f8f9fa;border:2px solid #c62828;border-radius:8px;padding:6px 14px;font-size:.72rem;font-weight:700;color:#c62828;cursor:pointer;margin-bottom:14px">📋 عرض تفاصيل الشاغر</button>';
          }

          // new tenants
          var nf=Object.keys(newByFloor).map(Number).sort(function(a,b){return a-b;});
          if(nf.length){ var nt={count:0,rent:0,deps:0};
            lhtml+='<div style="font-weight:700;font-size:.8rem;color:#2e7d32;margin-bottom:6px">🆕 المستأجرون الجدد</div><div style="overflow-x:auto;margin-bottom:14px"><table style="width:100%;border-collapse:collapse"><thead><tr>'+th('الدور')+th('عدد الجدد')+th('الإيجار')+th('التأمينات')+'</tr></thead><tbody>';
            nf.forEach(function(f){ var n=newByFloor[f]; nt.count+=n.count;nt.rent+=n.rent;nt.deps+=n.deps; lhtml+='<tr style="background:'+(f%2?'#f9f9f9':'#fff')+'">'+td('الدور '+f,true)+td(n.count)+td(S(n.rent))+td(S(n.deps))+'</tr>'; });
            lhtml+='<tr style="background:#1a3a6a;color:#fff;font-weight:800"><td style="padding:6px 10px;font-size:.73rem">الإجمالي</td><td style="padding:6px 10px;font-size:.73rem">'+nt.count+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(nt.rent)+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(nt.deps)+'</td></tr></tbody></table></div>';
          }
          // leavers
          var lf=Object.keys(leaveByFloor).map(Number).sort(function(a,b){return a-b;});
          if(lf.length){ var lt={count:0,rent:0};
            lhtml+='<div style="font-weight:700;font-size:.8rem;color:#e65100;margin-bottom:6px">🚪 المغادرون آخر الشهر</div><div style="overflow-x:auto;margin-bottom:14px"><table style="width:100%;border-collapse:collapse"><thead><tr>'+th('الدور')+th('عدد المغادرين')+th('الإيجار الخارج')+'</tr></thead><tbody>';
            lf.forEach(function(f){ var l=leaveByFloor[f]; lt.count+=l.count;lt.rent+=l.rent; lhtml+='<tr style="background:'+(f%2?'#f9f9f9':'#fff')+'">'+td('الدور '+f,true)+td(l.count)+td(S(l.rent))+'</tr>'; });
            lhtml+='<tr style="background:#1a3a6a;color:#fff;font-weight:800"><td style="padding:6px 10px;font-size:.73rem">الإجمالي</td><td style="padding:6px 10px;font-size:.73rem">'+lt.count+'</td><td style="padding:6px 10px;font-size:.73rem">'+S(lt.rent)+'</td></tr></tbody></table></div>';
          }
          // detail buttons
          lhtml+='<div style="font-weight:700;font-size:.8rem;color:#555;margin-bottom:8px">📂 التفاصيل (عند الطلب)</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">';
          [{k:'pays',l:'💳 إيجار محصّل'},{k:'deps',l:'🔒 تأمينات'},{k:'refs',l:'↩️ مرتجعات'},{k:'exps',l:'💸 مصاريف'},{k:'own',l:'👤 دفع المالك'},{k:'target',l:'🎯 مستهدف (Snapshot)'}].forEach(function(b){
            lhtml+='<button onclick="window._ledgerDetail(\''+b.k+'\')" style="background:#f8f9fa;border:2px solid #1a3a6a;border-radius:8px;padding:7px;font-size:.72rem;font-weight:700;color:#111;cursor:pointer">'+b.l+'</button>';
          });
          lhtml+='</div><div id="ledgerDetailArea"></div></div>';
          area.innerHTML='<div style="border:2px solid #e0c860;border-radius:10px;overflow:hidden"><div style="background:#f9f5e0;padding:8px 12px;font-weight:700;font-size:.78rem;display:flex;justify-content:space-between;align-items:center"><span style="color:#7a6000">📒 دفتر الشهر — '+monYM+'</span><div style="display:flex;gap:6px"><button onclick="window._auditLedgerPrint()" style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:3px 10px;font-size:.7rem;cursor:pointer">🖨️ طباعة</button><span onclick="document.getElementById(\'auditDetailArea\').innerHTML=\'\'" style="cursor:pointer;color:#999;font-weight:700;padding:2px 8px">✕</span></div></div><div style="padding:12px">'+lhtml+'</div></div>';
          // ledger detail
          window._ledgerDetailData={
            pays:{rows:ledgerPays,cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant_name'},{label:'المبلغ',key:'amount'},{label:'تاريخ الدفع',key:'payment_date'},{label:'الطريقة',key:'payment_method'}]},
            deps:{rows:ledgerDeps,cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant_name'},{label:'المبلغ',key:'amount'},{label:'التاريخ',key:'deposit_received_date'}]},
            refs:{rows:ledgerRefunds,cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant_name'},{label:'المُرتجع',key:'refund_amount'},{label:'تاريخ الإرجاع',key:'refund_date'}]},
            exps:{rows:ledgerExp,cols:[{label:'الفئة',key:'category'},{label:'الوصف',key:'description'},{label:'المبلغ',key:'amount'}]},
            own:{rows:ledgerOwner,cols:[{label:'المبلغ',key:'amount'},{label:'الشهر',key:'period_month'},{label:'الطريقة',key:'method'}]},
            target:{rows:snap_units,cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'المستأجر',key:'tenant_name'},{label:'الإيجار',key:'monthly_rent'}]},
            vacant:{rows:_auditData.vacantActualRows||[],cols:[{label:'شقة',key:'apartment'},{label:'غرفة',key:'room'},{label:'آخر مستأجر',key:'lastTenant'},{label:'شاغرة من',key:'vacantFrom'},{label:'أيام',key:'daysVacant'},{label:'إيجار ضائع',key:'lostRent'}]}
          };
          window._ledgerDetail=function(key){ var d=window._ledgerDetailData[key]; if(!d) return; var t='<div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#1a3a6a">'+d.cols.map(function(c){ return '<th style="padding:5px 8px;color:#fff;text-align:right;font-size:.7rem">'+c.label+'</th>'; }).join('')+'</tr></thead><tbody>'; d.rows.forEach(function(r,i){ t+='<tr style="background:'+(i%2?'#f9f9f9':'#fff')+'">'+d.cols.map(function(c){ return '<td style="padding:5px 8px;border:1px solid #eee;font-size:.7rem">'+esc2(String(r[c.key]===null||r[c.key]===undefined?'—':r[c.key]))+'</td>'; }).join('')+'</tr>'; }); t+='</tbody></table></div>'; document.getElementById('ledgerDetailArea').innerHTML=t; };
          window._auditLedgerPrint=function(){ var c=document.getElementById('ledgerContent'); if(!c) return; var w=window.open('','_blank','width=900,height=700'); w.document.write('<html dir="rtl"><head><meta charset="utf-8"><title>دفتر الشهر — '+monYM+'</title><style>body{font-family:Arial,sans-serif;direction:rtl;padding:24px;color:#111;background:#fff}table{width:100%;border-collapse:collapse}th{background:#1a3a6a;color:#fff;padding:6px 10px;text-align:right;font-size:11px}td{padding:6px 10px;border:1px solid #ddd;font-size:11px}@media print{button,span[onclick]{display:none}}</style></head><body>'+c.innerHTML+'</body></html>'); w.document.close(); w.focus(); setTimeout(function(){ w.print(); },400); };
          area.scrollIntoView({behavior:'smooth',block:'nearest'});
        }).catch(function(e){ area.innerHTML='<div style="color:#c62828;padding:10px;font-size:.75rem">خطأ: '+e.message+'</div>'; });
        return;

      }
      var cfg = configs[key];
      if(!cfg) return;
      area.innerHTML = '<div style="border:1.5px solid #ddd;border-radius:10px;overflow:hidden;margin-top:4px">'
        +'<div style="background:var(--panel2);padding:8px 12px;font-weight:700;font-size:.78rem;display:flex;justify-content:space-between">'
        +'<span>'+cfg.title+' ('+cfg.rows.length+')</span>'
        +'<span onclick="document.getElementById(\'auditDetailArea\').innerHTML=\'\'" style="cursor:pointer;color:var(--muted)">✕</span>'
        +'</div>'
        +makeTable(cfg.rows, cfg.cols)+'</div>';
      area.scrollIntoView({behavior:'smooth',block:'nearest'});
    };

  } catch(e) {
    toast('خطأ في التدقيق: '+e.message, 'err');
    console.error('loadDashboardAudit:', e);
  } finally {
    if(btn){ btn.disabled=false; btn.innerHTML=origTxt; }
  }
}



window.loadDashboardAudit = loadDashboardAudit;
window.loadSmartDash       = loadSmartDash;
window.repeatLastPayment   = repeatLastPayment;
window.loadLastPayment     = loadLastPayment;
window.generateUnitCode    = generateUnitCode;
window.openLatePayersPanel = openLatePayersPanel;
window.sendLateWA          = sendLateWA;
window.sendBulkLateWA      = sendBulkLateWA;
window.loadRentForecast    = loadRentForecast;
window.showForecast        = showForecast;
