// ══════════════════════════════════════════════════════
// PRINT HELPER — يفتح نافذة طباعة مستقلة
// ══════════════════════════════════════════════════════
function openPrintWindow(htmlContent) {
  // حاول window.open أولاً
  try {
    var w = window.open('', '_blank');
    if(w) {
      w.document.open();
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8">'
        +'<style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;direction:rtl;padding:16px;color:#111;margin:0;font-size:12px;background:#fff}table{width:100%;border-collapse:collapse;margin-bottom:12px}tr{page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}th{background:#1a3a6a;color:#fff;padding:6px 8px;text-align:right;font-size:11px;border:1px solid #999}td{padding:5px 8px;border:1px solid #ddd;text-align:right;font-size:11px}.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1a3a6a;padding-bottom:10px;margin-bottom:14px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>'
        +'</head><body>'+htmlContent+'</body></html>');
      w.document.close();
      setTimeout(function(){ try{ w.print(); }catch(_e){} }, 400);
      return;
    }
  } catch(_e){}
  // fallback: استخدم pdfOverlay
  var el = document.getElementById('pdf-content');
  if(el) el.innerHTML = htmlContent;
  var overlay = document.getElementById('pdfOverlay');
  if(overlay) overlay.style.display='flex';
}
window.openPrintWindow = openPrintWindow;

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
  // التأمين بيظهر في شهر تحصيله بغض النظر عن حالته
  // لو اتحصل في مارس واترجع في أبريل — يظهر في تقرير مارس كمحصّل
  // استثناء: لو deposit_received_date == refund_date (نفس اليوم) → execute_departure غلط حدّثها
  var rows = Array.isArray(depRows) ? depRows : [];
  return rows.reduce(function(s, d) {
    var rd = String(d.deposit_received_date || '').slice(0, 7);
    if(rd !== monYM) return s;
    // Skip: departure process wrongly set deposit_received_date = refund_date
    var rdFull  = String(d.deposit_received_date || '').slice(0, 10);
    var refFull = String(d.refund_date || '').slice(0, 10);
    if(rdFull && refFull && rdFull === refFull && Number(d.refund_amount) > 0) return s;
    return s + (Number(d.amount) || 0);
  }, 0);
}

// ══════════════════════════════════════════════════════
// MONTHLY REPORT
// Collected = rent paid + deposit paid this month
// Uncollected = rent only (deposit is extra, not rent)
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
// buildMonthSnapshot(monYM) — Source of Truth
// Read Only — NO INSERT / UPDATE / DELETE
// يبني قائمة المستأجرين الذين كانوا موجودين فعلياً في الشهر المختار
// نفس منطق loadMonthly بالضبط
// ══════════════════════════════════════════════════════
async function buildMonthSnapshot(monYM) {
  var monStart    = monYM+'-01';
  var monEnd      = window.monthEnd(monYM);
  var monNext2Start = (function(){
    var d = new Date(monYM+'-01'); d.setMonth(d.getMonth()+2);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
  })();

  var nowYM = (function(){
    var d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  })();

  // ── Queries ──
  var [unitsRes, histRes, discRes, rentHistRes] = await Promise.all([
    sb.from('units').select('id,apartment,room,monthly_rent,first_month_rent,tenant_name,tenant_name2,is_vacant,start_date,deposit,phone,language,unit_status'),
    sb.from('unit_history').select('unit_id,apartment,room,tenant_name,tenant_name2,monthly_rent,first_month_rent,deposit,start_date,end_date,snapshot_type')
      .gte('end_date', monStart),
    sb.from('unit_discounts').select('unit_id,discount_amount')
      .lte('start_date', monEnd)
      .gte('end_date', monStart),
    sb.from('unit_history').select('unit_id,monthly_rent,end_date,snapshot_type')
      .gt('end_date', monEnd)
      .order('end_date', {ascending: true})
  ]);

  var allUnits  = unitsRes.data||[];
  var histUnits = (histRes.data||[]).filter(function(h){ return !h.start_date || h.start_date <= monEnd; });
  histUnits.sort(function(a,b){ return (b.end_date||'') > (a.end_date||'') ? 1 : -1; });

  var discMap = {};
  (discRes.data||[]).forEach(function(d){ discMap[d.unit_id]=(discMap[d.unit_id]||0)+(d.discount_amount||0); });

  // historicRentMap
  var historicRentMap = {};
  if(monYM < nowYM) {
    (rentHistRes.data||[]).forEach(function(h){
      if(!historicRentMap[h.unit_id]) historicRentMap[h.unit_id] = h.monthly_rent||0;
    });
  }

  var monYMcheck = monYM;

  // ابدأ بالمستأجرين الحاليين اللي دخلوا في الشهر أو قبله
  var units = allUnits.filter(function(u){
    if(u.is_vacant) return false;
    var startYM = (u.start_date||'').slice(0,7);
    return !startYM || startYM <= monYMcheck;
  });

  var existingIds = new Set(units.map(function(u){ return u.id; }));
  var currentStartMap = {};
  units.forEach(function(u){ currentStartMap[u.id] = (u.start_date||'').slice(0,7); });

  var addedHistKeys = new Set();

  histUnits.forEach(function(h){
    var uniqueKey = String(h.unit_id)+'_'+String(h.end_date||'');
    if(addedHistKeys.has(uniqueKey)) return;

    var formerUnit = {
      id: h.unit_id, apartment: String(h.apartment||''), room: String(h.room||''),
      monthly_rent: h.monthly_rent||0, first_month_rent: h.first_month_rent||null,
      tenant_name: h.tenant_name||null, tenant_name2: h.tenant_name2||null,
      is_vacant: false, start_date: h.start_date||null, deposit: h.deposit||0,
      _isFormerTenant: true, _endDate: h.end_date, _snapshotType: h.snapshot_type||''
    };

    var endDateYM  = (h.end_date||'').slice(0,7);
    var startDateYM = (h.start_date||'').slice(0,7);

    if(h.end_date && endDateYM < monYMcheck) return;
    if(h.end_date && endDateYM === monYMcheck && h.end_date.slice(8,10) === '01') return;
    // internal_transfer_out: اعرضه بس لو حصل في آخر يوم من الشهر
    // لو حصل قبل آخر يوم → المستأجر انتقل داخل الشهر → تجاهله في الوحدة القديمة
    if(h.snapshot_type === 'internal_transfer_out' && endDateYM === monYMcheck && h.end_date !== monEnd) return;
    if(h.snapshot_type === 'internal_transfer_in') return;
    if(h.snapshot_type === 'rent_change') return;

    if(!existingIds.has(h.unit_id)) {
      addedHistKeys.add(uniqueKey);
      units.push(formerUnit);
      existingIds.add(h.unit_id);
      currentStartMap[h.unit_id] = startDateYM;
    } else {
      var existing = units.find(function(u){ return u.id === h.unit_id && !u._isFormerTenant; });
      if(existing && (!existing.monthly_rent || existing.monthly_rent === 0)) {
        var idx = units.findIndex(function(u){ return u.id === h.unit_id && !u._isFormerTenant; });
        if(idx > -1) { addedHistKeys.add(uniqueKey); units[idx] = formerUnit; currentStartMap[h.unit_id] = startDateYM; }
      } else {
        var currentStartYM = currentStartMap[h.unit_id] || '';
        if(currentStartYM > monYMcheck) {
          var idx = units.findIndex(function(u){ return u.id === h.unit_id && !u._isFormerTenant; });
          if(idx > -1) { addedHistKeys.add(uniqueKey); units[idx] = formerUnit; currentStartMap[h.unit_id] = startDateYM; }
        } else if(currentStartYM === monYMcheck) {
          var currentUnit = units.find(function(u){ return u.id === h.unit_id && !u._isFormerTenant; });
          var samePerson = currentUnit && currentUnit.tenant_name === h.tenant_name;
          if(!samePerson) {
            addedHistKeys.add(uniqueKey);
            var fu2 = Object.assign({}, formerUnit);
            fu2.id = h.unit_id + '_f_' + String(h.end_date||'').slice(0,10);
            units.push(fu2);
          }
        }
      }
    }
  });

  // ترتيب
  units.sort(function(a,b){
    var aa=parseInt(a.apartment)||0, bb=parseInt(b.apartment)||0;
    if(aa!==bb) return aa-bb;
    return (parseInt(a.room)||0)-(parseInt(b.room)||0);
  });

  // تطبيق historicRentMap
  if(monYM < nowYM) {
    units = units.map(function(u){
      var histRent = historicRentMap[u.id] || historicRentMap[String(u.id).split('_f')[0]];
      if(histRent && !u._isFormerTenant) return Object.assign({}, u, { monthly_rent: histRent, _rentFromHistory: true });
      return u;
    });
  }

  return { units: units, discMap: discMap, monStart: monStart, monEnd: monEnd };
}
window.buildMonthSnapshot = buildMonthSnapshot;

