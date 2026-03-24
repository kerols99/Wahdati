// ══ PAYMENTS ══

async function autoFillDepDate() {
  if(window._afdTimer) clearTimeout(window._afdTimer);
  window._afdTimer = setTimeout(async function() {
    var apt  = (document.getElementById('d-apt')||{}).value||'';
    var room = (document.getElementById('d-room')||{}).value||'';
    if(!apt || !room) return;
    var dateEl = document.getElementById('d-date');
    var nameEl = document.getElementById('d-name');

    // Remove old warning
    var oldWarn = document.getElementById('dep-dup-warn');
    if(oldWarn) oldWarn.remove();

    try {
      var { data: u } = await sb.from('units')
        .select('id,start_date,tenant_name')
        .eq('apartment', parseInt(apt)).eq('room', room).maybeSingle();
      if(!u) return;

      // Auto-fill date + name
      if(dateEl && !dateEl.value && u.start_date) dateEl.value = u.start_date.slice(0,10);
      if(nameEl && !nameEl.value && u.tenant_name) nameEl.value = u.tenant_name;

      // ── Check if deposit already exists ──
      if(u.id) {
        var { data: existing } = await sb.from('deposits')
          .select('id,amount,deposit_received_date,status')
          .eq('unit_id', u.id)
          .eq('status', 'held')
          .limit(1);

        if(existing && existing.length > 0) {
          var ex = existing[0];
          var warn = document.createElement('div');
          warn.id = 'dep-dup-warn';
          warn.style.cssText = 'background:var(--amber)22;border:1.5px solid var(--amber);'
            +'border-radius:10px;padding:10px 13px;margin-bottom:8px;font-size:.78rem';
          warn.innerHTML = '<div style="font-weight:700;color:var(--amber);margin-bottom:4px">'
            +'⚠️ تأمين مسجّل بالفعل لهذه الوحدة</div>'
            +'<div style="color:var(--muted)">المبلغ: <b style="color:var(--text)">'
            +ex.amount+' AED</b>'
            +(ex.deposit_received_date?' · تاريخ: <b style="color:var(--text)">'+ex.deposit_received_date.slice(0,10)+'</b>':'')
            +'</div>'
            +'<div style="color:var(--amber);margin-top:4px;font-size:.72rem">'
            +'تأكد إنك مش بتسجّل نفس التأمين مرتين</div>';

          // Insert warning before amount field
          var amtFld = document.getElementById('d-amt');
          if(amtFld && amtFld.parentNode && amtFld.parentNode.parentNode)
            amtFld.parentNode.parentNode.insertBefore(warn, amtFld.parentNode);
          else {
            var depPanel = document.getElementById('tDep');
            if(depPanel) depPanel.insertBefore(warn, depPanel.firstChild);
          }
        }
      }
    } catch(e) { /* silent */ }
  }, 400);
}

async function autoFillRent() {
  if(window._afTimer) clearTimeout(window._afTimer);
  window._afTimer = setTimeout(async function() {
    var apt  = (document.getElementById('r-apt')||{}).value||'';
    var room = (document.getElementById('r-room')||{}).value||'';
    if(!apt || !room) return;
    try {
      // Normalize room — try as-is first, then as integer
      var { data: unit } = await sb.from('units')
        .select('id,monthly_rent,rent1,rent2,tenant_name,tenant_name2,phone,phone2,language,start_date')
        .eq('apartment', parseInt(apt)).eq('room', room).maybeSingle();

      // If not found as string, try as integer
      if(!unit && !isNaN(room)) {
        var { data: unit2 } = await sb.from('units')
          .select('id,monthly_rent,rent1,rent2,tenant_name,tenant_name2,phone,phone2,language,start_date')
          .eq('apartment', parseInt(apt)).eq('room', parseInt(room)).maybeSingle();
        unit = unit2;
      }
      if(!unit) { console.log('autoFillRent: unit not found apt='+apt+' room='+room); return; }
      window._lastUnit = unit; // cache for receipt WhatsApp

      var amtEl   = document.getElementById('r-amt');
      var monEl   = document.getElementById('r-month');
      var pdateEl = document.getElementById('r-pdate');
      var badge   = document.getElementById('r-tenant-badge');

      // ── Auto-fill month ──
      if(monEl && !monEl.value) {
        var now = new Date();
        monEl.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
      }

      // ── Auto-fill receipt date ──
      if(pdateEl && !pdateEl.value) {
        pdateEl.value = new Date().toISOString().slice(0,10);
      }

      if(unit.tenant_name2) {
        // Two tenants — show buttons to pick who pays
        if(badge) {
          badge.style.display = 'block';
          badge.innerHTML =
            '<div style="margin-bottom:6px;font-size:.78rem;color:var(--muted)">👥 اختر من يدفع:</div>'
            +'<div style="display:flex;gap:8px">'
          badge.style.display = 'block';
          var t1amt = unit.rent1||unit.monthly_rent||0;
          var t2amt = unit.rent2||0;
          var t1name = escapeHtml(unit.tenant_name||'—');
          var t2name = escapeHtml(unit.tenant_name2||'—');
          badge.innerHTML =
            '<div style="margin-bottom:6px;font-size:.78rem;color:var(--muted)">👥 اختر من يدفع:</div>'
            +'<div style="display:flex;gap:8px">'
            +'<button type="button" onclick="setPayTenant(1,this)" data-apt="'+apt+'" data-room="'+room+'" data-amt="'+t1amt+'" data-name="'+t1name+'" '
            +'style="flex:1;padding:8px;background:var(--surf);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font);font-size:.78rem;font-weight:600;cursor:pointer">'
            +'👤 '+t1name+'<div style="font-size:.7rem;color:var(--accent)">'+t1amt+' AED</div></button>'
            +'<button type="button" onclick="setPayTenant(2,this)" data-apt="'+apt+'" data-room="'+room+'" data-amt="'+t2amt+'" data-name="'+t2name+'" '
            +'style="flex:1;padding:8px;background:var(--surf);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font);font-size:.78rem;font-weight:600;cursor:pointer">'
            +'👤 '+t2name+'<div style="font-size:.7rem;color:var(--accent)">'+t2amt+' AED</div></button>'
            +'</div>';
        }
        // Fill with total rent by default
        if(amtEl) amtEl.value = unit.monthly_rent || '';
      } else {
        // Single tenant — auto-fill amount always
        var fillAmt = unit.monthly_rent || unit.rent1 || 0;
        if(amtEl) {
          amtEl.value = fillAmt;
          amtEl.style.borderColor = 'var(--green)';
          setTimeout(function(){ amtEl.style.borderColor=''; }, 1500);
        }
        if(badge) {
          if(unit.tenant_name) {
            badge.style.display = 'block';
            badge.innerHTML = '<span style="font-size:.78rem">👤 <b>'+escapeHtml(unit.tenant_name)+'</b>'
              +'<span style="color:var(--green);margin-right:8px;font-weight:700"> — '+fillAmt+' AED</span></span>';
          } else {
            badge.style.display = 'none';
          }
        }
        if(amtEl) { amtEl.focus(); amtEl.select(); }
      }
    } catch(e) { console.error('autoFillRent:', e); }
  }, 400);
}

