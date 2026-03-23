// ══ WHATSAPP ══

function showWAModal(apt, room, tenantNum) {
  var unit = MO.find(u=>String(u.apartment)===String(apt)&&String(u.room)===String(room));
  if(!unit) { toast(LANG==='ar'?'الوحدة غير موجودة':'Unit not found','err'); return; }

  // Pick correct tenant based on tenantNum (1 or 2)
  var isT2 = tenantNum===2 && unit.tenant_name2;
  var tenantName = isT2 ? unit.tenant_name2 : (unit.tenant_name||'المستأجر');
  var tenantRent = isT2 ? (unit.rent2||unit.monthly_rent) : (unit.rent1||unit.monthly_rent);
  var rawPhone   = isT2 ? (unit.phone2||'') : (unit.phone||'');

  var phone = rawPhone.replace(/\D/g,'');
  if(phone.startsWith('0')) phone = '971'+phone.slice(1);

  var now = new Date();
  var monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var monthNamesEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var isAR = unit.language==='ar';
  var msg = isAR
    ? `عزيزي ${tenantName}، \nنود تذكيركم بأن إيجار شقة ${apt} غرفة ${room} لشهر ${monthNames[now.getMonth()]} ${now.getFullYear()} بمبلغ ${tenantRent} درهم لم يُسدَّد بعد.\nنرجو التكرم بالسداد في أقرب وقت.\nشكراً لتعاونكم 🙏`
    : `Dear ${tenantName},\nThis is a reminder that rent for Apartment ${apt}, Room ${room} for ${monthNamesEN[now.getMonth()]} ${now.getFullYear()} amounting to ${tenantRent} AED has not been paid.\nKindly settle the payment at your earliest convenience.\nThank you 🙏`;

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