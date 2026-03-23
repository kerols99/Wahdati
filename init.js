// ══ INIT ══
(function boot() {
  var tries = 0;

  function applyRuntimeClasses() {
    document.body.classList.toggle('desktop', window.innerWidth >= 900);
  }

  async function hydrateSession() {
    try {
      var result = await sb.auth.getSession();
      var session = result && result.data ? result.data.session : null;
      if (session && session.user) {
        ME = session.user;
        await afterLogin();
      } else {
        applyLang();
      }
    } catch (e) {
      console.error('hydrateSession:', e);
      applyLang();
    }
  }

  function attachGlobalGuards() {
    window.addEventListener('resize', applyRuntimeClasses, { passive:true });
    window.addEventListener('unhandledrejection', function(e){
      console.error('Unhandled promise rejection:', e.reason || e);
      toast((LANG==='ar' ? 'حدث خطأ غير متوقع' : 'Unexpected error occurred'), 'err');
    });
    window.addEventListener('error', function(e){
      console.error('Global error:', e.error || e.message || e);
    });
  }

  function waitSB() {
    applyTheme(localStorage.getItem('app_theme') || 'dark');
    applyRuntimeClasses();
    if(typeof window.supabase !== 'undefined') {
      initSB();
      var pdEl = document.getElementById('r-pdate');
      if(pdEl && !pdEl.value) pdEl.value = new Date().toISOString().split('T')[0];
      var overlay = document.getElementById('drawerOverlay');
      if(overlay) overlay.addEventListener('click', closeDrawer);
      attachGlobalGuards();
      hydrateSession();
      sb.auth.onAuthStateChange(function(event, session){
        if(event === 'SIGNED_IN' && session && session.user && (!ME || ME.id !== session.user.id)) {
          ME = session.user;
          afterLogin();
        }
        if(event === 'SIGNED_OUT') {
          ME = null;
          var app = document.getElementById('app');
          var auth = document.getElementById('auth-screen');
          if(app) app.style.display = 'none';
          if(auth) auth.style.display = 'flex';
        }
      });
    } else if(tries++ < 50) {
      setTimeout(waitSB, 100);
    } else {
      document.body.innerHTML = '<p style="color:red;text-align:center;padding:2rem">فشل تحميل المكتبة. أعد تحميل الصفحة.</p>';
    }
  }
  waitSB();
})();
