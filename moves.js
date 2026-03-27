
// ══ MOVES ══


// ══════════════════════════════════════════════════════════
// MOVES — Enhanced UI for departures and arrivals
// ══════════════════════════════════════════════════════════

async function fetchOccupiedUnits(){
  try {
  var r = await sb.from('units')
      .select('id,apartment,room,tenant_name,tenant_name2,phone,phone2,persons_count,monthly_rent,rent1,rent2,deposit,start_date')
      .eq('is_vacant',false).order('apartment').order('room');
    if(r.error) throw r.error;
    return r.data || [];
  } catch(e) { throw e; }
}

async function fetchDepartures(){
  try {
  var r = await sb.from('moves').select('*').eq('type','depart')
      .order('created_at',{ascending:false});
    if(r.error) throw r.error;
    return r.data || [];
  } catch(e) { throw e; }
}

function esc(v){ return window.escapeHtml ? window.escapeHtml(v) : String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildMoveOption(it){
  var label = (LANG==='ar'?'شقة ':'Apt ') + (it.apartment||it.apt||'') + ' - ' + (LANG==='ar'?'غرفة ':'Room ') + (it.room||'') + (it.tenant_name?' — '+it.tenant_name:'');
  return '<option value="'+ esc(it.id||'') +'" data-name="'+ esc(it.tenant_name||'') +'" data-phone="'+ esc(it.phone||'') +'" data-apt="'+ esc(it.apartment||it.apt||'') +'" data-room="'+ esc(it.room||'') +'" data-persons="'+ esc(it.persons_count||1) +'" data-rent="'+ esc(it.monthly_rent||0) +'" data-deposit="'+ esc(it.deposit||0) +'">' + esc(label) + '</option>';
}

function getSelectedMoveData(sel){
  if(!sel || !sel.value) return null;
  var opt = sel.options[sel.selectedIndex];
  if(!opt) return null;
  return {
    id: sel.value,
    name: opt.dataset.name||'',
    phone: opt.dataset.phone||'',
    apartment: opt.dataset.apt||'',
    room: opt.dataset.room||'',
    persons_count: parseInt(opt.dataset.persons)||1,
    monthly_rent: parseFloat(opt.dataset.rent)||0,
    deposit: parseFloat(opt.dataset.deposit)||0,
  };
}

function setMoveFormValues(d){
  var set = function(id,val){ var el=document.getElementById(id); if(el&&val!==undefined&&val!=='') el.value=val; };
  if(!d) return;
  set('me-name',   d.name);
  set('me-phone',  d.phone);
  set('me-apt',    d.apartment);
  set('me-room',   d.room);
  set('me-persons',d.persons_count||1);
  set('me-rent',   d.monthly_rent||d.rent||0);
  set('me-deposit',d.deposit||0);
}

// ── DEPARTURES: Full redesign ──
async function addDepartureModal(){
  var units = [];
  try { units = await fetchOccupiedUnits(); } catch(e){}

  var overlay = document.createElement('div');
  overlay.id = 'move-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:400;display:flex;align-items:flex-end;justify-content:center';

  overlay.innerHTML = `
  <div style="background:var(--surf);border-radius:20px 20px 0 0;padding:0;width:100%;max-width:520px;max-height:88vh;overflow-y:auto">
    <div style="position:sticky;top:0;background:var(--surf);padding:18px 20px 0;border-radius:20px 20px 0 0;z-index:2">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-weight:800;font-size:1rem">📤 ${LANG==='ar'?'تسجيل مغادرة':'Register Departure'}</div>
        <button onclick="document.getElementById('move-modal').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <!-- Search -->
      <input id="me-unit-search" class="inp" placeholder="${LANG==='ar'?'ابحث باسم المستأجر أو الشقة...':'Search tenant or apartment...'}" autocomplete="off" style="margin-bottom:8px">
    </div>

    <div style="padding:0 20px 24px">
      <!-- Unit selector cards -->
      <div id="me-unit-cards" style="display:grid;gap:6px;margin-bottom:14px;max-height:200px;overflow-y:auto"></div>
      <input type="hidden" id="me-selected-unit-id">

      <!-- Selected unit info card -->
      <div id="me-selected-card" style="display:none;background:var(--surf2);border:1.5px solid var(--accent);border-radius:12px;padding:12px;margin-bottom:14px">
        <div style="font-size:.72rem;color:var(--accent);font-weight:700;margin-bottom:6px">✅ ${LANG==='ar'?'الوحدة المختارة':'Selected Unit'}</div>
        <div id="me-selected-info" style="font-size:.85rem;font-weight:600"></div>
      </div>

      <!-- Tenant info (auto-filled, editable) -->
      <div style="background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="font-size:.72rem;color:var(--muted);font-weight:700;margin-bottom:8px">👤 ${LANG==='ar'?'بيانات المغادر':'Tenant Info'}</div>
        <div class="fld" style="margin-bottom:8px"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الاسم':'Name'}</label><input id="me-name" class="inp" placeholder="${LANG==='ar'?'الاسم':'Name'}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="fld"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الشقة':'Apt'}</label><input id="me-apt" class="inp" type="number" placeholder="101"></div>
          <div class="fld"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الغرفة':'Room'}</label><input id="me-room" class="inp" type="number" placeholder="1"></div>
        </div>
      </div>

      <!-- Departure details -->
      <div style="background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="font-size:.72rem;color:var(--muted);font-weight:700;margin-bottom:8px">📅 ${LANG==='ar'?'تفاصيل المغادرة':'Departure Details'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div class="fld"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'تاريخ المغادرة':'Departure Date'}</label><input id="me-date" class="inp" type="date"></div>
          <div class="fld"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'واتساب':'WhatsApp'}</label><input id="me-phone" class="inp" type="tel" placeholder="971501234567" inputmode="numeric"></div>
        </div>
        <div class="fld"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'ملاحظات':'Notes'}</label><input id="me-notes" class="inp" placeholder="..."></div>
      </div>

      <div style="display:flex;gap:8px">
        <button onclick="saveMoveEntry('depart',this)" class="btn bp" style="flex:2">📤 ${LANG==='ar'?'تسجيل المغادرة':'Save Departure'}</button>
        <button onclick="document.getElementById('move-modal').remove()" style="flex:1;padding:12px;background:var(--surf2);border:1px solid var(--border);border-radius:12px;color:var(--text);font-family:inherit;cursor:pointer">${LANG==='ar'?'إلغاء':'Cancel'}</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });

  // Set default date to last day of current month
  var now = new Date();
  var lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0);
  var dateEl = document.getElementById('me-date');
  if(dateEl) dateEl.value = lastDay.toISOString().split('T')[0];

  // Render unit cards
  renderUnitCards(units, '');

  // Search
  var searchEl = document.getElementById('me-unit-search');
  if(searchEl) {
    searchEl.addEventListener('input', function(){
      renderUnitCards(units, this.value);
    });
  }

  function renderUnitCards(list, q){
    var container = document.getElementById('me-unit-cards');
    if(!container) return;
    var filtered = q ? list.filter(function(u){
      var txt = [u.apartment,u.room,u.tenant_name,u.phone].join(' ').toLowerCase();
      return txt.indexOf(q.toLowerCase()) !== -1;
    }) : list;

    if(!filtered.length){
      container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:.8rem">'+(q ? (LANG==='ar'?'لا نتائج':'No results') : (LANG==='ar'?'لا توجد وحدات مشغولة':'No occupied units'))+'</div>';
      return;
    }
    container.innerHTML = filtered.map(function(u){
      return '<div class="unit-pick-card" data-id="'+esc(u.id)+'" data-name="'+esc(u.tenant_name||'')+'" data-phone="'+esc(u.phone||'')+'" data-apt="'+esc(u.apartment)+'" data-room="'+esc(u.room)+'" data-persons="'+esc(u.persons_count||1)+'" data-rent="'+esc(u.monthly_rent||0)+'" onclick="selectMoveUnit(this)" style="background:var(--surf);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'
        +'<div>'
        +'<div style="font-weight:700;font-size:.85rem">'+esc(LANG==='ar'?'شقة ':'Apt ')+esc(u.apartment)+' — '+esc(LANG==='ar'?'غرفة ':'Room ')+esc(u.room)+'</div>'
        +'<div style="font-size:.72rem;color:var(--muted);margin-top:2px">'+esc(u.tenant_name||'—')+(u.tenant_name2?' & '+esc(u.tenant_name2):'')+'</div>'
        +'</div>'
        +'<div style="font-size:.75rem;color:var(--accent);font-weight:700">'+esc(u.monthly_rent||0)+' AED</div>'
        +'</div>';
    }).join('');
  }
}

window.selectMoveUnit = function(card){
  // Highlight selected card
  document.querySelectorAll('.unit-pick-card').forEach(function(c){
    c.style.borderColor = 'var(--border)';
    c.style.background = 'var(--surf)';
  });
  card.style.borderColor = 'var(--accent)';
  card.style.background = 'rgba(79,142,247,.1)';

  var d = card.dataset;
  document.getElementById('me-selected-unit-id').value = d.id||'';
  document.getElementById('me-name').value = d.name||'';
  document.getElementById('me-apt').value = d.apt||'';
  document.getElementById('me-room').value = d.room||'';
  document.getElementById('me-phone').value = d.phone||'';

  var infoEl = document.getElementById('me-selected-info');
  if(infoEl) infoEl.innerHTML = (LANG==='ar'?'شقة ':'Apt ')+esc(d.apt)+' — '+(LANG==='ar'?'غرفة ':'Room ')+esc(d.room)+'<br><span style="color:var(--muted);font-size:.75rem">'+esc(d.name||'—')+'</span>';
  var cardEl = document.getElementById('me-selected-card');
  if(cardEl) cardEl.style.display = 'block';
};

// ── ARRIVALS: Full redesign with unit update ──
async function addArrivalModal(){
  var units = [];
  var deps  = [];
  try { units = await fetchOccupiedUnits(); } catch(e){}
  // Also fetch vacant units for arrivals
  var vacantUnits = [];
  try {
    var r = await sb.from('units').select('id,apartment,room,monthly_rent,deposit').eq('is_vacant',true).order('apartment').order('room');
    if(!r.error) vacantUnits = r.data||[];
  } catch(e){}
  try { deps = await fetchDepartures(); } catch(e){}

  // Combine: departures + vacant units as targets
  var targets = vacantUnits.map(function(u){ return {...u, _type:'vacant'}; })
    .concat(deps.map(function(m){ return {id:m.id, apartment:m.apartment, room:m.room, tenant_name:m.tenant_name, phone:m.phone, monthly_rent:0, deposit:0, _type:'depart', _moveId:m.id}; }));

  var overlay = document.createElement('div');
  overlay.id = 'move-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:400;display:flex;align-items:flex-end;justify-content:center';

  overlay.innerHTML = `
  <div style="background:var(--surf);border-radius:20px 20px 0 0;padding:0;width:100%;max-width:520px;max-height:88vh;overflow-y:auto">
    <div style="position:sticky;top:0;background:var(--surf);padding:18px 20px 0;border-radius:20px 20px 0 0;z-index:2">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-weight:800;font-size:1rem">📥 ${LANG==='ar'?'تسجيل حجز جديد':'Register New Booking'}</div>
        <button onclick="document.getElementById('move-modal').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <input id="me-target-search" class="inp" placeholder="${LANG==='ar'?'ابحث بالشقة أو الغرفة...':'Search apartment or room...'}" autocomplete="off" style="margin-bottom:8px">
    </div>

    <div style="padding:0 20px 24px">
      <!-- Step 1: Pick unit/departure slot -->
      <div style="font-size:.72rem;color:var(--muted);font-weight:700;margin-bottom:8px">🏠 ${LANG==='ar'?'اختر البارتشن (فاضي أو مغادر)':'Choose partition (vacant or departing)'}</div>
      <div id="me-target-cards" style="display:grid;gap:6px;margin-bottom:14px;max-height:180px;overflow-y:auto"></div>
      <input type="hidden" id="me-selected-unit-id">
      <input type="hidden" id="me-selected-depart-id">

      <!-- Selected slot info -->
      <div id="me-selected-card" style="display:none;background:var(--surf2);border:1.5px solid var(--green);border-radius:12px;padding:12px;margin-bottom:14px">
        <div style="font-size:.72rem;color:var(--green);font-weight:700;margin-bottom:6px">✅ ${LANG==='ar'?'البارتشن المختار':'Selected Partition'}</div>
        <div id="me-selected-info" style="font-size:.85rem;font-weight:600"></div>
      </div>

      <!-- New tenant info -->
      <div style="background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="font-size:.72rem;color:var(--muted);font-weight:700;margin-bottom:8px">👤 ${LANG==='ar'?'بيانات المستأجر الجديد':'New Tenant Info'}</div>
        <div class="fld" style="margin-bottom:8px"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الاسم':'Name'} *</label><input id="me-name" class="inp" placeholder="${LANG==='ar'?'اسم المستأجر الجديد':'New tenant name'}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الشقة':'Apt'}</label><input id="me-apt" class="inp" type="number" placeholder="101" readonly style="opacity:.7"></div>
          <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الغرفة':'Room'}</label><input id="me-room" class="inp" type="number" placeholder="1" readonly style="opacity:.7"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'واتساب':'WhatsApp'}</label><input id="me-phone" class="inp" type="tel" placeholder="971501234567" inputmode="numeric"></div>
          <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'عدد أشخاص':'Persons'}</label><input id="me-persons" class="inp" type="number" value="1" min="1"></div>
        </div>
      </div>

      <!-- Financial info -->
      <div style="background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="font-size:.72rem;color:var(--muted);font-weight:700;margin-bottom:8px">💰 ${LANG==='ar'?'البيانات المالية':'Financial Info'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'الإيجار (AED)':'Rent (AED)'}</label><input id="me-rent" class="inp" type="number" placeholder="0" inputmode="numeric"></div>
          <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'التأمين (AED)':'Deposit (AED)'}</label><input id="me-deposit" class="inp" type="number" placeholder="0" inputmode="numeric"></div>
        </div>
        <div><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'تاريخ البدء':'Start Date'}</label><input id="me-date" class="inp" type="date"></div>
      </div>

      <!-- Update unit checkbox -->
      <div style="background:rgba(52,200,122,.1);border:1.5px solid var(--green);border-radius:12px;padding:12px;margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" id="me-update-unit" style="width:18px;height:18px" checked>
          <div>
            <div style="font-weight:700;font-size:.85rem">${LANG==='ar'?'تحديث بيانات الوحدة تلقائياً':'Auto-update unit data'}</div>
            <div style="font-size:.7rem;color:var(--muted);margin-top:2px">${LANG==='ar'?'سيتم حفظ بيانات المستأجر الجديد في الوحدة واسم القديم في السجل':'New tenant saved to unit, old data archived'}</div>
          </div>
        </label>
      </div>

      <div class="fld" style="margin-bottom:14px"><label style="font-size:.75rem;color:var(--muted)">${LANG==='ar'?'ملاحظات':'Notes'}</label><input id="me-notes" class="inp" placeholder="..."></div>

      <div style="display:flex;gap:8px">
        <button onclick="saveArrivalEntry(this)" class="btn bp" style="flex:2;background:var(--green)">📥 ${LANG==='ar'?'تسجيل الحجز':'Save Booking'}</button>
        <button onclick="document.getElementById('move-modal').remove()" style="flex:1;padding:12px;background:var(--surf2);border:1px solid var(--border);border-radius:12px;color:var(--text);font-family:inherit;cursor:pointer">${LANG==='ar'?'إلغاء':'Cancel'}</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });

  // Default date = 1st of next month
  var now = new Date();
  var first = new Date(now.getFullYear(), now.getMonth()+1, 1);
  var dateEl = document.getElementById('me-date');
  if(dateEl) dateEl.value = first.toISOString().split('T')[0];

  // Render target cards
  renderTargetCards(targets, '');
  var searchEl = document.getElementById('me-target-search');
  if(searchEl) searchEl.addEventListener('input', function(){ renderTargetCards(targets, this.value); });

  function renderTargetCards(list, q){
    var container = document.getElementById('me-target-cards');
    if(!container) return;
    var filtered = q ? list.filter(function(t){
      return ([t.apartment,t.room,t.tenant_name||''].join(' ').toLowerCase()).indexOf(q.toLowerCase()) !== -1;
    }) : list;
    if(!filtered.length){
      container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:.8rem">'+(LANG==='ar'?'لا توجد بارتشنات متاحة':'No available partitions')+'</div>';
      return;
    }
    container.innerHTML = filtered.map(function(t){
      var isVacant = t._type==='vacant';
      var badge = isVacant
        ? '<span style="background:rgba(90,100,128,.2);color:var(--muted);border-radius:6px;padding:2px 8px;font-size:.65rem">'+(LANG==='ar'?'شاغرة':'Vacant')+'</span>'
        : '<span style="background:rgba(242,92,92,.15);color:var(--red);border-radius:6px;padding:2px 8px;font-size:.65rem">📤 '+(LANG==='ar'?'مغادر':'Departing')+'</span>';
      return '<div class="target-pick-card" onclick="selectArrivalTarget(this)" data-id="'+esc(t.id)+'" data-apt="'+esc(t.apartment)+'" data-room="'+esc(t.room)+'" data-rent="'+esc(t.monthly_rent||0)+'" data-deposit="'+esc(t.deposit||0)+'" data-type="'+esc(t._type||'')+'" data-moveid="'+esc(t._moveId||'')+'" style="background:var(--surf);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">'
        +'<div>'
        +'<div style="font-weight:700;font-size:.85rem">'+(LANG==='ar'?'شقة ':'Apt ')+esc(t.apartment)+' — '+(LANG==='ar'?'غرفة ':'Room ')+esc(t.room)+'</div>'
        +(t.tenant_name?'<div style="font-size:.7rem;color:var(--muted)">'+esc(t.tenant_name)+'</div>':'')
        +'</div>'
        +'<div style="text-align:end">'
        + badge
        +(t.monthly_rent?'<div style="font-size:.72rem;color:var(--accent);margin-top:4px">'+esc(t.monthly_rent)+' AED</div>':'')
        +'</div>'
        +'</div>';
    }).join('');
  }
}

