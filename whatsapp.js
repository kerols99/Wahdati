// ══ WHATSAPP ══

function showWAModal(apt, room, tenantNum) {
  var unit = MO.find(u=>String(u.apartment)===String(apt)&&String(u.room)===String(room));
  if(!unit) { toast(LANG==='ar'?'الوحدة غير موجودة':'Unit not found','err'); return; }

  // Pick correct tenant based on tenantNum (1 or 2)
  var isT2 = tenantNum===2 && unit.tenant_name2;
  var tenantName = isT2 ? unit.tenant_name2 : (unit.tenant_name||'المستأجر');
  var tenantRentBase = isT2 ? (unit.rent2||unit.monthly_rent) : (unit.rent1||unit.monthly_rent);
  // طبّق الخصم المؤقت لو موجود
  var _disc = (!isT2 && window._discountMapCache) ? (window._discountMapCache[unit.id]||0) : 0;
  var tenantRent = Math.max(0, tenantRentBase - _disc);
  var rawPhone   = isT2 ? (unit.phone2||'') : (unit.phone||'');

  var phone = rawPhone.replace(/\D/g,'');
  if(phone.startsWith('0')) phone = '971'+phone.slice(1);

  var now = new Date();
  var monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var monthNamesEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var isAR = unit.language==='ar';
  var msgLang = isAR ? 'ar' : 'en';
  var msgMonth = isAR ? monthNames[now.getMonth()] : monthNamesEN[now.getMonth()];
  var msg = buildWAMsg(msgLang, tenantName, apt, room, msgMonth, now.getFullYear(), tenantRent);

  var modal = document.createElement('div');
  modal.id = 'wa-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:400;display:flex;align-items:flex-end;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--surf);border-radius:20px;padding:20px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto">
      <div style="font-weight:700;margin-bottom:12px">💬 WhatsApp</div>
      <textarea id="wa-msg" style="width:100%;height:140px;background:var(--surf2);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--text);font-family:inherit;font-size:.82rem;resize:vertical">${msg}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        ${phone
          ? `<a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank"
               style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;background:#25D366;color:var(--text);border-radius:10px;text-decoration:none;font-weight:600;font-size:.85rem">
               💬 ${LANG==='ar'?'فتح واتساب':'Open WhatsApp'}
             </a>`
          : `<div style="flex:1;text-align:center;font-size:.78rem;color:var(--amber);padding:12px">${LANG==='ar'?'لا يوجد رقم هاتف':'No phone number'}</div>`
        }
        <button onclick="document.getElementById('wa-modal').remove()"
          style="padding:12px 16px;background:var(--surf2);color:var(--text);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-family:inherit">
          ${LANG==='ar'?'إلغاء':'Cancel'}
        </button>
      </div>
    </div>`;
  modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
  document.body.appendChild(modal);
}

function sendWA(apt, room) { showWAModal(apt, room); }


window.showWAModal=showWAModal; window.sendWA=sendWA;
// ══ WA TEMPLATES ══

var WA_DEFAULT_AR = 'عزيزي {name}،\nنود تذكيركم بأن إيجار شقة {apt} غرفة {room} لشهر {month} {year} بمبلغ {amount} درهم لم يُسدَّد بعد.\nنرجو التكرم بالسداد في أقرب وقت.\nشكراً لتعاونكم 🙏';

var WA_DEFAULT_EN = 'Dear {name},\nThis is a reminder that the rent for Apartment {apt}, Room {room} for {month} {year}, amounting to AED {amount}, has not yet been paid.\nKindly make the payment today.\nThank you 🙏';

function getWATemplate(lang) {
  var key = lang === 'ar' ? 'wa_template_ar' : 'wa_template_en';
  var def = lang === 'ar' ? WA_DEFAULT_AR : WA_DEFAULT_EN;
  return localStorage.getItem(key) || def;
}

function buildWAMsg(lang, name, apt, room, month, year, amount) {
  return getWATemplate(lang)
    .replace(/{name}/g, name)
    .replace(/{apt}/g, apt)
    .replace(/{room}/g, room)
    .replace(/{month}/g, month)
    .replace(/{year}/g, year)
    .replace(/{amount}/g, Number(amount).toLocaleString());
}

function saveWATemplates() {
  var ar = document.getElementById('wa-template-ar');
  var en = document.getElementById('wa-template-en');
  if(ar) localStorage.setItem('wa_template_ar', ar.value);
  if(en) localStorage.setItem('wa_template_en', en.value);
  toast(LANG==='ar'?'✅ تم حفظ القوالب':'✅ Templates saved','ok');
}

function resetWATemplates() {
  localStorage.removeItem('wa_template_ar');
  localStorage.removeItem('wa_template_en');
  loadWATemplatesIntoSettings();
  toast(LANG==='ar'?'تمت إعادة التعيين':'Reset done','ok');
}

function loadWATemplatesIntoSettings() {
  var ar = document.getElementById('wa-template-ar');
  var en = document.getElementById('wa-template-en');
  if(ar) ar.value = getWATemplate('ar');
  if(en) en.value = getWATemplate('en');
}

window.saveWATemplates = saveWATemplates;

// ── إعادة إرسال إيصال موجود عبر واتساب ──
async function resendReceiptWA(r) {
  try {
    var { data: unit } = await sb.from('units')
      .select('phone,phone2,tenant_name,tenant_name2,language')
      .eq('apartment', r.apartment).eq('room', r.room).single();

    var phone = unit ? (unit.phone || unit.phone2 || '') : '';
    phone = (phone||'').replace(/\D/g,'');
    if(phone.startsWith('0')) phone = '971'+phone.slice(1);

    if(!phone) {
      toast(LANG==='ar'?'لا يوجد رقم هاتف لهذه الوحدة':'No phone number for this unit','err');
      return;
    }

    var isAR = (unit && unit.language==='ar') || r.lang==='ar' || r.lang!=='en';
    var msgLang = isAR ? 'ar' : 'en';
    var monthNames   = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var monthNamesEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var pm = (r.payment_month||'').slice(0,7);
    var pmYear  = pm ? Number(pm.slice(0,4)) : new Date().getFullYear();
    var pmMonth = pm ? Number(pm.slice(5,7))-1 : new Date().getMonth();
    var monthLabel = isAR ? monthNames[pmMonth] : monthNamesEN[pmMonth];

    var tenantName = r.tenant_name || (unit && unit.tenant_name) || (isAR?'المستأجر':'Tenant');
    var msg = buildWAMsg(msgLang, tenantName, r.apartment, r.room, monthLabel, pmYear, r.amount);
    msg += '\n\n'+(isAR?'رقم الإيصال':'Receipt No')+': '+r.receipt_no;

    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg), '_blank');
  } catch(e) {
    toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message, 'err');
  }
}
window.resendReceiptWA = resendReceiptWA;
window.resetWATemplates = resetWATemplates;
window.loadWATemplatesIntoSettings = loadWATemplatesIntoSettings;
window.buildWAMsg = buildWAMsg;
