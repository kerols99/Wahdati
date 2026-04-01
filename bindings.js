// ══ BINDINGS ══
(function(){
  var debouncedSearch = function(){ if(window.filterUnits) window.filterUnits(); };
  if(window.debounce) debouncedSearch = debounce(debouncedSearch, 140);

  function bindActions() {
    document.addEventListener('click', function(e){
      var el = e.target.closest('[data-click], [data-tab-target], .nav .ni');
      if(!el) return;

      if(el.dataset.tabTarget) {
        e.preventDefault();
        if(window.switchTab) window.switchTab(el.dataset.tabTarget, el);
      // Auto-load bulk list when switching to bulk tab
      if(el.dataset.tabTarget === 'tBulk' && window.loadBulkPay) setTimeout(loadBulkPay, 100);
      if(el.dataset.tabTarget === 'tInternal' && window.loadInternalTransfers) setTimeout(loadInternalTransfers, 100);
      // Auto-load comparison when switching to compare tab
      if(el.dataset.tabTarget === 'rCompare') {
        var yEl = document.getElementById('rcmp-year');
        if(yEl && !yEl.value) yEl.value = new Date().getFullYear();
      }
        return;
      }

      var action = el.dataset.click;
      if(!action) return;
      e.preventDefault();

      switch(action) {
        case 'doLogin': return window.doLogin && window.doLogin();
        case 'doForgot': return window.doForgot && window.doForgot();
        case 'toggleTheme': return window.toggleTheme && window.toggleTheme();
        case 'toggleLang': return window.toggleLang && window.toggleLang();
        case 'goSettings': return window.goPanel && window.goPanel('settings');
        case 'goReports': return window.goPanel && window.goPanel('reports');
        case 'goPanel': return window.goPanel && window.goPanel(el.dataset.p);
        case 'loadHome': return window.loadHome && window.loadHome(el, true);
        case 'setFilter': return window.setFilter && window.setFilter(el.dataset.filter, el);
        case 'pickUnitImgs':
          var fi = document.getElementById('u-imgs');
          if(fi) fi.click();
          return;
        case 'saveUnit': return window.saveUnit && window.saveUnit(el);
        case 'clearUnit': return window.clearUnit && window.clearUnit();
        case 'saveRent': return window.saveRent && window.saveRent(el);
        case 'saveExp': return window.saveExp && window.saveExp(el);
        case 'saveOwner': return window.saveOwner && window.saveOwner(el);
        case 'saveDep': return window.saveDep && window.saveDep(el);
        case 'loadMonthly': return window.loadMonthly && window.loadMonthly(el);
        case 'loadExpRpt': return window.loadExpRpt && window.loadExpRpt(el);
        case 'loadDepRpt': return window.loadDepRpt && window.loadDepRpt(el);
        case 'loadAllDeps': return window.loadAllDeps && window.loadAllDeps(el);
        case 'loadAnnual': return window.loadAnnual && window.loadAnnual(el);
        case 'loadStats': return window.loadStats && window.loadStats(el);
        case 'loadCollReport': return window.loadCollReport && window.loadCollReport(el);
        case 'loadFinSummary': return window.loadFinSummary && window.loadFinSummary(el);
        case 'testConn': return window.testConn && window.testConn();
        case 'toggleAddStaff': return window.toggleAddStaff && window.toggleAddStaff();
        case 'createUser': return window.createUser && window.createUser(el);
        case 'loadTeam': return window.loadTeam && window.loadTeam(el);
        case 'doLogout': return window.doLogout && window.doLogout();
        case 'addMoveEntry': return window.addMoveEntry && window.addMoveEntry(el.dataset.type);
        case 'showWelcomeLetter': return window.showWelcomeLetter && window.showWelcomeLetter();
        case 'printWelcomeLetter': return window.printWelcomeLetter && window.printWelcomeLetter();
        case 'sendWelcomeWA': return window.sendWelcomeWA && window.sendWelcomeWA();
        case 'closePdf':
          var pdf = document.getElementById('pdfOverlay');
          if(pdf) pdf.style.display = 'none';
          return;
        case 'printPdf': return window.print && window.print();
      }
    });

    document.addEventListener('input', function(e){
      var el = e.target;
      if(el.id === 'search-inp') return debouncedSearch();
      if(el.dataset.input === 'calcTotalRent' && window.calcTotalRent) return window.calcTotalRent();
      if(el.dataset.input === 'autoFillRent' && window.autoFillRent) return window.autoFillRent();
      if(el.dataset.input === 'autoFillDepDate' && window.autoFillDepDate) return window.autoFillDepDate();
      if(el.dataset.input === 'calcOwnerBalance' && window.calcOwnerBalance) return window.calcOwnerBalance();
    });

    document.addEventListener('blur', function(e){
      var el = e.target;
      if(el.dataset.blur === 'autoFillRent' && window.autoFillRent) window.autoFillRent();
    }, true);

    document.addEventListener('change', function(e){
      var el = e.target;
      if(el.dataset.change === 'previewUnitImgs' && window.previewUnitImgs) window.previewUnitImgs(el);
      if(el.dataset.change === 'toggleVacantMode' && window.toggleVacantMode) window.toggleVacantMode(el);
    });

    var drawer = document.getElementById('drawer');
    if(drawer) {
      drawer.addEventListener('touchstart', function(e){ window.drTouchStart && window.drTouchStart(e); }, {passive:true});
      drawer.addEventListener('touchmove', function(e){ window.drTouchMove && window.drTouchMove(e); }, {passive:true});
      drawer.addEventListener('touchend', function(e){ window.drTouchEnd && window.drTouchEnd(e); }, {passive:true});
    }

    var pass = document.getElementById('l-pass');
    if(pass) {
      pass.addEventListener('keydown', function(e){
        if(e.key === 'Enter' && window.doLogin) window.doLogin();
      });
    }
  }

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindActions, {once:true});
  } else {
    bindActions();
  }
})();