window.selectArrivalTarget = function(card){
  document.querySelectorAll('.target-pick-card').forEach(function(c){
    c.style.borderColor='var(--border)'; c.style.background='var(--surf)';
  });
  card.style.borderColor = 'var(--green)';
  card.style.background = 'rgba(52,200,122,.08)';
  var d = card.dataset;
  document.getElementById('me-selected-unit-id').value = d.type==='vacant' ? d.id : '';
  document.getElementById('me-selected-depart-id').value = d.moveid||'';
  document.getElementById('me-apt').value = d.apt||'';
  document.getElementById('me-room').value = d.room||'';
  if(!document.getElementById('me-rent').value) document.getElementById('me-rent').value = d.rent||'';
  if(!document.getElementById('me-deposit').value) document.getElementById('me-deposit').value = d.deposit||'';
  var infoEl = document.getElementById('me-selected-info');
  if(infoEl) infoEl.innerHTML = (LANG==='ar'?'شقة ':'Apt ')+esc(d.apt)+' — '+(LANG==='ar'?'غرفة ':'Room ')+esc(d.room);
  var cardEl = document.getElementById('me-selected-card');
  if(cardEl) cardEl.style.display='block';
};

// Override addMoveEntry to route to specialized modals
function addMoveEntry(type){
  if(type==='depart') addDepartureModal();
  else addArrivalModal();
}