async function loadMonthly(btn) {
  var rpmEl = document.getElementById('rpm');
  // خد الشهر من الـ input الأول، لو فاضي خد من getActiveMonth
  var mon = (rpmEl && rpmEl.value) ? rpmEl.value
            : (window.getActiveMonth ? getActiveMonth() : '');
  if(!mon){toast(LANG==='ar'?'اختر الشهر':'Choose month','err');return;}
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    // Parallel fetch — only needed fields for performance
    var monStart = (mon||'').slice(0,7)+'-01';
    var monEnd   = window.monthEnd((mon||'').slice(0,7));
    // أول يوم من الشهر الجاي — عشان نشمل اللي غادروا في اليوم الأول منه
    var _monDate = new Date(monStart);
    _monDate.setMonth(_monDate.getMonth()+1);
    var monNextStart = _monDate.getFullYear()+'-'+String(_monDate.getMonth()+1).padStart(2,'0')+'-01';
    // آخر يوم في الشهر الجاي — عشان نشمل internal_transfer_out في الشهر الجاي
    var monNextMonthEnd = window.monthEnd ? monthEnd(_monDate.getFullYear()+'-'+String(_monDate.getMonth()+1).padStart(2,'0')) : monNextStart.slice(0,7)+'-31';
    // أول يوم في الشهر التالت — عشان نشمل departure اللي end_date = أول يوم الشهر التاني
    var _monDate2 = new Date(mon.slice(0,7)+'-01'); _monDate2.setMonth(_monDate2.getMonth()+2);
    var monNext2Start = _monDate2.getFullYear()+'-'+String(_monDate2.getMonth()+1).padStart(2,'0')+'-01';
    // ── buildMonthSnapshot: Source of Truth ──
    var [snapResult, paysRes, expsRes, ownsRes, pendingMovesRes, depsRes, refundedDepsRes] = await Promise.all([
      buildMonthSnapshot(mon.slice(0,7)),
      // ACCRUAL: filter rent by payment_month (when rent is DUE)
      sb.from('rent_payments').select('unit_id,amount,apartment,room,payment_month,payment_date,payment_method,notes,tenant_num').like('payment_month', mon + '%'),
      sb.from('expenses').select('amount,category,description,receipt_no,period_month').eq('period_month', monStart),
      sb.from('owner_payments').select('amount,period_month,method').eq('period_month', monStart),
      // Pending future bookings for this month
      sb.from('moves').select('unit_id,new_tenant_name,tenant_name,new_start_date,move_date,new_rent,status').eq('type','arrive').eq('status','pending'),
      // Deposits received this month
      sb.from('deposits').select('unit_id,amount,refund_amount,deposit_received_date,status,refund_date,tenant_name,apartment,room')
        .gte('deposit_received_date', monStart).lte('deposit_received_date', monEnd),
      // Refunded deposits this month — by refund_date
      sb.from('deposits').select('unit_id,amount,refund_amount,refund_date,tenant_name,apartment,room')
        .gt('refund_amount', 0)
        .gte('refund_date', monStart)
        .lte('refund_date', monEnd)
    ]);

    // units من buildMonthSnapshot — Source of Truth
    var units    = snapResult.units;
    var discMap  = snapResult.discMap;
    var allUnits = units; // للتوافق مع الكود التالي

    var pays         = paysRes.data||[];
    var exps         = expsRes.data||[];
    var owns         = ownsRes.data||[];
    var deps         = depsRes.data||[];
    var refundedDeps = refundedDepsRes.data||[];
    var monYM = mon.slice(0,7);

    // ── Maps ──
    // paidMap: rent paid this month per unit
    var paidMap = {};
    var paidMapByRoom = {};
    pays.forEach(function(p){
      if(p.unit_id) paidMap[String(p.unit_id)] = (paidMap[String(p.unit_id)]||0)+(p.amount||0);
      var _rk = String(p.apartment||'')+'-'+String(p.room||'');
      paidMapByRoom[_rk] = (paidMapByRoom[_rk]||0)+(p.amount||0);
    });

    // ── دفعات لوحدات شاغرة (مستأجر سابق عليه متأخرات) ──
    // الوحدة الشاغرة مش موجودة في units — نضيفها كصف خاص
    // Build unit_id → {apartment, room, tenant_name} map from ALL units (including vacant) for resolving null apt/room on payments
    // نجيب كل الوحدات (شاغرة ومشغولة) عشان unitIdToAptRoom يكون كامل
    var _allUnitsRes = await sb.from('units').select('id,apartment,room,tenant_name');
    var unitIdToAptRoom = {};
    (_allUnitsRes.data||[]).forEach(function(u){ if(u.id) unitIdToAptRoom[String(u.id)] = {apartment: String(u.apartment||''), room: String(u.room||''), tenant_name: u.tenant_name||null}; });
    // كمان أضيف وحدات الـ snapshot (شامل Former Tenants)
    units.forEach(function(u){ if(u.id) unitIdToAptRoom[String(u.id).split('_f')[0]] = {apartment: String(u.apartment||''), room: String(u.room||''), tenant_name: u.tenant_name||null}; });

    var coveredRooms = {};
    units.forEach(function(u){ coveredRooms[String(u.apartment)+'-'+String(u.room)] = true; });

    pays.forEach(function(p){
      // If payment is missing apartment/room, try to resolve via unit_id
      var apt = p.apartment, rm = p.room;
      if((!apt || !rm) && p.unit_id) {
        var resolved = unitIdToAptRoom[String(p.unit_id)];
        if(resolved) { apt = resolved.apartment; rm = resolved.room; }
      }
      if(!apt || !rm) return;
      var _rk = String(apt)+'-'+String(rm);
      if(coveredRooms[_rk]) return; // already in report
      coveredRooms[_rk] = true;
      units.push({
        id: p.unit_id || _rk,
        apartment: String(apt),
        room: String(rm),
        monthly_rent: 0,
        tenant_name: p.tenant_name || (unitIdToAptRoom[String(p.unit_id)] && unitIdToAptRoom[String(p.unit_id)].tenant_name) || null,
        is_vacant: true,
        _isVacantPaid: true,
        start_date: null
      });
    });

    // حفظ بيانات الشهر عشان exportPDF يستخدمها بدون ما يعمل fetch تاني
    window._pdfData = { mon: mon, units: units, pays: paysRes.data||[], deps: depsRes.data||[], exps: expsRes.data||[], owns: ownsRes.data||[], discMap: discMap, refundedDeps: refundedDepsRes.data||[] };

    // depRawMap: all deposit rows per unit_id AND per apartment-room
    var depRawMap = {};
    var depRawMapByRoom = {};
    deps.forEach(function(d){
      if(d.unit_id) {
        if(!depRawMap[d.unit_id]) depRawMap[d.unit_id]=[];
        depRawMap[d.unit_id].push(d);
      }
      // fallback by apartment-room (for former tenants whose unit_id changed)
      var roomKey = String(d.apartment||'')+'-'+String(d.room||'');
      if(roomKey !== '-') {
        if(!depRawMapByRoom[roomKey]) depRawMapByRoom[roomKey]=[];
        depRawMapByRoom[roomKey].push(d);
      }
    });

    // depMap: deposit counts in the month of unit.start_date
    // depMap: deposits received (deposit_received_date) in this month
    // Uses _pickDepositForReport which checks deposit_received_date — correct
    var depMap = {};
    units.forEach(function(u){
      var amt = _pickDepositForReport(depRawMap[u.id]||[], monYM);
      if(amt > 0) depMap[u.id] = amt;
    });
    // إضافة تأمينات الوحدات الشاغرة (forfeited/held) اللي deposit_received_date في الشهر
    // عشان تأمين المُصادر يظهر حتى لو الوحدة شاغرة
    var extraDepsFromVacant = 0;
    (depsRes.data||[]).forEach(function(d){
      // لو مش موجود في depMap (يعني وحدة شاغرة أو مش في units)
      var alreadyCounted = depMap[d.unit_id];
      if(!alreadyCounted) {
        var rdFull  = String(d.deposit_received_date||'').slice(0,10);
        var refFull = String(d.refund_date||'').slice(0,10);
        if(rdFull && refFull && rdFull === refFull && Number(d.refund_amount||0) > 0) return;
        extraDepsFromVacant += Number(d.amount||0);
      }
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
      // لو مستأجر جديد في الشهر ده وعنده first_month_rent — استخدمه
      var _effectiveRent = u.first_month_rent ? u.first_month_rent : (u.monthly_rent||0);
      _effectiveRent = Math.max(0, _effectiveRent - (discMap[u.id]||0));
      totalRent     += _effectiveRent;
      var _pk1=paidMap[String(u.id)]!==undefined?paidMap[String(u.id)]:(paidMapByRoom[String(u.apartment)+'-'+String(u.room)]||0); totalRentColl += _pk1;
      var _startYM2 = (u.start_date||'').slice(0,7);
      var _depRows2;
      if(u._isFormerTenant) {
        var _uid2 = String(u.id).split('_f')[0];
        _depRows2 = (depRawMap[_uid2]||[]).filter(function(d){ var dy=(d.deposit_received_date||'').slice(0,7); return dy>=_startYM2||!_startYM2; });
        if(!_depRows2.length) { var _rk2b=String(u.apartment)+'-'+String(u.room); _depRows2=(depRawMapByRoom[_rk2b]||[]).filter(function(d){ var dy=(d.deposit_received_date||'').slice(0,7); return dy>=_startYM2||!_startYM2; }); }
      } else {
        _depRows2 = (depRawMap[u.id]||[]).filter(function(d){ var dy=(d.deposit_received_date||'').slice(0,7); return dy>=_startYM2||!_startYM2; });
      }
      totalDeps += _pickDepositForReport(_depRows2, monYM);
    });
    // المُرتجعات في هذا الشهر — query منفصلة بـ refund_date
    var totalRefunds = refundedDeps.reduce(function(s,d){ return s+(Number(d.refund_amount)||0); }, 0);
    exps.forEach(function(e){ totalExp   += e.amount||0; });
    owns.forEach(function(o){ totalOwner += o.amount||0; });

    // totalDeps الصح — مجموع كل التأمينات اللي deposit_received_date في الشهر
    // بدون الاعتماد على depMap (اللي مرتبط بالوحدات بس)
    var totalDeps = (deps||[]).reduce(function(s,d){
      return s + _pickDepositForReport([d], monYM);
    }, 0);
    // totalColl = rent + deposit (total money received this month)
    var totalColl = totalRentColl + totalDeps;

    // ── Group by apartment ──
    // apt.coll = rent + deposit (what was actually received)
    var apts = {};
    units.forEach(function(u){
      if(!u || !u.apartment) return; // skip invalid units
      var apt = String(u.apartment);
      if(!apts[apt]) apts[apt]={units:[],rent:0,rentColl:0,coll:0,deps:0};
      apts[apt].units.push({...u, _isNew: isNewForMonth(u.start_date||'')});
      var _aptEffectiveRent = u.first_month_rent ? u.first_month_rent : (u.monthly_rent||0);
      _aptEffectiveRent = Math.max(0, _aptEffectiveRent - (discMap[u.id]||0));
      apts[apt].rent     += _aptEffectiveRent;
      var _pk3=paidMap[String(u.id)]!==undefined?paidMap[String(u.id)]:(paidMapByRoom[String(u.apartment)+'-'+String(u.room)]||0); apts[apt].rentColl += _pk3;
      var _startYM3 = (u.start_date||'').slice(0,7);
      var _depRows3;
      if(u._isFormerTenant) {
        var _uid3 = String(u.id).split('_f')[0];
        _depRows3 = (depRawMap[_uid3]||[]).filter(function(d){ var dy=(d.deposit_received_date||'').slice(0,7); return dy>=_startYM3||!_startYM3; });
        if(!_depRows3.length) { var _rk3b=String(u.apartment)+'-'+String(u.room); _depRows3=(depRawMapByRoom[_rk3b]||[]).filter(function(d){ var dy=(d.deposit_received_date||'').slice(0,7); return dy>=_startYM3||!_startYM3; }); }
      } else {
        _depRows3 = (depRawMap[u.id]||[]).filter(function(d){ var dy=(d.deposit_received_date||'').slice(0,7); return dy>=_startYM3||!_startYM3; });
      }
      var _dep3 = _pickDepositForReport(_depRows3, monYM);
      apts[apt].coll += _pk3 + _dep3;
      apts[apt].deps += _dep3;
    });
    // ملاحظة: former tenants بيتحسبوا في الـ loop الأصلي فوق — مش محتاج loop تاني

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
          // Former tenants: look up deposit by apartment-room (more reliable than unit_id)
          var _depRows;
          // استخدم unit_id أولاً، لو مفيش استخدم apartment-room
          // فلتر بـ start_date: التأمين المفروض يكون في نفس الشهر أو بعد start_date المستأجر
          var _unitStartYM = (u.start_date||'').slice(0,7);
          if(u._isFormerTenant) {
            // للسابقين — استخدم unit_id مع فلتر تاريخ قريب من فترة إقامته
            _depRows = (depRawMap[String(u.id).split('_f')[0]]||[]).filter(function(d){
              var dYM = (d.deposit_received_date||'').slice(0,7);
              return dYM >= _unitStartYM || !_unitStartYM;
            });
            if(!_depRows.length) {
              var _roomKey = String(u.apartment)+'-'+String(u.room);
              _depRows = (depRawMapByRoom[_roomKey]||[]).filter(function(d){
                var dYM = (d.deposit_received_date||'').slice(0,7);
                return dYM >= _unitStartYM || !_unitStartYM;
              });
            }
          } else {
            // للحاليين — استخدم unit_id مع فلتر إن التأمين بعد أو في نفس شهر الدخول
            _depRows = (depRawMap[u.id]||[]).filter(function(d){
              var dYM = (d.deposit_received_date||'').slice(0,7);
              return dYM >= _unitStartYM || !_unitStartYM;
            });
          }
          var dep = _pickDepositForReport(_depRows, monYM);
          var rentPaid=paidMap[String(u.id)]!==undefined?paidMap[String(u.id)]:(paidMapByRoom[String(u.apartment)+'-'+String(u.room)]||0);
          var isNew    = u._isNew;
          // لو عنده first_month_rent (سواء مستأجر حالي أو سابق) — استخدمه
          var effectiveRent = u.first_month_rent ? u.first_month_rent : (u.monthly_rent||0);
          effectiveRent = Math.max(0, effectiveRent - (discMap[u.id]||0));
          var showDep  = dep > 0; // show if deposit was received this month (regardless of isNew)
          var rem      = u._isVacantPaid ? 0 : Math.max(0, effectiveRent - rentPaid);
          var overpaid = (!u._isVacantPaid && effectiveRent > 0 && rentPaid > effectiveRent) ? (rentPaid - effectiveRent) : 0;
          var fullPaid = u._isVacantPaid ? rentPaid>0 : (rentPaid >= effectiveRent && effectiveRent > 0);
          var partPaid = !u._isVacantPaid && !fullPaid && rentPaid > 0 && !isNew;
          // Status badge
          var stBg = isNew && !fullPaid ? 'var(--accent)' : fullPaid ? 'var(--green)' : partPaid ? 'var(--amber)' : 'var(--red)';
          var stTx = isNew && !fullPaid ? '🆕' : fullPaid ? '✅' : partPaid ? '⚠️' : '❌';
          var stBadge = '<span style="display:inline-block;background:'+stBg+'33;color:'+stBg+';border:1px solid '+stBg+'55;border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:800">'+stTx+'</span>';
          // Paid cell — strong green or red bg
          var paidCell = rentPaid>0
            ? '<span style="background:var(--green)22;color:var(--green);border-radius:6px;padding:2px 7px;font-size:.78rem;font-weight:800">'+rentPaid.toLocaleString()+'</span>'
            : (u.monthly_rent&&!isNew?'<span style="background:var(--red)22;color:var(--red);border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:700">0</span>':'<span style="color:var(--muted)">—</span>');
          // Remaining cell — لو فيه زيادة بتتعرض كـ "مقدم"
          var remCell = rem > 0
            ? '<span style="background:var(--red)22;color:var(--red);border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:700">'+rem.toLocaleString()+'</span>'
            : overpaid > 0
              ? '<span style="background:var(--accent)22;color:var(--accent);border-radius:6px;padding:2px 7px;font-size:.72rem;font-weight:700">+'+overpaid.toLocaleString()+'↪️</span>'
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
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;font-size:.75rem;color:var(--muted)">'+(function(){
            var baseRent = (isNew && u.first_month_rent) ? u.first_month_rent : (u.monthly_rent||0);
            var disc = discMap[u.id]||0;
            var parts = [];
            if(isNew && u.first_month_rent) parts.push('<span style="text-decoration:line-through;color:var(--muted);font-size:.65rem">'+(u.monthly_rent||0).toLocaleString()+'</span> <b style="color:var(--amber)">'+u.first_month_rent.toLocaleString()+'</b>');
            else parts.push(String(u.monthly_rent||0 ));
            if(disc>0) parts.push('<span style="color:var(--amber);font-size:.65rem">-'+disc+'</span> <b style="color:var(--green)">'+effectiveRent.toLocaleString()+'</b>');
            return parts.join(' ');
          })()+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22">'+depCell+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22">'+paidCell+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;font-size:.75rem;color:var(--green);font-weight:800">'+(dep>0?'<b>'+(rentPaid+dep).toLocaleString()+'</b>':'<span style="color:var(--muted)">—</span>')+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22">'+remCell+'</td>'
            +'<td style="padding:7px 9px;border-bottom:1px solid var(--border)22;text-align:center">'+stBadge+'</td>'
            +'</tr>';
        }).join('');

        var aptDeps = g.deps; // بيشمل تأمينات المستأجرين الحاليين والسابقين

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
      var _dispAmt = (d.status==='refunded'&&d.refund_amount>0)?Number(d.refund_amount):Number(d.amount||0);
      groups[apt].total += _dispAmt;
      grandTotal += _dispAmt;
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
                 : d.status==='partial_refund'?(LANG==='ar'?'استرداد جزئي':'Partial Refund')
                 : (LANG==='ar'?'مُصادر':'Forfeited');
        var rdStr = (d.deposit_received_date||'').slice(0,10);
        var unitText = (LANG==='ar'?'شقة ':'Apt ') + escapeHtml(String(item.apt||'—')) + ' — ' + (LANG==='ar'?'غرفة ':'Room ') + escapeHtml(String(item.room||'—'));
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border)22;gap:8px">'
          +'<div>'
          +'<div style="font-size:.82rem;font-weight:600">'+unitText+'</div>'
          +'<div style="font-size:.76rem;color:var(--text)">'+escapeHtml(item.tenant||'—')+'</div>'
          +(rdStr?'<div style="font-size:.7rem;color:var(--muted)">📅 '+rdStr+'</div>':'')
          +(d.refund_date&&d.status!=='held'?'<div style="font-size:.7rem;color:var(--green)">↩️ '+(d.refund_date||'').slice(0,10)+'</div>':'')
          +(d.deduction_amount?'<div style="font-size:.7rem;color:var(--muted)">'+(LANG==='ar'?'خصم:':'Ded:')+' '+d.deduction_amount+' AED</div>':'')
          +(d.notes?'<div style="font-size:.7rem;color:var(--muted)">'+escapeHtml(d.notes)+'</div>':'')
          +'</div>'
          +'<div style="text-align:left;min-width:84px">'
          +'<div style="font-weight:700;color:var(--accent)">'+(d.status==='refunded'&&d.refund_amount>0?d.refund_amount:d.amount)+' AED'+(d.status==='refunded'&&d.refund_amount>0&&d.refund_amount!==d.amount?' <span style="font-size:.65rem;color:var(--muted)">من '+d.amount+'</span>':'')+'</div>'
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
  var [rentR, depR, expR, ownerR, refR] = await Promise.all([
    // الإيجار: payment_date (نفس Collection Report)
    sb.from('rent_payments').select('amount').gte('payment_date', start).lte('payment_date', end),
    // التأمينات: deposit_received_date في الشهر (نفس Collection Report)
    sb.from('deposits').select('amount,status,refund_date,deposit_received_date').gte('deposit_received_date', start).lte('deposit_received_date', end),
    sb.from('expenses').select('amount').eq('period_month', (monYM||'').slice(0,7)+'-01'),
    // دفعات المالك: period_month
    sb.from('owner_payments').select('amount').eq('period_month', (monYM||'').slice(0,7)+'-01'),
    // المرتجعات في الشهر: refund_date
    sb.from('deposits').select('refund_amount,refund_date').gt('refund_amount',0).gte('refund_date', start).lte('refund_date', end)
  ]);
  var rent = (rentR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  // التأمينات: نفس منطق Collection Report — استبعاد refunded لو refund_date = deposit_received_date
  var deps = (depR.data||[]).reduce(function(s,d){
    var rdFull = String(d.deposit_received_date||'').slice(0,10);
    var refFull = String(d.refund_date||'').slice(0,10);
    if(rdFull && refFull && rdFull === refFull && Number(d.refund_amount||0) > 0) return s;
    return s + Number(d.amount||0);
  },0);
  var refunds = (refR.data||[]).reduce(function(s,r){return s+Number(r.refund_amount||0);},0);
  var exps = (expR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  var owner = (ownerR.data||[]).reduce(function(s,r){return s+Number(r.amount||0);},0);
  var cashIn = rent + deps;
  var cashOut = exps + owner + refunds;
  return { month: monYM, rent: rent, deposits: deps, refunds: refunds, cashIn: cashIn, expenses: exps, ownerPayments: owner, cashOut: cashOut, net: cashIn - cashOut };
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
    +(x.refunds>0?'<div class="sum" style="border:1px solid var(--red)33"><span style="color:var(--red)">تأمينات مُرتجعة</span><b style="color:var(--red)">- '+_finAmt(x.refunds)+'</b></div>':'')
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
    // استخدم بيانات loadMonthly المحفوظة — نفس الـ snapshot الصح للشهر
    if(!window._pdfData || window._pdfData.mon.slice(0,7) !== mon.slice(0,7)) {
      toast(LANG==='ar'?'افتح التقرير أولاً ثم اطبع':'Open the report first, then print','err');
      return;
    }
    var units = window._pdfData.units;
    var pays  = window._pdfData.pays;
    var exps  = window._pdfData.exps;
    var owns  = window._pdfData.owns;
    var deps  = window._pdfData.deps;

    var monYM = mon.slice(0,7);

    var paidMap = {};
    var paidMapByRoom = {};
    pays.forEach(function(p){
      if(p.unit_id) paidMap[String(p.unit_id)] = (paidMap[String(p.unit_id)]||0)+(p.amount||0);
      var _rk = String(p.apartment||'')+'-'+String(p.room||'');
      paidMapByRoom[_rk] = (paidMapByRoom[_rk]||0)+(p.amount||0);
    });

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

    // discMap للـ PDF — من _pdfData اللي loadMonthly حسبه
    var _pdfDiscMap = {};
    if(window._pdfData && window._pdfData.discMap) {
      _pdfDiscMap = window._pdfData.discMap;
    }

    // totalRefunds — محتاجه في جدول المقارنة
    var _refundedDepsData = window._pdfData.refundedDeps || [];
    var totalRefunds = _refundedDepsData.reduce(function(s,d){ return s+(Number(d.refund_amount)||0); }, 0);
    // لو مش محفوظ — نجيبه من السيرفر
    if(!_refundedDepsData.length) {
      try {
        var _rr = await sb.from('deposits').select('refund_amount')
          .gt('refund_amount',0)
          .gte('refund_date', monYM+'-01')
          .lte('refund_date', window.monthEnd(monYM));
        totalRefunds = (_rr.data||[]).reduce(function(s,d){return s+(Number(d.refund_amount)||0);},0);
      } catch(_e){}
    }

    var totalRent=0, totalRentColl=0, totalExp=0, totalOwner=0;
    units.forEach(function(u){
      // نفس منطق loadMonthly: first_month_rent + discount + historicRent
      var baseRent = (u.start_date && u.start_date.slice(0,7)===monYM && u.first_month_rent) ? u.first_month_rent : (u.monthly_rent||0);
      var disc = _pdfDiscMap[u.id]||0;
      totalRent += Math.max(0, baseRent - disc);
      var _pk2=paidMap[String(u.id)]!==undefined?paidMap[String(u.id)]:(paidMapByRoom[String(u.apartment)+'-'+String(u.room)]||0); totalRentColl += _pk2;
      // depMap used only for per-room display — not for grand total
    });
    // totalDeps الصح — من كل التأمينات مباشرة
    var totalDeps = (deps||[]).reduce(function(s,d){ return s + _pickDepositForReport([d], monYM); }, 0);
    var totalColl = totalRentColl + totalDeps;
    exps.forEach(function(e){ totalExp   += e.amount||0; });
    owns.forEach(function(o){ totalOwner += o.amount||0; });

    // Group by apartment
    var apts = {};
    units.forEach(function(u){
      var apt = String(u.apartment);
      if(!apts[apt]) apts[apt]={units:[],rent:0,rentColl:0,deps:0};
      apts[apt].units.push(u);
      var _baseR = (u.start_date && u.start_date.slice(0,7)===monYM && u.first_month_rent) ? u.first_month_rent : (u.monthly_rent||0);
      apts[apt].rent     += Math.max(0, _baseR - (_pdfDiscMap[u.id]||0));
      var _pk4=paidMap[String(u.id)]!==undefined?paidMap[String(u.id)]:(paidMapByRoom[String(u.apartment)+'-'+String(u.room)]||0); apts[apt].rentColl += _pk4;
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
          var got=paidMap[String(u.id)]!==undefined?paidMap[String(u.id)]:(paidMapByRoom[String(u.apartment)+'-'+String(u.room)]||0);
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

    var _pdfStaticCSS = '<style>'      +'*{box-sizing:border-box}'      +'body{font-family:Arial,Helvetica,sans-serif;direction:rtl;padding:16px;color:#111;margin:0;font-size:12px;background:#fff}'      +'table{width:100%;border-collapse:collapse;page-break-inside:auto;margin-bottom:12px}'      +'tr{page-break-inside:avoid;page-break-after:auto}'      +'thead{display:table-header-group}'      +'tfoot{display:table-footer-group}'      +'th{background:#1a3a6a;color:#fff;padding:6px 8px;text-align:right;font-size:11px;border:1px solid #ccc}'      +'td{padding:5px 8px;border:1px solid #ddd;text-align:right;font-size:11px}'      +'.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1a3a6a;padding-bottom:10px;margin-bottom:14px}'      +'@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'      +'</style>';
    document.getElementById('pdf-content').innerHTML =
      '<div class="hd">'
    var pdfPct = totalRent>0?Math.round(totalRentColl/totalRent*100):0;
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
      +(totalRefunds>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px;background:#ffeaea;border-radius:4px">'
        +'<span style="font-size:11px;color:#555">↩️ تأمينات مُرتجعة</span>'
        +'<b style="font-size:12px;color:#c0392b">- '+totalRefunds.toLocaleString()+' AED</b>'
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
        +'<b style="font-size:15px;font-weight:800">'+(totalColl-totalRefunds-totalExp-totalOwner).toLocaleString()+' AED</b>'
      +'</div>'
      +'</div>';


    // ── جدول المقارنة في الـ PDF ──
    var _pdfCashRent = 0, _pdfCashDeps = 0, _pdfCashRef = 0;
    try {
      var [_cr, _cd, _cref] = await Promise.all([
        sb.from('rent_payments').select('amount').gte('payment_date', monYM+'-01').lte('payment_date', window.monthEnd(monYM)),
        sb.from('deposits').select('amount,status,refund_date,deposit_received_date').gte('deposit_received_date', monYM+'-01').lte('deposit_received_date', window.monthEnd(monYM)),
        sb.from('deposits').select('refund_amount').gt('refund_amount',0).gte('refund_date', monYM+'-01').lte('refund_date', window.monthEnd(monYM))
      ]);
      _pdfCashRent = (_cr.data||[]).reduce(function(s,p){return s+(p.amount||0);},0);
      _pdfCashDeps = (_cd.data||[]).reduce(function(s,d){
        var r=String(d.deposit_received_date||'').slice(0,10), rf=String(d.refund_date||'').slice(0,10);
        if(r&&rf&&r===rf&&Number(d.refund_amount||0)>0) return s;
        return s+Number(d.amount||0);
      },0);
      _pdfCashRef = (_cref.data||[]).reduce(function(s,d){return s+Number(d.refund_amount||0);},0);
    } catch(_e){}
    var _pdfAccrNet = totalRentColl + totalDeps - totalRefunds;
    var _pdfCashNet = _pdfCashRent + _pdfCashDeps - _pdfCashRef;
    var _pdfDiffRow = function(label, accrVal, cashVal) {
      var diff = cashVal - accrVal;
      var col  = diff>0?'#1a7a4a':diff<0?'#c0392b':'#666';
      var arr  = diff>0?'↑':diff<0?'↓':'—';
      return '<tr>'
        +'<td style="padding:5px 8px;border:1px solid #ddd;font-size:11px">'+label+'</td>'
        +'<td style="padding:5px 8px;border:1px solid #ddd;font-size:11px;text-align:center">'+accrVal.toLocaleString()+'</td>'
        +'<td style="padding:5px 8px;border:1px solid #ddd;font-size:11px;text-align:center">'+cashVal.toLocaleString()+'</td>'
        +'<td style="padding:5px 8px;border:1px solid #ddd;font-size:11px;text-align:center;font-weight:700;color:'+col+'">'
        +(diff!==0?arr+' '+Math.abs(diff).toLocaleString():'—')+'</td>'
        +'</tr>';
    };
    var _pdfCompare = '<div style="margin-top:16px;border-top:2px solid #333;padding-top:12px">'
      +'<div style="font-size:11px;font-weight:700;color:#333;margin-bottom:8px">📊 مقارنة الاستحقاق والتحصيل الفعلي</div>'
      +'<table style="width:100%;border-collapse:collapse;margin-bottom:6px">'
      +'<thead><tr style="background:#f0f0f0">'
      +'<th style="padding:6px 8px;border:1px solid #ccc;font-size:11px;text-align:right">البند</th>'
      +'<th style="padding:6px 8px;border:1px solid #ccc;font-size:10px;text-align:center">استحقاق</th>'
      +'<th style="padding:6px 8px;border:1px solid #ccc;font-size:10px;text-align:center">فعلي</th>'
      +'<th style="padding:6px 8px;border:1px solid #ccc;font-size:10px;text-align:center">الفرق</th>'
      +'</tr></thead><tbody>'
      +_pdfDiffRow('الإيجار', totalRentColl, _pdfCashRent)
      +_pdfDiffRow('التأمينات المستلمة', totalDeps, _pdfCashDeps)
      +_pdfDiffRow('التأمينات المرتجعة', totalRefunds, _pdfCashRef)
      +_pdfDiffRow('إجمالي الكاش', _pdfAccrNet, _pdfCashNet)
      +'</tbody></table>'
      +'<div style="font-size:9px;color:#888">💡 سبب الفرق غالباً هو دفعات تم استلامها خلال الشهر لكنها تخص شهوراً أخرى أو العكس.</div>'
      +'</div>';
    document.getElementById('pdf-content').innerHTML += _pdfCompare;
    openPrintWindow(_pdfStaticCSS + document.getElementById('pdf-content').innerHTML);
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
    var sorted = Object.keys(aptData).map(function(k){ return aptData[k]; }).sort(function(a,b){ return b.collected - a.collected; });
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

// ══ DISCOUNT REPORT ══
async function loadDiscReport(btn) {
  var orig = btn ? btn.innerHTML : '';
  if(btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }
  try {
    var today = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();

    var { data: discounts, error } = await sb.from('unit_discounts')
      .select('id,unit_id,apartment,room,discount_amount,start_date,end_date,reason')
      .order('apartment').order('room').order('start_date');
    if(error) throw error;

    var discounts = discounts || [];
    var out = document.getElementById('rDiscOut');
    if(!discounts.length) {
      out.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">'+
        (LANG==='ar'?'لا توجد خصومات مسجّلة':'No discounts found')+'</div>';
      return;
    }

    // تقسيم لنشط وسابق
    var active = discounts.filter(function(d){ return d.end_date >= today; });
    var expired = discounts.filter(function(d){ return d.end_date < today; });

    var totalActive = active.reduce(function(s,d){ return s+(d.discount_amount||0); }, 0);
    var totalExpired = expired.reduce(function(s,d){ return s+(d.discount_amount||0); }, 0);

    // تجميع بالشقة
    var aptMap = {};
    discounts.forEach(function(d) {
      var apt = String(d.apartment||'');
      if(!aptMap[apt]) aptMap[apt] = [];
      aptMap[apt].push(d);
    });

    function discRow(d) {
      var isActive = d.end_date >= today;
      var badge = isActive
        ? '<span style="background:var(--green)22;color:var(--green);border-radius:6px;padding:2px 7px;font-size:.65rem;font-weight:700">✅ نشط</span>'
        : '<span style="background:var(--muted)22;color:var(--muted);border-radius:6px;padding:2px 7px;font-size:.65rem;font-weight:700">⏱️ منتهي</span>';
      return '<tr style="border-bottom:1px solid var(--border)">'
        +'<td style="padding:7px 6px;font-size:.8rem">'+d.room+'</td>'
        +'<td style="padding:7px 6px;font-size:.8rem;font-weight:700;color:var(--amber)">'+d.discount_amount+' AED</td>'
        +'<td style="padding:7px 6px;font-size:.75rem;color:var(--muted)">'+d.start_date+'</td>'
        +'<td style="padding:7px 6px;font-size:.75rem;color:var(--muted)">'+d.end_date+'</td>'
        +'<td style="padding:7px 6px;font-size:.75rem">'+badge+'</td>'
        +'<td style="padding:7px 6px;font-size:.75rem;color:var(--muted)">'+(d.reason||'—')+'</td>'
        +'</tr>';
    }

    var html = '<div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap">'
      +'<div style="background:var(--green)15;border:1px solid var(--green)33;border-radius:10px;padding:10px 16px;flex:1;min-width:120px">'
      +'<div style="font-size:.65rem;color:var(--muted)">'+(LANG==='ar'?'خصومات نشطة':'Active Discounts')+'</div>'
      +'<div style="font-weight:900;color:var(--green);font-size:1.1rem">'+active.length+' <span style="font-size:.75rem">خصم</span></div>'
      +'<div style="font-size:.8rem;color:var(--green)">'+totalActive.toLocaleString()+' AED</div>'
      +'</div>'
      +'<div style="background:var(--muted)15;border:1px solid var(--border);border-radius:10px;padding:10px 16px;flex:1;min-width:120px">'
      +'<div style="font-size:.65rem;color:var(--muted)">'+(LANG==='ar'?'خصومات منتهية':'Expired Discounts')+'</div>'
      +'<div style="font-weight:900;color:var(--muted);font-size:1.1rem">'+expired.length+' <span style="font-size:.75rem">خصم</span></div>'
      +'<div style="font-size:.8rem;color:var(--muted)">'+totalExpired.toLocaleString()+' AED</div>'
      +'</div>'
      +'</div>';

    Object.keys(aptMap).sort().forEach(function(apt) {
      var rows = aptMap[apt];
      var aptTotal = rows.reduce(function(s,d){ return s+(d.discount_amount||0); }, 0);
      var aptActive = rows.filter(function(d){ return d.end_date >= today; });
      html += '<div style="margin-bottom:14px;border:1px solid var(--border);border-radius:12px;overflow:hidden">'
        +'<div style="background:var(--surf2);padding:9px 12px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-weight:700;font-size:.85rem">🏢 شقة '+apt+'</span>'
        +'<span style="font-size:.75rem;color:var(--amber)">إجمالي: '+aptTotal.toLocaleString()+' AED'
        +(aptActive.length?' | <span style="color:var(--green)">'+aptActive.length+' نشط</span>':'')
        +'</span>'
        +'</div>'
        +'<table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="background:var(--surf3,var(--surf2))">'
        +'<th style="padding:5px 6px;font-size:.7rem;text-align:right;color:var(--muted)">غرفة</th>'
        +'<th style="padding:5px 6px;font-size:.7rem;text-align:right;color:var(--muted)">الخصم</th>'
        +'<th style="padding:5px 6px;font-size:.7rem;text-align:right;color:var(--muted)">من</th>'
        +'<th style="padding:5px 6px;font-size:.7rem;text-align:right;color:var(--muted)">حتى</th>'
        +'<th style="padding:5px 6px;font-size:.7rem;text-align:right;color:var(--muted)">الحالة</th>'
        +'<th style="padding:5px 6px;font-size:.7rem;text-align:right;color:var(--muted)">السبب</th>'
        +'</tr></thead><tbody>'
        + rows.map(discRow).join('')
        +'</tbody></table></div>';
    });

    out.innerHTML = html;
  } catch(e) {
    toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err');
    console.error('loadDiscReport:', e);
  } finally {
    if(btn) { btn.disabled=false; btn.innerHTML=orig||'🏷️ عرض تقرير الخصومات'; }
  }
}
window.loadDiscReport = loadDiscReport;

// ══════════════════════════════════════════════════════
// REFUNDED DEPOSITS REPORT
// ══════════════════════════════════════════════════════
async function loadRefundedDepsReport(btn) {
  var monEl = document.getElementById('rrefund-month');
  if(!monEl || !monEl.value) { toast(LANG==='ar'?'اختر الشهر':'Choose month','err'); return; }
  var monYM = monEl.value.slice(0,7);
  var orig = btn ? btn.innerHTML : '';
  if(btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }
  try {
    var start = monYM+'-01';
    var end   = window.monthEnd(monYM);

    var { data: refunds, error } = await sb.from('deposits')
      .select('id,unit_id,apartment,room,tenant_name,amount,refund_amount,refund_date,deduction_amount,deduction_reason,deposit_received_date,status')
      .gt('refund_amount', 0)
      .gte('refund_date', start)
      .lte('refund_date', end)
      .in('status', ['refunded','partial_refund'])
      .order('apartment').order('room');
    if(error) throw error;

    var out = document.getElementById('rRefundDepOut');
    if(!out) { toast('rRefundDepOut not found','err'); return; }

    if(!refunds || !refunds.length) {
      out.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px">لا توجد تأمينات مُرتجعة في '+monYM+'</div>';
      return;
    }

    var totalDeposit    = refunds.reduce(function(s,d){ return s+Number(d.refund_amount||0); },0);
    var totalRefund     = refunds.reduce(function(s,d){ return s+Number(d.refund_amount||0); },0);
    var totalDeductions = refunds.reduce(function(s,d){ return s+Number(d.deduction_amount||0); },0);
    var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    var html = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">'
      +'<div style="background:var(--accent-glow);border:1px solid var(--accent);border-radius:10px;padding:10px 16px;flex:1;min-width:120px">'
      +'<div style="font-size:.65rem;color:var(--muted)">إجمالي التأمينات</div>'
      +'<div style="font-weight:800;color:var(--accent);font-size:1rem">'+totalDeposit.toLocaleString()+' AED</div></div>'
      +'<div style="background:var(--red)15;border:1px solid var(--red)33;border-radius:10px;padding:10px 16px;flex:1;min-width:120px">'
      +'<div style="font-size:.65rem;color:var(--muted)">إجمالي الخصومات</div>'
      +'<div style="font-weight:800;color:var(--red);font-size:1rem">'+totalDeductions.toLocaleString()+' AED</div></div>'
      +'<div style="background:var(--green)15;border:1px solid var(--green)33;border-radius:10px;padding:10px 16px;flex:1;min-width:120px">'
      +'<div style="font-size:.65rem;color:var(--muted)">صافي المُرتجع</div>'
      +'<div style="font-weight:800;color:var(--green);font-size:1rem">'+totalRefund.toLocaleString()+' AED</div></div>'
      +'</div>';

    html += '<button onclick="exportRefundedDepsPDF(\''+monYM+'\')" style="width:100%;padding:11px;background:var(--surf2);border:1.5px solid var(--border);border-radius:12px;color:var(--text);font-family:var(--font);font-size:.82rem;font-weight:700;cursor:pointer;margin-bottom:14px">📄 PDF</button>';

    html += '<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">';
    refunds.forEach(function(d, i){
      var bg = i%2===0 ? '' : 'background:var(--surf2);';
      html += '<div style="padding:11px 14px;border-bottom:1px solid var(--border)22;'+bg+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start">'
        +'<div>'
        +'<div style="font-size:.85rem;font-weight:700">شقة '+esc(d.apartment||'')+'–'+esc(d.room||'')+' <span style="font-weight:400;color:var(--muted);font-size:.75rem">'+esc(d.tenant_name||'—')+'</span></div>'
        +'<div style="font-size:.7rem;color:var(--muted);margin-top:2px">تاريخ الإرجاع: '+(d.refund_date||'').slice(0,10)+'</div>'
        +(d.deduction_reason?'<div style="font-size:.7rem;color:var(--amber);margin-top:1px">سبب الخصم: '+esc(d.deduction_reason)+'</div>':'')
        +'</div>'
        +'<div style="text-align:end">'
        +'<div style="font-size:.78rem;color:var(--muted)">أصل التأمين: <b>'+Number(d.amount||0).toLocaleString()+'</b></div>'
        +(d.deduction_amount?'<div style="font-size:.75rem;color:var(--red)">خصم: -'+Number(d.deduction_amount).toLocaleString()+'</div>':'')
        +'<div style="font-size:.88rem;font-weight:800;color:var(--green)">مُرتجع: '+Number(d.refund_amount||0).toLocaleString()+' AED</div>'
        +'</div>'
        +'</div>'
        +'</div>';
    });
    html += '</div>';

    out.innerHTML = html;
  } catch(e) {
    toast('خطأ: '+e.message,'err');
    console.error('loadRefundedDepsReport:', e);
  } finally {
    if(btn) { btn.disabled=false; btn.innerHTML=orig; }
  }
}

async function exportRefundedDepsPDF(monYM) {
  var start = monYM+'-01';
  var end   = window.monthEnd(monYM);
  var { data: refunds } = await sb.from('deposits')
    .select('apartment,room,tenant_name,amount,refund_amount,refund_date,deduction_amount,deduction_reason')
    .gt('refund_amount', 0).gte('refund_date', start).lte('refund_date', end)
    .order('apartment').order('room');

  var totalDeposit = (refunds||[]).reduce(function(s,d){return s+Number(d.refund_amount||0);},0);
  var totalRefund  = (refunds||[]).reduce(function(s,d){return s+Number(d.refund_amount||0);},0);
  var totalDed     = (refunds||[]).reduce(function(s,d){return s+Number(d.deduction_amount||0);},0);
  var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  var rows = (refunds||[]).map(function(d){
    return '<tr>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(d.apartment||'')+'–'+esc(d.room||'')+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(d.tenant_name||'—')+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">'+Number(d.amount||0).toLocaleString()+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;color:#c0392b">'+Number(d.deduction_amount||0).toLocaleString()+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;font-size:11px">'+esc(d.deduction_reason||'—')+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;color:#1a7a4a;font-weight:700">'+Number(d.refund_amount||0).toLocaleString()+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-size:11px">'+(d.refund_date||'').slice(0,10)+'</td>'
      +'</tr>';
  }).join('');

  openPrintWindow(
    '<div style="font-family:Arial,sans-serif;direction:rtl;padding:20px;color:#111">'
    +'<div style="border-bottom:3px solid #1a3a6a;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between">'
    +'<div><div style="font-size:18px;font-weight:800;color:#1a3a6a">تقرير التأمينات المُرتجعة</div>'
    +'<div style="font-size:12px;color:#555;margin-top:3px">'+monYM+'</div></div>'
    +'<div style="font-size:11px;color:#888">'+new Date().toLocaleDateString('ar-AE')+'</div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">'
    +'<div style="background:#e8f0fe;border-radius:8px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:800;color:#1a3a6a">'+totalDeposit.toLocaleString()+'</div><div style="font-size:10px;color:#555">إجمالي التأمينات</div></div>'
    +'<div style="background:#ffeaea;border-radius:8px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:800;color:#c0392b">'+totalDed.toLocaleString()+'</div><div style="font-size:10px;color:#555">إجمالي الخصومات</div></div>'
    +'<div style="background:#e8f5ee;border-radius:8px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:800;color:#1a7a4a">'+totalRefund.toLocaleString()+'</div><div style="font-size:10px;color:#555">صافي المُرتجع</div></div>'
    +'</div>'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<thead><tr style="background:#1a3a6a;color:#fff">'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">الوحدة</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">المستأجر</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">التأمين</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">الخصم</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">سبب الخصم</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">المُرتجع</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">تاريخ الإرجاع</th>'
    +'</tr></thead><tbody>'+rows+'</tbody>'
    +'<tfoot><tr style="background:#f0f0f0;font-weight:700">'
    +'<td colspan="2" style="padding:7px 8px;border:1px solid #ddd;text-align:right">الإجمالي</td>'
    +'<td style="padding:7px 8px;border:1px solid #ddd;text-align:center">'+totalDeposit.toLocaleString()+'</td>'
    +'<td style="padding:7px 8px;border:1px solid #ddd;text-align:center;color:#c0392b">'+totalDed.toLocaleString()+'</td>'
    +'<td style="border:1px solid #ddd"></td>'
    +'<td style="padding:7px 8px;border:1px solid #ddd;text-align:center;color:#1a7a4a">'+totalRefund.toLocaleString()+'</td>'
    +'<td style="border:1px solid #ddd"></td>'
    +'</tr></tfoot></table></div>'
  );
}

// ══════════════════════════════════════════════════════
// DEPOSIT DEDUCTIONS REPORT
// ══════════════════════════════════════════════════════
async function loadDepDeductionsReport(btn) {
  var monEl = document.getElementById('rdeduct-month');
  if(!monEl || !monEl.value) { toast(LANG==='ar'?'اختر الشهر':'Choose month','err'); return; }
  var monYM = monEl.value.slice(0,7);
  var orig = btn ? btn.innerHTML : '';
  if(btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }
  try {
    var start = monYM+'-01';
    var end   = window.monthEnd(monYM);

    var { data: deductions, error } = await sb.from('deposits')
      .select('id,unit_id,apartment,room,tenant_name,amount,deduction_amount,deduction_reason,refund_date')
      .gt('deduction_amount', 0)
      .gte('refund_date', start)
      .lte('refund_date', end)
      .order('apartment').order('room');
    if(error) throw error;

    var out = document.getElementById('rDeductOut');
    if(!out) { toast('rDeductOut not found','err'); return; }

    if(!deductions || !deductions.length) {
      out.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px">لا توجد خصومات في '+monYM+'</div>';
      return;
    }

    var totalDed = deductions.reduce(function(s,d){ return s+Number(d.deduction_amount||0); },0);
    var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    var html = '<div style="background:var(--red)15;border:1px solid var(--red)33;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">'
      +'<span style="font-weight:700">إجمالي الخصومات</span>'
      +'<span style="font-weight:800;color:var(--red);font-size:1.1rem">'+totalDed.toLocaleString()+' AED</span></div>';

    html += '<button onclick="exportDepDeductionsPDF(\''+monYM+'\')" style="width:100%;padding:11px;background:var(--surf2);border:1.5px solid var(--border);border-radius:12px;color:var(--text);font-family:var(--font);font-size:.82rem;font-weight:700;cursor:pointer;margin-bottom:14px">📄 PDF</button>';

    html += '<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">';
    deductions.forEach(function(d, i){
      var bg = i%2===0 ? '' : 'background:var(--surf2);';
      html += '<div style="padding:11px 14px;border-bottom:1px solid var(--border)22;'+bg+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:center">'
        +'<div>'
        +'<div style="font-size:.85rem;font-weight:700">شقة '+esc(d.apartment||'')+'–'+esc(d.room||'')+' <span style="font-weight:400;color:var(--muted);font-size:.75rem">'+esc(d.tenant_name||'—')+'</span></div>'
        +'<div style="font-size:.72rem;color:var(--amber);margin-top:2px">'+esc(d.deduction_reason||'—')+'</div>'
        +'<div style="font-size:.68rem;color:var(--muted)">تاريخ: '+(d.refund_date||'').slice(0,10)+'</div>'
        +'</div>'
        +'<div style="font-weight:800;color:var(--red);font-size:.9rem">'+Number(d.deduction_amount||0).toLocaleString()+' AED</div>'
        +'</div>'
        +'</div>';
    });
    html += '</div>';
    out.innerHTML = html;
  } catch(e) {
    toast('خطأ: '+e.message,'err');
    console.error('loadDepDeductionsReport:', e);
  } finally {
    if(btn) { btn.disabled=false; btn.innerHTML=orig; }
  }
}

async function exportDepDeductionsPDF(monYM) {
  var start = monYM+'-01';
  var end   = window.monthEnd(monYM);
  var { data: deductions } = await sb.from('deposits')
    .select('apartment,room,tenant_name,amount,deduction_amount,deduction_reason,refund_date')
    .gt('deduction_amount', 0).gte('refund_date', start).lte('refund_date', end)
    .order('apartment').order('room');

  var totalDed = (deductions||[]).reduce(function(s,d){return s+Number(d.deduction_amount||0);},0);
  var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  var rows = (deductions||[]).map(function(d){
    return '<tr>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(d.apartment||'')+'–'+esc(d.room||'')+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(d.tenant_name||'—')+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;color:#c0392b;font-weight:700">'+Number(d.deduction_amount||0).toLocaleString()+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;font-size:11px">'+esc(d.deduction_reason||'—')+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-size:11px">'+(d.refund_date||'').slice(0,10)+'</td>'
      +'</tr>';
  }).join('');

  openPrintWindow(
    '<div style="font-family:Arial,sans-serif;direction:rtl;padding:20px;color:#111">'
    +'<div style="border-bottom:3px solid #1a3a6a;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between">'
    +'<div><div style="font-size:18px;font-weight:800;color:#1a3a6a">تقرير خصومات التأمين</div>'
    +'<div style="font-size:12px;color:#555;margin-top:3px">'+monYM+'</div></div>'
    +'<div style="font-size:11px;color:#888">'+new Date().toLocaleDateString('ar-AE')+'</div></div>'
    +'<div style="background:#ffeaea;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between">'
    +'<span style="font-weight:700;font-size:13px">إجمالي الخصومات</span>'
    +'<span style="font-weight:800;color:#c0392b;font-size:15px">'+totalDed.toLocaleString()+' AED</span></div>'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<thead><tr style="background:#1a3a6a;color:#fff">'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">الوحدة</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">المستأجر</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">مبلغ الخصم</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">السبب</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">تاريخ الإرجاع</th>'
    +'</tr></thead><tbody>'+rows+'</tbody>'
    +'<tfoot><tr style="background:#f0f0f0;font-weight:700">'
    +'<td colspan="2" style="padding:7px 8px;border:1px solid #ddd;text-align:right">الإجمالي</td>'
    +'<td style="padding:7px 8px;border:1px solid #ddd;text-align:center;color:#c0392b">'+totalDed.toLocaleString()+' AED</td>'
    +'<td colspan="2" style="border:1px solid #ddd"></td>'
    +'</tr></tfoot></table></div>'
  );
}

window.loadRefundedDepsReport = loadRefundedDepsReport;
window.exportRefundedDepsPDF  = exportRefundedDepsPDF;
window.loadDepDeductionsReport = loadDepDeductionsReport;
window.exportDepDeductionsPDF  = exportDepDeductionsPDF;

// ══════════════════════════════════════════════════════
// VACANT UNITS HISTORICAL REPORT
// وحدات كانت شاغرة طول الشهر المختار (مش فيها مستأجر خالص)
// ══════════════════════════════════════════════════════
async function loadVacantHistoricalReport(btn) {
  var monEl = document.getElementById('rvacant-month');
  if(!monEl || !monEl.value) { toast(LANG==='ar'?'اختر الشهر':'Choose month','err'); return; }
  var monYM    = monEl.value.slice(0,7);
  var monStart = monYM+'-01';
  var monEnd   = window.monthEnd(monYM);
  var orig = btn ? btn.innerHTML : '';
  if(btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }

  try {
    var [unitsRes, histRes] = await Promise.all([
      sb.from('units').select('id,apartment,room,monthly_rent,is_vacant,unit_status,start_date,tenant_name'),
      sb.from('unit_history').select('unit_id,apartment,room,tenant_name,monthly_rent,start_date,end_date,snapshot_type')
        .order('end_date', {ascending: false})
    ]);

    var allUnits = unitsRes.data||[];
    var hist     = histRes.data||[];

    // Month-End Vacancy Snapshot:
    // وحدة شاغرة في نهاية الشهر = مفيش مستأجر نشط في monEnd
    // مستأجر نشط في monEnd = start_date <= monEnd ومش خرج قبل أو في monEnd

    var vacantUnits = [];

    allUnits.forEach(function(u) {
      var isOccupiedNow = !u.is_vacant && u.unit_status !== 'available' && u.unit_status !== 'maintenance';

      // المستأجر الحالي نشط في monEnd لو دخل قبله أو فيه
      if(isOccupiedNow && u.start_date && u.start_date <= monEnd) {
        return; // مشغولة في نهاية الشهر — استبعد
      }

      // شوف لو في مستأجر من unit_history نشط في monEnd
      // نشط = start_date <= monEnd وend_date > monEnd (لسه موجود)
      var activeTenantAtMonEnd = hist.some(function(h) {
        if(h.unit_id !== u.id) return false;
        if(h.snapshot_type === 'rent_change' || h.snapshot_type === 'internal_transfer_in') return false;
        var hStart = h.start_date || '2000-01-01';
        var hEnd   = h.end_date   || '9999-12-31';
        // نشط في monEnd = دخل قبل أو في monEnd وخرج بعده
        return hStart <= monEnd && hEnd > monEnd;
      });

      if(!activeTenantAtMonEnd) {
        vacantUnits.push(u);
      }
    });

    // لكل وحدة شاغرة — ابحث عن آخر مستأجر (end_date <= monEnd)
    var results = vacantUnits.map(function(u) {
      // آخر مستأجر خرج قبل أو في monEnd
      var prevTenants = hist.filter(function(h) {
        if(h.unit_id !== u.id) return false;
        if(h.snapshot_type === 'rent_change') return false;
        return (h.end_date||'') <= monEnd;
      }).sort(function(a,b) {
        return (b.end_date||'') > (a.end_date||'') ? 1 : -1;
      });

      var lastTenant  = prevTenants[0] || null;
      var vacantSince = lastTenant ? lastTenant.end_date : null;
      var daysVacant  = 0;
      if(vacantSince) {
        var d1 = new Date(vacantSince);
        var d2 = new Date(monEnd);
        daysVacant = Math.max(0, Math.round((d2-d1)/(1000*60*60*24)));
      } else {
        // لا يوجد مستأجر سابق — شاغرة من أول الشهر
        var d1 = new Date(monStart);
        var d2 = new Date(monEnd);
        daysVacant = Math.max(1, Math.round((d2-d1)/(1000*60*60*24)));
        vacantSince = monStart;
      }

      // لو مفيش مستأجر سابق أو إيجاره 0 — استخدم إيجار الوحدة الحالي كتقدير
      var estimatedRent = lastTenant && (lastTenant.monthly_rent||0) > 0
        ? (lastTenant.monthly_rent||0)
        : (u.monthly_rent||0);

      return {
        id:           u.id,
        apartment:    u.apartment,
        room:         u.room,
        lastTenant:   lastTenant ? (lastTenant.tenant_name||'—') : 'No Previous Tenant',
        startDate:    lastTenant ? (lastTenant.start_date||'—') : '—',
        endDate:      lastTenant ? (lastTenant.end_date||'—')   : '—',
        lastRent:     estimatedRent,
        isEstimated:  !lastTenant && estimatedRent > 0,  // إيجار تقديري مش حقيقي
        daysVacant:   daysVacant,
        vacantSince:  vacantSince
      };
    });

    // رتّب: حسب الشقة ثم الغرفة
    results.sort(function(a,b){
      var an=Number(a.apartment)||0, bn=Number(b.apartment)||0;
      if(an!==bn) return an-bn;
      return (Number(a.room)||0)-(Number(b.room)||0);
    });

    // تصنيف الوحدات لـ 3 مجموعات
    var reallyVacant   = results.filter(function(r){ return r.daysVacant > 0; });
    var endOfMonthExit = results.filter(function(r){ return r.daysVacant === 0 && r.lastTenant !== 'No Previous Tenant'; });
    var neverOccupied  = results.filter(function(r){ return r.lastTenant === 'No Previous Tenant'; });


    var out = document.getElementById('rVacantOut');
    if(!out) { toast('rVacantOut not found','err'); return; }

    if(!results.length) {
      out.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px">لا توجد وحدات شاغرة في '+monYM+'</div>';
      return;
    }

    var totalLostRent = results.reduce(function(s,r){ return s+r.lastRent; },0);
    var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    // تجميع بالشقق والأدوار
    var apts = {};
    results.forEach(function(r){
      var apt = String(r.apartment);
      if(!apts[apt]) apts[apt]={units:[],rent:0};
      apts[apt].units.push(r);
      apts[apt].rent += r.lastRent||0;
    });
    var floors = {};
    Object.keys(apts).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
      var fl = String(Math.floor(Number(apt)/100));
      if(!floors[fl]) floors[fl]={apts:[],count:0,rent:0};
      floors[fl].apts.push(apt);
      floors[fl].count += apts[apt].units.length;
      floors[fl].rent  += apts[apt].rent;
    });

    // ملخص عام
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">'
      +'<div style="background:var(--red)15;border:1px solid var(--red)33;border-radius:10px;padding:12px;text-align:center">'
      +'<div style="font-size:1.8rem;font-weight:800;color:var(--red)">'+results.length+'</div>'
      +'<div style="font-size:.68rem;color:var(--muted)">إجمالي وحدات شاغرة</div></div>'
      +'<div style="background:var(--amber)15;border:1px solid var(--amber)33;border-radius:10px;padding:12px;text-align:center">'
      +'<div style="font-size:1.4rem;font-weight:800;color:var(--amber)">'+totalLostRent.toLocaleString()+'</div>'
      +'<div style="font-size:.68rem;color:var(--muted)">إجمالي الإيجار الضائع (AED)</div></div>'
      +'</div>';

    html += '<button onclick="exportVacantPDF(\''+monYM+'\')" style="width:100%;padding:11px;background:var(--surf2);border:1.5px solid var(--border);border-radius:12px;color:var(--text);font-family:var(--font);font-size:.82rem;font-weight:700;cursor:pointer;margin-bottom:14px">📄 PDF</button>';

    // عرض حسب الأدوار والشقق
    Object.keys(floors).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(fl){
      var fg = floors[fl];
      html += '<div style="background:var(--accent)22;border-right:4px solid var(--accent);border-radius:10px;padding:9px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
        +'<span style="font-size:.9rem;font-weight:800">🏬 الدور '+fl+'</span>'
        +'<span style="font-size:.78rem;display:flex;gap:10px">'
        +'<span style="color:var(--red);font-weight:700">'+fg.count+' وحدة شاغرة</span>'
        +'<span style="color:var(--amber);font-weight:700">'+fg.rent.toLocaleString()+' AED</span>'
        +'</span></div>';

      fg.apts.forEach(function(apt){
        var g = apts[apt];
        html += '<div style="margin-bottom:10px;margin-right:8px">'
          +'<div style="background:var(--surf2);border-radius:10px 10px 0 0;padding:7px 12px;border-right:3px solid var(--red);display:flex;justify-content:space-between;align-items:center">'
          +'<span style="font-weight:700;font-size:.82rem">🏢 شقة '+apt+'</span>'
          +'<span style="font-size:.75rem;display:flex;gap:8px">'
          +'<span style="color:var(--red)">'+g.units.length+' شاغرة</span>'
          +'<span style="color:var(--amber);font-weight:700">'+g.rent.toLocaleString()+' AED</span>'
          +'</span></div>'
          +'<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px">';
        g.units.forEach(function(r){
          var daysColor = r.daysVacant>90?'var(--red)':r.daysVacant>30?'var(--amber)':'var(--muted)';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border)22">'
            +'<div>'
            +'<div style="font-size:.82rem;font-weight:700">غرفة '+esc(String(r.room))+'</div>'
            +'<div style="font-size:.72rem;color:var(--muted)">آخر مستأجر: <b style="color:var(--text)">'+esc(r.lastTenant)+'</b></div>'
            +(r.endDate!=='—'?'<div style="font-size:.65rem;color:var(--muted)">خرج: '+r.endDate+'</div>':'')
            +'</div>'
            +'<div style="text-align:end">'
            +(r.lastRent>0
              ? '<div style="font-size:.75rem;color:'+(r.isEstimated?'var(--amber)':'var(--muted)')+'">'+r.lastRent.toLocaleString()+' AED'+(r.isEstimated?' <span style="font-size:.62rem">(تقديري)</span>':'')+'</div>'
              : '')
            +'<div style="font-size:.78rem;font-weight:800;color:'+daysColor+'">'+r.daysVacant+' يوم</div>'
            +'</div></div>';
        });
        html += '</div></div>';
      });

      html += '<div style="background:var(--surf2);border-radius:10px;padding:8px 14px;margin-bottom:14px;display:flex;justify-content:space-between;font-size:.8rem;border-right:4px solid var(--red)">'
        +'<span style="font-weight:800">إجمالي الدور '+fl+'</span>'
        +'<span style="display:flex;gap:12px">'
        +'<span style="color:var(--red);font-weight:700">'+fg.count+' وحدة</span>'
        +'<span style="color:var(--amber);font-weight:700">'+fg.rent.toLocaleString()+' AED</span>'
        +'</span></div>';
    });

    // ── قسم خروج آخر الشهر ──
    if(endOfMonthExit.length) {
      var endRent = endOfMonthExit.reduce(function(s,r){return s+r.lastRent;},0);
      html += '<div style="margin-top:16px;border-top:2px dashed var(--border);padding-top:12px">'
        +'<div style="background:var(--amber)22;border-right:4px solid var(--amber);border-radius:10px;padding:9px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'
        +'<div><div style="font-size:.85rem;font-weight:800;color:var(--amber)">📤 خروج آخر الشهر</div>'
        +'<div style="font-size:.68rem;color:var(--muted)">غادروا في نهاية الشهر — محتاجة تسويق للشهر الجاي</div></div>'
        +'<div style="text-align:end">'
        +'<div style="font-weight:800;color:var(--amber)">'+endOfMonthExit.length+' وحدة</div>'
        +'<div style="font-size:.78rem;color:var(--amber)">'+endRent.toLocaleString()+' AED</div>'
        +'</div></div>';

      // تجميع بالشقق
      var endApts = {};
      endOfMonthExit.forEach(function(r){
        var apt=String(r.apartment);
        if(!endApts[apt]) endApts[apt]=[];
        endApts[apt].push(r);
      });
      Object.keys(endApts).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(apt){
        endApts[apt].forEach(function(r){
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 14px;border-bottom:1px solid var(--border)22">'
            +'<div><span style="font-size:.82rem;font-weight:700">شقة '+apt+' – غرفة '+r.room+'</span>'
            +'<span style="font-size:.7rem;color:var(--muted);margin-right:6px"> '+r.lastTenant+'</span></div>'
            +(r.lastRent>0?'<span style="font-size:.78rem;color:var(--amber);font-weight:700">'+r.lastRent.toLocaleString()+' AED</span>':'')
            +'</div>';
        });
      });
      html += '</div>';
    }

    // ── لا يوجد مستأجر سابق ──
    if(neverOccupied.length) {
      html += '<div style="margin-top:12px">'
        +'<div style="background:var(--surf2);border-right:4px solid var(--muted);border-radius:10px;padding:9px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'
        +'<div><div style="font-size:.85rem;font-weight:800;color:var(--muted)">🔲 لم يسكنها أحد</div>'
        +'<div style="font-size:.68rem;color:var(--muted)">No Previous Tenant</div></div>'
        +'<div style="font-weight:800;color:var(--muted)">'+neverOccupied.length+' وحدة</div>'
        +'</div>';
      neverOccupied.forEach(function(r){
        html += '<div style="display:flex;justify-content:space-between;padding:6px 14px;border-bottom:1px solid var(--border)22">'
          +'<span style="font-size:.8rem;color:var(--muted)">شقة '+r.apartment+' – غرفة '+r.room+'</span>'
          +'<span style="font-size:.72rem;color:var(--muted)">—</span>'
          +'</div>';
      });
      html += '</div>';
    }

    // ── الإجمالي النهائي ──
    var realRent = reallyVacant.reduce(function(s,r){return s+r.lastRent;},0);
    var endRentTotal = endOfMonthExit.reduce(function(s,r){return s+r.lastRent;},0);
    html += '<div style="margin-top:12px;border:1.5px solid var(--border);border-radius:12px;overflow:hidden">'
      +'<div style="padding:9px 14px;background:var(--surf2);font-weight:800;font-size:.85rem;border-bottom:1px solid var(--border)">📊 ملخص الشغور</div>'
      +'<div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border)22">'
      +'<span style="font-size:.78rem;color:var(--muted)">🏚️ شاغرة فعلاً (قبل آخر الشهر)</span>'
      +'<span style="font-weight:700;color:var(--red)">'+reallyVacant.length+' | '+realRent.toLocaleString()+' AED</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border)22">'
      +'<span style="font-size:.78rem;color:var(--muted)">📤 خروج آخر الشهر</span>'
      +'<span style="font-weight:700;color:var(--amber)">'+endOfMonthExit.length+' | '+endRentTotal.toLocaleString()+' AED</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border)22">'
      +'<span style="font-size:.78rem;color:var(--muted)">🔲 لم يسكنها أحد</span>'
      +'<span style="font-weight:700;color:var(--muted)">'+neverOccupied.length+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:10px 14px;background:var(--red)22">'
      +'<span style="font-weight:800;font-size:.88rem;color:var(--red)">الإجمالي الكلي</span>'
      +'<span style="font-weight:800;color:var(--red)">'+results.length+' وحدة | '+totalLostRent.toLocaleString()+' AED</span>'
      +'</div></div>';

    window._vacantResults = results;
    window._vacantMonYM   = monYM;
    out.innerHTML = html;
  } catch(e) {
    toast('خطأ: '+e.message,'err');
    console.error('loadVacantHistoricalReport:', e);
  } finally {
    if(btn) { btn.disabled=false; btn.innerHTML=orig; }
  }
}

