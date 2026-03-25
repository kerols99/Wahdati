// caches
var _paidMapCache = {};
var _departMapCache = {};

// ══ UNITS ══

async function loadHome(btn, force) {
  if(btn){var orig=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spin"></span>';}
  try {
    var now = new Date();
    var ym  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    var monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var monthNamesEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var mn = LANG==='ar' ? monthNames[now.getMonth()] : monthNamesEN[now.getMonth()];
    document.getElementById('home-month').textContent = mn + ' ' + now.getFullYear();

    var { data: units } = await sb.from('units').select('id,apartment,room,monthly_rent,tenant_name,tenant_name2,phone,rent1,rent2,start_date,language').eq('is_vacant',false).order('apartment').order('room');
    if(!units) units=[];
    MO = units;

    // HOME: unit status cards use payment_month (accrual — who paid this month's rent)
    var { data: pays } = await sb.from('rent_payments').select('unit_id,amount').like('payment_month', ym + '%');
    if(!pays) pays=[];

    var paidMap = {};
    pays.forEach(p=>{ paidMap[p.unit_id] = (paidMap[p.unit_id]||0) + p.amount; });

    var paid=0, partial=0, unpaid=0, remaining=0, lateUnits=[];
    // Current month as YYYY-MM for comparison
    var ymPrefix = ym; // e.g. "2026-03"
    units.forEach(u=>{
      var got  = paidMap[u.id]||0;
      var rent = u.monthly_rent || 0;

      // NEW THIS MONTH: unit start_date is in current month
      // They only paid deposit - don't count in unpaid/partial
      if(u.start_date && u.start_date.slice(0,7) === ymPrefix) {
        if(got >= rent && rent > 0) paid++;
        // else: new tenant, deposit paid, no rent due yet → skip
        return;
      }

      if(got >= rent && rent > 0) paid++;
      else if(got > 0) { partial++; remaining += rent - got; lateUnits.push({...u,got,rem:rent-got,status:'partial'}); }
      else { unpaid++; remaining += rent; lateUnits.push({...u,got:0,rem:rent,status:'unpaid'}); }
    });

    document.getElementById('sp').textContent  = paid;
    document.getElementById('spar').textContent = partial;
    document.getElementById('su').textContent   = unpaid;
    document.getElementById('srem').textContent = remaining>=1000?(remaining/1000).toFixed(1)+'k':remaining;

    // Update nav badges
    var nb = document.getElementById('nav-badge');
    var ub = document.getElementById('units-badge');
    var totalLate = unpaid + partial;
    if(nb){ nb.textContent = totalLate > 0 ? (totalLate>99?'99+':totalLate) : ''; nb.style.display = totalLate>0?'block':'none'; }
    if(ub){ ub.textContent = unpaid > 0 ? (unpaid>99?'99+':unpaid) : ''; ub.style.display = unpaid>0?'block':'none'; }

    var ll = document.getElementById('lateList');
    if(!lateUnits.length) {
      ll.innerHTML = `<div style="text-align:center;padding:14px 0;color:var(--green);font-size:.85rem">${t('allPaid')}</div>`;
    } else {
      ll.innerHTML = lateUnits.slice(0,10).map(u=>{
        var col = u.status==='partial'?'var(--amber)':'var(--red)';
        var statTxt = u.status==='partial'?(LANG==='ar'?'جزئية':'Partial'):(LANG==='ar'?'غير مدفوعة':'Unpaid');
        var waHtml = u.phone
          ? `<button onclick="event.stopPropagation();window.open('https://wa.me/'+(('${u.phone}'.replace(/\D/g,'').startsWith('0')?'971':'')+'${u.phone}'.replace(/\D/g,'').replace(/^0/,''))+\'?text=\'+encodeURIComponent('تذكير إيجار شقة ${u.apartment}–${u.room}: متبقي ${u.rem} AED'))" style="padding:4px 9px;background:var(--green)22;border:1px solid var(--green);border-radius:8px;color:var(--green);font-size:.65rem;cursor:pointer;font-family:var(--font)">💬</button>`
          : '';
        var quickPayBtn = `<button onclick="event.stopPropagation();quickSwitchTab('tRent',null);goPanel('pay');setTimeout(function(){var ae=document.getElementById('r-apt');var re=document.getElementById('r-room');if(ae)ae.value='${u.apartment}';if(re)re.value='${u.room}';if(window.autoFillRent)autoFillRent();},200)" style="padding:5px 10px;background:var(--green)22;border:1px solid var(--green)55;border-radius:8px;color:var(--green);font-size:.68rem;font-weight:700;cursor:pointer;font-family:var(--font);touch-action:manipulation">💰</button>`;
        return `<div class="late-item" data-uid="${u.id}">
          <div style="flex:1;min-width:0">
            <div style="font-size:.82rem;font-weight:600">شقة ${escapeHtml(u.apartment)} — ${escapeHtml(u.room)}</div>
            <div style="font-size:.72rem;color:var(--muted)">${escapeHtml(u.tenant_name||'—')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            ${waHtml}
            ${quickPayBtn}
            <div style="text-align:end">
              <div style="font-size:.65rem;color:${col}">${statTxt}</div>
              <div style="font-size:.8rem;font-weight:700;color:${col}">${u.rem>=1000?(u.rem/1000).toFixed(1)+'k':u.rem} AED</div>
            </div>
          </div>
        </div>`;
      }).join('');
      // Make late items clickable to open drawer
      ll.onclick = function(e){
        var item = e.target.closest('[data-uid]');
        if(item && window.openDrawer) openDrawer(item.dataset.uid);
      };
    }
  } catch(e){ toast('خطأ: '+e.message,'err'); }
  finally{ if(btn){btn.disabled=false;btn.innerHTML=orig||t('refresh');} }
}

async function loadUnits() {
  try {
    // Show skeleton while loading
    var listEl = document.getElementById('unitList');
    if(listEl && !listEl.innerHTML.trim()) {
      listEl.innerHTML = [1,2,3,4,5].map(()=>
        '<div class="unit-skel skeleton"></div>'
      ).join('');
    }
    // Select only fields needed for unit cards
  var { data } = await sb.from('units').select('id,apartment,room,monthly_rent,tenant_name,tenant_name2,phone,phone2,rent1,rent2,start_date,is_vacant,unit_status,deposit,building_name,unit_code,persons_count,language,notes,window_status').order('apartment',{ascending:true});
    if(!data) data=[];
    data.sort((a,b)=>{
      var aptA=parseInt(a.apartment)||0, aptB=parseInt(b.apartment)||0;
      if(aptA!==aptB) return aptA-aptB;
      var rA=parseInt(a.room)||0, rB=parseInt(b.room)||0;
      return rA-rB;
    });
    MO = data;

    // Populate building filter
    var bldSel = document.getElementById('building-filter');
    if(bldSel) {
      var blds = [...new Set((data||[]).map(function(u){return u.building_name||'';}).filter(Boolean))].sort();
      var curBld = bldSel.value;
      bldSel.innerHTML = '<option value="">🏢 كل المباني</option>'
        + blds.map(function(b){ return '<option value="'+b+'"'+(b===curBld?' selected':'')+'>'+b+'</option>'; }).join('');
    }

    var now = new Date();
    var ym = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    var nextM = new Date(now); nextM.setMonth(nextM.getMonth()+1);
    var nextYM = nextM.getFullYear()+'-'+String(nextM.getMonth()+1).padStart(2,'0');

    // Fetch payments + scheduled departures in parallel
    var [paysRes, departRes] = await Promise.all([
      // UNIT CARDS: payment_month for accrual status
      sb.from('rent_payments').select('unit_id,amount').like('payment_month', ym + '%'),
      (function(){
        var departDates = [];
        ['28','29','30','31'].forEach(function(day){
          var d1 = ym + '-' + day;
          if(d1 <= monthEnd(ym)) departDates.push(d1);
        });
        departDates.push(monthStart(nextYM));
        ['28','29','30','31'].forEach(function(day){
          var d2 = nextYM + '-' + day;
          if(d2 <= monthEnd(nextYM)) departDates.push(d2);
        });
        return sb.from('moves').select('unit_id,move_date').eq('type','depart').in('move_date', departDates);
      })()
    ]);

    var paidMap = {};
    (paysRes.data||[]).forEach(p=>{ paidMap[p.unit_id]=(paidMap[p.unit_id]||0)+p.amount; });

    // Build departure map: unit_id → move_date
    var departMap = {};
    (departRes.data||[]).forEach(function(m){ departMap[m.unit_id] = m.move_date; });

    // Attach departure info to units
    data.forEach(function(u){ u._scheduledDepart = departMap[u.id]||null; });

    _paidMapCache = paidMap;
    _departMapCache = departMap;
    renderUnits(data, paidMap);
    document.getElementById('units-count').textContent = data.length + (LANG==='ar'?' وحدة':' units');
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('loadUnits:', e); }
}

function renderUnits(units, paidMap) {
  paidMap = paidMap || {};
  var aptColors = ['#4f8ef7','#22c98a','#f5b731','#f05555','#a78bf5','#2dd4bf','#fb923c','#f472b6'];
  var _now2 = new Date();
  var currentYM = _now2.getFullYear()+'-'+String(_now2.getMonth()+1).padStart(2,'0');
  var html = units.map(u=>{
    var ci = parseInt(u.apartment||0) % aptColors.length;
    var color = aptColors[ci];
    var paid = paidMap[u.id]||0;
    var rent = u.monthly_rent||0;
    var statusColor, statusTxt, badgeBg, stripeColor;
    var unitYM = (u.start_date||'').slice(0,7);
    var isNewThisMonth = unitYM === currentYM;

    var isLeaving     = !u.is_vacant && u._scheduledDepart;
    var isReserved    = u.unit_status === 'reserved';
    var isMaintenance = u.unit_status === 'maintenance';

    if(u.is_vacant || u.unit_status === 'available') {
      statusColor='var(--muted)'; statusTxt=LANG==='ar'?'🏠 شاغرة':'🏠 Vacant';
      badgeBg='var(--surf2)'; stripeColor='var(--border)';
    } else if(isMaintenance) {
      statusColor='var(--amber)'; statusTxt=LANG==='ar'?'🔧 صيانة':'🔧 Maint.';
      badgeBg='var(--amber-bg)'; stripeColor='var(--amber)';
    } else if(isReserved) {
      statusColor='var(--purple)'; statusTxt=LANG==='ar'?'🔖 محجوز':'🔖 Reserved';
      badgeBg='rgba(167,139,245,.1)'; stripeColor='var(--purple)';
    } else if(isLeaving) {
      statusColor='var(--amber)'; statusTxt=LANG==='ar'?'📤 مغادر':'📤 Leaving';
      badgeBg='var(--amber-bg)'; stripeColor='var(--amber)';
    } else if(isNewThisMonth && paid === 0) {
      statusColor='var(--accent)'; statusTxt=LANG==='ar'?'🆕 جديد':'🆕 New';
      badgeBg='var(--accent-glow)'; stripeColor='var(--accent)';
    } else if(paid >= rent && rent > 0) {
      statusColor='var(--green)'; statusTxt=LANG==='ar'?'✓ مدفوع':'✓ Paid';
      badgeBg='var(--green-bg)'; stripeColor='var(--green)';
    } else if(paid > 0) {
      statusColor='var(--amber)'; statusTxt=LANG==='ar'?'◑ جزئي':'◑ Partial';
      badgeBg='var(--amber-bg)'; stripeColor='var(--amber)';
    } else {
      statusColor='var(--red)'; statusTxt=LANG==='ar'?'✕ لم يدفع':'✕ Unpaid';
      badgeBg='var(--red-bg)'; stripeColor='var(--red)';
    }

    var rem = (!u.is_vacant && paid < rent) ? rent - paid : 0;
    var remHtml = rem > 0
      ? '<div style="font-size:.68rem;color:'+statusColor+';margin-top:2px;font-weight:700">'+rem.toLocaleString()+' متبقي</div>'
      : '';
    var paidHtml = (!u.is_vacant && paid > 0 && paid < rent)
      ? '<div style="font-size:.62rem;color:var(--green);margin-top:1px">دفع '+paid.toLocaleString()+'</div>'
      : '';
    var aptLabel = 'شقة '+escapeHtml(u.apartment)+' · '+escapeHtml(u.room)+(u.building_name?' · '+escapeHtml(u.building_name):'');

    return '<div class="unit-card" data-uid="'+u.id+'" style="border:1.5px solid '+stripeColor+'40;border-right:3px solid '+stripeColor+';border-radius:16px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:11px;background:var(--surf);box-shadow:0 2px 10px rgba(0,0,0,.2);cursor:pointer;transition:transform .12s,box-shadow .18s;touch-action:manipulation">'
      +'<div style="min-width:42px;height:42px;border-radius:12px;background:'+color+'20;color:'+color+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0">'+escapeHtml(u.apartment)+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:.68rem;color:var(--muted);margin-bottom:1px">'+aptLabel+'</div>'
        +'<div style="font-size:.88rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escapeHtml(u.tenant_name||'—')+'</div>'
        +(u.tenant_name2?'<div style="font-size:.68rem;color:var(--amber);font-weight:600">+ '+escapeHtml(u.tenant_name2)+'</div>':'')
        +paidHtml
      +'</div>'
      +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">'        +'<div style="font-size:.7rem;font-weight:700;color:'+statusColor+'">'+statusTxt+'</div>'        +'<div style="font-size:.85rem;font-weight:700;color:var(--text)">'+(rent > 0 ? rent.toLocaleString()+' AED' : '—')+'</div>'        +remHtml      +'</div>'    +((!u.is_vacant && rem > 0)?'<button onclick="event.stopPropagation();quickPayUnit(\'' + u.apartment + '\',\'' + u.room + '\',' + rent + ')" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:var(--green);border:none;border-radius:10px;color:#fff;font-size:.9rem;cursor:pointer;flex-shrink:0;touch-action:manipulation">💰</button>':'')    +'</div>'; 
  }).join('');
  var el = document.getElementById('unitList');
  el.innerHTML = html || `<div style="text-align:center;padding:30px;color:var(--muted)">${LANG==='ar'?'لا توجد وحدات':'No units found'}</div>`;
  // Event delegation - one listener for all cards
  el.onclick = function(e) {
    var card = e.target.closest('[data-uid]');
    if(card) openDrawer(card.dataset.uid);
  };
}

function setFilter(filter, btn) {
  _activeFilter = filter;
  // Update button styles
  document.querySelectorAll('.filter-btn').forEach(b => {
    var isActive = b.dataset.filter === filter;
    var colors = {all:'var(--accent)',unpaid:'var(--red)',partial:'var(--amber)',paid:'var(--green)',vacant:'var(--muted)'};
    var col = colors[b.dataset.filter] || 'var(--accent)';
    b.style.background = isActive ? col : 'none';
    b.style.color = isActive ? '#fff' : 'var(--muted)';
    b.style.borderColor = isActive ? col : 'var(--border)';
  });
  filterUnits();
}

function normalizeUnitSearch(v) {
  return String(v == null ? '' : v)
    .replace(/[٠-٩]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, '')
    .trim();
}

function filterUnits() {
  var rawQ = document.getElementById('search-inp').value || '';
  var q = normalizeUnitSearch(rawQ);
  var bldFilter = (document.getElementById('building-filter')||{}).value || '';
  var filtered = MO.filter(function(u) {
    // Building filter
    if(bldFilter && (u.building_name||'') !== bldFilter) return false;
    if(q) {
      var apartment = normalizeUnitSearch(u.apartment || '');
      var room = normalizeUnitSearch(u.room || '');
      var tenant = normalizeUnitSearch(u.tenant_name || '');
      var tenant2 = normalizeUnitSearch(u.tenant_name2 || '');
      var phone = normalizeUnitSearch(u.phone || '');
      var phone2 = normalizeUnitSearch(u.phone2 || '');
      var combos = [
        apartment + '-' + room,
        apartment + room,
        apartment,
        room,
        tenant,
        phone
      ];
      var match = combos.some(function(v){ return v && v.indexOf(q) !== -1; });
      if(!match) return false;
    }
    if(_activeFilter === 'all') return true;
    var paid = _paidMapCache[u.id]||0;
    var rent = u.monthly_rent||0;
    if(_activeFilter === 'vacant')  return u.is_vacant;
    if(_activeFilter === 'paid')    return !u.is_vacant && paid >= rent && rent > 0;
    if(_activeFilter === 'partial') return !u.is_vacant && paid > 0 && paid < rent;
    if(_activeFilter === 'unpaid')  return !u.is_vacant && paid === 0;
    if(_activeFilter === 'leaving')     return !u.is_vacant && !!u._scheduledDepart;
    if(_activeFilter === 'reserved')    return u.unit_status === 'reserved';
    if(_activeFilter === 'maintenance') return u.unit_status === 'maintenance';
    return true;
  });
  if(filtered.length===0){
    document.getElementById('unitList').innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">' + (LANG==='ar'?'لا توجد نتائج مطابقة':'No matching units') + '</div>';
    return;
  }
  renderUnits(filtered, _paidMapCache);
}

async function openDrawer(unitId) {
  // Show loading in drawer immediately
  var drawerContent = document.getElementById('drawerContent');
  if(drawerContent) drawerContent.innerHTML = '<div style="padding:24px;text-align:center"><span class="spin"></span></div>';
  var ov = document.getElementById('drawerOverlay');
  var dr = document.getElementById('drawer');
  if(ov){ ov.classList.add('open'); ov.style.display=''; }
  if(dr){ dr.classList.add('open'); dr.style.display=''; }
  document.body.style.overflow = 'hidden';
  // Always fetch fresh from DB to avoid MO cache issues
  var unit = MO.find(u=>u.id===unitId);
  if(!unit) {
    var { data } = await sb.from('units').select('*').eq('id',unitId).single();
    if(data) { unit = data; MO.push(data); }
  }
  if(!unit) return;

    try {
var now = new Date();
  var ym  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');

  // DRAWER: show rent paid for this month (by due month, not receipt date)
  var { data: pays } = await sb.from('rent_payments')
    .select('amount,tenant_num,payment_date')
    .eq('unit_id', unitId)
    .like('payment_month', ym + '%');

  var totalPaid = (pays||[]).reduce((s,p)=>s+(p.amount||0),0);
  var paid1 = (pays||[]).filter(p=>p.tenant_num===1).reduce((s,p)=>s+(p.amount||0),0);
  var paid2 = (pays||[]).filter(p=>p.tenant_num===2).reduce((s,p)=>s+(p.amount||0),0);
  var rem   = (unit.monthly_rent||0) - totalPaid;
  // Last payment info for partial tracking
  var lastPay = (pays||[]).length > 0 ? pays[0] : null;
  var lastPayDate = lastPay ? (lastPay.payment_date||'').slice(0,10) : null;

  var { data: depRows } = await sb.from('deposits').select('*').eq('unit_id',unitId).order('deposit_received_date',{ascending:false});
  var depRows = depRows || [];
  var { data: departRows } = await sb.from('moves').select('id,move_date').eq('type','depart').eq('unit_id',unitId).order('created_at',{ascending:false}).limit(1);
  var scheduledDepart = (departRows||[])[0] || null;
  // NOTE: deposit shown only if real record exists in deposits table
  // No fallback to unit.deposit — that is reference data only

  var statusColor = totalPaid>=(unit.monthly_rent||0)&&(unit.monthly_rent||0)>0
    ? 'var(--green)' : totalPaid>0 ? 'var(--amber)' : 'var(--red)';
  var statusTxt = totalPaid>=(unit.monthly_rent||0)&&(unit.monthly_rent||0)>0
    ? (LANG==='ar'?'مدفوعة':'Paid')
    : totalPaid>0 ? (LANG==='ar'?'جزئية':'Partial')
    : (LANG==='ar'?'غير مدفوعة':'Unpaid');

  // Build deposit section — shows ALL deposit records for this unit
  var depHTML = '';
  var totalDepHeld = (depRows||[]).filter(function(d){return d.status!=='refunded';}).reduce(function(s,d){return s+(d.amount||0);},0);
  if((depRows||[]).length > 0) {
    var depRowsHTML = (depRows||[]).map(function(d) {
      var sCol = d.status==='held'?'var(--amber)':d.status==='refunded'?'var(--green)':'var(--red)';
      var sTxt = d.status==='held'?(LANG==='ar'?'محتجز':'Held')
               : d.status==='refunded'?(LANG==='ar'?'مُرتجع':'Refunded')
               : (LANG==='ar'?'مُصادر':'Forfeited');
      // RULE: deposit date = deposit_received_date only, never created_at
      var rdStr = (d.deposit_received_date||'').slice(0,10);
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)22">'
        + '<div style="flex:1;min-width:0">'
        + '<span style="color:var(--accent);font-weight:700;font-size:.85rem">'+(d.amount||0)+' AED</span>'
        + (rdStr?' <span style="font-size:.7rem;color:var(--muted)">'+rdStr+'</span>':'')
        + ' <span style="font-size:.7rem;color:'+sCol+';font-weight:600">· '+sTxt+'</span>'
        + (d.notes?'<div style="font-size:.7rem;color:var(--muted)">'+d.notes+'</div>':'')
        + '</div>'
        + '<div style="display:flex;gap:5px;flex-shrink:0;margin-right:4px">'
        + (d.status==='held' ? '<button onclick="quickRefundDeposit(\'' + d.id + '\')" style="padding:5px 9px;background:var(--red)22;border:1px solid var(--red);border-radius:8px;color:var(--red);font-size:.72rem;cursor:pointer;font-family:inherit">↩️</button>' : '')
        + '<button onclick="editDeposit(\'' + d.id + '\')" style="padding:5px 9px;background:var(--accent)22;border:1px solid var(--accent);border-radius:8px;color:var(--accent);font-size:.72rem;cursor:pointer;font-family:inherit">✏️</button>'
        + '<button onclick="deleteDeposit(\'' + d.id + '\',\'' + unitId + '\')" style="padding:5px 9px;background:var(--red)22;border:1px solid var(--red);border-radius:8px;color:var(--red);font-size:.72rem;cursor:pointer;font-family:inherit">🗑️</button>'
        + '</div>'
        + '</div>';
    }).join('');
    depHTML = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">'
      + '<span style="font-size:.65rem;color:var(--muted);font-weight:700">🔒 '+(LANG==='ar'?'التأمين':'Deposit')+'</span>'
      + (totalDepHeld>0?'<span style="font-size:.75rem;color:var(--amber);font-weight:700">'+totalDepHeld+' AED '+(LANG==='ar'?'محتجز':'held')+'</span>':'')
      + '</div>'
      + depRowsHTML
      + '</div>';
  } else {
    var refDep = unit.deposit || 0;
    // Store values on window for button access (avoids iOS text-selection issue)
    window._qrd = {apt: unit.apartment, room: unit.room, amt: refDep, name: unit.tenant_name||'', startDate: unit.start_date||''};
    if(refDep > 0) {
      depHTML = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'        +'<span style="font-size:.75rem;color:var(--amber);font-weight:600">🔒 تأمين مرجعي: <b>'+refDep+' AED</b></span>'        +'<span style="font-size:.65rem;color:var(--muted)">غير مسجّل رسمياً</span>'        +'</div>'        +'<button id="btn-quick-dep" type="button" '        +'style="display:block;width:100%;padding:13px;background:var(--amber);border:none;border-radius:12px;'        +'color:#fff;font-family:var(--font);font-size:.85rem;font-weight:700;cursor:pointer;'        +'touch-action:manipulation;-webkit-appearance:none;letter-spacing:.3px">'        +'🔒 تسجيل التأمين — '+refDep+' AED</button>'        +'</div>';
    } else {
      depHTML = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:.75rem;color:var(--muted)">🔒 '+(LANG==='ar'?'لا يوجد تأمين مسجّل':'No deposit recorded')+'</div>';
    }
  }

  // Build 2-tenant section
  var t2HTML = '';
  if(unit.tenant_name2) {
    t2HTML = '<div style="background:var(--surf2);border-radius:12px;padding:11px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div style="border-left:3px solid var(--accent);padding-right:8px">'
      + '<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">👤 '+(LANG==='ar'?'المستأجر الأول':'Tenant 1')+'</div>'
      + '<div style="font-size:.82rem;font-weight:700">'+(unit.tenant_name||'—')+'</div>'
      + '<div style="font-size:.7rem;color:var(--muted)">'+(unit.phone||'—')+'</div>'
      + (unit.rent1?'<div style="font-size:.78rem;font-weight:700;color:var(--accent);margin-top:2px">'+unit.rent1+' AED</div>':'')
      + (paid1>0?'<div style="font-size:.7rem;color:var(--green)">✅ '+paid1+' AED</div>'
               :'<div style="font-size:.7rem;color:var(--red)">❌ '+(LANG==='ar'?'لم يدفع':'Unpaid')+'</div>')
      + '</div>'
      + '<div style="border-left:3px solid var(--amber);padding-right:8px">'
      + '<div style="font-size:.6rem;color:var(--muted);margin-bottom:2px">👤 '+(LANG==='ar'?'المستأجر الثاني':'Tenant 2')+'</div>'
      + '<div style="font-size:.82rem;font-weight:700">'+(unit.tenant_name2)+'</div>'
      + '<div style="font-size:.7rem;color:var(--muted)">'+(unit.phone2||'—')+'</div>'
      + (unit.rent2?'<div style="font-size:.78rem;font-weight:700;color:var(--amber);margin-top:2px">'+unit.rent2+' AED</div>':'')
      + (paid2>0?'<div style="font-size:.7rem;color:var(--green)">✅ '+paid2+' AED</div>'
               :'<div style="font-size:.7rem;color:var(--red)">❌ '+(LANG==='ar'?'لم يدفع':'Unpaid')+'</div>')
      + '</div>'
      + '</div>';
  }

  var unitCode = window.generateUnitCode ? window.generateUnitCode(unit.apartment, unit.room, unit.building_name) : '';
  document.getElementById('drawerContent').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
    + '<div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'    + '<div style="font-size:1.1rem;font-weight:700">'+(LANG==='ar'?'شقة':'Apt')+' '+unit.apartment+' \u2014 '+unit.room+'</div>'    + (unitCode?'<span style="font-family:monospace;background:var(--accent)18;color:var(--accent);border:1px solid var(--accent)33;border-radius:6px;padding:2px 7px;font-size:.65rem">'+unitCode+'</span>':'')    + '</div>'
    + '<div style="font-size:.82rem;color:var(--muted);margin-top:3px">'+(unit.tenant_name||'—')+(unit.tenant_name2?' & '+unit.tenant_name2:'')+'</div>'
    + '</div>'
    + '<span style="font-size:.75rem;font-weight:700;color:'+statusColor+';background:'+statusColor+'22;padding:4px 10px;border-radius:20px">'+statusTxt+'</span>'
    + '</div>'

    + t2HTML

    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
    + '<div style="background:var(--surf2);border-radius:10px;padding:10px"><div style="font-size:.65rem;color:var(--muted)">'+(LANG==='ar'?'الإيجار الشهري':'Monthly Rent')+'</div><div style="font-weight:700">'+(unit.monthly_rent||0)+' AED</div></div>'
    + '<div style="background:var(--surf2);border-radius:10px;padding:10px"><div style="font-size:.65rem;color:var(--muted)">'+(LANG==='ar'?'المدفوع هذا الشهر':'Paid this month')+'</div><div style="font-weight:700;color:var(--green)">'+totalPaid+' AED</div></div>'
    + '<div style="background:var(--surf2);border-radius:10px;padding:10px"><div style="font-size:.65rem;color:var(--muted)">'+(LANG==='ar'?'المتبقي':'Remaining')+'</div><div style="font-weight:700;color:'+(rem>0?'var(--red)':'var(--green)')+'">'+rem+' AED</div></div>'
    + '<div style="background:var(--surf2);border-radius:10px;padding:10px"><div style="font-size:.65rem;color:var(--muted)">'+(LANG==='ar'?'الهاتف':'Phone')+'</div><div style="font-weight:700;font-size:.78rem">'+(unit.phone||'—')+'</div></div>'
    + '</div>'

    + '<div style="background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:14px">'
    + '<div style="font-size:.65rem;color:var(--muted);font-weight:700;margin-bottom:8px">'+(LANG==='ar'?'بيانات المستأجر والتأمين':'Tenant & Deposit Info')+'</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.78rem">'
    + '<div><span style="color:var(--muted)">'+(LANG==='ar'?'تاريخ الدخول:':'Start Date:')+'</span> <span style="font-weight:600">'+(unit.start_date?new Date(unit.start_date).toLocaleDateString(LANG==='ar'?'ar-AE':'en-GB'):'—')+'</span></div>'
    + '<div><span style="color:var(--muted)">'+(LANG==='ar'?'عدد الأشخاص:':'Persons:')+'</span> <span style="font-weight:600">'+(unit.persons_count||1)+'</span></div>'
    + '<div><span style="color:var(--muted)">'+(LANG==='ar'?'اللغة:':'Language:')+'</span> <span style="font-weight:600">'+(unit.language==='ar'?'عربي':'English')+'</span></div>'
    + '<div><span style="color:var(--muted)">'+(LANG==='ar'?'حالة النافذة:':'Window:')+'</span> <span style="font-weight:600">'+(unit.window_status||'—')+'</span></div>'
    + '</div>'
    + depHTML
    + (scheduledDepart?'<div style="margin-top:8px;padding:8px 10px;border:1px solid var(--amber);border-radius:10px;background:var(--amber)11;font-size:.78rem;color:var(--amber)">📤 '+(LANG==='ar'?'مغادرة مسجلة: ':'Scheduled departure: ') + (scheduledDepart.move_date?new Date(scheduledDepart.move_date).toLocaleDateString(LANG==='ar'?'ar-EG':'en-GB'):'—') + '</div>':'')
    + (unit.notes?'<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:.75rem;color:var(--muted)">📝 '+unit.notes+'</div>':'')
    + '</div>'
    + '<div id="unit-imgs-section" style="margin-bottom:14px"></div>'

    + '<div style="display:flex;gap:8px;margin-bottom:8px">'
    + '<button class="btn bp" style="flex:1" id="drawer-pay-btn">💰 '+(LANG==='ar'?'تسجيل دفعة':'Pay')+(unit.monthly_rent?' — '+unit.monthly_rent.toLocaleString()+' AED':'')+'</button>'
    + '<button class="btn bg" style="flex:1" id="drawer-edit-btn">✏️ '+(LANG==='ar'?'تعديل':'Edit')+'</button>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-bottom:8px">'
    + '<button class="btn bg" style="flex:1;font-size:.8rem" id="drawer-wa-btn">💬 WhatsApp</button>'
    + '<button class="btn br" style="flex:1;font-size:.8rem" id="drawer-del-btn">🗑️ '+(LANG==='ar'?'حذف':'Delete')+'</button>'
    + '</div>'
    + '<button id="drawer-mark-depart-btn" style="width:100%;padding:11px;background:' + (scheduledDepart ? 'var(--amber)22' : 'var(--red)18') + ';border:1px solid ' + (scheduledDepart ? 'var(--amber)' : 'var(--red)') + ';border-radius:12px;color:' + (scheduledDepart ? 'var(--amber)' : 'var(--red)') + ';font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">📤 ' + (scheduledDepart ? (LANG==='ar'?'مغادرة مسجلة':'Scheduled departure') : (LANG==='ar'?'تسجيل مغادرة آخر الشهر':'Mark departure at month end')) + '</button>'
    + '<button id="drawer-contract-btn" style="width:100%;padding:11px;background:var(--accent)22;border:1px solid var(--accent);border-radius:12px;color:var(--accent);font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:8px">📄 '+(LANG==='ar'?'إرسال العقد / PDF':'Contract / PDF')+'</button>'
    + '<button id="drawer-hist-btn" style="width:100%;padding:11px;background:var(--surf2);border:1px solid var(--border);border-radius:12px;color:var(--text);font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer">📋 '+(LANG==='ar'?'سجل الدفعات':'Payment History')+'</button>'
    + '<div id="pay-history" style="display:none"></div>'
    + '<button id="drawer-qnote-btn" style="width:100%;padding:10px;margin-top:8px;background:var(--amber)15;border:1px solid var(--amber)44;border-radius:12px;color:var(--amber);font-family:var(--font);font-size:.78rem;font-weight:700;cursor:pointer;touch-action:manipulation">📝 '+(unit.notes?(LANG==='ar'?'تعديل الملاحظة':'Edit Note'):(LANG==='ar'?'إضافة ملاحظة':'Add Note'))+'</button>'
    + (unit.notes
        ? '<div id="drawer-note-display" style="margin-top:8px;background:var(--amber)15;border:1px solid var(--amber)33;border-radius:10px;padding:9px 12px;border-right:3px solid var(--amber)"><div style="font-size:.6rem;color:var(--amber);font-weight:700;margin-bottom:3px;text-transform:uppercase">📝 ملاحظة</div><div style="font-size:.78rem">'+escapeHtml(unit.notes)+'</div></div>'
        : '<div id="drawer-note-display" style="display:none"></div>');

  // ── Load unit images ──
  loadUnitImages(unitId).then(function(imgs) {
    var sec = document.getElementById('unit-imgs-section');
    if(!sec) return;
    if(imgs.length === 0) { sec.innerHTML = ''; return; }
    sec.innerHTML = '<div style="font-size:.65rem;color:var(--muted);font-weight:700;margin-bottom:8px">📷 صور الوحدة</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + imgs.map(function(img){ return '<img src="'+img.image_data+'" style="width:100px;height:100px;object-fit:cover;border-radius:12px;border:2px solid var(--border);cursor:pointer;flex-shrink:0;transition:transform .15s" onclick="openImgViewer(this.src)" ontouchstart="this.style.transform=\'scale(.93)\'" ontouchend="this.style.transform=\'\'">'; }).join('')
      + '</div>';
  });

  // ── Safe event listeners (no closure variable issues) ──
  var _u = unit; // local ref
  document.getElementById('drawer-pay-btn').onclick = function() {
    if(_u.tenant_name2) { askWhoPayment(_u.id, _u.apartment, _u.room, _u); }
    else {
      closeDrawer(); goPanel('pay');
      setTimeout(function(){
        var ae=document.getElementById('r-apt'); if(ae) ae.value=_u.apartment;
        var re=document.getElementById('r-room'); if(re) re.value=_u.room;
        if(window.autoFillRent) autoFillRent();  // auto-fill amount + month
        var rentTab=document.querySelector('[data-tab-target="tRent"]');
        if(rentTab && window.switchTab) switchTab('tRent', rentTab);
      }, 80);
    }
  };
  document.getElementById('drawer-edit-btn').onclick  = function(){ closeDrawer(); editUnit(_u.id); };
  document.getElementById('drawer-del-btn').onclick   = function(){ confirmDel(_u.id, _u.apartment, _u.room); };
  document.getElementById('drawer-wa-btn').onclick    = function(){ if(_u.tenant_name2) askWhoWA(_u.apartment,_u.room,_u); else showWAModal(_u.apartment,_u.room); };
  document.getElementById('drawer-hist-btn').onclick = function(){ togglePayHistory(_u.id); };

  // Quick note button
  var qnBtn = document.getElementById('drawer-qnote-btn');
  if(qnBtn) {
    qnBtn.onclick = function(){
      var note = prompt(LANG==='ar'?'إضافة ملاحظة للوحدة:':'Add note to unit:', _u.notes||'');
      if(note === null) return; // cancelled
      sb.from('units').update({notes: note||null}).eq('id',_u.id).then(function(res){
        if(res.error){ toast('خطأ: '+res.error.message,'err'); return; }
        _u.notes = note||null;
        toast(LANG==='ar'?'تم حفظ الملاحظة ✓':'Note saved ✓','ok');
        // Update displayed note in drawer
        var noteEl = document.getElementById('drawer-note-display');
        if(noteEl) {
          if(note) {
            noteEl.style.display='block';
            noteEl.innerHTML = '<div style="margin-top:8px;background:var(--amber)15;border:1px solid var(--amber)33;border-radius:10px;padding:9px 12px;border-right:3px solid var(--amber)">'
              +'<div style="font-size:.6rem;color:var(--amber);font-weight:700;margin-bottom:3px">📝 ملاحظات</div>'
              +'<div style="font-size:.78rem">'+escapeHtml(note)+'</div>'
              +'</div>';
          } else {
            noteEl.style.display='none';
          }
        }
        // Update MO cache
        var mo = (window.MO||[]).find(function(u){return u.id===_u.id;});
        if(mo) mo.notes = note||null;
      });
    };
  }

  // Wire deposit register button (avoids iOS text-select issue)
  var qrdBtn = document.getElementById('btn-quick-dep');
  if(qrdBtn && window._qrd) {
    qrdBtn.addEventListener('touchend', function(e){
      e.preventDefault();
      var d = window._qrd;
      quickRegisterDeposit(d.apt, d.room, d.amt, d.name);
    }, {passive:false});
    qrdBtn.addEventListener('click', function(e){
      var d = window._qrd;
      quickRegisterDeposit(d.apt, d.room, d.amt, d.name);
    });
  }
  // Inject profile + timeline buttons
  var _aptLabel = (LANG==='ar'?'شقة':'Apt')+' '+_u.apartment+' — '+_u.room;
  if(window.injectProfileButtons) setTimeout(function(){ window.injectProfileButtons(_u.id, _aptLabel); }, 10);
  document.getElementById('drawer-contract-btn').onclick = function(){ openWelcomeFromUnit(_u); };
  var markBtn = document.getElementById('drawer-mark-depart-btn');
  if(markBtn){ markBtn.onclick = async function(){
    if(scheduledDepart){ toast(t('alreadyMarkedDepart'),'err'); return; }
    if(!confirm(LANG==='ar'?'تسجيل هذه الوحدة كمغادرة آخر الشهر؟':'Mark this unit as leaving at month end?')) return;
    await window.quickMarkDepartureFromUnit(_u);
    closeDrawer();
    setTimeout(function(){ openDrawer(_u.id); }, 150);
  }; }

  // Re-attach overlay listener each time (safe)
  var _ov = document.getElementById('drawerOverlay');
  _ov.onclick = closeDrawer;
  var _ov2=document.getElementById('drawerOverlay'); _ov2.classList.add('open'); _ov2.style.display='';
  var _dr2=document.getElementById('drawer'); _dr2.classList.add('open'); _dr2.style.display='';
  document.body.style.overflow='hidden';

  } catch(e){ toast('خطأ: '+e.message,'err'); document.body.style.overflow=''; }
}