// ── SAVE ARRIVAL: Updates unit + archives old data ──
async function saveArrivalEntry(btn){
  var name    = (document.getElementById('me-name')||{}).value||'';
  var apt     = (document.getElementById('me-apt')||{}).value||'';
  var room    = (document.getElementById('me-room')||{}).value||'';
  var phone   = (document.getElementById('me-phone')||{}).value||'';
  var persons = parseInt((document.getElementById('me-persons')||{}).value)||1;
  var rent    = parseFloat((document.getElementById('me-rent')||{}).value)||0;
  var deposit = parseFloat((document.getElementById('me-deposit')||{}).value)||0;
  var date    = (document.getElementById('me-date')||{}).value||'';
  var notes   = (document.getElementById('me-notes')||{}).value||'';
  var unitId  = (document.getElementById('me-selected-unit-id')||{}).value||'';
  var departId= (document.getElementById('me-selected-depart-id')||{}).value||'';
  var doUpdate= document.getElementById('me-update-unit') && document.getElementById('me-update-unit').checked;

  if(!name) { toast(LANG==='ar'?'يرجى إدخال اسم المستأجر':'Please enter tenant name','err'); return; }
  if(!apt || !room) { toast(LANG==='ar'?'يرجى تحديد الشقة والغرفة':'Please select apartment and room','err'); return; }

  var orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try {
    // If no unitId, find it
    if(!unitId) {
      var r2 = await sb.from('units').select('id,tenant_name,tenant_name2,phone,phone2,monthly_rent,rent1,rent2,deposit,persons_count,start_date,notes').eq('apartment',parseInt(apt)).eq('room',parseInt(room)).maybeSingle();
      if(r2.data) unitId = r2.data.id;
    }

    // 1. Archive old tenant data to unit_history
    if(unitId && doUpdate) {
      var rUnit = await sb.from('units').select('*').eq('id',unitId).maybeSingle();
      if(rUnit.data) {
        var old = rUnit.data;
        await sb.from('unit_history').insert({
          unit_id: unitId,
          apartment: old.apartment,
          room: old.room,
          tenant_name: old.tenant_name,
          tenant_name2: old.tenant_name2,
          phone: old.phone,
          phone2: old.phone2,
          monthly_rent: old.monthly_rent,
          rent1: old.rent1,
          rent2: old.rent2,
          deposit: old.deposit,
          persons_count: old.persons_count,
          start_date: old.start_date,
          end_date: date || new Date().toISOString().split('T')[0],
          snapshot_type: 'departure',
          recorded_by: (ME||{}).id || null
        });
      }

      // 2. Update unit with new tenant
      var updatePayload = {
        tenant_name: name,
        tenant_name2: null,
        phone: phone||null,
        phone2: null,
        monthly_rent: rent||old.monthly_rent,
        rent1: rent||0,
        rent2: 0,
        deposit: deposit||0,
        persons_count: persons,
        start_date: date||null,
        is_vacant: false
      };
      await sb.from('units').update(updatePayload).eq('id',unitId);
    }

    // 3. Save move record
    var payload = {
      type: 'arrive',
      unit_id: unitId||null,
      arrival_unit_id: unitId||null,
      linked_depart_id: departId||null,
      tenant_name: name,
      apartment: parseInt(apt),
      room: parseInt(room),
      move_date: date||null,
      notes: notes||null,
      phone: phone||null,
      persons_count: persons,
      new_tenant_name: name,
      new_phone: phone||null,
      new_rent: rent||null,
      new_deposit: deposit||null,
      new_persons: persons,
      new_start_date: date||null,
      status: doUpdate ? 'done' : 'pending',
      created_by: (ME||{}).id||null
    };
    var ins = await sb.from('moves').insert(payload);
    if(ins.error) throw ins.error;

    toast(LANG==='ar'?'تم تسجيل الحجز ✓':'Booking saved ✓','ok');
    var modal = document.getElementById('move-modal');
    if(modal) modal.remove();
    loadMovesList('arrive');
    if(doUpdate) {
      toast(LANG==='ar'?'تم تحديث بيانات الوحدة ✓':'Unit updated ✓','ok');
    }
  } catch(e) {
    toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err');
  } finally {
    btn.disabled=false; btn.innerHTML=orig;
  }
}