async function exportVacantPDF(monYM) {
  var results = window._vacantResults || [];
  if(!results.length) { toast('لا بيانات للطباعة','err'); return; }
  var totalLostRent = results.reduce(function(s,r){ return s+r.lastRent; },0);
  var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  var rows = results.map(function(r){
    return '<tr>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(String(r.apartment))+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(String(r.room))+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd">'+esc(r.lastTenant)+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-size:11px">'+esc(r.startDate)+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-size:11px">'+esc(r.endDate)+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">'+r.lastRent.toLocaleString()+'</td>'
      +'<td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-weight:700;color:'+(r.daysVacant>90?'#c0392b':r.daysVacant>30?'#b07400':'#333')+'">'+r.daysVacant+'</td>'
      +'</tr>';
  }).join('');

  // فتح نافذة طباعة مستقلة بدل pdfOverlay عشان يظهر كامل
  var printHTML = '<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">'
    +'<title>تقرير الوحدات الشاغرة</title>'
    +'<style>'
    +'body{font-family:Arial,sans-serif;direction:rtl;padding:20px;color:#111;margin:0}'
    +'table{width:100%;border-collapse:collapse;page-break-inside:auto}'
    +'tr{page-break-inside:avoid;page-break-after:auto}'
    +'thead{display:table-header-group}'
    +'tfoot{display:table-footer-group}'
    +'@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    +'</style></head><body>'
    +'<div style="border-bottom:3px solid #1a3a6a;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between">'
    +'<div><div style="font-size:18px;font-weight:800;color:#1a3a6a">تقرير الوحدات الشاغرة التاريخي</div>'
    +'<div style="font-size:12px;color:#555;margin-top:3px">'+monYM+'</div></div>'
    +'<div style="font-size:11px;color:#888">'+new Date().toLocaleDateString('ar-AE')+'</div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">'
    +'<div style="background:#ffeaea;border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:800;color:#c0392b">'+results.length+'</div><div style="font-size:10px;color:#555">وحدة شاغرة</div></div>'
    +'<div style="background:#fff8e1;border-radius:8px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:800;color:#b07400">'+totalLostRent.toLocaleString()+'</div><div style="font-size:10px;color:#555">إيجار ضائع (AED)</div></div>'
    +'<div style="background:#f5f5f5;border-radius:8px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:800;color:#333">'+results[0].daysVacant+'</div><div style="font-size:10px;color:#555">أطول شغور (يوم)</div></div>'
    +'</div>'
    +'<table>'
    +'<thead><tr style="background:#1a3a6a;color:#fff">'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">شقة</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">غرفة</th>'
    +'<th style="padding:7px 8px;text-align:right;font-size:11px">آخر مستأجر</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:10px">تاريخ الدخول</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:10px">تاريخ الخروج</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">آخر إيجار</th>'
    +'<th style="padding:7px 8px;text-align:center;font-size:11px">أيام الشغور</th>'
    +'</tr></thead><tbody>'+rows+'</tbody>'
    +'<tfoot><tr style="background:#f0f0f0;font-weight:700">'
    +'<td colspan="5" style="padding:7px 8px;border:1px solid #ddd;text-align:right">الإجمالي</td>'
    +'<td style="padding:7px 8px;border:1px solid #ddd;text-align:center">'+totalLostRent.toLocaleString()+' AED</td>'
    +'<td style="border:1px solid #ddd"></td>'
    +'</tr></tfoot></table>'
    +'</body></html>';

  var w = window.open('', '_blank');
  w.document.open();
  w.document.write(printHTML);
  w.document.close();
  setTimeout(function(){ try{ w.print(); }catch(_e){} }, 400);
}