function drTouchStart(e){ _drStartY=e.touches[0].clientY; _drDy=0; }

function drTouchMove(e){
  _drDy = e.touches[0].clientY - _drStartY;
  if(_drDy>0){ document.getElementById('drawer').style.transform='translateY('+_drDy+'px)'; }
}

function drTouchEnd(e){
  document.getElementById('drawer').style.transform='';
  if(_drDy>80) closeDrawer();
  _drDy=0;
}

function closeDrawer() {
  var ov = document.getElementById('drawerOverlay');
  var dr = document.getElementById('drawer');
  if(ov) { ov.classList.remove('open'); ov.style.display=''; }
  if(dr) { dr.classList.remove('open'); dr.style.display=''; }
  document.body.style.overflow = '';
  MO = [];
}

async function editUnit(unitId) {
  try {
  var unit = MO.find(u=>u.id===unitId);
    if(!unit) {
      var { data } = await sb.from('units').select('*').eq('id',unitId).single();
      unit = data;
    }
    if(!unit) { toast(LANG==='ar'?'لم يتم العثور على الوحدة':'Unit not found','err'); return; }
    goPanel('unit');
    document.getElementById('u-apt').value   = unit.apartment||'';
    document.getElementById('u-room').value  = unit.room||'';
    document.getElementById('u-rent').value  = unit.monthly_rent||'';
    document.getElementById('u-rent1').value = unit.rent1||'';
    document.getElementById('u-rent2').value = unit.rent2||'';
    document.getElementById('u-dep').value   = unit.deposit||'';
    document.getElementById('u-start').value = unit.start_date||'';
    document.getElementById('u-name').value  = unit.tenant_name||'';
    document.getElementById('u-phone').value = unit.phone||'';
    document.getElementById('u-name2').value = unit.tenant_name2||'';
    document.getElementById('u-phone2').value= unit.phone2||'';
    document.getElementById('u-cnt').value   = unit.persons_count||1;
    document.getElementById('u-lang').value  = unit.language||'ar';
    document.getElementById('u-win').value   = unit.window_status||'';
    var statusEl = document.getElementById('u-status');
    if(statusEl) statusEl.value = unit.unit_status||'occupied';
    var buildEl = document.getElementById('u-building');
    if(buildEl) buildEl.value = unit.building_name||'';
    document.getElementById('u-notes').value = unit.notes||'';
    var vac=document.getElementById('u-vacant'); if(vac){ vac.checked = !!unit.is_vacant; toggleVacantMode(vac); }
    var pr=document.getElementById('total-rent-preview');
    if(pr) pr.textContent=(unit.monthly_rent||0)+' AED';
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('editUnit:', e); }
}