// saveMoveEntry for departures only
async function saveMoveEntry(type, btn){
  if(type==='arrive') return saveArrivalEntry(btn);
  var name    = (document.getElementById('me-name')||{}).value||'';
  var apt     = (document.getElementById('me-apt')||{}).value||'';
  var room    = (document.getElementById('me-room')||{}).value||'';
  var date    = (document.getElementById('me-date')||{}).value||'';
  var notes   = (document.getElementById('me-notes')||{}).value||'';
  var phone   = (document.getElementById('me-phone')||{}).value||'';
  var unitId  = (document.getElementById('me-selected-unit-id')||{}).value||'';
  if(!name || !apt || !room) { toast(t('nameRequired'),'err'); return; }
  // Check for duplicate departure
  var { data: existingDep } = await sb.from('moves')
    .select('id')
    .eq('type','depart')
    .eq('apartment', parseInt(apt))
    .eq('room', parseInt(room))
    .eq('status','pending')
    .limit(1);
  if(existingDep && existingDep.length > 0) {
    toast(LANG==='ar'?'⚠️ هذه الوحدة مسجّلة بالفعل في قائمة المغادرين':'⚠️ Unit already in departure list','err');
    return;
  }
  var orig = btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try {
    var payload = {
      type: 'depart',
      unit_id: unitId||null,
      tenant_name: name,
      apartment: parseInt(apt),
      room: parseInt(room),
      move_date: date||null,
      notes: notes||null,
      phone: phone||null,
      status: 'pending',
      created_by: (ME||{}).id||null
    };
    var ins = await sb.from('moves').insert(payload);
    if(ins.error) throw ins.error;
    // Update unit_status to leaving_soon
    if(unitId) {
      await sb.from('units').update({ unit_status: 'leaving_soon' }).eq('id', parseInt(unitId));
    } else {
      await sb.from('units').update({ unit_status: 'leaving_soon' })
        .eq('apartment', String(apt)).eq('room', String(room));
    }
    toast(t('savedDeparture'),'ok');
    var modal = document.getElementById('move-modal');
    if(modal) modal.remove();
    loadMovesList('depart');
  } catch(e){ toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
  finally { btn.disabled=false; btn.innerHTML=orig; }
}


function esc(v){ return window.escapeHtml ? escapeHtml(v==null?'':String(v)) : String(v==null?'':v); }
function fmtDate(date, lang){
  if(!date) return '';
  try { return new Date(date).toLocaleDateString(lang==='ar'?'ar-EG':'en-GB',{day:'numeric',month:'short',year:'numeric'}); }
  catch(e){ return date; }
}


function endOfCurrentMonthISO(){
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split('T')[0];
}
async function hasDepartureForUnit(unitId){
  try {
  if(!unitId) return false;
    var r = await sb.from('moves').select('id').eq('type','depart').eq('unit_id', unitId).limit(1);
    if(r.error) throw r.error;
    return !!((r.data||[])[0]);
  } catch(e) { throw e; }
}




async function quickMarkDepartureFromUnit(unit){
  if(!unit || !unit.id) return;
  try {
    if(await hasDepartureForUnit(unit.id)){ toast(t('alreadyMarkedDepart'),'err'); return; }
    var payload = {
      type:'depart', unit_id: unit.id, tenant_name: unit.tenant_name || '', apartment: parseInt(unit.apartment,10), room: parseInt(unit.room,10),
      move_date: endOfCurrentMonthISO(), phone: unit.phone || null, persons_count: parseInt(unit.persons_count,10)||1,
      notes: LANG==='ar' ? 'مغادر آخر الشهر' : 'Leaving at month end', created_by:(ME||{}).id || null
    };
    var ins = await sb.from('moves').insert(payload);
    if(ins.error) throw ins.error;
    toast(t('markedDepartEndMonth'),'ok');
    if(window.loadMovesList) loadMovesList('depart');
  } catch(e) { toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
}
window.quickMarkDepartureFromUnit = quickMarkDepartureFromUnit;

function getWelcomeData() {
  var name     = document.getElementById('wl-name').value || 'المستأجر';
  var room     = document.getElementById('wl-room').value || '—';
  var apt      = document.getElementById('wl-apt').value  || '—';
  var rent     = document.getElementById('wl-rent').value || '—';
  var dep      = document.getElementById('wl-dep').value  || '0';
  var building = document.getElementById('wl-building').value || 'Arabian Gulf';
  var persons  = document.getElementById('wl-persons') ? document.getElementById('wl-persons').value || '1' : '1';
  var phone    = document.getElementById('wl-phone') ? document.getElementById('wl-phone').value.replace(/\D/g,'') : '';
  var startRaw = document.getElementById('wl-start').value;
  var startEn  = startRaw ? new Date(startRaw).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '1st of the month';
  var startAr  = startRaw ? new Date(startRaw).toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'}) : '1 من الشهر';
  var idNum = document.getElementById('wl-id') ? document.getElementById('wl-id').value || '' : '';
  return {name, room, apt, rent, dep, building, persons, phone, startEn, startAr, idNum};
}

async function loadMovesList(type) {
  var listEl = document.getElementById(type === 'depart' ? 'depart-list' : 'arrive-list');
  if(!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:20px"><span class="spin"></span></div>';
  try {
    var result = await sb.from('moves').select('*').eq('type', type).order('created_at', {ascending: false});
    if(result.error) throw result.error;
    var data = result.data || [];
    data.sort(function(a,b){
      var aptA = parseInt(a.apartment,10) || 0, aptB = parseInt(b.apartment,10) || 0;
      if(aptA !== aptB) return aptA - aptB;
      var roomA = parseInt(a.room,10), roomB = parseInt(b.room,10);
      if(isNaN(roomA) || isNaN(roomB)) return String(a.room||'').localeCompare(String(b.room||''));
      return roomA - roomB;
    });
    if(!data.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem">📭 ' + esc(type==='depart' ? t('noRegisteredDep') : t('noRegisteredArr')) + '</div>';
      return;
    }
    var html = '';
    if(type==='depart') {
      html += '<div style="background:var(--surf);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px">'
        + '<div style="font-size:.78rem;color:var(--muted);margin-bottom:8px">' + esc(LANG==='ar'?'تقرير المغادرين':'Departure report') + '</div>'
        + '<div style="font-size:1rem;font-weight:800;margin-bottom:8px">' + esc(LANG==='ar'?'الترتيب حسب الشقة والغرفة':'Sorted by apartment and room') + '</div>'
        + data.map(function(m){
          return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border)">'
            + '<div style="font-weight:800">' + esc(LANG==='ar'?'شقة ':'Apt ') + esc(m.apartment||'') + ' — ' + esc(LANG==='ar'?'غرفة ':'Room ') + esc(m.room||'') + '</div>'
            + '<div style="font-size:.72rem;color:var(--muted)">' + esc(fmtDate(m.move_date, LANG) || '') + '</div>'
            + '</div>';
        }).join('')
        + '</div>';
    }
    data.forEach(function(m) {
      var dateStr = m.move_date ? fmtDate(m.move_date, LANG) : '';
      var badge = type==='depart'
        ? '<span style="background:var(--red)22;color:var(--red);border-radius:6px;padding:2px 8px;font-size:.7rem">📤 ' + esc(LANG==='ar'?'مغادر':'Departure') + '</span>'
        : '<span style="background:var(--green)22;color:var(--green);border-radius:6px;padding:2px 8px;font-size:.7rem">📥 ' + esc(LANG==='ar'?'حجز جديد':'Booking') + '</span>';
      var title = esc(LANG==='ar'?'شقة ':'Apt ') + esc(m.apartment||'') + ' — ' + esc(LANG==='ar'?'غرفة ':'Room ') + esc(m.room||'');
      html += '<div style="background:var(--surf);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">'
        + '<div style="flex:1">'
        + '<div style="font-weight:900;font-size:1rem;margin-bottom:4px">' + title + '</div>'
        + '<div style="font-size:.78rem;color:var(--muted);margin-bottom:2px">' + esc(m.tenant_name||'—') + '</div>'
        + (dateStr ? '<div style="font-size:.72rem;color:var(--muted);margin-top:2px">📅 ' + esc(dateStr) + '</div>' : '')
        + (m.phone ? '<div style="font-size:.72rem;color:var(--muted);margin-top:2px">📱 ' + esc(m.phone) + '</div>' : '')
        + (m.persons_count && m.persons_count>1 ? '<div style="font-size:.72rem;color:var(--amber);margin-top:2px">👥 ' + esc(m.persons_count) + ' ' + esc(LANG==='ar'?'أشخاص':'persons') + '</div>' : '')
        + (m.notes ? '<div style="font-size:.72rem;color:var(--muted);margin-top:4px;background:var(--surf2);padding:4px 8px;border-radius:6px">📝 ' + esc(m.notes) + '</div>' : '')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">'
        + badge
        + '<button onclick="deleteMoveEntry(\'' + esc(m.id) + '\',\'' + type + '\')" style="background:var(--red)22;border:1px solid var(--red);border-radius:8px;padding:4px 10px;color:var(--red);font-size:.72rem;cursor:pointer">🗑️</button>'
        + '</div></div></div>';
    });
    listEl.innerHTML = html;
  } catch(e) {
    listEl.innerHTML = '<div style="color:var(--red);font-size:.8rem;padding:10px">' + esc((LANG==='ar'?'خطأ: ':'Error: ') + e.message) + '</div>';
  }
}






async function deleteMoveEntry(id, type) {
  if(!confirm(LANG==='ar'?'حذف هذا السجل؟':'Delete this entry?')) return;
  try {
    var result = await sb.from('moves').delete().eq('id', id);
    if(result.error) throw result.error;
    toast(t('deleted'),'ok');
    loadMovesList(type);
  } catch(e) { toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
}

function buildWelcomeLetter(name, room, apt, rent, dep, building, startEn, startAr, persons, idNum) {
  var totalDeposit = Number(dep||0) || 0;
  var received = totalDeposit;
  var personsAr = String(persons) === '1' ? 'فرد واحد فقط' : (persons + ' أفراد فقط');
  var personsEn = String(persons) === '1' ? '1 person only' : (persons + ' persons only');
  var idRow = idNum ? '<tr><td class="ehead">ID / Passport</td><td class="eval">'+ esc(idNum) +'</td><td class="ahead">رقم الهوية / الجواز</td><td class="aval">'+ esc(idNum) +'</td></tr>' : '';
  var rules = [
    ['Booking Deposit','Received <strong>'+received+' AED</strong> as booking/security deposit for Partition <strong>'+esc(room)+'</strong>, Apartment <strong>'+esc(apt)+'</strong>, '+esc(building)+'. Monthly rent: <strong>'+esc(rent)+' AED</strong> for '+personsEn+'.','العربون / التأمين','تم استلام <strong>'+received+' درهم</strong> عربون/تأمين لحجز بارتشن <strong>'+esc(room)+'</strong> شقة <strong>'+esc(apt)+'</strong> '+esc(building)+'. الإيجار الشهري: <strong>'+esc(rent)+' درهم</strong> لـ '+personsAr+'.'],
    ['Cancellation','The paid booking/security amount is <strong>non-refundable</strong> in case of cancellation or non-compliance with the agreed terms.','الإلغاء','العربون/التأمين المدفوع <strong>غير مسترد</strong> في حالة الإلغاء أو عدم الالتزام بالشروط المتفق عليها.'],
    ['Refund Rule','Refundable security deposit is <strong>'+totalDeposit+' AED</strong> if notice is given by the <strong>15th</strong> of the departure month at the latest. After the 15th, full month rent applies.','استرداد التأمين','قيمة التأمين المسترد <strong>'+totalDeposit+' درهم</strong> بشرط الإبلاغ بحد أقصى يوم <strong>15</strong> من شهر المغادرة. بعد يوم 15 يتم احتساب إيجار الشهر كاملًا.'],
    ['Visits','No visits allowed. The place is for the registered tenant only.','الزيارات','ممنوع الزيارات. المكان للمستأجر المسجل فقط.'],
    ['Extended Stay','The stay is considered extended until the tenant notifies departure according to the agreed notice period.','التمديد','تعتبر الإقامة ممتدة حتى يبلغ المستأجر بالمغادرة وفق مدة الإشعار المتفق عليها.'],
    ['Last Month','In the month of departure, the partition may be opened for viewing/booking. If the tenant is absent, it may still be opened.','آخر شهر','في شهر المغادرة يحق فتح البارتشن للمعاينة أو الحجز، وإذا لم يكن الساكن غير موجود يمكن فتحه كذلك.'],
    ['Deposit Timing','Deposit is returned at the end of the month before departure after inspection and with no damages.','موعد استرداد التأمين','يُرد التأمين في آخر الشهر قبل المغادرة بعد المعاينة وتسليم المكان بدون تلفيات.'],
    ['Late Notice','If departure notice is given after the <strong>15th</strong> of the month, the booking/deposit is not returned and the full month rent remains due even if re-booked.','التبليغ المتأخر','إذا تم التبليغ بالمغادرة بعد يوم <strong>15</strong> من الشهر فلا يُسترد العربون/التأمين ويستحق إيجار الشهر كاملًا حتى لو تم حجز البارتشن لشخص آخر.'],
    ['Rent Collection','Rent is collected on the <strong>1st day</strong> of every month only. First month starts upon key handover.','تحصيل الإيجار','يتم تحصيل الإيجار في <strong>اليوم الأول</strong> من كل شهر فقط، وأول شهر يبدأ مع استلام المفتاح.'],
    ['Personal Items','No personal belongings outside the partition or in the building: shoes, bicycle, scooter, boxes, etc.','الأغراض الشخصية','يُمنع وضع أي أغراض شخصية خارج الغرفة أو في المبنى مثل الجزامة أو العجلة أو السكوتر أو الكراتين.'],
    ['Handover','On departure, the partition must be handed over on the last day of the month before <strong>4:00 PM</strong>.','التسليم','عند المغادرة يتم تسليم البارتشن آخر يوم في الشهر قبل الساعة <strong>4:00 مساءً</strong>.'],
    ['Kitchen & Fridge','A dedicated kitchen/fridge place is allocated. <strong>Cleanliness is mandatory at all times.</strong> Do not leave food, dishes, or personal items on the counter; anything left there may be discarded by the cleaner.','المطبخ والثلاجة','يتم تخصيص مكان لك بالمطبخ والثلاجة، و<strong>النظافة إلزامية دائمًا</strong>. يُمنع ترك الطعام أو الأطباق أو أي أغراض شخصية على الرخامة، وأي شيء يُترك عليها قد يتم التخلص منه فورًا من عامل النظافة.'],
    ['Smoking & Fire','Smoking and shisha are prohibited inside the apartment. Please switch off lights and unplug devices when absent. No incense, candles, or any fire source.','التدخين والنار','يمنع التدخين والشيشة داخل الشقة. يرجى إطفاء الأنوار وفصل التوصيلات عند عدم التواجد. يمنع استخدام البخور أو الشمع أو أي مصدر نار.'],
    ['Lock Change','Changing the partition lock by the tenant is prohibited. Any unauthorized change may be broken/removed without liability.','تغيير القفل','يمنع تغيير قفل باب البارتشن من طرف المستأجر، وأي تغيير غير مصرح به قد يتم كسره أو إزالته دون مسؤولية علينا.']
  ];
  var rows = rules.map(function(r){ return '<tr><td class="ehead">'+r[0]+'</td><td class="eval">'+r[1]+'</td><td class="ahead">'+r[2]+'</td><td class="aval">'+r[3]+'</td></tr>'; }).join('');
  return ''
    + '<div class="contract-sheet">'
    + '<style>'
    + '@page{size:A4;margin:7mm;} html,body{margin:0;padding:0;font-family:Arial,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;} .contract-sheet{color:#111;font-size:9.15px;line-height:1.2;padding:4px 6px;page-break-after:avoid;min-height:calc(100vh - 14mm);display:flex;flex-direction:column} .title{font-size:14.5px;font-weight:800;text-align:center;margin-bottom:3px;color:#1a3a6e} .sub{font-size:8.9px;text-align:center;color:#555;margin-bottom:6px} .box{border:1.25px solid #1a3a6e;border-radius:8px;overflow:hidden;margin-bottom:7px;page-break-inside:avoid} table{width:100%;border-collapse:collapse;table-layout:fixed} td{border:1px solid #d6deeb;padding:4px 5px;vertical-align:top;word-wrap:break-word} .ehead,.ahead{background:#f4f7fc;font-weight:700;width:14%} .eval,.aval{width:36%} .ahead,.aval{text-align:right;direction:rtl} .center{text-align:center} .muted{color:#666;font-size:8px} .sig{height:22px} .sign td{padding:8px 10px} strong{font-weight:800}</style>'
    + '<div class="title">BOOKING RECEIPT & HOUSE RULES | إيصال الحجز وشروط السكن</div>'
    + '<div class="sub">Entry date: '+esc(startEn)+' &nbsp;|&nbsp; تاريخ الدخول: '+esc(startAr)+' &nbsp;|&nbsp; Extended until tenant notifies departure / ممتد حتى يبلغ المستأجر بالمغادرة</div>'
    + '<div class="box"><table>'
    + '<tr><td class="ehead">Tenant Name</td><td class="eval">'+esc(name)+'</td><td class="ahead">اسم المستأجر</td><td class="aval">'+esc(name)+'</td></tr>'
    + '<tr><td class="ehead">Partition / Apt</td><td class="eval">Partition '+esc(room)+' — Apt '+esc(apt)+' — '+esc(building)+'</td><td class="ahead">البارتشن / الشقة</td><td class="aval">بارتشن '+esc(room)+' — شقة '+esc(apt)+' — '+esc(building)+'</td></tr>'
    + '<tr><td class="ehead">Monthly Rent</td><td class="eval">'+esc(rent)+' AED</td><td class="ahead">الإيجار الشهري</td><td class="aval">'+esc(rent)+' درهم</td></tr>'
    + '<tr><td class="ehead">Security Deposit</td><td class="eval">'+esc(totalDeposit)+' AED</td><td class="ahead">التأمين</td><td class="aval">'+esc(totalDeposit)+' درهم</td></tr>'
    + '<tr><td class="ehead">Persons</td><td class="eval">'+esc(personsEn)+'</td><td class="ahead">عدد الأشخاص</td><td class="aval">'+esc(personsAr)+'</td></tr>'
    + idRow
    + '</table></div>'
    + '<div class="box"><table>'+rows+'</table></div>'
    + '<div class="box sign"><table><tr><td class="center"><strong>Tenant Signature</strong><div class="sig"></div><div class="muted">Name: '+esc(name)+'</div></td><td class="center" style="direction:rtl"><strong>توقيع المستأجر</strong><div class="sig"></div><div class="muted">الاسم: '+esc(name)+'</div></td></tr></table></div>'
    + '</div>';
}


async function persistWelcomeData(d) {
  try {
    if(!window.sb) return;
    var apt = String(d.apt || '').trim();
    var room = String(d.room || '').trim();
    if(!apt || !room) return;

    var depAmt = Number(d.dep || 0) || 0;
    var payload = {
      tenant_name: d.name || null,
      monthly_rent: Number(d.rent || 0) || 0,
      deposit: depAmt,
      start_date: (document.getElementById('wl-start')||{}).value || null,
      phone: d.phone || null,
      persons_count: Number(d.persons || 1) || 1,
      notes: null,
      is_vacant: false,
    };

    var q = await sb.from('units').select('id,deposit,start_date').eq('apartment', apt).eq('room', room).maybeSingle();
    var unit = q.data;
    if(unit && unit.id) {
      await sb.from('units').update(payload).eq('id', unit.id);
      // NOTE: deposit reference value is saved in units.deposit above.
      // Real deposit payment must be recorded from the Operations/Payments screen only.
      // Do NOT insert into deposits table here — that would create a fake financial record.
    }
  } catch(e) {
    console.error('persistWelcomeData:', e);
  }
}

async function showWelcomeLetter() {

  var d = getWelcomeData();
  var html = buildWelcomeLetter(d.name, d.room, d.apt, d.rent, d.dep, d.building, d.startEn, d.startAr, d.persons, d.idNum);
  var preview = document.getElementById('welcome-preview');
  if(preview) {
    preview.innerHTML = '<div style="background:#fff;border-radius:12px;padding:10px;color:#111;font-size:.78rem;line-height:1.5;max-height:70vh;overflow-y:auto;border:1px solid var(--border)">' + html + '</div>';
    setTimeout(function(){ preview.scrollIntoView({behavior:'smooth', block:'start'}); }, 100);
  }
  window._welcomeHTML = html;
}

async function printWelcomeLetter() {
  var d = getWelcomeData();
  await persistWelcomeData(d);
  var html = buildWelcomeLetter(d.name, d.room, d.apt, d.rent, d.dep, d.building, d.startEn, d.startAr, d.persons, d.idNum);
  window._welcomeHTML = html;
  var iframe = document.getElementById('print-frame');
  if(!iframe){
    iframe = document.createElement('iframe');
    iframe.id = 'print-frame';
    iframe.style.cssText = 'position:fixed;right:-9999px;bottom:0;width:1px;height:1px;border:0';
    document.body.appendChild(iframe);
  }
  var doc = iframe.contentWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contract</title></head><body>'+html+'</body></html>');
  doc.close();
  setTimeout(function(){ iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 250);
}

async function sendWelcomeWA() {
  try {
  var d = getWelcomeData();
  await persistWelcomeData(d);
  var phone = (d.phone || '').replace(/\D/g, '');
  var msg = buildWAMsg(d);
  var url = 'https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent(msg);
  if(url.length > 2000) {
    var shortMsg = (LANG==='ar'?'مرحباً ':'Hello ') + d.name + '\nBP:' + d.room + '-' + d.apt + '\n' + d.rent + ' AED/mo';
    url = 'https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent(shortMsg);
  }
  safeOpen ? safeOpen(url) : window.open(url, '_blank', 'noopener,noreferrer');

  } catch(e) { toast((LANG==='ar'?'خطأ:':'Error:') + e.message,'err'); }
}

function buildWAMsg(d) {
  var totalDeposit = Number(d.dep||0)||0;
  var received = Number(d.dep||0)||0;
  var remaining = Math.max(0, totalDeposit - received);
  return [
    'Arabic / عربي',
    'تم استلام ' + received + ' درهم عربون تأمين لحجز بارتشن ' + d.room + ' شقة ' + d.apt + ' ' + d.building + '.',
    'متبقي ' + remaining + ' من التأمين عند الانتقال.',
    'الإيجار ' + d.rent + ' شهريًا لعدد ' + d.persons + ' أشخاص كحد أقصى.',
    'العربون غير مسترد في حالة الإلغاء أو عدم الالتزام بالشروط.',
    '',
    'English',
    'Received ' + received + ' AED as booking/security deposit for Partition ' + d.room + ', Apartment ' + d.apt + ', ' + d.building + '.',
    'Remaining deposit on move-in: ' + remaining + ' AED.',
    'Monthly rent: ' + d.rent + ' AED for up to ' + d.persons + ' person(s).',
    'The paid booking amount is non-refundable in case of cancellation or breach of the agreed terms.'
  ].join('\n');
}

window.getWelcomeData=getWelcomeData; window.loadMovesList=loadMovesList; window.addMoveEntry=addMoveEntry; window.saveMoveEntry=saveMoveEntry; window.deleteMoveEntry=deleteMoveEntry; window.showWelcomeLetter=showWelcomeLetter; window.printWelcomeLetter=printWelcomeLetter; window.buildWelcomeLetter=buildWelcomeLetter; window.sendWelcomeWA=sendWelcomeWA; window.buildWAMsg=buildWAMsg; window.addDepartureModal=addDepartureModal; window.addArrivalModal=addArrivalModal; window.saveArrivalEntry=saveArrivalEntry; window.fetchOccupiedUnits=fetchOccupiedUnits; window.fetchDepartures=fetchDepartures;


// ══════════════════════════════════════════════════════
// INTERNAL TRANSFER — نقل داخلي
// ══════════════════════════════════════════════════════

async function openInternalTransferModal() {
  window._itFromId = null;
  window._itToId   = null;

  var allUnits = [];
  try {
    var res = await sb.from('units')
      .select('id,apartment,room,monthly_rent,is_vacant,unit_status,tenant_name,tenant_name2')
      .order('apartment',{ascending:true});
    allUnits = res.data || [];
  } catch(e){}

  // مشغولة أو سوف تغادر
  window._itOccupied = allUnits.filter(function(u){ return !u.is_vacant; });
  // شاغرة أو سوف تغادر أو محجوزة
  window._itVacant   = allUnits.filter(function(u){
    return u.is_vacant
      || u.unit_status==='available'
      || u.unit_status==='leaving_soon'
      || u.unit_status==='reserved';
  });

  var existing = document.getElementById('internal-transfer-modal');
  if(existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'internal-transfer-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:500;display:flex;align-items:flex-end;justify-content:center;padding:0';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'background:var(--surf);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto';

  wrap.innerHTML = [
    '<div style="font-weight:800;font-size:1.1rem;margin-bottom:4px">🔄 نقل داخلي</div>',
    '<div style="font-size:.75rem;color:var(--muted);margin-bottom:16px">نقل مستأجر من وحدة لأخرى مع كل بياناته</div>',
    // FROM
    '<div class="fld">',
      '<label style="font-weight:700;color:var(--red)">📤 من وحدة (المستأجر الحالي)</label>',
      '<input class="inp" id="it-from-search" placeholder="ابحث بالشقة أو الاسم...">',
      '<div id="it-from-results" style="background:var(--surf2);border-radius:10px;margin-top:4px;max-height:150px;overflow-y:auto;display:none"></div>',
      '<div id="it-from-selected" style="display:none;padding:8px 12px;background:var(--red)15;border:1px solid var(--red)44;border-radius:10px;margin-top:4px;font-size:.82rem;color:var(--red);font-weight:700"></div>',
    '</div>',
    // TO
    '<div class="fld">',
      '<label style="font-weight:700;color:var(--green)">📥 إلى وحدة (الوحدة الشاغرة)</label>',
      '<input class="inp" id="it-to-search" placeholder="ابحث برقم الشقة أو الغرفة...">',
      '<div id="it-to-results" style="background:var(--surf2);border-radius:10px;margin-top:4px;max-height:150px;overflow-y:auto;display:none"></div>',
      '<div id="it-to-selected" style="display:none;padding:8px 12px;background:var(--green)15;border:1px solid var(--green)44;border-radius:10px;margin-top:4px;font-size:.82rem;color:var(--green);font-weight:700"></div>',
    '</div>',
    '<div class="fld"><label>تاريخ الانتقال</label><input class="inp" id="it-date" type="date"></div>',
    '<div class="fld"><label>الإيجار الجديد (AED) — فاضي = يبقى نفس القديم</label><input class="inp" id="it-rent" type="number" inputmode="numeric" placeholder="اختياري"></div>',
    '<div class="fld"><label>ملاحظات</label><input class="inp" id="it-notes" placeholder="اختياري"></div>',
    '<div style="background:var(--amber)18;border:1px solid var(--amber)44;border-radius:10px;padding:10px;margin-bottom:14px;font-size:.74rem;color:var(--amber)">',
      '⚠️ سيتم: نقل البيانات للوحدة الجديدة + إفراغ القديمة + تسجيل في السجل التاريخي + نقل التأمين',
    '</div>',
    '<div style="display:flex;gap:8px">',
      '<button id="it-exec-btn" style="flex:1;padding:13px;background:var(--green);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer">✅ تنفيذ النقل</button>',
      '<button id="it-cancel-btn" style="padding:13px 18px;background:var(--surf2);border:1px solid var(--border);border-radius:12px;color:var(--muted);font-family:inherit;cursor:pointer">إلغاء</button>',
    '</div>'
  ].join('');

  overlay.appendChild(wrap);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Set today's date
  var dateEl = document.getElementById('it-date');
  if(dateEl) dateEl.value = new Date().toISOString().slice(0,10);

  // Bind events
  document.getElementById('it-exec-btn').addEventListener('click', executeInternalTransfer);
  document.getElementById('it-cancel-btn').addEventListener('click', function(){ overlay.remove(); });

  document.getElementById('it-from-search').addEventListener('input', function(){ itFilterUnits('from'); });
  document.getElementById('it-to-search').addEventListener('input', function(){ itFilterUnits('to'); });
}

function itFilterUnits(mode) {
  var searchEl  = document.getElementById('it-'+mode+'-search');
  var resultsEl = document.getElementById('it-'+mode+'-results');
  var q = (searchEl ? searchEl.value || '' : '').trim().toLowerCase();
  var list = mode === 'from' ? (window._itOccupied||[]) : (window._itVacant||[]);

  resultsEl.innerHTML = '';
  if(!q) { resultsEl.style.display='none'; return; }

  var filtered = list.filter(function(u){
    var apt  = String(u.apartment||'').toLowerCase();
    var room = String(u.room||'').toLowerCase();
    var name = String(u.tenant_name||'').toLowerCase();
    return apt.indexOf(q)>-1 || room.indexOf(q)>-1 || name.indexOf(q)>-1
      || (apt+'-'+room).indexOf(q)>-1;
  }).slice(0,8);

  if(!filtered.length) {
    resultsEl.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:.8rem">لا نتائج</div>';
    resultsEl.style.display = 'block';
    return;
  }

  filtered.forEach(function(u){
    var div = document.createElement('div');
    div.style.cssText = 'padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border)33;font-size:.82rem';
    var statusTag = u.unit_status==='leaving_soon' ? ' 📤' : u.unit_status==='reserved' ? ' 🔖' : '';
    div.textContent = mode === 'from'
      ? 'شقة '+u.apartment+' — غرفة '+u.room+' | '+(u.tenant_name||'—')+statusTag
      : 'شقة '+u.apartment+' — غرفة '+u.room+' | '+u.monthly_rent+' AED'+statusTag;
    div.addEventListener('click', function(){
      itSelectUnit(mode, u.id, div.textContent);
    });
    div.addEventListener('mouseover', function(){ this.style.background='var(--surf3)'; });
    div.addEventListener('mouseout',  function(){ this.style.background=''; });
    resultsEl.appendChild(div);
  });
  resultsEl.style.display = 'block';
}

function itSelectUnit(mode, id, label) {
  if(mode==='from') window._itFromId = id;
  else              window._itToId   = id;

  var searchEl   = document.getElementById('it-'+mode+'-search');
  var resultsEl  = document.getElementById('it-'+mode+'-results');
  var selectedEl = document.getElementById('it-'+mode+'-selected');

  if(searchEl)   searchEl.style.display   = 'none';
  if(resultsEl)  resultsEl.style.display  = 'none';
  if(selectedEl) {
    selectedEl.style.display = 'block';

    var span = document.createElement('span');
    span.textContent = (mode==='from'?'📤 ':'📥 ') + label;

    var changeBtn = document.createElement('span');
    changeBtn.textContent = '  ✕';
    changeBtn.style.cssText = 'cursor:pointer;color:var(--muted);font-weight:400';
    changeBtn.addEventListener('click', function(){
      if(mode==='from') window._itFromId=null;
      else              window._itToId=null;
      if(searchEl)   { searchEl.style.display='block'; searchEl.value=''; }
      if(resultsEl)  resultsEl.style.display='none';
      selectedEl.style.display='none';
      selectedEl.innerHTML='';
    });

    selectedEl.innerHTML = '';
    selectedEl.appendChild(span);
    selectedEl.appendChild(changeBtn);
  }
}


// ══ LOAD INTERNAL TRANSFERS FROM DB ══
async function loadInternalTransfers() {
  var list = document.getElementById('internal-transfer-list');
  if(!list) return;
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">⏳ جاري التحميل...</div>';

  try {
    var { data: records } = await sb.from('internal_transfers')
      .select('*')
      .order('created_at', {ascending:false})
      .limit(20);

    if(!records || !records.length) {
      list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:.82rem">لا توجد نقليات داخلية مسجّلة</div>';
      return;
    }

    list.innerHTML = '';
    records.forEach(function(rec) {
      var f = rec.from_snapshot || {};
      var t = rec.to_snapshot || {};
      var item = document.createElement('div');
      item.style.cssText = 'background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:8px;border-right:4px solid var(--green)';
      item.dataset.transferId = rec.id;

      var undoBtn = document.createElement('button');
      undoBtn.textContent = '↩️ تراجع';
      undoBtn.style.cssText = 'padding:6px 10px;background:var(--amber)22;border:1px solid var(--amber);border-radius:8px;color:var(--amber);font-size:.72rem;cursor:pointer;font-family:inherit;flex-shrink:0';
      undoBtn.addEventListener('click', function(){ undoInternalTransfer(undoBtn); });

      var info = document.createElement('div');
      info.innerHTML = '<div style="font-weight:700">🔄 '+(f.tenant_name||'—')+'</div>'
        + '<div style="font-size:.75rem;color:var(--muted)">شقة '+f.apartment+' غرفة '+f.room
        + ' ← شقة '+t.apartment+' غرفة '+t.room+'</div>'
        + '<div style="font-size:.7rem;color:var(--muted)">📅 '+(rec.transfer_date||rec.created_at||'').slice(0,10)+'</div>';

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px';
      row.appendChild(info);
      row.appendChild(undoBtn);
      item.appendChild(row);
      // Also add undo button below for mobile visibility
      var undoBtn2 = document.createElement('button');
      undoBtn2.textContent = '↩️ تراجع عن النقل';
      undoBtn2.style.cssText = 'margin-top:8px;width:100%;padding:9px;background:var(--amber)22;border:1px solid var(--amber);border-radius:10px;color:var(--amber);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit';
      undoBtn2.addEventListener('click', function(){ undoInternalTransfer(undoBtn2); });
      item.appendChild(undoBtn2);
      list.appendChild(item);
    });
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red)">خطأ: '+e.message+'</div>';
  }
}

window.openInternalTransferModal = openInternalTransferModal;
window.itFilterUnits = itFilterUnits;
window.itSelectUnit  = itSelectUnit;



async function executeInternalTransfer() {
  var fromId = window._itFromId;
  var toId   = window._itToId;
  var date   = (document.getElementById('it-date')||{}).value||'';
  var newRent= (document.getElementById('it-rent')||{}).value||'';
  var notes  = ((document.getElementById('it-notes')||{}).value||'').trim();

  if(!fromId) { toast(LANG==='ar'?'اختر الوحدة الحالية':'Select source unit','err'); return; }
  if(!toId)   { toast(LANG==='ar'?'اختر الوحدة الجديدة':'Select target unit','err'); return; }
  if(fromId === toId) { toast(LANG==='ar'?'الوحدتان متشابهتان':'Same unit selected','err'); return; }
  if(!date)   { toast(LANG==='ar'?'التاريخ مطلوب':'Date required','err'); return; }
  if(!confirm(LANG==='ar'?'هل تريد تنفيذ النقل الداخلي؟':'Execute internal transfer?')) return;

  var btn = document.getElementById('it-exec-btn');
  if(btn) { btn.disabled=true; btn.textContent='⏳ جاري النقل...'; }

  try {
    var { data: fromUnit, error: e1 } = await sb.from('units').select('*').eq('id', fromId).single();
    if(e1) throw e1;
    var { data: toUnit, error: e2 } = await sb.from('units').select('*').eq('id', toId).single();
    if(e2) throw e2;

    // 1. Save snapshots in unit_history + internal_transfers
    await sb.from('unit_history').insert({
      unit_id: fromId,
      apartment: parseInt(fromUnit.apartment)||0,
      room: parseInt(fromUnit.room)||0,
      tenant_name: fromUnit.tenant_name,
      tenant_name2: fromUnit.tenant_name2,
      phone: fromUnit.phone,
      phone2: fromUnit.phone2,
      monthly_rent: fromUnit.monthly_rent,
      rent1: fromUnit.rent1,
      rent2: fromUnit.rent2,
      deposit: fromUnit.deposit,
      persons_count: fromUnit.persons_count,
      start_date: fromUnit.start_date,
      end_date: date,
      notes: 'نقل داخلي إلى شقة '+toUnit.apartment+' غرفة '+toUnit.room+(notes?' — '+notes:''),
      snapshot_type: 'internal_transfer_out',
      recorded_by: ME ? ME.id : null
    });
    // Save snapshot for toUnit (displaced tenant) in unit_history
    if(toUnit.tenant_name) {
      await sb.from('unit_history').insert({
        unit_id: toId,
        apartment: parseInt(toUnit.apartment)||0,
        room: parseInt(toUnit.room)||0,
        tenant_name: toUnit.tenant_name,
        tenant_name2: toUnit.tenant_name2,
        phone: toUnit.phone,
        phone2: toUnit.phone2,
        monthly_rent: toUnit.monthly_rent,
        rent1: toUnit.rent1,
        rent2: toUnit.rent2,
        deposit: toUnit.deposit,
        persons_count: toUnit.persons_count,
        start_date: toUnit.start_date,
        end_date: date,
        notes: 'تم استبداله بنقل داخلي — '+fromUnit.tenant_name+' من شقة '+fromUnit.apartment+' غرفة '+fromUnit.room+(notes?' — '+notes:''),
        snapshot_type: 'internal_transfer_displaced',
        recorded_by: ME ? ME.id : null
      });
    }
    // Save to internal_transfers for persistent undo
    var { data: transferRec } = await sb.from('internal_transfers').insert({
      from_unit_id: fromId,
      to_unit_id: toId,
      from_snapshot: fromUnit,
      to_snapshot: toUnit,
      transfer_date: date,
      notes: notes||null,
      created_by: ME ? ME.id : null
    }).select('id').single();
    var transferId = transferRec ? transferRec.id : null;

    // 2. Copy tenant to new unit
    var rentToSet = newRent ? Number(newRent) : fromUnit.monthly_rent;
    var { error: e3 } = await sb.from('units').update({
      tenant_name: fromUnit.tenant_name,
      tenant_name2: fromUnit.tenant_name2,
      phone: fromUnit.phone,
      phone2: fromUnit.phone2,
      language: fromUnit.language,
      persons_count: fromUnit.persons_count,
      monthly_rent: rentToSet,
      rent1: newRent ? Number(newRent) : (fromUnit.rent1||0),
      rent2: fromUnit.rent2||0,
      deposit: fromUnit.deposit||0,
      start_date: date,
      is_vacant: false,
      unit_status: 'occupied',
      notes: notes || fromUnit.notes || null
    }).eq('id', toId);
    if(e3) throw e3;

    // 3. Clear source unit
    var { error: e4 } = await sb.from('units').update({
      tenant_name: null, tenant_name2: null,
      phone: null, phone2: null,
      monthly_rent: 0, rent1: 0, rent2: 0, deposit: 0,
      start_date: null,
      is_vacant: true,
      unit_status: 'available',
      notes: 'أُفرغت بنقل داخلي — '+date
    }).eq('id', fromId);
    if(e4) throw e4;

    // 4. Transfer deposit record if exists
    await sb.from('deposits').update({
      unit_id: toId,
      apartment: String(toUnit.apartment),
      room: String(toUnit.room)
    }).eq('unit_id', fromId).eq('status', 'held');

    // 5. Update list display
    var list = document.getElementById('internal-transfer-list');
    if(list) {
      var item = document.createElement('div');
      item.style.cssText = 'background:var(--surf2);border-radius:12px;padding:12px;margin-bottom:8px;border-right:4px solid var(--green)';
      // Store transfer ID for persistent undo
      item.dataset.transferId = transferId || '';
      item.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
        + '<div>'
        + '<div style="font-weight:700">🔄 '+(fromUnit.tenant_name||'—')+'</div>'
        + '<div style="font-size:.75rem;color:var(--muted)">شقة '+fromUnit.apartment+' غرفة '+fromUnit.room
        + ' ← شقة '+toUnit.apartment+' غرفة '+toUnit.room+'</div>'
        + '<div style="font-size:.7rem;color:var(--muted)">📅 '+date+'</div>'
        + '</div>'
        + '<button onclick="undoInternalTransfer(this)" style="padding:6px 10px;background:var(--amber)22;border:1px solid var(--amber);border-radius:8px;color:var(--amber);font-size:.72rem;cursor:pointer;font-family:inherit;flex-shrink:0;margin-right:4px">↩️ تراجع</button>'
        + '</div>';
      var empty = list.querySelector('[style*="text-align:center"]');
      if(empty) list.innerHTML = '';
      list.insertBefore(item, list.firstChild);
    }

    toast(LANG==='ar'?'✅ تم النقل الداخلي بنجاح':'✅ Transfer completed','ok');
    var modal = document.getElementById('internal-transfer-modal');
    if(modal) modal.remove();
    if(window.loadUnits) loadUnits();

  } catch(e) {
    toast((LANG==='ar'?'خطأ: ':'Error: ')+(e.message||String(e)),'err');
    if(btn) { btn.disabled=false; btn.textContent='✅ تنفيذ النقل'; }
  }
}


// ══ UNDO INTERNAL TRANSFER ══
async function undoInternalTransfer(btn) {
  var item = btn ? btn.closest('[data-transfer-id]') : null;
  var transferId = item ? item.dataset.transferId : null;
  if(!transferId) { toast(LANG==='ar'?'لا يمكن التراجع — لا يوجد سجل':'Cannot undo','err'); return; }

  // Load transfer record from DB
  var { data: rec, error: recErr } = await sb.from('internal_transfers')
    .select('*').eq('id', transferId).single();
  if(recErr || !rec) { toast(LANG==='ar'?'لم يتم العثور على سجل النقل':'Transfer record not found','err'); return; }

  var data = { fromId: rec.from_unit_id, toId: rec.to_unit_id, fromSnapshot: rec.from_snapshot, toSnapshot: rec.to_snapshot };

  if(!confirm(LANG==='ar'?'هل تريد التراجع عن هذا النقل؟ سيتم إرجاع البيانات كما كانت.':'Undo this transfer? All data will be reverted.')) return;

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    var f = data.fromSnapshot;
    var t = data.toSnapshot;

    // Restore source unit (fromUnit) with original data
    await sb.from('units').update({
      tenant_name: f.tenant_name,
      tenant_name2: f.tenant_name2,
      phone: f.phone,
      phone2: f.phone2,
      language: f.language,
      persons_count: f.persons_count,
      monthly_rent: f.monthly_rent,
      rent1: f.rent1||0,
      rent2: f.rent2||0,
      deposit: f.deposit||0,
      start_date: f.start_date,
      is_vacant: f.is_vacant,
      unit_status: f.unit_status,
      notes: f.notes||null
    }).eq('id', data.fromId);

    // Restore target unit (toUnit) with original data
    await sb.from('units').update({
      tenant_name: t.tenant_name,
      tenant_name2: t.tenant_name2,
      phone: t.phone,
      phone2: t.phone2,
      language: t.language,
      persons_count: t.persons_count,
      monthly_rent: t.monthly_rent,
      rent1: t.rent1||0,
      rent2: t.rent2||0,
      deposit: t.deposit||0,
      start_date: t.start_date,
      is_vacant: t.is_vacant,
      unit_status: t.unit_status,
      notes: t.notes||null
    }).eq('id', data.toId);

    // Move deposit back to source unit
    await sb.from('deposits').update({
      unit_id: data.fromId,
      apartment: String(data.fromApt),
      room: String(data.fromRoom)
    }).eq('unit_id', data.toId).eq('status','held');

    // Delete the transfer record
    await sb.from('internal_transfers').delete().eq('id', transferId);
    toast(LANG==='ar'?'✅ تم التراجع عن النقل':'✅ Transfer undone','ok');
    if(item) item.remove();
    if(window.loadUnits) loadUnits();

  } catch(e) {
    toast('خطأ: '+e.message,'err');
    btn.disabled = false;
    btn.textContent = '↩️ تراجع';
  }
}

window.executeInternalTransfer = executeInternalTransfer;
window.undoInternalTransfer = undoInternalTransfer;
window.loadInternalTransfers = loadInternalTransfers;