async function saveRent(btn) {
  if(MY_ROLE==='viewer'){toast(LANG==='ar'?'ليس لديك صلاحية':'No permission','err');return;}
  var apt  = document.getElementById('r-apt').value.trim();
  var room = document.getElementById('r-room').value.trim();
  var amt  = Number(document.getElementById('r-amt').value||0);
  var mon  = document.getElementById('r-month').value;
  if(!apt||!room||!amt||!mon){toast(LANG==='ar'?'كل الحقول إلزامية':'All fields required','err');return;}

  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var { data: unit } = await sb.from('units')
      .select('id,language,phone,phone2,tenant_name')
      .eq('apartment', parseInt(apt)).eq('room', room).maybeSingle();
    if(!unit && !isNaN(room)) {
      var { data: unit2 } = await sb.from('units')
        .select('id,language,phone,phone2,tenant_name')
        .eq('apartment', parseInt(apt)).eq('room', parseInt(room)).maybeSingle();
      unit = unit2;
    }
    if(!unit) throw new Error(LANG==='ar'?'الوحدة غير موجودة':'Unit not found');

    var tNum = Number(document.getElementById('r-tenant-num').value||0);
    var pdateVal = document.getElementById('r-pdate').value;
    var paymentDate = pdateVal || new Date().toISOString().split('T')[0];
    // RULE: always save BOTH fields
    // payment_month = when rent is DUE (accrual basis)
    // payment_date  = when cash was RECEIVED (cash basis)
    var meth = document.getElementById('r-meth').value;
    var { data: payInserted, error } = await sb.from('rent_payments').insert({
      unit_id: unit.id,
      apartment: apt,
      room: room,
      amount: amt,
      amount_paid: amt,
      payment_month: mon,
      payment_date: paymentDate,
      payment_method: meth,
      received_by: ME?.id||null,
      tenant_num: tNum||null,
      notes: document.getElementById('r-notes').value.trim()||null,
    }).select('id').single();
    if(error) throw error;

    // حفظ الإيصال في DB مربوطاً بالدفعة
    var rcptNo = 'W-' + Date.now().toString().slice(-6);
    await sb.from('receipts').insert({
      receipt_no:     rcptNo,
      payment_id:     payInserted?.id || null,
      unit_id:        unit.id,
      apartment:      apt,
      room:           room,
      tenant_name:    (unit.tenant_name || '').split(' ')[0] || '',
      amount:         amt,
      payment_month:  (mon||'').slice(0,7),
      payment_date:   paymentDate,
      payment_method: meth,
      lang:           unit.language || 'ar',
    });

    toast(LANG==='ar'?'تم تسجيل الدفعة ✓':'Payment recorded ✓','ok');
    // Remember last used unit for quick next entry
    try{ localStorage.setItem('lastPayApt', apt); localStorage.setItem('lastPayRoom', room); }catch(e){}
    // Show receipt option
    var tenantName = document.getElementById('r-tenant-badge') ? (document.getElementById('r-tenant-badge').textContent||'').replace('👤 ','') : '';
    window._lastReceipt = {apt:apt, room:room, amount:amt, month:mon, date:paymentDate,
      payment_method: meth,
      tenant: tenantName || unit.tenant_name || '',
      phone: unit.phone || unit.phone2 || '',
      lang: unit.language || 'ar',
      receiptNo: rcptNo
    };
    var rc = document.getElementById('receipt-toast');
    if(!rc) {
      rc = document.createElement('div');
      rc.id = 'receipt-toast';
      rc.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--surf2);border:1px solid var(--border);border-radius:14px;padding:10px 16px;display:flex;align-items:center;gap:10px;z-index:999;box-shadow:var(--shadow);font-family:var(--font)';
      document.body.appendChild(rc);
    }
    var rcLabel = LANG==='ar'?'إيصال؟':'Receipt?';
    var rcPrint  = LANG==='ar'?'طباعة':'Print';
    rc.innerHTML = '<span style="font-size:.8rem">🧾 '+rcLabel+'</span>'
      +'<button onclick="printPaymentReceipt();document.getElementById(\'receipt-toast\').style.display=\'none\'" style="padding:5px 12px;background:var(--accent);border:none;border-radius:8px;color:#fff;font-family:var(--font);font-size:.75rem;font-weight:700;cursor:pointer">🖨️ '+rcPrint+'</button>'
      +'<button onclick="openReceiptSearch()" style="padding:5px 10px;background:var(--surf3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:.75rem;cursor:pointer">🔍</button>'
      +'<button onclick="document.getElementById(\'receipt-toast\').style.display=\'none\'" style="padding:5px 10px;background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-family:var(--font);font-size:.75rem;cursor:pointer">✕</button>';
    rc.style.display='flex';
    setTimeout(function(){ if(rc) rc.style.display='none'; }, 8000);
    document.getElementById('r-amt').value='';
    document.getElementById('r-notes').value='';
    document.getElementById('r-pdate').value='';
    // Keep apt/room for faster next entry — user can change if needed
    // document.getElementById('r-apt').value='';    // KEPT for speed
    // document.getElementById('r-room').value='';   // KEPT for speed
    document.getElementById('r-tenant-num').value='0';
    var badge=document.getElementById('r-tenant-badge'); if(badge){badge.style.display='none';badge.textContent='';}
    // Re-trigger autofill for same unit to refresh month/amount
    if(window.autoFillRent) setTimeout(autoFillRent, 100);
    // Remove duplicate deposit warning if present
    var dw=document.getElementById('dep-dup-warn'); if(dw) dw.remove();
    // Auto-focus apt field for next quick entry
    setTimeout(function(){ var a=document.getElementById('r-apt'); if(a) a.focus(); }, 100);
    loadHome(null,true);
  } catch(e){ toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

async function saveExp(btn) {
  if(MY_ROLE==='collector'||MY_ROLE==='viewer'){toast(LANG==='ar'?'ليس لديك صلاحية':'No permission','err');return;}
  var amt = Number(document.getElementById('e-amt').value||0);
  var mon = document.getElementById('e-month').value;
  if(!amt||!mon){toast(LANG==='ar'?'المبلغ والشهر إلزاميان':'Amount and month required','err');return;}

  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var { error } = await sb.from('expenses').insert({
      category: document.getElementById('e-cat').value,
      amount: amt, period_month: (mon||'').slice(0,7)+'-01',
      receipt_no: document.getElementById('e-rec').value.trim()||null,
      description: document.getElementById('e-desc').value.trim()||null,
    });
    if(error) throw error;
    toast(LANG==='ar'?'تم تسجيل المصروف ✓':'Expense recorded ✓','ok');
    document.getElementById('e-amt').value='';
    document.getElementById('e-rec').value='';
    document.getElementById('e-desc').value='';
  } catch(e){ toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

async function calcOwnerBalance() {
  var monEl = document.getElementById('o-month');
  // Auto-fill current month if empty
  if(monEl && !monEl.value) {
    var now = new Date();
    monEl.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  var mon = monEl ? monEl.value : '';
  if(!mon) return;

  var wrap    = document.getElementById('o-balance-wrap');
  var display = document.getElementById('o-balance-display');
  var detail  = document.getElementById('o-balance-detail');
  if(!wrap) return;

  display.textContent = '⏳ ...';
  wrap.style.display = 'block';

  try {
    var monYM = mon.slice(0,7);

    // Fetch rent payments this month
    var { data: pays } = await sb.from('rent_payments')
      .select('amount').gte('payment_date', monYM+'-01').lte('payment_date', monthEnd(monYM));

    // RULE: deposit cash = deposit_received_date (cash basis, NOT start_date)
    var { data: deps } = await sb.from('deposits')
      .select('amount,deposit_received_date,status,tenant_name,apartment,room,refund_date')
      .gte('deposit_received_date', monYM+'-01')
      .lte('deposit_received_date', monthEnd(monYM));

    // المُرتجعات في هذا الشهر (refund_date في الشهر الحالي)
    var { data: refundedDeps } = await sb.from('deposits')
      .select('amount,deposit_received_date,status,tenant_name,apartment,room,refund_date')
      .eq('status','refunded')
      .gte('refund_date', monYM+'-01')
      .lte('refund_date', monthEnd(monYM));
    refundedDeps = refundedDeps || [];

    var totalDepsIn  = (deps||[]).filter(function(d){ return d.status !== 'refunded'; })
      .reduce(function(s,d){ return s+(Number(d.amount)||0); }, 0);
    var totalRefunds = refundedDeps.reduce(function(s,d){ return s+(Number(d.amount)||0); }, 0);
    var totalDeps    = totalDepsIn;  // للـ KPI cards (تأمينات مستلمة)

    // Fetch expenses this month
    var { data: exps } = await sb.from('expenses')
      .select('amount').eq('period_month', (monYM||'').slice(0,7)+'-01');

    // Fetch owner payments already recorded this month
    var { data: prevOwn } = await sb.from('owner_payments')
      .select('amount').eq('period_month', (monYM||'').slice(0,7)+'-01');

    var totalRent = (pays||[]).reduce(function(s,p){return s+(p.amount||0);},0);
    var totalExp  = (exps||[]).reduce(function(s,e){return s+(e.amount||0);},0);
    var prevPaid  = (prevOwn||[]).reduce(function(s,o){return s+(o.amount||0);},0);
    var available = totalRent + totalDeps - totalRefunds - totalExp - prevPaid;

    display.textContent = available.toLocaleString() + ' AED';
    display.style.color = available > 0 ? 'var(--green)' : 'var(--red)';
    detail.innerHTML =
      '🏠 إيجار محصّل: <b>'+totalRent.toLocaleString()+'</b>'
      +(totalDeps>0?' &nbsp;|&nbsp; 🔒 تأمين: <b>'+totalDeps.toLocaleString()+'</b>':'')
      +(totalExp>0?' &nbsp;|&nbsp; 📤 مصاريف: <b>-'+totalExp.toLocaleString()+'</b>':'')
      +(prevPaid>0?' &nbsp;|&nbsp; ✅ حُوِّل للمالك: <b>-'+prevPaid.toLocaleString()+'</b>':'');

    // Auto-fill amount if empty
    var amtEl = document.getElementById('o-amt');
    if(amtEl && !amtEl.value && available > 0) amtEl.value = available;

  } catch(e) {
    display.textContent = '—';
    console.error('calcOwnerBalance:', e);
  }
}

async function saveOwner(btn) {
  if(MY_ROLE==='collector'||MY_ROLE==='viewer'){toast(LANG==='ar'?'ليس لديك صلاحية':'No permission','err');return;}
  var amt = Number(document.getElementById('o-amt').value||0);
  var mon = document.getElementById('o-month').value;
  if(!amt||!mon){toast(LANG==='ar'?'المبلغ والشهر إلزاميان':'Amount and month required','err');return;}

  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var { error } = await sb.from('owner_payments').insert({
      amount: amt, period_month: (mon||'').slice(0,7)+'-01',
      payment_date: new Date().toISOString().slice(0,10),
      method: document.getElementById('o-meth').value,
      reference: document.getElementById('o-ref').value.trim()||null,
      notes: document.getElementById('o-notes').value.trim()||null,
    });
    if(error) throw error;
    toast(LANG==='ar'?'تم تسجيل الدفعة للمالك ✓':'Owner payment recorded ✓','ok');
    document.getElementById('o-amt').value='';
    document.getElementById('o-ref').value='';
    document.getElementById('o-notes').value='';
  } catch(e){ toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

async function saveDep(btn) {
  if(MY_ROLE==='viewer'){toast(LANG==='ar'?'ليس لديك صلاحية':'No permission','err');return;}
  var apt  = document.getElementById('d-apt').value.trim();
  var room = document.getElementById('d-room').value.trim();
  var amt  = Number(document.getElementById('d-amt').value||0);
  if(!apt||!room||!amt){toast(LANG==='ar'?'الشقة والغرفة والمبلغ إلزامية':'All fields required','err');return;}

  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var { data: unit } = await sb.from('units').select('id').eq('apartment',apt).eq('room',room).single();
    if(!unit) throw new Error(LANG==='ar'?'الوحدة غير موجودة':'Unit not found');

    // deposit_received_date: MUST be entered by user explicitly
    // Fallback order: user-entered date → unit.start_date → null
    // NEVER use today or created_at as financial date
    var enteredDate = document.getElementById('d-date') ? document.getElementById('d-date').value.trim() : '';
    if(!enteredDate) {
      // Try to get start_date from unit as fallback
      var { data: unitFull } = await sb.from('units').select('start_date').eq('id', unit.id).single();
      enteredDate = (unitFull && unitFull.start_date) ? unitFull.start_date.slice(0,10) : '';
    }
    if(!enteredDate) {
      toast(LANG==='ar'?'يرجى إدخال تاريخ الاستلام':'Please enter received date','err');
      btn.disabled=false; btn.innerHTML=orig; return;
    }
    var receivedDate = enteredDate;

    // RULE: deposit_received_date = when cash was received
    // Never use today/created_at as default — user must enter or it comes from start_date
    // CHECK for duplicate — same unit + same amount + same date
    var { data: existing } = await sb.from('deposits')
      .select('id')
      .eq('unit_id', unit.id)
      .eq('amount', amt)
      .eq('deposit_received_date', receivedDate)
      .limit(1);

    if(existing && existing.length > 0) {
      toast(LANG==='ar'?'⚠️ هذا التأمين مسجّل بالفعل بنفس المبلغ والتاريخ':'⚠️ Deposit already exists with same amount and date','err');
      btn.disabled=false; btn.innerHTML=orig; return;
    }

    var { error } = await sb.from('deposits').insert({
      unit_id: unit.id,
      apartment: apt,
      room: room,
      tenant_name: document.getElementById('d-name').value.trim()||null,
      amount: amt,
      status: document.getElementById('d-status').value,
      refund_amount: Number(document.getElementById('d-ref').value||0),
      deduction_amount: Number(document.getElementById('d-ded').value||0),
      deduction_reason: document.getElementById('d-why').value.trim()||null,
      notes: document.getElementById('d-notes').value.trim()||null,
      deposit_received_date: receivedDate,
    });
    if(error) throw error;
    toast(LANG==='ar'?'تم تسجيل التأمين ✓':'Deposit recorded ✓','ok');
    // Clear form for next entry
    ['d-apt','d-room','d-amt','d-name','d-date','d-ref','d-ded','d-why','d-notes'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.value='';
    });
    var stEl=document.getElementById('d-status'); if(stEl) stEl.value='held';
    var dw=document.getElementById('dep-dup-warn'); if(dw) dw.remove();
    setTimeout(function(){ var a=document.getElementById('d-apt'); if(a) a.focus(); }, 100);
  } catch(e){ toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

function setPayTenant(num, btnOrApt, roomOrUndef, amtOrUndef, nameOrUndef, evt) {
  // Supports both old call signature and new data-attribute buttons
  var apt, room, amt, name;
  if(typeof btnOrApt === 'object' && btnOrApt && btnOrApt.dataset) {
    // New: called with (num, btn)
    apt  = btnOrApt.dataset.apt;
    room = btnOrApt.dataset.room;
    amt  = btnOrApt.dataset.amt;
    name = btnOrApt.dataset.name;
  } else {
    // Old: called with (num, apt, room, amt, name, evt)
    apt  = btnOrApt;
    room = roomOrUndef;
    amt  = amtOrUndef;
    name = nameOrUndef;
  }
  goPanel('pay');
  // Wait for panel to render before setting values
  setTimeout(function(){
    var aptEl = document.getElementById('r-apt'); if(aptEl) aptEl.value = apt;
    var roomEl = document.getElementById('r-room'); if(roomEl) roomEl.value = room;
    var tnEl = document.getElementById('r-tenant-num'); if(tnEl) tnEl.value = num;
    var amtEl = document.getElementById('r-amt'); if(amt && amtEl) amtEl.value = amt;
    var badge = document.getElementById('r-tenant-badge');
    if(badge) {
      if(num > 0 && name) {
        badge.textContent = '👤 ' + (LANG==='ar'?'المستأجر: ':'Tenant: ') + name;
        badge.style.display = 'block';
        badge.style.borderRight = '3px solid ' + (num===1?'var(--accent)':'var(--amber)');
        badge.style.color = num===1?'var(--accent)':'var(--amber)';
      } else {
        badge.style.display = 'none';
      }
    }
  }, 50);
}

function askWhoPayment(unitId, apt, room, unit) {
  if(!unit) unit = MO.find(u=>u.id===unitId);
  if(!unit) return;

  var t1 = unit.tenant_name || (LANG==='ar'?'المستأجر الأول':'Tenant 1');
  var t2 = unit.tenant_name2 || (LANG==='ar'?'المستأجر الثاني':'Tenant 2');
  var r1 = unit.rent1 || 0;
  var r2 = unit.rent2 || 0;

  // Replace drawer content with who-selection screen (no modal)
  var dc = document.getElementById('drawerContent');
  if(!dc) return;

  dc.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'padding:8px 0';

  var title = document.createElement('div');
  title.style.cssText = 'font-size:1.1rem;font-weight:700;margin-bottom:6px;text-align:right';
  title.textContent = '💰 ' + (LANG==='ar'?'تسجيل دفعة':'Record Payment');

  var sub = document.createElement('div');
  sub.style.cssText = 'font-size:.82rem;color:var(--muted);margin-bottom:20px;text-align:right';
  sub.textContent = LANG==='ar'?'اختر المستأجر:':'Select tenant:';

  var btn1 = document.createElement('button');
  btn1.style.cssText = 'width:100%;padding:16px;margin-bottom:10px;background:var(--surf2);border:2px solid var(--accent);border-radius:14px;color:var(--text);font-family:inherit;font-size:1rem;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;align-items:center;-webkit-tap-highlight-color:transparent';
  btn1.innerHTML = '<span style="color:var(--text)">👤 '+t1+'</span><span style="color:var(--accent);font-weight:800">'+r1+' AED</span>';

  var btn2 = document.createElement('button');
  btn2.style.cssText = 'width:100%;padding:16px;margin-bottom:10px;background:var(--surf2);border:2px solid var(--amber);border-radius:14px;color:var(--text);font-family:inherit;font-size:1rem;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;align-items:center;-webkit-tap-highlight-color:transparent';
  btn2.innerHTML = '<span style="color:var(--text)">👤 '+t2+'</span><span style="color:var(--amber);font-weight:800">'+r2+' AED</span>';

  var btnM = document.createElement('button');
  btnM.style.cssText = 'width:100%;padding:14px;margin-bottom:10px;background:none;border:1px solid var(--border);border-radius:14px;color:var(--muted);font-family:inherit;font-size:.9rem;cursor:pointer;-webkit-tap-highlight-color:transparent';
  btnM.textContent = LANG==='ar'?'إدخال يدوي':'Manual Entry';

  var btnBack = document.createElement('button');
  btnBack.style.cssText = 'width:100%;padding:12px;background:none;border:none;color:var(--muted);font-family:inherit;font-size:.85rem;cursor:pointer;-webkit-tap-highlight-color:transparent';
  btnBack.textContent = '← ' + (LANG==='ar'?'رجوع':'Back');

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(btn1);
  wrap.appendChild(btn2);
  wrap.appendChild(btnM);
  wrap.appendChild(btnBack);
  dc.appendChild(wrap);

  btn1.onclick = function(){ closeDrawer(); goPanel('pay'); setTimeout(function(){ document.getElementById('r-apt').value=apt; document.getElementById('r-room').value=room; document.getElementById('r-tenant-num').value='1'; var b=document.getElementById('r-tenant-badge'); if(b){b.textContent='👤 '+t1;b.style.display='block';b.style.color='var(--accent)';} if(r1){document.getElementById('r-amt').value=r1;} },80); };
  btn2.onclick = function(){ closeDrawer(); goPanel('pay'); setTimeout(function(){ document.getElementById('r-apt').value=apt; document.getElementById('r-room').value=room; document.getElementById('r-tenant-num').value='2'; var b=document.getElementById('r-tenant-badge'); if(b){b.textContent='👤 '+t2;b.style.display='block';b.style.color='var(--amber)';} if(r2){document.getElementById('r-amt').value=r2;} },80); };
  btnM.onclick = function(){ closeDrawer(); goPanel('pay'); setTimeout(function(){ document.getElementById('r-apt').value=apt; document.getElementById('r-room').value=room; document.getElementById('r-tenant-num').value='0'; },80); };
  btnBack.onclick = function(){ openDrawer(unitId); };
}

function askWhoWA(apt, room, unit) {
  if(!unit) unit = MO.find(u=>String(u.apartment)===String(apt)&&String(u.room)===String(room));
  if(!unit) return;

  var dc = document.getElementById('drawerContent');
  if(!dc) return;
  dc.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'padding:8px 0';

  var title = document.createElement('div');
  title.style.cssText = 'font-size:1.1rem;font-weight:700;margin-bottom:6px;text-align:right';
  title.textContent = '💬 WhatsApp';

  var sub = document.createElement('div');
  sub.style.cssText = 'font-size:.82rem;color:var(--muted);margin-bottom:20px;text-align:right';
  sub.textContent = LANG==='ar'?'ابعت لمين؟':'Send to who?';

  var btn1 = document.createElement('button');
  btn1.style.cssText = 'width:100%;padding:16px;margin-bottom:10px;background:var(--surf2);border:2px solid var(--accent);border-radius:14px;color:var(--text);font-family:inherit;font-size:1rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent';
  btn1.textContent = '👤 '+(unit.tenant_name||'المستأجر الأول');

  var btn2 = document.createElement('button');
  btn2.style.cssText = 'width:100%;padding:16px;margin-bottom:10px;background:var(--surf2);border:2px solid var(--amber);border-radius:14px;color:var(--text);font-family:inherit;font-size:1rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent';
  btn2.textContent = '👤 '+(unit.tenant_name2||'المستأجر الثاني');

  var btnBack = document.createElement('button');
  btnBack.style.cssText = 'width:100%;padding:12px;background:none;border:none;color:var(--muted);font-family:inherit;font-size:.85rem;cursor:pointer;-webkit-tap-highlight-color:transparent';
  btnBack.textContent = '← '+(LANG==='ar'?'رجوع':'Back');

  wrap.appendChild(title);
  wrap.appendChild(sub);
  wrap.appendChild(btn1);
  wrap.appendChild(btn2);
  wrap.appendChild(btnBack);
  dc.appendChild(wrap);

  btn1.onclick = function(){ showWAModal(apt, room, 1); };
  btn2.onclick = function(){ showWAModal(apt, room, 2); };
  btnBack.onclick = function(){ openDrawer(unit.id); };
}

async function togglePayHistory(unitId) {
  try {
    var container = document.getElementById('pay-history');
    var btn = document.getElementById('drawer-hist-btn');
    if(!container || !btn) return;

    if(container.style.display !== 'none') {
      container.style.display = 'none';
      btn.textContent = LANG==='ar'?'📋 السجل الكامل':'📋 Full History';
      return;
    }

    btn.textContent = '⏳ ...';

    // Fetch both: rent payments + tenant history in parallel
    var [paysRes, histRes] = await Promise.all([
      // Payment history: order by actual receipt date
      sb.from('rent_payments').select('*').eq('unit_id', unitId).order('payment_date', {ascending:false}),
      sb.from('unit_history').select('*').eq('unit_id', unitId).order('end_date', {ascending:false})
    ]);

    var pays = paysRes.data || [];
    var hist = histRes.data || [];

    var html = '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:12px">';

    // ── Section 1: Previous Tenants ──
    if(hist.length > 0) {
      html += '<div style="font-size:.68rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">👥 '+(LANG==='ar'?'المستأجرون السابقون':'Previous Tenants')+'</div>';
      hist.forEach(function(h) {
        var startStr = h.start_date ? h.start_date.slice(0,10) : '—';
        var endStr   = h.end_date   ? h.end_date.slice(0,10)   : '—';
        var name     = h.tenant_name || '—';
        var name2    = h.tenant_name2 ? ' & '+h.tenant_name2 : '';
        html += '<div style="background:var(--surf2);border-radius:10px;padding:10px 12px;margin-bottom:6px;border-right:3px solid var(--muted)">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
          + '<div>'
          + '<div style="font-weight:700;font-size:.85rem;color:var(--text)">'+name+name2+'</div>'
          + (h.phone?'<div style="font-size:.7rem;color:var(--muted)">📞 '+h.phone+'</div>':'')
          + '</div>'
          + '<div style="text-align:end;font-size:.7rem;color:var(--muted)">'
          + '<div>دخل: '+startStr+'</div>'
          + '<div>غادر: '+endStr+'</div>'
          + '</div>'
          + '</div>'
          + '<div style="display:flex;gap:12px;margin-top:6px;font-size:.72rem;color:var(--muted)">'
          + '<span>💰 '+(h.monthly_rent||0)+' AED</span>'
          + (h.deposit?'<span>🔒 '+h.deposit+' AED <span style="font-size:.6rem;color:var(--muted)">(مرجعي)</span></span>':'')
          + (h.persons_count?'<span>👤 '+h.persons_count+'</span>':'')
          + '</div>'
          + '</div>';
      });
      html += '<div style="height:1px;background:var(--border);margin:12px 0"></div>';
    }

    // ── Section 2: Payment History ──
    html += '<div style="font-size:.68rem;color:var(--green);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">💳 '+(LANG==='ar'?'سجل الدفعات':'Payment History')+'</div>';

    if(pays.length === 0) {
      html += '<div style="text-align:center;padding:12px;color:var(--muted);font-size:.8rem">'+(LANG==='ar'?'لا توجد دفعات':'No payments')+'</div>';
    } else {
      pays.forEach(function(p) {
        var mon    = p.payment_month ? p.payment_month.slice(0,7) : '—';
        var amt    = p.amount || p.amount_paid || 0;
        var method = p.payment_method || '—';
        var notes  = p.notes || '';
        var pdate  = p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB') : '';
        html += '<div style="background:var(--surf2);border-radius:10px;padding:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
          + '<div>'
          + '<div style="font-weight:700;font-size:.85rem;color:var(--green)">'+amt+' AED</div>'
          + '<div style="font-size:.7rem;color:var(--muted)">'+mon+' · '+method+(pdate?' · 📅 '+pdate:'')+'</div>'
          + (notes?'<div style="font-size:.7rem;color:var(--muted);margin-top:2px">'+notes+'</div>':'')
          + '</div>'
          + '<div style="display:flex;gap:6px">'
          + '<button onclick="editPayment(\'' + p.id + '\',\'' + unitId + '\')" style="padding:6px 10px;background:var(--accent)22;border:1px solid var(--accent);border-radius:8px;color:var(--accent);font-size:.72rem;cursor:pointer;font-family:inherit">✏️</button>'
          + '<button onclick="deletePayment(\'' + p.id + '\',\'' + unitId + '\')" style="padding:6px 10px;background:var(--red)22;border:1px solid var(--red);border-radius:8px;color:var(--red);font-size:.72rem;cursor:pointer;font-family:inherit">🗑️</button>'
          + '</div>'
          + '</div>';
      });
    }

    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
    btn.textContent = LANG==='ar'?'📋 إخفاء السجل':'📋 Hide History';
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('togglePayHistory:', e); }
}

async function editPayment(payId, unitId) {
  try {
  var modal = document.createElement('div');
    modal.id = 'edit-pay-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:flex-end;justify-content:center;padding:16px';
  
    // Fetch payment
    var { data: p } = await sb.from('rent_payments').select('*').eq('id', payId).single();
    if(!p) { toast(LANG==='ar'?'لم يتم العثور على الدفعة':'Payment not found','err'); return; }
  
    var mon = p.payment_month ? p.payment_month.slice(0,7) : '';
    var amt = p.amount || p.amount_paid || 0;
  
    modal.innerHTML = `
      <div style="background:var(--surf);border-radius:20px;padding:20px;width:100%;max-width:480px">
        <div style="font-weight:700;font-size:1rem;margin-bottom:16px">✏️ ${LANG==='ar'?'تعديل الدفعة':'Edit Payment'}</div>
        <div class="fld"><label>${LANG==='ar'?'المبلغ (AED)':'Amount (AED)'}</label>
          <input class="inp" id="ep-amt" type="number" inputmode="numeric" value="${amt}">
        </div>
        <div class="fld"><label>${LANG==='ar'?'الشهر':'Month'}</label>
          <input class="inp" id="ep-mon" type="month" value="${mon}">
        </div>
        <div class="fld"><label>${LANG==='ar'?'تاريخ الاستلام':'Receipt Date'}</label>
          <input class="inp" id="ep-pdate" type="date" value="${p.payment_date?p.payment_date.slice(0,10):''}">
        </div>
        <div class="fld"><label>${LANG==='ar'?'طريقة الدفع':'Method'}</label>
          <select class="inp" id="ep-meth">
            <option value="Cash" ${p.payment_method==='Cash'?'selected':''}>نقدي</option>
            <option value="Bank Transfer" ${p.payment_method==='Bank Transfer'?'selected':''}>تحويل بنكي</option>
            <option value="Cheque" ${p.payment_method==='Cheque'?'selected':''}>شيك</option>
          </select>
        </div>
        <div class="fld"><label>${LANG==='ar'?'ملاحظات':'Notes'}</label>
          <input class="inp" id="ep-notes" value="${p.notes||''}">
        </div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button onclick="saveEditPayment('${payId}','${unitId}')"
            style="flex:1;padding:13px;background:var(--accent);border:none;border-radius:12px;color:var(--text);font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer">
            ${LANG==='ar'?'حفظ':'Save'}
          </button>
          <button onclick="document.getElementById('edit-pay-modal').remove()"
            style="padding:13px 18px;background:var(--surf2);border:1px solid var(--border);border-radius:12px;color:var(--muted);font-family:inherit;cursor:pointer">
            ${LANG==='ar'?'إلغاء':'Cancel'}
          </button>
        </div>
      </div>`;
    modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('editPayment:', e); }
}

async function saveEditPayment(payId, unitId) {
  try {
  var amt  = Number(document.getElementById('ep-amt').value||0);
    var mon  = document.getElementById('ep-mon').value;
    var meth = document.getElementById('ep-meth').value;
    var notes= document.getElementById('ep-notes').value.trim()||null;
    if(!amt||!mon){ toast(LANG==='ar'?'المبلغ والشهر إلزاميان':'Amount and month required','err'); return; }
  
    var pdateEl = document.getElementById('ep-pdate');
    var pdate = pdateEl ? pdateEl.value : null;
    var { error } = await sb.from('rent_payments').update({
      amount: amt, amount_paid: amt,
      payment_month: mon,
      payment_date: pdate||null,
      payment_method: meth,
      notes: notes
    }).eq('id', payId);
  
    if(error){ toast((LANG==='ar'?'خطأ: ':'Error: ')+error.message,'err'); return; }
    toast(LANG==='ar'?'تم التعديل ✓':'Updated ✓','ok');
    document.getElementById('edit-pay-modal').remove();
    togglePayHistory(unitId); // refresh
    togglePayHistory(unitId); // toggle back open
    loadHome(null,true);
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('saveEditPayment:', e); }
}

async function deletePayment(payId, unitId) {
  try {
  if(!confirm(LANG==='ar'?'هل تريد حذف هذه الدفعة؟':'Delete this payment?')) return;
    // حذف الإيصال المرتبط أولاً
    await sb.from('receipts').delete().eq('payment_id', payId);
    var { error } = await sb.from('rent_payments').delete().eq('id', payId);
    if(error){ toast((LANG==='ar'?'خطأ: ':'Error: ')+error.message,'err'); return; }
    toast(LANG==='ar'?'تم الحذف ✓':'Deleted ✓','ok');
    togglePayHistory(unitId);
    togglePayHistory(unitId);
    loadHome(null,true);
    loadUnits();
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('deletePayment:', e); }
}



// ══ DEPOSIT EDIT / DELETE ══

async function editDeposit(depId) {
  try {
    var { data: d } = await sb.from('deposits').select('*').eq('id', depId).single();
    if(!d) { toast(LANG==='ar'?'لم يتم العثور على التأمين':'Deposit not found','err'); return; }

    var modal = document.createElement('div');
    modal.id = 'edit-dep-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:flex-end;justify-content:center;padding:16px';

    var rdVal = (d.deposit_received_date||'').slice(0,10);
    var curAmt = d.amount||0;

    modal.innerHTML = '<div style="background:var(--surf);border-radius:20px;padding:20px;width:100%;max-width:480px">'
      + '<div style="font-weight:700;font-size:1rem;margin-bottom:16px">✏️ '+(LANG==='ar'?'تعديل التأمين':'Edit Deposit')+'</div>'
      + '<div class="fld"><label>'+(LANG==='ar'?'المبلغ (AED)':'Amount (AED)')+'</label>'
      + '<input class="inp" id="ed-amt" type="number" inputmode="numeric" value="'+curAmt+'"></div>'
      + '<div class="fld"><label>'+(LANG==='ar'?'تاريخ الاستلام':'Received Date')+'</label>'
      + '<input class="inp" id="ed-date" type="date" value="'+rdVal+'"></div>'
      + '<div class="fld"><label>'+(LANG==='ar'?'الحالة':'Status')+'</label>'
      + '<select class="inp" id="ed-status">'
      + '<option value="held"'+(d.status==='held'?' selected':'')+'>محتجز</option>'
      + '<option value="refunded"'+(d.status==='refunded'?' selected':'')+'>مُرتجع</option>'
      + '<option value="forfeited"'+(d.status==='forfeited'?' selected':'')+'>مُصادر</option>'
      + '</select></div>'
      + '<div class="fld"><label>'+(LANG==='ar'?'ملاحظات':'Notes')+'</label>'
      + '<input class="inp" id="ed-notes" value="'+(d.notes||'')+'" placeholder="'+(LANG==='ar'?'اختياري':'Optional')+'"></div>'
      + '<div style="display:flex;gap:8px;margin-top:16px">'
      + '<button onclick="saveEditDeposit(\'' + depId + '\')" style="flex:1;padding:13px;background:var(--accent);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer">'+(LANG==='ar'?'حفظ':'Save')+'</button>'
      + '<button onclick="document.getElementById(\'edit-dep-modal\').remove()" style="padding:13px 18px;background:var(--surf2);border:1px solid var(--border);border-radius:12px;color:var(--muted);font-family:inherit;cursor:pointer">'+(LANG==='ar'?'إلغاء':'Cancel')+'</button>'
      + '</div>'
      + '</div>';

    modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e){ toast('خطأ: '+e.message,'err'); }
}

async function saveEditDeposit(depId) {
  try {
    var amt   = Number(document.getElementById('ed-amt').value||0);
    var date  = document.getElementById('ed-date').value;
    var status= document.getElementById('ed-status').value;
    var notes = document.getElementById('ed-notes').value.trim()||null;

    if(!amt){ toast(LANG==='ar'?'المبلغ مطلوب':'Amount required','err'); return; }
    if(!date){ toast(LANG==='ar'?'التاريخ مطلوب':'Date required','err'); return; }

    var updateData = {
      amount: amt,
      deposit_received_date: date,
      status: status,
      notes: notes,
    };
    // لو مرتجع → احفظ تاريخ الإرجاع تلقائياً
    if(status === 'refunded') {
      updateData.refund_date = new Date().toISOString().slice(0,10);
    } else {
      updateData.refund_date = null;
    }
    var { error } = await sb.from('deposits').update(updateData).eq('id', depId);

    if(error) throw error;
    toast(LANG==='ar'?'تم التعديل ✓':'Updated ✓','ok');
    document.getElementById('edit-dep-modal').remove();
    // Refresh drawer
    var drawer = document.getElementById('drawerContent');
    if(drawer) {
      var uid = drawer.querySelector('[data-uid]');
      if(uid) openDrawer(uid.dataset.uid);
    }
  } catch(e){ toast('خطأ: '+e.message,'err'); }
}

async function deleteDeposit(depId, unitId) {
  if(!confirm(LANG==='ar'?'هل تريد حذف هذا التأمين؟':'Delete this deposit?')) return;
  try {
    var { error } = await sb.from('deposits').delete().eq('id', depId);
    if(error) throw error;
    toast(LANG==='ar'?'تم الحذف ✓':'Deleted ✓','ok');
    if(unitId) setTimeout(function(){ openDrawer(unitId); }, 150);
  } catch(e){ toast('خطأ: '+e.message,'err'); }
}

// ══════════════════════════════════════════════════════
// QUICK REGISTER DEPOSIT — from drawer
// Pre-fills deposit form and switches to deposit tab
// ══════════════════════════════════════════════════════
function quickRegisterDeposit(apt, room, amount, tenantName) {
  // Prevent double-tap
  if(window._qrdBusy) return;
  window._qrdBusy = true;
  setTimeout(function(){ window._qrdBusy = false; }, 2000);

  // Close drawer first
  if(window.closeDrawer) closeDrawer();

  // Navigate to operations panel
  if(window.goPanel) goPanel('pay');

  // Wait for panel + tabs to render
  setTimeout(function(){
    // Switch to deposit tab
    var depTab = document.querySelector('[data-tab-target="tDep"]');
    if(depTab) {
      if(window.switchTab) window.switchTab('tDep', depTab);
      else depTab.click();
    }

    // Fill all deposit form fields
    var fill = function(id, val){
      var el = document.getElementById(id);
      if(el) { el.value = val; }
    };

    fill('d-apt',    apt);
    fill('d-room',   room);
    fill('d-amt',    amount);
    fill('d-name',   tenantName||'');
    fill('d-status', 'held');

    // Use tenant's start_date as received date (when they moved in)
    // Falls back to today only if no start_date
    var dateEl = document.getElementById('d-date');
    if(dateEl) {
      var depDate = (tenantName && tenantName.__startDate) ? tenantName.__startDate
                  : (window._qrd && window._qrd.startDate) ? window._qrd.startDate
                  : new Date().toISOString().slice(0,10);
      dateEl.value = depDate ? depDate.slice(0,10) : new Date().toISOString().slice(0,10);
    }

    // Visual feedback on amount field
    var amtEl = document.getElementById('d-amt');
    if(amtEl) {
      amtEl.style.borderColor = 'var(--green)';
      setTimeout(function(){ amtEl.style.borderColor=''; }, 2000);
      amtEl.focus();
      amtEl.select();
    }

    toast(LANG==='ar'?'✅ بيانات التأمين جاهزة — راجع واحفظ':'✅ Deposit ready — review and save','ok');
  }, 350);
}
window.quickRegisterDeposit = quickRegisterDeposit;


// ══════════════════════════════════════════════════════
// PAYMENT RECEIPT PDF
// ══════════════════════════════════════════════════════
function printPaymentReceipt() {
  var r = window._lastReceipt;
  if(!r) return;

  // لغة الإيصال = لغة المستأجر المسجّلة (مش لغة التطبيق)
  var isEn = (r.lang === 'en');
  var dateStr = r.date
    ? new Date(r.date).toLocaleDateString(isEn ? 'en-GB' : 'ar-AE')
    : new Date().toLocaleDateString(isEn ? 'en-GB' : 'ar-AE');
  var monthStr = r.month ? r.month.slice(0,7) : '';
  var methodMap = {cash:'نقداً', transfer:'تحويل بنكي', cheque:'شيك', 'Cash':'نقداً', 'Bank Transfer':'تحويل بنكي', 'Cheque':'شيك'};
  var methodMapEn = {cash:'Cash', transfer:'Bank Transfer', cheque:'Cheque', 'Cash':'Cash', 'Bank Transfer':'Bank Transfer', 'Cheque':'Cheque'};
  var methodLabel = isEn ? (methodMapEn[r.payment_method] || r.payment_method || 'Cash')
                         : (methodMap[r.payment_method]   || r.payment_method || 'نقداً');
  var receiptNum = r.receiptNo || ('W-' + Date.now().toString().slice(-6));

  // Save receipt for search
  try {
    var saved = JSON.parse(localStorage.getItem('receipts')||'[]');
    saved.unshift({num:receiptNum, apt:r.apt, room:r.room, tenant:r.tenant, amount:r.amount, month:monthStr, date:r.date, method:r.payment_method});
    if(saved.length > 200) saved = saved.slice(0,200);
    localStorage.setItem('receipts', JSON.stringify(saved));
  } catch(e) {}

  // WhatsApp link
  var waLink = '';
  if(r.phone) {
    var phone = String(r.phone).replace(/[^0-9+]/g,'');
    if(phone.startsWith('0')) phone = '971' + phone.slice(1);
    var waMsg = isEn
      ? 'Receipt No: ' + receiptNum + '%0AUnit: Apt ' + r.apt + ' - Room ' + r.room + '%0AAmount: ' + Number(r.amount).toLocaleString() + ' AED%0AMonth: ' + monthStr + '%0ADate: ' + dateStr + '%0AMethod: ' + methodLabel + '%0AThank you.'
      : 'رقم الإيصال: ' + receiptNum + '%0Aالوحدة: شقة ' + r.apt + ' - غرفة ' + r.room + '%0Aالمبلغ: ' + Number(r.amount).toLocaleString() + ' AED%0Aالشهر: ' + monthStr + '%0Aالتاريخ: ' + dateStr + '%0Aالطريقة: ' + methodLabel + '%0Aشكراً لك.';
    waLink = 'https://wa.me/' + phone + '?text=' + waMsg;
  }

  var dir = isEn ? 'ltr' : 'rtl';
  var body = '<style>'
    +'*{font-family:Arial,sans-serif;direction:'+dir+'}'
    +'body{padding:30px;color:#111;font-size:14px;background:#fff}'
    +'.header{text-align:center;border-bottom:3px solid #1a3a6a;padding-bottom:16px;margin-bottom:20px}'
    +'.title{font-size:22px;font-weight:700;color:#1a3a6a}'
    +'.sub{font-size:12px;color:#555;margin-top:4px}'
    +'.receipt-box{border:2px solid #1a3a6a;border-radius:10px;padding:22px;max-width:420px;margin:0 auto}'
    +'.row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #eee}'
    +'.row:last-child{border-bottom:none}'
    +'.lbl{color:#666;font-size:13px}'
    +'.val{font-weight:700;font-size:13px;text-align:'+(isEn?'right':'left')+'}'
    +'.amount-box{text-align:center;background:#e8f5ee;border-radius:8px;padding:18px;margin:16px 0}'
    +'.amount-big{font-size:30px;font-weight:800;color:#1a7a4a}'
    +'.refnum{font-family:monospace;font-size:12px;color:#1a3a6a;background:#f0f4ff;padding:2px 8px;border-radius:4px}'
    +'.wa-btn{display:block;width:100%;padding:13px;background:#25D366;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:700;text-align:center;text-decoration:none;margin-top:14px;cursor:pointer}'
    +'.footer{text-align:center;margin-top:18px;color:#aaa;font-size:11px;line-height:1.6}'
    +'@media print{.wa-btn{display:none!important}}'
    +'</style>'
    +'<div class="header">'
      +'<div class="title">'+(isEn ? 'Property Management' : 'إدارة العقارات')+'</div>'
      +'<div class="sub">'+(isEn ? 'Rent Receipt' : 'إيصال استلام إيجار')+'</div>'
    +'</div>'
    +'<div class="receipt-box">'
      +'<div class="row"><span class="lbl">'+(isEn?'Receipt No.':'رقم الإيصال')+'</span><span class="val"><span class="refnum">'+receiptNum+'</span></span></div>'
      +'<div class="row"><span class="lbl">'+(isEn?'Date':'التاريخ')+'</span><span class="val">'+dateStr+'</span></div>'
      +(r.tenant?'<div class="row"><span class="lbl">'+(isEn?'Tenant':'المستأجر')+'</span><span class="val">'+r.tenant+'</span></div>':'')
      +'<div class="row"><span class="lbl">'+(isEn?'Unit':'الوحدة')+'</span><span class="val">'+(isEn?'Apt '+r.apt+' — Room '+r.room:'شقة '+r.apt+' — غرفة '+r.room)+'</span></div>'
      +'<div class="row"><span class="lbl">'+(isEn?'Rent Month':'شهر الإيجار')+'</span><span class="val">'+monthStr+'</span></div>'
      +'<div class="row"><span class="lbl">'+(isEn?'Payment Method':'طريقة الدفع')+'</span><span class="val">'+methodLabel+'</span></div>'
      +'<div class="amount-box">'
        +'<div style="font-size:12px;color:#555;margin-bottom:6px">'+(isEn?'Amount Received':'المبلغ المستلم')+'</div>'
        +'<div class="amount-big">AED '+Number(r.amount).toLocaleString()+'</div>'
      +'</div>'
      +(waLink ? '<a href="'+waLink+'" target="_blank" class="wa-btn">💬 '+(isEn?'Send via WhatsApp':'إرسال عبر واتساب')+'</a>' : '')
    +'</div>'
    +'<div class="footer">'
      +'<div>'+(isEn?'Thank you — Property Management':'شكراً لك — إدارة العقارات')+'</div>'
      +'<div style="margin-top:3px">'+(isEn?'Generated':'وُلِّد')+' '+new Date().toLocaleDateString(isEn?'en-GB':'ar-AE')+'</div>'
    +'</div>';

  var pdfEl = document.getElementById('pdf-content');
  var overlay = document.getElementById('pdfOverlay');
  if(pdfEl && overlay) {
    pdfEl.innerHTML = '<style>body,html{background:#fff;color:#111}</style>' + body;
    overlay.style.display = 'flex';
  } else {
    var w = window.open('','_blank','width=500,height=750');
    if(w){ w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title></head><body>'+body+'</body></html>'); w.document.close(); setTimeout(function(){w.print();},400); }
  }
}
window.printPaymentReceipt = printPaymentReceipt;
// ══════════════════════════════════════════════════════
// RECEIPT SEARCH
// ══════════════════════════════════════════════════════
function openReceiptSearch() {
  var isEn = (LANG !== 'ar');
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem('receipts')||'[]'); } catch(e) {}

  var modal = document.createElement('div');
  modal.id = 'rcpt-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  modal.onclick = function(e){ if(e.target===modal) modal.remove(); };

  function renderList(list) {
    var el = document.getElementById('rcpt-list');
    if(!el) return;
    if(!list.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:.8rem">'+(isEn?'No receipts found':'لا توجد إيصالات')+'</div>'; return; }
    el.innerHTML = list.map(function(rc){
      return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px">'        +'<div>'          +'<div style="font-size:.8rem;font-weight:700;color:var(--accent);font-family:monospace">'+rc.num+'</div>'          +'<div style="font-size:.72rem;color:var(--text2);margin-top:1px">'+(isEn?'Apt':'شقة')+' '+rc.apt+' — '+(isEn?'Room':'غرفة')+' '+rc.room+(rc.tenant?' · '+rc.tenant:'')+'</div>'          +'<div style="font-size:.68rem;color:var(--muted)">'+rc.month+' · '+rc.date+'</div>'        +'</div>'        +'<div style="font-weight:700;font-size:.88rem;color:var(--green);flex-shrink:0">'+(Number(rc.amount)||0).toLocaleString()+' AED</div>'        +'</div>';
    }).join('');
  }

  var inner = document.createElement('div');
  inner.style.cssText = 'background:var(--surf);border-radius:20px 20px 0 0;width:100%;max-width:520px;max-height:80vh;overflow-y:auto;padding:0 0 32px';
  inner.onclick = function(e){ e.stopPropagation(); };

  var header = document.createElement('div');
  header.style.cssText = 'padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center';
  header.innerHTML = '<div style="font-size:.95rem;font-weight:700">🔍 '+(isEn?'Search Receipts':'بحث في الإيصالات')+'</div>'
    +'<button id="rcpt-close-btn" style="background:none;border:none;color:var(--muted);font-size:1.1rem;cursor:pointer">✕</button>';

  var searchWrap = document.createElement('div');
  searchWrap.style.padding = '12px 16px';
  var inp = document.createElement('input');
  inp.id = 'rcpt-search-inp';
  inp.placeholder = isEn ? 'Receipt No., tenant, room...' : 'رقم الإيصال، اسم، غرفة...';
  inp.style.cssText = 'width:100%;padding:10px 13px;background:var(--surf2);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font);font-size:.88rem;outline:none;direction:'+( isEn?'ltr':'rtl');
  inp.addEventListener('input', function() {
    var q = this.value.toLowerCase();
    var all = [];
    try { all = JSON.parse(localStorage.getItem('receipts')||'[]'); } catch(e) {}
    var filtered = q ? all.filter(function(r){ return JSON.stringify(r).toLowerCase().includes(q); }) : all;
    renderList(filtered.slice(0,50));
  });
  searchWrap.appendChild(inp);

  var list = document.createElement('div');
  list.id = 'rcpt-list';

  header.querySelector('#rcpt-close-btn').addEventListener('click', function(){ modal.remove(); });
  inner.appendChild(header);
  inner.appendChild(searchWrap);
  inner.appendChild(list);
  modal.appendChild(inner);
  document.body.appendChild(modal);

  renderList(saved.slice(0,50));
  setTimeout(function(){ inp.focus(); }, 100);
}
window.openReceiptSearch = openReceiptSearch;


// ══════════════════════════════════════════════════════
// OWNER SETTLEMENT PDF
// ══════════════════════════════════════════════════════
async function printOwnerSettlement() {
  var monEl = document.getElementById('o-month');
  var mon   = monEl ? monEl.value : '';
  if(!mon) { toast(LANG==='ar'?'اختر الشهر أولاً':'Choose month first','err'); return; }
  var monYM = mon.slice(0,7);
  var monthLabel = new Date(monYM+'-15').toLocaleDateString(LANG==='ar'?'ar-AE':'en-GB',{month:'long',year:'numeric'});
  var monthStartDate = monYM + '-01';
  var monthEndDate = window.monthEnd ? window.monthEnd(monYM) : (monYM + '-31');

  try {
    var [pR, dR, eR, oR, uR] = await Promise.all([
      sb.from('rent_payments').select('unit_id,apartment,room,amount,payment_date,payment_method').gte('payment_date',monthStartDate).lte('payment_date',monthEndDate),
      sb.from('deposits').select('unit_id,apartment,room,amount,deposit_received_date,tenant_name').gte('deposit_received_date',monthStartDate).lte('deposit_received_date',monthEndDate),
      sb.from('expenses').select('category,amount,description').eq('period_month', (monYM||'').slice(0,7)+'-01'),
      sb.from('owner_payments').select('amount,method,reference,notes').eq('period_month', (monYM||'').slice(0,7)+'-01'),
      sb.from('units').select('id,apartment,room,tenant_name,tenant_name2')
    ]);
    var pays=pR.data||[], deps=dR.data||[], exps=eR.data||[], owns=oR.data||[], units=uR.data||[];
    var unitById = {};
    units.forEach(function(u){ unitById[u.id]=u; });
    deps = deps.map(function(d){
      var u = d.unit_id ? unitById[d.unit_id] : null;
      return Object.assign({}, d, {
        apartment: d.apartment || (u && u.apartment) || '',
        room: d.room || (u && u.room) || '',
        tenant_name: d.tenant_name || (u && (u.tenant_name || u.tenant_name2)) || ''
      });
    });
    var totalRent    = pays.reduce(function(s,p){return s+(Number(p.amount)||0);},0);
    var totalDeps    = deps.reduce(function(s,d){ if(d.status==='refunded') return s; return s+(Number(d.amount)||0); },0);
    var totalRefunds = (refundedDeps||[]).reduce(function(s,d){ return s+(Number(d.amount)||0); }, 0);
    var totalExp     = exps.reduce(function(s,e){return s+(Number(e.amount)||0);},0);
    var totalOwn     = owns.reduce(function(s,o){return s+(Number(o.amount)||0);},0);
    var balance      = totalRent + totalDeps - totalRefunds - totalExp - totalOwn;

    var row = function(lbl,val,col){
      return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee">'
        +'<span style="color:#555;font-size:13px">'+lbl+'</span>'
        +'<b style="font-size:13px;color:'+(col||'#111')+'">'+Number(val).toLocaleString()+' AED</b>'
        +'</div>';
    };
    var esc = function(v){
      return String(v == null ? '' : v)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    };
    var fmtAmt = function(v){ return (Number(v)||0).toLocaleString() + ' AED'; };
    var padFloorLabel = function(floorNo){
      var labels = {
        0:'الدور 0', 1:'الدور الأول', 2:'الدور الثاني', 3:'الدور الثالث', 4:'الدور الرابع', 5:'الدور الخامس',
        6:'الدور السادس', 7:'الدور السابع', 8:'الدور الثامن', 9:'الدور التاسع', 10:'الدور العاشر'
      };
      return labels[floorNo] || ('الدور ' + floorNo);
    };
    var apartmentDigits = function(apartment){
      var digits = String(apartment == null ? '' : apartment).replace(/\D/g,'');
      return digits ? Number(digits) : 0;
    };
    var getFloorNo = function(apartment){
      var digits = apartmentDigits(apartment);
      return digits ? Math.floor(digits / 100) : 0;
    };

    var body = '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;padding:22px 20px;max-width:800px;margin:0 auto">'
      +'<style>*{box-sizing:border-box}table{border-collapse:collapse;width:100%}</style>'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1a3a6a;padding-bottom:14px;margin-bottom:20px">'
      +'<div>'
      +'<div style="font-size:22px;font-weight:800;color:#1a3a6a">تسوية المالك</div>'
      +'<div style="font-size:13px;color:#555;margin-top:3px;font-weight:600">'+monthLabel+'</div>'
      +'</div>'
      +'<div style="text-align:left;font-size:11px;color:#888;line-height:1.6">Wahdati<br>'+new Date().toLocaleDateString('ar-AE')+'</div>'
      +'</div>';

    var tdS = function(v, s){ return '<td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;'+(s||'')+'">'+v+'</td>'; };
    var paysByApt = {};
    pays.forEach(function(p){
      var apt = String(p.apartment||'?');
      if(!paysByApt[apt]) paysByApt[apt] = [];
      paysByApt[apt].push(p);
    });
    var aptNos = Object.keys(paysByApt).sort(function(a,b){ return (Number(a.replace(/\D/g,''))||0)-(Number(b.replace(/\D/g,''))||0); });

    // Deps map by apartment
    var depsByApt = {};
    deps.forEach(function(d){
      var apt = String(d.apartment||'?');
      if(!depsByApt[apt]) depsByApt[apt] = [];
      depsByApt[apt].push(d);
    });
    // المُرتجعات مقسّمة على الشقة
    var refundsByApt = {};
    refundedDeps.forEach(function(d){
      var apt = String(d.apartment||'?');
      if(!refundsByApt[apt]) refundsByApt[apt] = [];
      refundsByApt[apt].push(d);
    });

    // All apt numbers (pays + deps)
    var allAptKeys = Array.from(new Set(Object.keys(paysByApt).concat(Object.keys(depsByApt))));
    allAptKeys.sort(function(a,b){ return (Number(a.replace(/\D/g,''))||0)-(Number(b.replace(/\D/g,''))||0); });

    var body_apts = allAptKeys.map(function(apt){
      var aptPays = (paysByApt[apt]||[]).slice().sort(function(a,b){
        var ar=String(a.room||''), br=String(b.room||'');
        if(ar===br) return String(a.payment_date||'').localeCompare(String(b.payment_date||''));
        return ar.localeCompare(br,undefined,{numeric:true,sensitivity:'base'});
      });
      var aptDeps = (depsByApt[apt]||[]).slice().sort(function(a,b){
        return String(a.room||'').localeCompare(String(b.room||''),undefined,{numeric:true,sensitivity:'base'});
      });
      var aptRefunds = (refundsByApt[apt]||[]).slice().sort(function(a,b){
        return String(a.room||'').localeCompare(String(b.room||''),undefined,{numeric:true,sensitivity:'base'});
      });
      var aptPayTotal = aptPays.reduce(function(s,p){return s+(Number(p.amount)||0);},0);
      var aptDepTotal = aptDeps.filter(function(d){return d.status!=='refunded';}).reduce(function(s,d){return s+(Number(d.amount)||0);},0);
      var aptTotal    = aptPayTotal + aptDepTotal;

      // Header bar
      var html = '<div style="border:1px solid #e0e0e0;border-radius:10px;margin-bottom:14px;overflow:hidden">'
        +'<div style="background:#1a3a6a;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
        +'<div style="font-size:14px;font-weight:800">🏢 شقة '+esc(String(apt))+'</div>'
        +'<div style="display:flex;gap:10px;align-items:center">'
        +(aptDepTotal>0?'<span style="font-size:11px;background:rgba(255,200,50,.2);padding:2px 8px;border-radius:10px">تأمين: '+fmtAmt(aptDepTotal)+'</span>':'')
        +'<span style="font-size:13px;font-weight:700;background:rgba(255,255,255,.15);padding:3px 10px;border-radius:14px">'+fmtAmt(aptTotal)+'</span>'
        +'</div></div>';

      // Payments table
      if(aptPays.length) {
        html += '<div style="font-size:11px;font-weight:700;color:#1a3a6a;padding:8px 10px 4px;border-bottom:1px solid #e8eef8">🏠 دفعات الإيجار ('+aptPays.length+')</div>'
          +'<table style="width:100%;border-collapse:collapse">'
          +'<thead><tr style="background:#f0f4ff">'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #c0d0f0">الغرفة</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #c0d0f0">المبلغ</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #c0d0f0">التاريخ</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #c0d0f0">الطريقة</th>'
          +'</tr></thead><tbody>'
          + aptPays.map(function(p){
              return '<tr>'
                + tdS('<b>'+esc(String(p.room||''))+'</b>')
                + tdS(fmtAmt(p.amount||0),'font-weight:700;color:#166534')
                + tdS(esc((p.payment_date||'').slice(0,10)),'color:#777;font-size:11px')
                + tdS(esc(p.payment_method||''),'color:#777;font-size:11px')
                + '</tr>';
            }).join('')
          +'</tbody></table>';
      }

      // Deposits table (under same apt section)
      if(aptDeps.length) {
        html += '<div style="font-size:11px;font-weight:700;color:#92400e;padding:8px 10px 4px;border-top:2px solid #f6cc7c;border-bottom:1px solid #fef3c7;background:#fffdf5">🔒 تأمينات الشقة ('+aptDeps.length+')</div>'
          +'<table style="width:100%;border-collapse:collapse;background:#fffdf5">'
          +'<thead><tr style="background:#fef9ec">'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f6cc7c">الغرفة</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f6cc7c">الاسم</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f6cc7c">المبلغ</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f6cc7c">التاريخ</th>'
          +'</tr></thead><tbody>'
          + aptDeps.map(function(d){
              return '<tr>'
                + tdS('<b>'+esc(String(d.room||''))+'</b>')
                + tdS(esc(d.tenant_name||'—'),'color:#555')
                + tdS(fmtAmt(d.amount||0),'font-weight:700;color:#b45309')
                + tdS(esc((d.deposit_received_date||'').slice(0,10)),'color:#777;font-size:11px')
                + '</tr>';
            }).join('')
          +'</tbody></table>';
      }
      // صفوف المرتجعات في الشقة
      if(aptRefunds.length) {
        html += '<div style="font-size:11px;font-weight:700;color:#c0392b;padding:8px 10px 4px;border-top:2px solid #f0a0a0;border-bottom:1px solid #fde8e8;background:#fff8f8">↩️ تأمينات مُرتجعة ('+aptRefunds.length+')</div>'
          +'<table style="width:100%;border-collapse:collapse;background:#fff8f8">'
          +'<thead><tr style="background:#fff0f0">'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f0a0a0">الغرفة</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f0a0a0">الاسم</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f0a0a0">المُرتجع</th>'
          +'<th style="padding:7px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:1.5px solid #f0a0a0">تاريخ الإرجاع</th>'
          +'</tr></thead><tbody>'
          + aptRefunds.map(function(d){
              return '<tr>'
                + tdS('<b>'+esc(String(d.room||''))+'</b>')
                + tdS(esc(d.tenant_name||'—'),'color:#555')
                + tdS('- '+fmtAmt(d.amount||0),'font-weight:700;color:#c0392b')
                + tdS(esc((d.refund_date||'').slice(0,10)),'color:#777;font-size:11px')
                + '</tr>';
            }).join('')
          +'</tbody></table>';
      }

      html += '</div>';
      return html;
    }).join('');
    var body_deps = ''; // now embedded per-apt

    var body_exps = exps.length
      ? '<div style="border:1px solid #e0e0e0;border-radius:10px;margin-bottom:14px;overflow:hidden">'
        +'<div style="background:#991b1b;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
        +'<div style="font-size:14px;font-weight:800">💸 المصاريف ('+exps.length+')</div>'
        +'<div style="font-size:13px;font-weight:700;background:rgba(255,255,255,.15);padding:3px 10px;border-radius:14px">'+fmtAmt(totalExp)+'</div>'
        +'</div>'
        +'<table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="background:#fff8f8">'
        +'<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:2px solid #f0c0c0">الفئة</th>'
        +'<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:2px solid #f0c0c0">الوصف</th>'
        +'<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;border-bottom:2px solid #f0c0c0">المبلغ</th>'
        +'</tr></thead><tbody>'
        + exps.map(function(e){
            return '<tr style="border-bottom:1px solid #f8f0f0">'
              +'<td style="padding:8px 10px;font-size:12px;font-weight:600">'+esc(e.category||'')+'</td>'
              +'<td style="padding:8px 10px;font-size:12px;color:#666">'+esc(e.description||'—')+'</td>'
              +'<td style="padding:8px 10px;font-size:12px;font-weight:700;color:#b91c1c;text-align:left">'+fmtAmt(e.amount||0)+'</td>'
              +'</tr>';
          }).join('')
        +'<tr style="background:#fff0f0;border-top:2px solid #e0a0a0">'
        +'<td colspan="2" style="padding:9px 10px;font-size:12px;font-weight:700">الإجمالي</td>'
        +'<td style="padding:9px 10px;font-size:13px;font-weight:800;color:#b91c1c;text-align:left">'+fmtAmt(totalExp)+'</td>'
        +'</tr></tbody></table></div>'
      : '';

    var body_owns = owns.length
      ? '<div style="border:1px solid #e0e0e0;border-radius:10px;margin-bottom:14px;overflow:hidden">'
        +'<div style="background:#5b21b6;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
        +'<div style="font-size:14px;font-weight:800">👤 مدفوعات المالك ('+owns.length+')</div>'
        +'<div style="font-size:13px;font-weight:700;background:rgba(255,255,255,.15);padding:3px 10px;border-radius:14px">'+fmtAmt(totalOwn)+'</div>'
        +'</div>'
        +'<table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="background:#f8f0ff">'
        +'<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:2px solid #d0b0f0">المبلغ</th>'
        +'<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:2px solid #d0b0f0">الطريقة</th>'
        +'<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:2px solid #d0b0f0">المرجع</th>'
        +'<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;border-bottom:2px solid #d0b0f0">ملاحظات</th>'
        +'</tr></thead><tbody>'
        + owns.map(function(o){
            return '<tr style="border-bottom:1px solid #f5f0ff">'
              +'<td style="padding:8px 10px;font-size:12px;font-weight:700;color:#7c3aed">'+fmtAmt(o.amount||0)+'</td>'
              +'<td style="padding:8px 10px;font-size:12px">'+esc(o.method||'—')+'</td>'
              +'<td style="padding:8px 10px;font-size:12px;color:#666">'+esc(o.reference||'—')+'</td>'
              +'<td style="padding:8px 10px;font-size:12px;color:#666">'+esc(o.notes||'—')+'</td>'
              +'</tr>';
          }).join('')
        +'</tbody></table></div>'
      : '';

    var body_summary =
      '<div style="border:2px solid #1a3a6a;border-radius:10px;overflow:hidden;margin-bottom:14px">'
      +'<div style="background:#1a3a6a;color:#fff;padding:10px 14px">'
      +'<div style="font-size:14px;font-weight:800">📊 الملخص الكلي</div>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse">'
      +'<tbody>'
      +'<tr style="border-bottom:1px solid #e8f0e8">'
      +'<td style="padding:10px 14px;font-size:13px">✅ إيجار محصّل</td>'
      +'<td style="padding:10px 14px;font-size:13px;font-weight:800;color:#166534;text-align:left">'+fmtAmt(totalRent)+'</td>'
      +'</tr>'
      +(totalDepsIn>0?'<tr style="border-bottom:1px solid #fef3e8">'
      +'<td style="padding:10px 14px;font-size:13px">🔒 تأمينات مستلمة</td>'
      +'<td style="padding:10px 14px;font-size:13px;font-weight:800;color:#b45309;text-align:left">'+fmtAmt(totalDepsIn)+'</td>'
      +'</tr>':'')
      +(totalRefunds>0?'<tr style="border-bottom:1px solid #fef3e8;background:#fff8f8">'
      +'<td style="padding:10px 14px;font-size:13px">↩️ تأمينات مُرتجعة</td>'
      +'<td style="padding:10px 14px;font-size:13px;font-weight:800;color:#c0392b;text-align:left">- '+fmtAmt(totalRefunds)+'</td>'
      +'</tr>':'')
      +(totalExp>0?'<tr style="border-bottom:1px solid #fff0f0">'
      +'<td style="padding:10px 14px;font-size:13px">💸 مصاريف</td>'
      +'<td style="padding:10px 14px;font-size:13px;font-weight:800;color:#b91c1c;text-align:left">'+fmtAmt(totalExp)+'</td>'
      +'</tr>':'')
      +(totalOwn>0?'<tr style="border-bottom:1px solid #f5f0ff">'
      +'<td style="padding:10px 14px;font-size:13px">👤 مدفوع للمالك</td>'
      +'<td style="padding:10px 14px;font-size:13px;font-weight:800;color:#7c3aed;text-align:left">'+fmtAmt(totalOwn)+'</td>'
      +'</tr>':'')
      +'<tr style="background:'+(balance>=0?'#f0faf5':'#fff0f0')+';border-top:3px solid '+(balance>=0?'#166534':'#b91c1c')+'">'
      +'<td style="padding:12px 14px;font-size:15px;font-weight:800">💰 الصافي</td>'
      +'<td style="padding:12px 14px;font-size:15px;font-weight:800;color:'+(balance>=0?'#166534':'#b91c1c')+';text-align:left">'+fmtAmt(balance)+'</td>'
      +'</tr>'
      +'</tbody></table></div>';

    // Remove old summary table and KPI from body, rebuild:
    // body already has: header div only (we cut KPI+table above)
    // Add sections in order
    body += body_apts;
    body += body_deps;
    body += body_exps;
    body += body_owns;
    body += body_summary;
    body += '<div style="font-size:11px;color:#888;text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid #eee">وُلِّد بتاريخ '+new Date().toLocaleDateString(LANG==='ar'?'ar-AE':'en-GB')+'</div>';
    body += '</div>';

    var overlay = document.getElementById('pdfOverlay');
    var pdfEl = document.getElementById('pdf-content');
    if(overlay && pdfEl){
      pdfEl.innerHTML = '<style>body,html{background:#fff;color:#111}</style>' + body;
      overlay.style.display = 'flex';
    } else {
      var w = window.open('','_blank','width=900,height=1100');
      if(w){
        w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>تسوية المالك</title></head><body>'+body+'</body></html>');
        w.document.close();
        setTimeout(function(){ w.print(); }, 500);
      }
    }
  } catch(e){ toast('خطأ: '+e.message,'err'); console.error('printOwnerSettlement:',e); }
}
window.printOwnerSettlement = printOwnerSettlement;

window.autoFillRent=autoFillRent; window.calcOwnerBalance=calcOwnerBalance; window.autoFillDepDate=autoFillDepDate; window.saveRent=saveRent; window.saveExp=saveExp; window.saveOwner=saveOwner; window.saveDep=saveDep; window.setPayTenant=setPayTenant; window.askWhoPayment=askWhoPayment; window.askWhoWA=askWhoWA; window.togglePayHistory=togglePayHistory; window.editDeposit=editDeposit; window.saveEditDeposit=saveEditDeposit; window.deleteDeposit=deleteDeposit; window.editPayment=editPayment; window.saveEditPayment=saveEditPayment; window.deletePayment=deletePayment;
// ══════════════════════════════════════════════════════
// BULK QUICK PAY — show all unpaid units in one list
// ══════════════════════════════════════════════════════
async function loadBulkPay() {
  var listEl = document.getElementById('bulk-pay-list');
  if(!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:20px"><span class="spin"></span></div>';

  var now = new Date();
  var ym  = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var today = now.toISOString().slice(0,10);

  try {
    var [uR, pR] = await Promise.all([
      sb.from('units').select('id,apartment,room,tenant_name,monthly_rent,rent1,rent2,tenant_name2,is_vacant,start_date').eq('is_vacant',false).order('apartment').order('room'),
      sb.from('rent_payments').select('unit_id,amount').like('payment_month', ym + '%')
    ]);

    var units = (uR.data||[]).filter(function(u){ return (u.monthly_rent||0) > 0; });
    var paidMap = {};
    (pR.data||[]).forEach(function(p){ paidMap[p.unit_id]=(paidMap[p.unit_id]||0)+(p.amount||0); });

    // Exclude new tenants this month
    var unpaid = units.filter(function(u){
      if(u.start_date && u.start_date.slice(0,7)===ym) return false;
      return (paidMap[u.id]||0) < (u.monthly_rent||0);
    });

    if(!unpaid.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--green)"><div style="font-size:2rem">✅</div><div style="font-weight:700;margin-top:8px">كل الوحدات مدفوعة!</div></div>';
      return;
    }

    var html = '<div style="font-size:.72rem;color:var(--muted);margin-bottom:10px">'+unpaid.length+' وحدة متبقية — شهر '+ym+'</div>';

    unpaid.forEach(function(u) {
      var paid    = paidMap[u.id]||0;
      var rent    = u.monthly_rent||0;
      var rem     = rent - paid;
      var isPartial = paid > 0;
      var unitId  = u.id;

      html += '<div style="background:var(--surf2);border-radius:14px;padding:12px 14px;margin-bottom:8px;border-right:3px solid '+(isPartial?'var(--amber)':'var(--red)')+'">'
        // Header
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
          +'<div>'
            +'<div style="font-size:.85rem;font-weight:700">شقة '+u.apartment+' — '+u.room+'</div>'
            +'<div style="font-size:.72rem;color:var(--muted)">'+escapeHtml(u.tenant_name||'—')+(u.tenant_name2?' & '+escapeHtml(u.tenant_name2):'')+'</div>'
          +'</div>'
          +'<div style="text-align:end">'
            +(isPartial?'<div style="font-size:.65rem;color:var(--amber)">دفع '+paid.toLocaleString()+'</div>':'')
            +'<div style="font-size:.82rem;font-weight:700;color:'+(isPartial?'var(--amber)':'var(--red)')+'">متبقي: '+rem.toLocaleString()+' AED</div>'
          +'</div>'
        +'</div>'
        // Inline form
        +'<div style="display:flex;gap:6px;align-items:center">'
          +'<input id="bpamt-'+unitId+'" type="number" value="'+rem+'" inputmode="numeric" '
            +'style="flex:1;padding:9px 10px;background:var(--surf);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font);font-size:.85rem;font-weight:700" '
            +'placeholder="المبلغ"/>'
          +'<select id="bpmeth-'+unitId+'" style="padding:9px;background:var(--surf);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font);font-size:.78rem">'
            +'<option value="cash">نقداً</option>'
            +'<option value="transfer">تحويل</option>'
            +'<option value="cheque">شيك</option>'
          +'</select>'
          +'<button onclick="bulkSavePay(\''+unitId+'\',\''+u.apartment+'\',\''+u.room+'\',\''+ym+'\',\''+today+'\')" '
            +'style="padding:9px 14px;background:var(--green);border:none;border-radius:10px;color:#fff;font-family:var(--font);font-size:.8rem;font-weight:700;cursor:pointer;touch-action:manipulation;white-space:nowrap">'
            +'✅ سجّل'
          +'</button>'
        +'</div>'
        +'</div>';
    });

    listEl.innerHTML = html;

  } catch(e) {
    listEl.innerHTML = '<div style="color:var(--red);padding:14px">خطأ: '+e.message+'</div>';
  }
}

async function bulkSavePay(unitId, apt, room, mon, today) {
  var amtEl  = document.getElementById('bpamt-'+unitId);
  var methEl = document.getElementById('bpmeth-'+unitId);
  if(!amtEl) return;

  var amt  = parseFloat(amtEl.value);
  var meth = methEl ? methEl.value : 'cash';
  if(!amt || amt <= 0) { toast('أدخل مبلغاً صحيحاً','err'); return; }

  // Disable the row
  var btn = amtEl.parentElement.querySelector('button');
  if(btn) { btn.disabled=true; btn.textContent='...'; }

  try {
    var { error } = await sb.from('rent_payments').insert({
      unit_id:        unitId,
      apartment:      parseInt(apt),
      room:           String(room),
      amount:         amt,
      payment_month:  mon,
      payment_date:   today,
      payment_method: meth
    });
    if(error) throw error;

    // Remove row with animation
    var row = amtEl.closest('div[style*="border-radius:14px"]');
    if(row) { row.style.opacity='0.4'; row.style.transition='opacity .3s'; setTimeout(function(){ row.remove(); }, 320); }

    toast('✅ شقة '+apt+' — '+room+' — '+amt.toLocaleString()+' AED','ok');
    loadHome(null, true);

    // Store as last payment for quick access
    try{ localStorage.setItem('lastPayApt',apt); localStorage.setItem('lastPayRoom',room); }catch(e){}
  } catch(e) {
    toast('خطأ: '+e.message,'err');
    if(btn) { btn.disabled=false; btn.textContent='✅ سجّل'; }
  }
}

window.loadBulkPay  = loadBulkPay;
window.bulkSavePay  = bulkSavePay;