function confirmDel(id, apt, room) {
  if(!confirm((LANG==='ar'?'حذف شقة':'Delete unit')+` ${apt}-${room}?`)) return;
  deleteUnit(id);
}

async function deleteUnit(id) {
  try {
  closeDrawer();
    var { error } = await sb.from('units').delete().eq('id',id);
    if(error){ toast('خطأ: '+error.message,'err'); return; }
    toast(LANG==='ar'?'تم الحذف ✓':'Deleted ✓','ok');
    MO = MO.filter(u=>u.id!==id);
    loadUnits();
    loadHome(null,true);
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('deleteUnit:', e); }
}

async function saveUnit(btn) {
  if(MY_ROLE==='viewer'){toast(LANG==='ar'?'ليس لديك صلاحية':'No permission','err');return;}
  var apt  = document.getElementById('u-apt').value.trim();
  var room = document.getElementById('u-room').value.trim();
  var rent1 = Number(document.getElementById('u-rent1').value||0);
  var rent2 = Number(document.getElementById('u-rent2').value||0);
  var rent  = Number(document.getElementById('u-rent').value||0) || (rent1+rent2) || rent1;
  if(!rent && (rent1||rent2)) rent = rent1+rent2;
  var isVacant = !!(document.getElementById('u-vacant') && document.getElementById('u-vacant').checked);
  if(!apt||!room||(!isVacant && !rent)){toast(LANG==='ar'?'الشقة والغرفة والإيجار إلزامية':'Apartment, room and rent are required','err');return;}

  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var name2  = document.getElementById('u-name2').value.trim()||null;
    var phone2 = document.getElementById('u-phone2').value.trim()||null;
    // RULE: saveUnit only writes to 'units' table
    // NEVER inserts into deposits or rent_payments
    // units.deposit = reference only (not financial record)
    var payload = {
      monthly_rent:  isVacant ? (rent||0) : rent,
      deposit:       isVacant ? 0 : Number(document.getElementById('u-dep').value||0),
      start_date:    isVacant ? null : (document.getElementById('u-start').value||null),
      tenant_name:   isVacant ? null : (document.getElementById('u-name').value.trim()||null),
      phone:         isVacant ? null : (document.getElementById('u-phone').value.trim()||null),
      tenant_name2:  isVacant ? null : name2,
      phone2:        isVacant ? null : phone2,
      rent1:         isVacant ? null : (rent1||null),
      rent2:         isVacant ? null : (rent2||null),
      persons_count: isVacant ? 0 : Number(document.getElementById('u-cnt').value||1),
      language:      isVacant ? null : document.getElementById('u-lang').value,
      window_status: isVacant ? null : (document.getElementById('u-win').value.trim()||null),
      notes:         document.getElementById('u-notes').value.trim()||null,
      is_vacant:     isVacant,
      unit_status:   isVacant ? 'available' : (document.getElementById('u-status')?(document.getElementById('u-status').value||'occupied'):'occupied'),
      building_name: (document.getElementById('u-building')&&document.getElementById('u-building').value.trim())||null,
    };

    var { data: existing } = await sb.from('units').select('id').eq('apartment',apt).eq('room',room).single();

    if(existing) {
      var { error } = await sb.from('units').update(payload).eq('id',existing.id);
      if(error) throw error;
    } else {
      var { error } = await sb.from('units').insert({apartment:apt,room:room,...payload});
      if(error) throw error;
    }

    // Upload images if any (deposit is NOT auto-saved here — use Operations tab)
    var { data: savedUnit2 } = await sb.from('units').select('id').eq('apartment',apt).eq('room',room).single();
    if(savedUnit2 && _unitImgFiles && _unitImgFiles.length > 0) {
      await uploadUnitImages(savedUnit2.id);
      _unitImgFiles = [];
      var prev = document.getElementById('unit-imgs-preview');
      if(prev) prev.innerHTML = '';
    }
    toast(isVacant ? (LANG==='ar'?'تم حفظ الوحدة كشاغرة ✓':'Vacant unit saved ✓') : (LANG==='ar'?'تم حفظ الوحدة ✓':'Unit saved ✓'),'ok');
    clearUnit();
    await loadHome(null,true);
  } catch(e){
    toast((LANG==='ar'?'خطأ: ':'Error: ')+(e.message||JSON.stringify(e)),'err');
  } finally{ btn.disabled=false; btn.innerHTML=orig; }
}

