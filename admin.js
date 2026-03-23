// ══ ADMIN ══

function toggleAddStaff() {
  var f = document.getElementById('addStaffForm');
  f.style.display = f.style.display==='none'?'block':'none';
}

async function createUser(btn) {
  var name  = document.getElementById('inv-name').value.trim();
  var email = document.getElementById('inv-email').value.trim();
  var pass  = document.getElementById('inv-pass').value.trim();
  var role  = document.getElementById('inv-role').value;
  if(!name||!email||!pass){toast(LANG==='ar'?'كل الحقول إلزامية':'All fields required','err');return;}
  if(pass.length<6){toast(LANG==='ar'?'كلمة السر 6 أحرف على الأقل':'Password must be 6+ chars','err');return;}
  var orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span>';
  try{
    var { data, error } = await sb.auth.signUp({
      email, password: pass,
      options: { data: { name, role } }
    });
    if(error && error.message.includes('signup')) {
      toast(LANG==='ar'?'فعّل التسجيل في Supabase مؤقتاً ثم أعد المحاولة':'Enable signups in Supabase then retry','err');
      return;
    }
    if(error) throw error;
    if(data?.user?.id) {
      await sb.from('profiles').upsert({id:data.user.id,name,role,is_active:true},{onConflict:'id'});
    }
    toast((LANG==='ar'?'تم إنشاء حساب ':'Account created: ')+name+' ✓','ok');
    ['inv-name','inv-email','inv-pass'].forEach(id=>document.getElementById(id).value='');
    setTimeout(()=>loadTeam(null), 800);
  } catch(e){ toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
  finally{ btn.disabled=false; btn.innerHTML=orig; }
}

async function loadTeam(btn) {
  if(btn){var orig=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spin"></span>';}
  try{
    var { data, error } = await sb.from('profiles').select('*').order('created_at');
    var el = document.getElementById('teamList');
    if(error||!data?.length){
      el.innerHTML='<div style="font-size:.78rem;color:var(--muted);padding:8px 0">'+(LANG==='ar'?'لا يوجد أعضاء':'No team members')+'</div>';
      return;
    }
    var rc = {admin:'var(--accent)',manager:'var(--green)',collector:'var(--amber)',viewer:'var(--muted)'};
    var rl = {admin:'👑 مسؤول',manager:'🟢 مدير',collector:'🟡 محصّل',viewer:'👁️ مشاهد'};
    el.innerHTML = data.map(u=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:.85rem;font-weight:700">${u.name||'—'}</div>
          ${u.id===ME?.id?`<div style="font-size:.7rem;color:var(--muted)">(${LANG==='ar'?'أنت':'You'})</div>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <select onchange="changeRole('${u.id}',this)" style="background:var(--surf2);border:1px solid var(--border);color:${rc[u.role]||'var(--text)'};border-radius:8px;padding:5px 8px;font-size:.75rem;font-weight:700;font-family:inherit" ${u.id===ME?.id?'disabled':''}>
            <option value="collector" ${u.role==='collector'?'selected':''}>🟡 محصّل</option>
            <option value="manager"   ${u.role==='manager'  ?'selected':''}>🟢 مدير</option>
            <option value="admin"     ${u.role==='admin'    ?'selected':''}>👑 مسؤول</option>
            <option value="viewer"    ${u.role==='viewer'   ?'selected':''}>👁️ مشاهد</option>
          </select>
          ${u.id!==ME?.id?`<div style="width:8px;height:8px;border-radius:50%;background:${u.is_active?'var(--green)':'var(--red)'}"></div>`:''}
        </div>
      </div>`).join('');
  } catch(e){ toast(e.message,'err'); }
  finally{ if(btn){btn.disabled=false;btn.innerHTML=orig;} }
}

async function changeRole(userId, sel) {
  try {
  var role = sel.value;
    var { error } = await sb.from('profiles').update({role}).eq('id',userId);
    if(error){ toast(error.message,'err'); return; }
    toast(LANG==='ar'?'تم تغيير الدور ✓':'Role changed ✓','ok');
  } catch(e) { toast('خطأ: ' + e.message, 'err'); console.error('changeRole:', e); }
}


window.toggleAddStaff=toggleAddStaff; window.createUser=createUser; window.loadTeam=loadTeam; window.changeRole=changeRole;