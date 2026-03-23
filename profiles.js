// ═══ WAHDATI PROFILES v2 ═══
// Tenant Profile, Unit Timeline, Unit Status System

var STATUS_CONFIG = {
  occupied:     { label:'مشغولة',    labelEN:'Occupied',     color:'var(--green)',  icon:'🔑' },
  available:    { label:'شاغرة',     labelEN:'Available',    color:'var(--muted)',  icon:'🏠' },
  reserved:     { label:'محجوزة',    labelEN:'Reserved',     color:'var(--purple)', icon:'🔖' },
  leaving_soon: { label:'مغادرة',    labelEN:'Leaving Soon', color:'var(--amber)',  icon:'📤' },
  maintenance:  { label:'صيانة',     labelEN:'Maintenance',  color:'var(--amber)',  icon:'🔧' },
};

function statusPill(key) {
  var s = STATUS_CONFIG[key] || STATUS_CONFIG.available;
  return '<span style="background:'+s.color+'22;color:'+s.color+';border:1px solid '+s.color+'44;'
    +'border-radius:20px;padding:3px 9px;font-size:.68rem;font-weight:700">'+s.icon+' '
    +(LANG==='ar'?s.label:s.labelEN)+'</span>';
}
window.statusPill = statusPill;

// ── Inject profile + timeline buttons into drawer ──
function injectProfileButtons(unitId, aptLabel) {
  var histBtn = document.getElementById('drawer-hist-btn');
  if(!histBtn || document.getElementById('drawer-profile-btn')) return;

  function makeBtn(id, text, fn, color) {
    var b = document.createElement('button');
    b.id = id;
    b.style.cssText = 'width:100%;padding:11px;background:'+color+'18;border:1px solid '+color+'44;'
      +'border-radius:12px;color:'+color+';font-family:var(--font);font-size:.82rem;font-weight:600;'
      +'cursor:pointer;margin-top:6px';
    b.textContent = text;
    b.onclick = fn;
    return b;
  }

  var p = makeBtn('drawer-profile-btn','👤 بروفايل المستأجر',function(){ openTenantProfile(unitId); },'var(--accent)');
  var t = makeBtn('drawer-timeline-btn','📅 تاريخ الوحدة الكامل',function(){ openUnitTimeline(unitId,aptLabel); },'var(--purple)');
  histBtn.parentNode.insertBefore(t, histBtn.nextSibling);
  histBtn.parentNode.insertBefore(p, histBtn.nextSibling);
}
window.injectProfileButtons = injectProfileButtons;