function clearUnit() {
  ['u-apt','u-room','u-rent','u-rent1','u-rent2','u-dep','u-start',
   'u-name','u-phone','u-name2','u-phone2','u-notes','u-win','u-building'].forEach(id=>{
    var el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('u-cnt').value='1';
  document.getElementById('u-lang').value='ar';
  var vac=document.getElementById('u-vacant'); if(vac){ vac.checked=false; toggleVacantMode(vac); }
  var pr=document.getElementById('total-rent-preview'); if(pr) pr.textContent='0 AED';
}


function toggleVacantMode(source) {
  var chk = document.getElementById('u-vacant');
  if(!chk) return;

  var isVacant = typeof source === 'boolean' ? source : !!chk.checked;
  chk.checked = isVacant;

  var disableIds = ['u-name','u-phone','u-name2','u-phone2','u-dep','u-start','u-cnt','u-lang','u-win'];
  disableIds.forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.disabled = isVacant;
    if(isVacant){
      if(el.tagName === 'SELECT'){
        if(id === 'u-lang') el.value = 'ar';
        else el.selectedIndex = 0;
      } else if(id === 'u-cnt') {
        el.value = '0';
      } else {
        el.value = '';
      }
    } else if(id === 'u-cnt' && !el.value) {
      el.value = '1';
    }
  });

  var rent = document.getElementById('u-rent');
  var rent1 = document.getElementById('u-rent1');
  var rent2 = document.getElementById('u-rent2');
  [rent, rent1, rent2].forEach(function(el){ if(el) el.required = !isVacant; });
  if(isVacant){
    if(rent1) rent1.value='';
    if(rent2) rent2.value='';
    var preview = document.getElementById('total-rent-preview');
    if(preview) preview.textContent = '0 AED';
  }

  var note = document.getElementById('u-notes');
  if(note && isVacant && !note.value){
    note.value = LANG==='ar' ? 'الوحدة شاغرة' : 'Unit is vacant';
  }
}

