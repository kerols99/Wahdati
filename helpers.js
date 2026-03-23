// ══ HELPERS ══
(function(){
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function debounce(fn, wait) {
    var timer;
    return function() {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(ctx, args); }, wait || 180);
    };
  }
  function setButtonBusy(btn, isBusy, labelHtml) {
    if(!btn) return;
    if(isBusy) {
      btn.dataset.prevHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span>';
      return;
    }
    btn.disabled = false;
    btn.innerHTML = labelHtml || btn.dataset.prevHtml || btn.innerHTML;
  }
  function closeModalById(id){
    var el = document.getElementById(id);
    if(el) el.remove();
  }
  function safeOpen(url){
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e) {}
  }

  function monthStart(ym) {
    ym = String(ym || '').slice(0,7);
    return ym ? ym + '-01' : '';
  }
  function monthEnd(ym) {
    ym = String(ym || '').slice(0,7);
    var parts = ym.split('-').map(Number);
    var y = parts[0], m = parts[1];
    if(!y || !m) return '';
    var d = new Date(y, m, 0).getDate();
    return String(y) + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  }
  function monthDateRange(ym) {
    return { start: monthStart(ym), end: monthEnd(ym) };
  }
  window.qs = qs;
  window.qsa = qsa;
  window.escapeHtml = escapeHtml;
  window.debounce = debounce;
  window.setButtonBusy = setButtonBusy;
  window.closeModalById = closeModalById;
  window.safeOpen = safeOpen;
  window.monthStart = monthStart;
  window.monthEnd = monthEnd;
  window.monthDateRange = monthDateRange;
})();