// ── Tenant Profile Modal ──
async function openTenantProfile(unitId) {
  var ex = document.getElementById('tenant-profile-modal');
  if(ex) ex.remove();
  try {
    var unit = (window.MO||[]).find(function(u){return u.id===unitId;});
    if(!unit){ var r = await sb.from('units').select('*').eq('id',unitId).single(); unit=r.data; }
    if(!unit) return;
    var code = window.generateUnitCode?window.generateUnitCode(unit.apartment,unit.room,unit.building_name):'';
    var modal = document.createElement('div');
    modal.id='tenant-profile-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:700;display:flex;align-items:flex-end;justify-content:center';
    modal.innerHTML='<div style="background:var(--surf);border-radius:20px 20px 0 0;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:20px 16px 36px">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">'
      +'<div><div style="font-weight:800;font-size:1.05rem">👤 '+escapeHtml(unit.tenant_name||'—')+(unit.tenant_name2?' &amp; '+escapeHtml(unit.tenant_name2):'')+'</div>'
      +'<div style="font-size:.72rem;color:var(--muted);margin-top:3px">'
      +(code?'<span style="font-family:monospace;background:var(--accent)18;color:var(--accent);border-radius:5px;padding:1px 6px;font-size:.65rem;margin-left:6px">'+code+'</span>':'')
      +'شقة '+unit.apartment+' — غرفة '+unit.room+'</div></div>'
      +'<button onclick="document.getElementById(\'tenant-profile-modal\').remove()" style="background:var(--surf2);border:1px solid var(--border);border-radius:50%;min-width:34px;height:34px;cursor:pointer;font-size:1rem">✕</button></div>'
      +'<div id="tenant-profile-body" style="text-align:center;padding:24px"><span class="spin"></span></div></div>';
    modal.addEventListener('click',function(e){if(e.target===modal)modal.remove();});
    document.body.appendChild(modal);

    var [pR,dR,hR] = await Promise.all([
      sb.from('rent_payments').select('*').eq('unit_id',unitId).order('payment_date',{ascending:false}).limit(36),
      sb.from('deposits').select('*').eq('unit_id',unitId).order('deposit_received_date',{ascending:false}),
      sb.from('unit_history').select('*').eq('unit_id',unitId).order('end_date',{ascending:false})
    ]);
    var pays=pR.data||[], deps=dR.data||[], hist=hR.data||[];
    var totalPaid=pays.reduce(function(s,p){return s+(p.amount||0);},0);
    var totalDep=deps.filter(function(d){return d.status!=='refunded';}).reduce(function(s,d){return s+(d.amount||0);},0);
    var html='';

    // Info
    html+='<div style="background:var(--surf2);border-radius:14px;padding:14px;margin-bottom:12px">'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">'
      +'<div><span style="color:var(--muted)">📅 دخل:</span> <b>'+(unit.start_date?unit.start_date.slice(0,10):'—')+'</b></div>'
      +'<div><span style="color:var(--muted)">💰 إيجار:</span> <b>'+(unit.monthly_rent||0)+' AED</b></div>'
      +'<div><span style="color:var(--muted)">📞 هاتف:</span> <b dir="ltr">'+(unit.phone||'—')+'</b></div>'
      +'<div><span style="color:var(--muted)">🔒 تأمين:</span> <b style="color:var(--amber)">'+totalDep+' AED</b></div>'
      +'<div><span style="color:var(--muted)">👥 أشخاص:</span> <b>'+(unit.persons_count||1)+'</b></div>'
      +'<div><span style="color:var(--muted)">🗣️ لغة:</span> <b>'+(unit.language==='ar'?'عربي':'English')+'</b></div>'
      +'</div>'+(unit.notes
  ? '<div style="margin-top:10px;background:var(--amber)15;border:1px solid var(--amber)33;border-radius:10px;padding:10px 12px;border-right:3px solid var(--amber)">'
    + '<div style="font-size:.62rem;color:var(--amber);font-weight:700;margin-bottom:4px">📝 ملاحظات</div>'
    + '<div style="font-size:.78rem;color:var(--text)">'+escapeHtml(unit.notes)+'</div>'
    + '</div>'
  : '')+'</div>';

    // Payment trend — are they getting better or worse?
    var recentPays = pays.slice(0,3), olderPays = pays.slice(3,6);
    var recentTotal = recentPays.reduce(function(s,p){return s+(p.amount||0);},0);
    var olderTotal  = olderPays.reduce(function(s,p){return s+(p.amount||0);},0);
    var trendIcon = '';
    if(recentPays.length>=2 && olderPays.length>=2) {
      trendIcon = recentTotal >= olderTotal ? ' <span style="color:var(--green);font-size:.7rem">↑ منتظم</span>' : ' <span style="color:var(--amber);font-size:.7rem">↓ متقطع</span>';
    }

    // Stats — 4 cards with tenure
    var tenureMonths = 0;
    if(unit.start_date){ var _sd=new Date(unit.start_date),_nd=new Date(); tenureMonths=Math.max(0,(_nd.getFullYear()-_sd.getFullYear())*12+(_nd.getMonth()-_sd.getMonth())); }
    html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px">'
      +'<div style="background:var(--green-bg);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.9rem;color:var(--green)">'+pays.length+'</div><div style="font-size:.58rem;color:var(--muted)">دفعة</div></div>'
      +'<div style="background:var(--accent-glow);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.85rem;color:var(--accent)">'+(totalPaid>=1000?(totalPaid/1000).toFixed(1)+'k':totalPaid.toLocaleString())+'</div><div style="font-size:.58rem;color:var(--muted)">مجموع AED</div></div>'
      +'<div style="background:var(--amber-bg);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.9rem;color:var(--amber)">'+totalDep+'</div><div style="font-size:.58rem;color:var(--muted)">تأمين</div></div>'
      +'<div style="background:var(--surf2);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.9rem;color:var(--text)">'+tenureMonths+'</div><div style="font-size:.58rem;color:var(--muted)">شهر</div></div>'
      +'</div>';

    // History tenants
    if(hist.length>0){
      html+='<div style="font-weight:700;font-size:.75rem;color:var(--accent);margin-bottom:7px;text-transform:uppercase">⏮️ سابقون</div>';
      hist.forEach(function(h){
        html+='<div style="background:var(--surf2);border-radius:10px;padding:10px;margin-bottom:6px;border-right:3px solid var(--muted)">'
          +'<div style="display:flex;justify-content:space-between"><b style="font-size:.82rem">'+escapeHtml(h.tenant_name||'—')+(h.tenant_name2?' &amp; '+escapeHtml(h.tenant_name2):'')+'</b>'
          +'<div style="font-size:.68rem;color:var(--muted);text-align:end"><div>'+(h.start_date?h.start_date.slice(0,10):'')+'</div><div>'+(h.end_date?h.end_date.slice(0,10):'')+'</div></div></div>'
          +(h.monthly_rent?'<div style="font-size:.7rem;color:var(--muted);margin-top:4px">💰 '+h.monthly_rent+' AED'+(h.deposit?' · 🔒 '+h.deposit+' AED':'')+'</div>':'')
          +'</div>';
      });
      html+='<div style="height:1px;background:var(--border);margin:12px 0"></div>';
    }

    // Payments grouped
    html+='<div style="font-weight:700;font-size:.75rem;color:var(--green);margin-bottom:7px;text-transform:uppercase">💳 سجل الدفعات</div>';
    if(!pays.length){ html+='<div style="text-align:center;padding:14px;color:var(--muted);font-size:.8rem">لا توجد دفعات</div>'; }
    else {
      var bm={};
      pays.forEach(function(p){var m=(p.payment_month||'').slice(0,7)||'—';if(!bm[m])bm[m]=0;bm[m]+=p.amount||0;});
      html+='<div style="max-height:200px;overflow-y:auto;background:var(--surf2);border-radius:10px">';
      Object.keys(bm).sort().reverse().forEach(function(m){
        html+='<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border)22;font-size:.78rem"><b>'+m+'</b><b style="color:var(--green)">'+bm[m].toLocaleString()+' AED</b></div>';
      });
      html+='</div>';
    }

    // Deposits
    if(deps.length>0){
      html+='<div style="font-weight:700;font-size:.75rem;color:var(--amber);margin-bottom:7px;margin-top:14px;text-transform:uppercase">🔒 تأمينات</div>';
      deps.forEach(function(d){
        var sc=d.status==='held'?'var(--amber)':d.status==='refunded'?'var(--green)':'var(--red)';
        var st=d.status==='held'?'محتجز':d.status==='refunded'?'مُرتجع':'مُصادر';
        html+='<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)22;font-size:.78rem">'
          +'<div><b style="color:var(--accent)">'+(d.amount||0)+' AED</b><div style="font-size:.67rem;color:var(--muted)">📅 '+(d.deposit_received_date||'').slice(0,10)+'</div></div>'
          +'<span style="color:'+sc+';font-weight:600;font-size:.72rem">'+st+'</span></div>';
      });
    }
    document.getElementById('tenant-profile-body').innerHTML=html;
  } catch(e){
    console.error('openTenantProfile:',e);
    var b=document.getElementById('tenant-profile-body');
    if(b)b.innerHTML='<div style="color:var(--red);padding:16px">خطأ: '+e.message+'</div>';
  }
}