function calcTotalRent() {
  var r1=Number(document.getElementById('u-rent1').value||0);
  var r2=Number(document.getElementById('u-rent2').value||0);
  var total=r1+r2;
  var pr=document.getElementById('total-rent-preview'); if(pr) pr.textContent=total+' AED';
  // Auto-fill main rent field
  if(total>0) document.getElementById('u-rent').value=total;
}

function openWelcomeFromUnit(unit) {
  closeDrawer();
  // Fill welcome form from unit data
  setTimeout(function() {
    goPanel('moves');
    setTimeout(function() {
      // Switch to welcome tab
      var welcomeTab = document.querySelector('[onclick*="tWelcome"]');
      if(welcomeTab) welcomeTab.click();
      setTimeout(function() {
        var el = function(id){ return document.getElementById(id); };
        if(el('wl-name'))     el('wl-name').value     = unit.tenant_name || '';
        if(el('wl-room'))     el('wl-room').value     = unit.room || '';
        if(el('wl-apt'))      el('wl-apt').value      = unit.apartment || '';
        if(el('wl-rent'))     el('wl-rent').value     = unit.monthly_rent || '';
        if(el('wl-dep'))      el('wl-dep').value      = unit.deposit || '';
        if(el('wl-persons'))  el('wl-persons').value  = unit.persons_count || '1';
        if(el('wl-phone'))    el('wl-phone').value    = (unit.phone || '').replace(/\D/g,'');
        if(el('wl-start') && unit.start_date) el('wl-start').value = unit.start_date.slice(0,10);
      }, 200);
    }, 100);
  }, 300);
}