window.loadVacantHistoricalReport = loadVacantHistoricalReport;
window.exportVacantPDF = exportVacantPDF;

// ══════════════════════════════════════════════════════
// ACCRUAL VS CASH COMPARISON REPORT
// مقارنة الاستحقاق (payment_month) والتحصيل الفعلي (payment_date)
// ══════════════════════════════════════════════════════
async function loadAccrualCashComparison(btn) {
  var monEl = document.getElementById('raccrual-month');
  if(!monEl || !monEl.value) { toast(LANG==='ar'?'اختر الشهر':'Choose month','err'); return; }
  var monYM    = monEl.value.slice(0,7);
  var monStart = monYM+'-01';
  var monEnd   = window.monthEnd(monYM);
  var orig = btn ? btn.innerHTML : '';
  if(btn) { btn.disabled=true; btn.innerHTML='<span class="spin"></span>'; }

  try {
    var [accrRentRes, cashRentRes, depsRes, cashDepsRes, accrRefRes, cashRefRes] = await Promise.all([
      // استحقاق: payment_month
      sb.from('rent_payments').select('unit_id,amount,payment_date,payment_month,apartment,room')
        .like('payment_month', monYM+'%'),
      // فعلي: payment_date
      sb.from('rent_payments').select('unit_id,amount,payment_date,payment_month,apartment,room')
        .gte('payment_date', monStart).lte('payment_date', monEnd),
      // تأمينات الاستحقاق
      sb.from('deposits').select('amount,status,refund_date,deposit_received_date')
        .gte('deposit_received_date', monStart).lte('deposit_received_date', monEnd),
      // تأمينات فعلية (نفس الاستحقاق هنا)
      sb.from('deposits').select('amount,status,refund_date,deposit_received_date')
        .gte('deposit_received_date', monStart).lte('deposit_received_date', monEnd),
      // مرتجعات الاستحقاق: refund_date
      sb.from('deposits').select('refund_amount').gt('refund_amount',0)
        .gte('refund_date', monStart).lte('refund_date', monEnd),
      // مرتجعات فعلية (نفس)
      sb.from('deposits').select('refund_amount').gt('refund_amount',0)
        .gte('refund_date', monStart).lte('refund_date', monEnd)
    ]);

    var accrRent = (accrRentRes.data||[]).reduce(function(s,p){return s+(p.amount||0);},0);
    var cashRent = (cashRentRes.data||[]).reduce(function(s,p){return s+(p.amount||0);},0);

    var calcDeps = function(data) {
      return (data||[]).reduce(function(s,d){
        var r=String(d.deposit_received_date||'').slice(0,10);
        var rf=String(d.refund_date||'').slice(0,10);
        if(r&&rf&&r===rf&&Number(d.refund_amount||0)>0) return s;
        return s+Number(d.amount||0);
      },0);
    };
    var accrDeps = calcDeps(depsRes.data);
    var cashDeps = calcDeps(cashDepsRes.data);
    var accrRef  = (accrRefRes.data||[]).reduce(function(s,d){return s+Number(d.refund_amount||0);},0);
    var cashRef  = (cashRefRes.data||[]).reduce(function(s,d){return s+Number(d.refund_amount||0);},0);

    var accrNet = accrRent + accrDeps - accrRef;
    var cashNet = cashRent + cashDeps - cashRef;

    // الدفعات اللي سببت الفرق في الإيجار
    // دفعات وصلت في payment_date=أبريل بس payment_month != أبريل
    var diffPays = (cashRentRes.data||[]).filter(function(p){
      return (p.payment_month||'').slice(0,7) !== monYM;
    });
    // دفعات payment_month=أبريل بس payment_date خارج أبريل
    var accrOnlyPays = (accrRentRes.data||[]).filter(function(p){
      var pd = (p.payment_date||'').slice(0,7);
      return pd !== monYM;
    });

    var out = document.getElementById('rAccrualCashOut');
    if(!out) return;

    var diffRow = function(label, accrVal, cashVal) {
      var diff = cashVal - accrVal;
      var col  = diff>0?'var(--green)':diff<0?'var(--red)':'var(--muted)';
      var arr  = diff>0?'↑':diff<0?'↓':'—';
      return '<tr style="border-bottom:1px solid var(--border)22">'
        +'<td style="padding:8px 12px;font-size:.78rem">'+label+'</td>'
        +'<td style="padding:8px 12px;font-size:.78rem;text-align:center;font-weight:700">'+accrVal.toLocaleString()+'</td>'
        +'<td style="padding:8px 12px;font-size:.78rem;text-align:center;font-weight:700">'+cashVal.toLocaleString()+'</td>'
        +'<td style="padding:8px 12px;font-size:.78rem;text-align:center;font-weight:800;color:'+col+'">'
        +(diff!==0?arr+' '+Math.abs(diff).toLocaleString():'—')+'</td>'
        +'</tr>';
    };

    var esc = function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    var html = '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
      +'<div style="padding:10px 14px;background:var(--surf2);border-bottom:2px solid var(--border);font-weight:800;font-size:.85rem">'
      +'📊 مقارنة '+monYM+'</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
      +'<thead><tr style="background:var(--surf3)">'
      +'<th style="padding:7px 10px;text-align:right;font-size:.72rem;color:var(--muted)">البند</th>'
      +'<th style="padding:7px 10px;text-align:center;font-size:.72rem;color:var(--muted)">استحقاق<br><span style="font-size:.62rem">(payment_month)</span></th>'
      +'<th style="padding:7px 10px;text-align:center;font-size:.72rem;color:var(--muted)">فعلي<br><span style="font-size:.62rem">(payment_date)</span></th>'
      +'<th style="padding:7px 10px;text-align:center;font-size:.72rem;color:var(--muted)">الفرق</th>'
      +'</tr></thead><tbody>'
      +diffRow('الإيجار', accrRent, cashRent)
      +diffRow('التأمينات المستلمة', accrDeps, cashDeps)
      +diffRow('التأمينات المرتجعة', accrRef, cashRef)
      +diffRow('إجمالي الكاش', accrNet, cashNet)
      +'</tbody></table></div>'
      +'<div style="padding:8px 14px;font-size:.68rem;color:var(--muted);border-top:1px solid var(--border)22">'
      +'💡 سبب الفرق غالباً هو دفعات تم استلامها خلال الشهر لكنها تخص شهوراً أخرى أو العكس.'
      +'</div></div>';

    // ── جدول تفصيل الفرق في الإيجار ──
    var rentDiff = cashRent - accrRent;
    if(rentDiff !== 0) {
      html += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
        +'<div style="padding:10px 14px;background:var(--surf2);border-bottom:2px solid var(--border);font-weight:800;font-size:.85rem">'
        +'🔍 تفصيل فرق الإيجار ('+rentDiff.toLocaleString()+' AED)'
        +'</div>';

      // دفعات وصلت في أبريل بس لشهور تانية
      if(diffPays.length) {
        var diffTotal = diffPays.reduce(function(s,p){return s+(p.amount||0);},0);
        html += '<div style="padding:8px 14px;background:var(--green)12;font-size:.72rem;font-weight:700;color:var(--green);border-bottom:1px solid var(--border)22">'
          +'💰 دفعات وصلت في '+monYM+' لكنها لشهور أخرى (+'+diffTotal.toLocaleString()+' AED)</div>';
        diffPays.forEach(function(p){
          html += '<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid var(--border)22;font-size:.75rem">'
            +'<div><b>شقة '+esc(String(p.apartment||''))+'–'+esc(String(p.room||''))+'</b>'
            +'<span style="color:var(--muted);margin-right:6px"> تاريخ الدفع: '+(p.payment_date||'').slice(0,10)+'</span>'
            +'<span style="color:var(--amber)"> لشهر: '+(p.payment_month||'').slice(0,7)+'</span></div>'
            +'<b style="color:var(--green)">+'+Number(p.amount||0).toLocaleString()+'</b>'
            +'</div>';
        });
      }

      // دفعات استحقاقها أبريل بس دُفعت في شهر تاني
      if(accrOnlyPays.length) {
        var accrOnlyTotal = accrOnlyPays.reduce(function(s,p){return s+(p.amount||0);},0);
        html += '<div style="padding:8px 14px;background:var(--red)12;font-size:.72rem;font-weight:700;color:var(--red);border-bottom:1px solid var(--border)22">'
          +'⏳ دفعات إيجار '+monYM+' دُفعت في شهور أخرى (-'+accrOnlyTotal.toLocaleString()+' AED)</div>';
        accrOnlyPays.forEach(function(p){
          html += '<div style="display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid var(--border)22;font-size:.75rem">'
            +'<div><b>شقة '+esc(String(p.apartment||''))+'–'+esc(String(p.room||''))+'</b>'
            +'<span style="color:var(--muted);margin-right:6px"> دُفع في: '+(p.payment_date||'').slice(0,10)+'</span></div>'
            +'<b style="color:var(--red)">-'+Number(p.amount||0).toLocaleString()+'</b>'
            +'</div>';
        });
      }

      html += '</div>';
    }

    out.innerHTML = html;
  } catch(e) {
    toast('خطأ: '+e.message,'err');
    console.error('loadAccrualCashComparison:', e);
  } finally {
    if(btn) { btn.disabled=false; btn.innerHTML=orig; }
  }
}

window.loadAccrualCashComparison = loadAccrualCashComparison;