// ── Unit Timeline Modal ──
async function openUnitTimeline(unitId, aptLabel) {
  var ex=document.getElementById('unit-timeline-modal');
  if(ex)ex.remove();
  var modal=document.createElement('div');
  modal.id='unit-timeline-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:750;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML='<div style="background:var(--surf);border-radius:20px 20px 0 0;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:20px 16px 36px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    +'<div style="font-weight:800;font-size:1rem">📅 تاريخ الوحدة — '+(aptLabel||'')+'</div>'
    +'<button onclick="document.getElementById(\'unit-timeline-modal\').remove()" style="background:var(--surf2);border:1px solid var(--border);border-radius:50%;min-width:34px;height:34px;cursor:pointer;font-size:1rem">✕</button></div>'
    +'<div id="unit-timeline-body"><div style="text-align:center;padding:24px"><span class="spin"></span></div></div></div>';
  modal.addEventListener('click',function(e){if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
  try {
    var [uR,pR,dR,hR]=await Promise.all([
      sb.from('units').select('*').eq('id',unitId).single(),
      sb.from('rent_payments').select('*').eq('unit_id',unitId).order('payment_date',{ascending:false}),
      sb.from('deposits').select('*').eq('unit_id',unitId).order('deposit_received_date',{ascending:false}),
      sb.from('unit_history').select('*').eq('unit_id',unitId).order('end_date',{ascending:false})
    ]);
    var unit=uR.data, pays=pR.data||[], deps=dR.data||[], hist=hR.data||[];
    var tRent=pays.reduce(function(s,p){return s+(p.amount||0);},0);
    var tDep=deps.reduce(function(s,d){return s+(d.amount||0);},0);
    var nTen=hist.length+(unit&&!unit.is_vacant&&unit.tenant_name?1:0);
    var code=window.generateUnitCode?window.generateUnitCode(unit.apartment,unit.room,unit.building_name):'';
    var html='';

    // Identity
    html+='<div style="background:var(--accent)15;border:1px solid var(--accent)33;border-radius:14px;padding:14px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      +'<div style="font-weight:800;font-size:.88rem">🏢 هوية الوحدة</div>'
      +(code?'<span style="font-family:monospace;background:var(--surf);padding:3px 9px;border-radius:7px;font-size:.7rem;color:var(--accent);font-weight:700">'+code+'</span>':'')
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">'
      +'<div><span style="color:var(--muted)">شقة:</span> <b>'+unit.apartment+'</b></div>'
      +'<div><span style="color:var(--muted)">غرفة:</span> <b>'+unit.room+'</b></div>'
      +(unit.building_name?'<div><span style="color:var(--muted)">المبنى:</span> <b>'+escapeHtml(unit.building_name)+'</b></div>':'')
      +'<div><span style="color:var(--muted)">الإيجار:</span> <b>'+(unit.monthly_rent||0)+' AED</b></div>'
      +'<div><span style="color:var(--muted)">الحالة:</span> '+statusPill(unit.unit_status||(unit.is_vacant?'available':'occupied'))+'</div>'
      +'</div></div>';

    // Stats
    html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:14px">'
      +'<div style="background:var(--surf2);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.95rem;color:var(--green)">'+(tRent>=1000?(tRent/1000).toFixed(1)+'k':tRent)+'</div><div style="font-size:.6rem;color:var(--muted);margin-top:2px">إجمالي إيجار</div></div>'
      +'<div style="background:var(--surf2);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.95rem;color:var(--amber)">'+tDep+'</div><div style="font-size:.6rem;color:var(--muted);margin-top:2px">إجمالي تأمين</div></div>'
      +'<div style="background:var(--surf2);border-radius:10px;padding:10px;text-align:center"><div style="font-weight:800;font-size:.95rem;color:var(--accent)">'+nTen+'</div><div style="font-size:.6rem;color:var(--muted);margin-top:2px">مستأجرون</div></div>'
      +'</div>';

    // Timeline
    html+='<div style="font-weight:700;font-size:.78rem;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">📅 التسلسل الزمني</div>';
    if(unit&&!unit.is_vacant&&unit.tenant_name){
      var depHeld=deps.filter(function(d){return d.status!=='refunded';}).reduce(function(s,d){return s+(d.amount||0);},0);
      html+=_timelineEntry({name:unit.tenant_name+(unit.tenant_name2?' & '+unit.tenant_name2:''),phone:unit.phone,start:unit.start_date,end:null,rent:unit.monthly_rent,deposit:depHeld,isCurrent:true});
    }
    hist.forEach(function(h){ html+=_timelineEntry({name:h.tenant_name+(h.tenant_name2?' & '+h.tenant_name2:''),phone:h.phone,start:h.start_date,end:h.end_date,rent:h.monthly_rent,deposit:h.deposit,isCurrent:false}); });
    if(!unit.tenant_name&&hist.length===0) html+='<div style="text-align:center;padding:16px;color:var(--muted);font-size:.8rem">لا يوجد سجل بعد</div>';

    // Payment summary
    if(pays.length>0){
      var bm={};
      pays.forEach(function(p){var m=(p.payment_month||'').slice(0,7)||'—';bm[m]=(bm[m]||0)+(p.amount||0);});
      html+='<div style="margin-top:16px"><div style="font-weight:700;font-size:.75rem;color:var(--green);margin-bottom:8px;text-transform:uppercase">💳 ملخص الدفعات ('+pays.length+')</div>'
        +'<div style="max-height:180px;overflow-y:auto;background:var(--surf2);border-radius:10px">';
      Object.keys(bm).sort().reverse().forEach(function(m){
        html+='<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid var(--border)22;font-size:.75rem"><span style="color:var(--muted)">'+m+'</span><b style="color:var(--green)">'+bm[m].toLocaleString()+' AED</b></div>';
      });
      html+='</div></div>';
    }
    document.getElementById('unit-timeline-body').innerHTML=html;
  } catch(e){
    console.error('openUnitTimeline:',e);
    var b=document.getElementById('unit-timeline-body');
    if(b)b.innerHTML='<div style="color:var(--red);padding:16px">خطأ: '+e.message+'</div>';
  }
}

function _timelineEntry(t) {
  var bc=t.isCurrent?'var(--green)':'var(--border)';
  var bg=t.isCurrent?'var(--green-bg)':'var(--surf2)';
  var badge=t.isCurrent
    ?'<span style="background:var(--green)22;color:var(--green);border-radius:20px;padding:2px 8px;font-size:.62rem;font-weight:700">حالي ✓</span>'
    :'<span style="background:var(--surf);color:var(--muted);border-radius:20px;padding:2px 8px;font-size:.62rem;border:1px solid var(--border)">سابق</span>';
  return '<div style="border-right:3px solid '+bc+';padding:10px 12px;margin-bottom:8px;background:'+bg+';border-radius:0 10px 10px 0">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px"><b style="font-size:.85rem">'+escapeHtml(t.name||'—')+'</b>'+badge+'</div>'
    +(t.phone?'<div style="font-size:.7rem;color:var(--muted)" dir="ltr">📞 '+t.phone+'</div>':'')
    +'<div style="display:flex;gap:10px;margin-top:5px;font-size:.72rem;color:var(--muted);flex-wrap:wrap">'
    +'<span>📅 '+(t.start?t.start.slice(0,10):'—')+' → '+(t.end?t.end.slice(0,10):(t.isCurrent?'الآن':'—'))+'</span>'
    +(t.rent?'<span>💰 '+t.rent+' AED</span>':'')+(t.deposit?'<span>🔒 '+t.deposit+' AED <span style="font-size:.58rem;opacity:.7">(مرجعي)</span></span>':'')
    +'</div></div>';
}

async function loadUnitPerformance() {
  try {
    var now=new Date(), months=[];
    for(var i=0;i<3;i++){var d=new Date(now);d.setMonth(d.getMonth()-i);months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
    // Unit performance uses payment_month (accrual — who paid their rent)
    var monthOr = months.map(function(m){ return 'payment_month.like.' + m + '%'; }).join(',');
    var [uR,pR]=await Promise.all([
      sb.from('units').select('id,apartment,room,tenant_name,monthly_rent').eq('is_vacant',false),
      sb.from('rent_payments').select('unit_id,amount').or(monthOr)
    ]);
    var units=uR.data||[], pm={};
    (pR.data||[]).forEach(function(p){pm[p.unit_id]=(pm[p.unit_id]||0)+(p.amount||0);});
    return units.map(function(u){
      var exp=(u.monthly_rent||0)*3, coll=pm[u.id]||0, rate=exp>0?Math.round(coll/exp*100):0;
      return {u:u,rate:rate,collected:coll,expected:exp};
    }).sort(function(a,b){return b.rate-a.rate;});
  }catch(e){console.error('loadUnitPerformance:',e);return [];}
}

window.openTenantProfile   = openTenantProfile;
window.openUnitTimeline    = openUnitTimeline;
window.loadUnitPerformance = loadUnitPerformance;