// Quick pay from unit card
function quickPayUnit(apt, room, rent) {
  goPanel('pay');
  setTimeout(function(){
    var ae = document.getElementById('r-apt');
    var re = document.getElementById('r-room');
    if(ae) ae.value = apt;
    if(re) re.value = room;
    if(window.autoFillRent) autoFillRent();
    // Tab switch to rent
    var rentTab = document.querySelector('[data-tab-target="tRent"]');
    if(rentTab && window.switchTab) switchTab('tRent', rentTab);
  }, 200);
}
window.quickPayUnit = quickPayUnit;

// Image viewer overlay
function openImgViewer(src) {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  ov.innerHTML = '<img src="'+src+'" style="max-width:96vw;max-height:92vh;object-fit:contain;border-radius:12px">'
    +'<button onclick="this.parentElement.remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.2);border:none;border-radius:50%;width:36px;height:36px;color:#fff;font-size:1.1rem;cursor:pointer">✕</button>';
  ov.onclick = function(e){ if(e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}
window.openImgViewer = openImgViewer;

window.loadHome=loadHome; window.loadUnits=loadUnits; window.renderUnits=renderUnits; window.setFilter=setFilter; window.filterUnits=filterUnits; window.openDrawer=openDrawer; window.drTouchStart=drTouchStart; window.drTouchMove=drTouchMove; window.drTouchEnd=drTouchEnd; window.closeDrawer=closeDrawer; window.editUnit=editUnit; window.confirmDel=confirmDel; window.deleteUnit=deleteUnit; window.saveUnit=saveUnit; window.clearUnit=clearUnit; window.calcTotalRent=calcTotalRent; window.openWelcomeFromUnit=openWelcomeFromUnit;
window.toggleVacantMode = toggleVacantMode;
