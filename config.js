
// ══ CONFIG ══
const SB_URL = 'https://fdackyyoubwustrsiucs.supabase.co';
const SB_KEY = 'sb_publishable_rXlNwZBkhCZJ5JobGPd5DA_wiLOooC4';

var sb;
var ME = null, MY_ROLE = 'collector', MO = [], CURRENT_PANEL = 'home';
var LANG = localStorage.getItem('app_lang') || 'ar';
var _toastTmr, _FILT = 'all';
var APP_THEME = localStorage.getItem('app_theme') || 'dark';

var T = {
  ar: {
    home:'الرئيسية', units:'الوحدات', add:'إضافة', ops:'عمليات', reports:'تقارير', settings:'الإعدادات',
    addUnit:'إضافة وحدة', ops_title:'العمليات', reports_title:'التقارير',
    paid:'مدفوع', partial:'جزئي', unpaid:'غير مدفوع', remaining:'المتبقي', unit:'وحدة', late:'المتأخرون', refresh:'تحديث',
    unit_sec:'بيانات الوحدة', tenant_sec:'بيانات المستأجر', apt:'الشقة', room:'الغرفة', rent:'الإيجار', deposit:'التأمين',
    startDate:'تاريخ البدء', tenantName:'اسم المستأجر', phone:'الهاتف', persons:'عدد الأشخاص', lang:'اللغة', window:'النافذة', notes:'ملاحظات',
    saveUnit:'حفظ الوحدة', rent_tab:'إيجار', exp_tab:'مصروف', owner_tab:'مالك', dep_tab:'تأمين', amount:'المبلغ', month:'الشهر', method:'طريقة الدفع',
    cash:'كاش', transfer:'تحويل', cheque:'شيك', saveRent:'حفظ الإيجار', category:'الفئة', receipt:'الإيصال', desc:'الوصف', saveExp:'حفظ المصروف',
    ref:'المرجع', saveOwner:'حفظ دفعة المالك', dep_status:'حالة التأمين', refund_amt:'المبلغ المسترد', deduction:'الخصم', reason:'السبب', held:'محتجز',
    refunded:'مسترد', forfeited:'مصادَر', saveDep:'حفظ التأمين', mon_tab:'شهري', exp_rpt:'المصروفات', dep_rpt:'التأمينات', ann_tab:'سنوي',
    current_user:'المستخدم الحالي', conn_status:'حالة الاتصال', conn_test:'اختبار الاتصال', logout:'تسجيل الخروج', team_mgmt:'إدارة الفريق', add_staff:'إضافة موظف',
    staff_name:'اسم الموظف', staff_email:'إيميل الموظف', staff_pass:'كلمة المرور', staff_role:'الدور', create_acc:'إنشاء الحساب', team_list:'قائمة الفريق', update_list:'تحديث القائمة', install:'التثبيت',
    moves:'تنقلات', departures:'مغادرون', arrivals:'حجوزات جديدة', welcome:'رسالة ترحيب', addDeparture:'إضافة مغادر', addArrival:'إضافة حجز جديد',
    departures_hint:'المغادرون أول الشهر القادم', arrivals_hint:'الحجوزات الجديدة أول الشهر القادم', preview:'معاينة', pdf:'PDF', whatsapp:'واتساب',
    fill_then_preview:'أدخل البيانات ثم اضغط معاينة أو PDF مباشرة', partitionNo:'رقم البارتشن', building:'المبنى', idPassport:'رقم الهوية / الجواز', optionalWA:'واتساب (اختياري)',
    tenant_only:'المكان للمستأجر فقط', moveDate:'تاريخ المغادرة', startDate2:'تاريخ البدء', selectUnit:'اختر من الوحدات المسجلة', linkDeparture:'ربط بمغادر مسجل',
    noRegisteredDep:'لا يوجد مغادرون مسجلون', noRegisteredArr:'لا يوجد حجوزات مسجلة', save:'حفظ', cancel:'إلغاء', noUnits:'لا توجد وحدات مشغولة', noDepartures:'لا توجد مغادرات متاحة',
    nameRequired:'يرجى ملء الاسم والشقة والغرفة', savedDeparture:'تم تسجيل المغادر ✓', savedArrival:'تم تسجيل الحجز ✓', deleted:'تم الحذف', unitSearch:'ابحث باسم المستأجر أو الشقة/الغرفة', markDepartEndMonth:'تسجيل مغادرة آخر الشهر', markedDepartEndMonth:'تم تسجيل المغادرة آخر الشهر ✓', alreadyMarkedDepart:'هذه الوحدة مسجلة كمغادرة بالفعل', departingEndMonth:'مغادر آخر الشهر', scheduledDeparture:'مغادرة مسجلة', search:'بحث', vacantUnit:'الوحدة فاضية / شاغرة', vacantHelp:'إذا كانت الوحدة شاغرة فلن تدخل في الحسابات الشهرية'
  },
  en: {
    home:'Home', units:'Units', add:'Add', ops:'Operations', reports:'Reports', settings:'Settings',
    addUnit:'Add Unit', ops_title:'Operations', reports_title:'Reports',
    paid:'Paid', partial:'Partial', unpaid:'Unpaid', remaining:'Remaining', unit:'Unit', late:'Late', refresh:'Refresh',
    unit_sec:'Unit Details', tenant_sec:'Tenant Details', apt:'Apartment', room:'Room', rent:'Rent', deposit:'Deposit',
    startDate:'Start Date', tenantName:'Tenant Name', phone:'Phone', persons:'Persons', lang:'Language', window:'Window', notes:'Notes',
    saveUnit:'Save Unit', rent_tab:'Rent', exp_tab:'Expense', owner_tab:'Owner', dep_tab:'Deposit', amount:'Amount', month:'Month', method:'Method',
    cash:'Cash', transfer:'Transfer', cheque:'Cheque', saveRent:'Save Rent', category:'Category', receipt:'Receipt', desc:'Description', saveExp:'Save Expense',
    ref:'Reference', saveOwner:'Save Owner Payment', dep_status:'Deposit Status', refund_amt:'Refund Amount', deduction:'Deduction', reason:'Reason', held:'Held',
    refunded:'Refunded', forfeited:'Forfeited', saveDep:'Save Deposit', mon_tab:'Monthly', exp_rpt:'Expenses', dep_rpt:'Deposits', ann_tab:'Annual',
    current_user:'Current user', conn_status:'Connection status', conn_test:'Test connection', logout:'Logout', team_mgmt:'Team management', add_staff:'Add staff',
    staff_name:'Staff name', staff_email:'Staff email', staff_pass:'Password', staff_role:'Role', create_acc:'Create account', team_list:'Team list', update_list:'Refresh list', install:'Install',
    moves:'Moves', departures:'Departures', arrivals:'New bookings', welcome:'Welcome Letter', addDeparture:'Add Departure', addArrival:'Add Booking',
    departures_hint:'Departures at the beginning of next month', arrivals_hint:'New bookings at the beginning of next month', preview:'Preview', pdf:'PDF', whatsapp:'WhatsApp',
    fill_then_preview:'Enter the data, then click Preview or PDF', partitionNo:'Partition No.', building:'Building', idPassport:'ID / Passport No.', optionalWA:'WhatsApp (optional)',
    tenant_only:'For tenant only', moveDate:'Departure Date', startDate2:'Start Date', selectUnit:'Choose from registered units', linkDeparture:'Link to a registered departure',
    noRegisteredDep:'No departures registered', noRegisteredArr:'No bookings registered', save:'Save', cancel:'Cancel', noUnits:'No occupied units', noDepartures:'No available departures',
    nameRequired:'Please fill tenant name, apartment, and room', savedDeparture:'Departure saved ✓', savedArrival:'Booking saved ✓', deleted:'Deleted', vacantUnit:'Unit is vacant', vacantHelp:'Vacant units will not be included in monthly calculations'
  }
};

window.addEventListener('online', function(){ toast(LANG==='ar' ? 'تم استعادة الاتصال' : 'Connection restored','ok'); });
window.addEventListener('offline', function(){ toast(LANG==='ar' ? 'لا يوجد اتصال بالإنترنت' : 'No internet connection','err'); });

function initSB() {
  if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(SB_URL, SB_KEY);
  } else {
    setTimeout(initSB, 50);
  }
}

function toast(msg, type) {
  clearTimeout(_toastTmr);
  var el = document.getElementById('toast');
  if(!el) return;
  var icon = type==='err' ? '❌ ' : type==='ok' ? '✅ ' : 'ℹ️ ';
  el.textContent = icon + msg;
  el.className = 'show' + (type==='err'?' err':type==='ok'?' ok':'');
  _toastTmr = setTimeout(function(){ el.className=''; }, 3200);
}

// ══════════════════════════════════════
// SELECTED_MONTH — Global month selector
// كل التطبيق بيستخدم الشهر ده بدل new Date()
// ══════════════════════════════════════
var SELECTED_MONTH = null; // null = الشهر الحالي

function getActiveMonth() {
  if(SELECTED_MONTH) return SELECTED_MONTH;
  var now = new Date();
  return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
}

function getActiveMonthFirst() {
  return getActiveMonth() + '-01';
}

function getActiveMonthEnd() {
  // آخر يوم في الشهر المختار
  var ym = getActiveMonth().split('-');
  return new Date(parseInt(ym[0]), parseInt(ym[1]), 0).toISOString().slice(0,10);
}

function isHistoricalMonth() {
  if(!SELECTED_MONTH) return false;
  var now = new Date();
  var currentYM = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  return SELECTED_MONTH !== currentYM && SELECTED_MONTH < currentYM;
}

function isFutureMonth() {
  if(!SELECTED_MONTH) return false;
  var now = new Date();
  var currentYM = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  return SELECTED_MONTH > currentYM;
}

// payment_date للشهر المختار = آخر يوم فيه
function getActivePaymentDate() {
  if(isHistoricalMonth()) return getActiveMonthEnd();
  return new Date().toISOString().slice(0,10);
}

window.getActiveMonth       = getActiveMonth;
window.getActiveMonthFirst  = getActiveMonthFirst;
window.getActiveMonthEnd    = getActiveMonthEnd;
window.isHistoricalMonth    = isHistoricalMonth;
window.getActivePaymentDate = getActivePaymentDate;

// ══════════════════════════════════════
// Month Selector UI
// ══════════════════════════════════════
function initMonthSelector() {
  // إظهار الـ bar بعد اللوجين
  var bar = document.getElementById('month-selector-bar');
  if(bar) bar.style.display = 'flex';
  updateMonthSelectorUI();
}

function updateMonthSelectorUI() {
  var ym    = getActiveMonth();
  var label = document.getElementById('month-selector-label');
  var sub   = document.getElementById('month-selector-sub');
  var todayBtn  = document.getElementById('month-today-btn');
  var nextBtn   = document.getElementById('month-next-btn');

  // لو العناصر مش موجودة — retry بعد 200ms
  if(!label) {
    setTimeout(updateMonthSelectorUI, 200);
    return;
  }

  var now       = new Date();
  var currentYM = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var isHistory = isHistoricalMonth();
  var isFuture  = ym > currentYM;

  // Label
  var months_ar = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var parts = ym.split('-');
  var mIdx  = parseInt(parts[1]) - 1;
  var year  = parts[0];
  var mName = LANG==='ar' ? months_ar[mIdx] : months_en[mIdx];

  label.textContent = mName + ' ' + year;
  label.style.color = isHistory ? 'var(--amber)' : isFuture ? 'var(--accent)' : 'var(--text)';

  if(sub) {
    sub.textContent = isHistory ? (LANG==='ar'?'وضع الاسترجاع':'History Mode') :
                      isFuture  ? (LANG==='ar'?'شهر قادم':'Future Month') :
                                  (LANG==='ar'?'الشهر الحالي':'Current Month');
    sub.style.color = isHistory ? 'var(--amber)' : isFuture ? 'var(--accent)' : 'var(--green)';
  }

  // Show/hide "back to current" button
  if(todayBtn) todayBtn.style.display = (isHistory || isFuture) ? 'block' : 'none';

  // Disable next if current month
  if(nextBtn) nextBtn.style.opacity = isFuture ? '0.4' : '1';

  // تغيير لون الـ bar لو في وضع استرجاع
  var bar = document.getElementById('month-selector-bar');
  if(bar) bar.style.borderBottom = isHistory ? '2px solid var(--amber)' : isFuture ? '2px solid var(--accent)' : '1px solid var(--border)';
}

function changeActiveMonth(delta) {
  var ym    = getActiveMonth().split('-');
  var year  = parseInt(ym[0]);
  var month = parseInt(ym[1]) + delta;

  if(month > 12) { month = 1; year++; }
  if(month < 1)  { month = 12; year--; }

  var newYM = year + '-' + String(month).padStart(2,'0');

  // منع الانتقال لأكتر من شهر في المستقبل
  var now = new Date();
  var nextYM = now.getFullYear()+'-'+String(now.getMonth()+2 > 12 ? 1 : now.getMonth()+2).padStart(2,'0');
  if(newYM > nextYM) return;

  SELECTED_MONTH = newYM;
  updateMonthSelectorUI();
  refreshAllScreens();
}

function resetToCurrentMonth() {
  SELECTED_MONTH = null;
  updateMonthSelectorUI();
  refreshAllScreens();
}

function refreshAllScreens() {
  // إعادة تحميل الشاشة الحالية
  var activePanel = document.querySelector('.panel.active');
  if(!activePanel) return;
  var id = activePanel.id;

  if(id === 'panel-home')     { if(window.loadHome)    loadHome(null, true); }
  else if(id === 'panel-units')    { if(window.loadUnits)   loadUnits(); }
  else if(id === 'panel-reports')  { if(window.loadReports) loadReports(); }
  else if(id === 'panel-ops')      { /* payments reload on tab switch */ }
}

window.initMonthSelector   = initMonthSelector;
window.updateMonthSelectorUI = updateMonthSelectorUI;
window.changeActiveMonth   = changeActiveMonth;
window.resetToCurrentMonth = resetToCurrentMonth;
window.refreshAllScreens   = refreshAllScreens;

function goPanel(name) {
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.ni').forEach(function(n){ n.classList.remove('active'); });
  var panel = document.getElementById('panel-'+name);
  if(panel) panel.classList.add('active');
  var ni = document.querySelector('.ni[data-p="'+name+'"]');
  if(ni) ni.classList.add('active');
  CURRENT_PANEL = name;
  if(name==='home' && window.loadHome) loadHome(document.getElementById('btn-refresh'), false);
  if(name==='units' && window.loadUnits) loadUnits();
  if(name==='settings' && window.loadWATemplatesIntoSettings) loadWATemplatesIntoSettings();
  if(name==='pay' || name==='reports') {
    // تحديث كل month inputs بالشهر المختار
    var _ym    = window.getActiveMonth    ? getActiveMonth()    : (new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0'));
    var _today = window.getActivePaymentDate ? getActivePaymentDate() : new Date().toISOString().slice(0,10);
    var _year  = _ym.split('-')[0];
    ['r-month','rcoll-month','rdep-month','e-month','o-month','pay-month','exp-month','own-month','rpm'].forEach(function(mid){
      var el = document.getElementById(mid);
      if(el) el.value = _ym;
    });
    ['r-pdate','pay-date'].forEach(function(pid){
      var el = document.getElementById(pid);
      if(el) el.value = _today;
    });
    var yEl = document.getElementById('r-year');
    if(yEl) yEl.value = _year;
  }
  if(name==='moves' && window.loadMovesList) { loadMovesList('depart'); loadMovesList('arrive'); }
}

function switchTab(id, btn) {
  var parent = btn.closest('.panel') || btn.closest('.card') || document.body;
  parent.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
  parent.querySelectorAll('.tpanel').forEach(function(p){ p.classList.remove('active'); });
  btn.classList.add('active');
  var tp = document.getElementById(id);
  if(tp) tp.classList.add('active');

  // تحديث كل الـ month inputs بالشهر المختار
  var _ym    = window.getActiveMonth    ? getActiveMonth()    : (new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0'));
  var _today = window.getActivePaymentDate ? getActivePaymentDate() : new Date().toISOString().slice(0,10);

  if(id==='tRent' || id==='tExp' || id==='tOwner' || id==='tDep') {
    ['r-month','e-month','o-month','dep-month','pay-month','exp-month','own-month'].forEach(function(mid){
      var el = document.getElementById(mid);
      if(el) el.value = _ym;
    });
    var pd = document.getElementById('r-pdate');
    if(pd) pd.value = _today;
    var pd2 = document.getElementById('pay-date');
    if(pd2) pd2.value = _today;
  }
}

async function testConn() {
  try {
    var result = await sb.from('units').select('id').limit(1);
    toast(result.error ? ((LANG==='ar'?'خطأ: ':'Error: ')+result.error.message) : (LANG==='ar'?'الاتصال يعمل ✓':'Connection works ✓'), result.error?'err':'ok');
  } catch(e) { toast((LANG==='ar'?'خطأ: ':'Error: ')+e.message,'err'); }
}

function applyLang() {
  var ar = LANG==='ar';
  document.documentElement.lang = ar?'ar':'en';
  document.documentElement.dir  = ar?'rtl':'ltr';
  var lb = document.getElementById('lang-btn');
  if(lb) lb.textContent = ar?'EN':'عر';

  var as = document.getElementById('auth-sub-text');
  if(as) as.innerHTML = ar
    ? 'نظام إدارة العقارات<br><span style="font-size:.72rem;color:var(--muted)">للدخول فقط — تواصل مع المسؤول للحصول على حساب</span>'
    : 'Property Management System<br><span style="font-size:.72rem;color:var(--muted)">Login only — contact admin for an account</span>';
  setT('lbl-email', ar?'البريد الإلكتروني':'Email');
  setT('lbl-pass',  ar?'كلمة السر':'Password');
  var lb2 = document.getElementById('lbtn');
  if(lb2 && !lb2.disabled) lb2.textContent = ar?'🔐 دخول':'🔐 Login';
  setT('forgot-btn', ar?'نسيت كلمة السر؟':'Forgot password?');

  setT('nav-home', t('home')); setT('nav-units', t('units')); setT('nav-add', t('add')); setT('nav-ops', t('ops')); setT('nav-reports', t('reports')); setT('nav-moves', t('moves'));
  setT('h-home', t('home')); setT('h-units', t('units')); setT('h-add', t('addUnit')); setT('h-ops', t('ops_title')); setT('h-reports', t('reports_title')); setT('h-settings', t('settings'));
  setT('sl-paid', t('paid')); setT('sl-partial', t('partial')); setT('sl-unpaid', t('unpaid')); setT('sl-remaining', t('remaining'));
  ['ss-paid','ss-partial','ss-unpaid','ss-remaining'].forEach(function(id){ setT(id, t('unit')); });
  setT('lbl-late', t('late')); setT('btn-refresh', t('refresh')); setT('btn-reports', ar?'📊 التقارير':'📊 Reports');

  setT('lbl-unit-sec', t('unit_sec')); setT('lbl-vacant', t('vacantUnit')); setT('vacant-help', t('vacantHelp')); setT('lbl-tenant-sec', t('tenant_sec')); setT('lbl-apt', t('apt')); setT('lbl-room', t('room')); setT('lbl-rent', t('rent')); setT('lbl-dep', t('deposit')); setT('lbl-start', t('startDate')); setT('lbl-uname', t('tenantName')); setT('lbl-phone', t('phone')); setT('lbl-cnt', t('persons')); setT('lbl-lang', t('lang')); setT('lbl-win', t('window')); setT('lbl-notes', t('notes'));
  var su = document.getElementById('savUnitBtn'); if(su) su.textContent = t('saveUnit');

  setT('tab-rent', t('rent_tab')); setT('tab-exp', t('exp_tab')); setT('tab-own', t('owner_tab')); setT('tab-dep', t('dep_tab'));
  setT('lbl-rapt', t('apt')); setT('lbl-rroom', t('room')); setT('lbl-ramt', t('amount')); setT('lbl-rmonth', t('month')); setT('lbl-rmeth', t('method')); setT('lbl-rnotes', t('notes'));
  setOptT('r-meth', 0, t('cash')); setOptT('r-meth', 1, t('transfer')); setOptT('r-meth', 2, t('cheque'));
  var srb = document.querySelector('#tRent .btn'); if(srb) srb.textContent = t('saveRent');
  setT('lbl-ecat', t('category')); setT('lbl-eamt', t('amount')); setT('lbl-emonth', t('month')); setT('lbl-erec', t('receipt')); setT('lbl-edesc', t('desc'));
  var seb = document.querySelector('#tExp .btn'); if(seb) seb.textContent = t('saveExp');
  setT('lbl-oamt', t('amount')); setT('lbl-omonth', t('month')); setT('lbl-ometh', t('method')); setT('lbl-oref', t('ref')); setT('lbl-onotes', t('notes'));
  setOptT('o-meth', 0, t('cash')); setOptT('o-meth', 1, t('transfer')); setOptT('o-meth', 2, t('cheque'));
  var sob = document.querySelector('#tOwn .btn'); if(sob) sob.textContent = t('saveOwner');
  setT('lbl-dapt', t('apt')); setT('lbl-droom', t('room')); setT('lbl-dname', t('tenantName')); setT('lbl-damt', t('amount')); setT('lbl-dstatus', t('dep_status')); setT('lbl-dref', t('refund_amt')); setT('lbl-dded', t('deduction')); setT('lbl-dwhy', t('reason')); setT('lbl-dnotes', t('notes'));
  setOptT('d-status', 0, t('held')); setOptT('d-status', 1, t('refunded')); setOptT('d-status', 2, t('forfeited'));
  var sdb = document.querySelector('#tDep .btn'); if(sdb) sdb.textContent = t('saveDep');

  setT('rtab-mon', t('mon_tab')); setT('rtab-exp', t('exp_rpt')); setT('rtab-dep', t('dep_rpt')); setT('rtab-ann', t('ann_tab')); setT('lbl-rpm', t('month')); setT('lbl-rem', t('month')); setT('lbl-ryear', ar?'السنة':'Year');
  setT('lbl-cur-user', t('current_user')); setT('lbl-conn', t('conn_status')); setT('btn-test-conn', t('conn_test')); setT('btn-logout', t('logout')); setT('lbl-team', t('team_mgmt')); setT('btn-add-staff', t('add_staff')); setT('lbl-iname', t('staff_name')); setT('lbl-iemail', t('staff_email')); setT('lbl-ipass', t('staff_pass')); setT('lbl-irole', t('staff_role')); setT('btn-create-acc', t('create_acc')); setT('lbl-team-list', t('team_list')); setT('btn-update-list', t('update_list')); setT('lbl-install', t('install'));

  // Moves static text
  setT('moves-title', ar?'🚪 تنقلات الشهر':'🚪 Monthly Moves');
  setT('moves-tab-depart', ar?'📤 مغادرون':'📤 Departures');
  setT('moves-tab-arrive', ar?'📥 حجوزات جديدة':'📥 New Bookings');
  setT('moves-tab-welcome', ar?'📄 رسالة ترحيب':'📄 Welcome Letter');
  setT('moves-depart-hint', t('departures_hint'));
  setT('moves-arrive-hint', t('arrivals_hint'));
  setT('btn-add-depart', ar?'+ إضافة':'+ Add');
  setT('btn-add-arrive', ar?'+ إضافة':'+ Add');
  setT('btn-show-welcome', '👁️ ' + t('preview')); setT('btn-print-welcome', '🖨️ ' + t('pdf')); setT('btn-send-welcome-wa', '💬 ' + t('whatsapp')); setT('welcome-help', t('fill_then_preview'));
  setT('wl-name-lbl', t('tenantName')); setT('wl-room-lbl', t('partitionNo')); setT('wl-apt-lbl', t('apt')); setT('wl-rent-lbl', ar?'الإيجار (AED)':'Rent (AED)'); setT('wl-dep-lbl', ar?'العربون المستلم (AED)':'Booking deposit received (AED)'); setT('wl-start-lbl', t('startDate')); setT('wl-building-lbl', t('building')); setT('wl-persons-lbl', t('persons')); setT('wl-id-lbl', t('idPassport')); setT('wl-phone-lbl', t('optionalWA'));
  var previewTitle = document.querySelector('#pdfOverlay .pdf-header span'); if(previewTitle) previewTitle.textContent = ar?'معاينة التقرير':'Preview';
  setT('btn-close-pdf', ar?'✕ إغلاق':'✕ Close'); setT('btn-print-pdf', ar?'🖨️ طباعة':'🖨️ Print');
  var si = document.getElementById('search-inp'); if(si) si.placeholder = ar?'ابحث بالشقة أو الاسم...':'Search by apartment or name...';
}

function toggleLang() { LANG = LANG==='ar'?'en':'ar'; localStorage.setItem('app_lang', LANG); applyLang(); }
function t(k) { return (T[LANG]||T.ar)[k]||k; }
function setT(id, txt) { var e=document.getElementById(id); if(e) e.textContent=txt; }
function setOptT(sid, i, txt) { var e=document.getElementById(sid); if(e&&e.options[i]) e.options[i].text=txt; }
function applyTheme(theme) { APP_THEME = theme; document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : ''); var btn = document.getElementById('theme-btn'); if(btn) btn.textContent = theme === 'light' ? '☀️' : '🌙'; localStorage.setItem('app_theme', theme); }
function toggleTheme() { applyTheme(APP_THEME === 'dark' ? 'light' : 'dark'); }

window.initSB=initSB; window.toast=toast; window.goPanel=goPanel; window.switchTab=switchTab; window.testConn=testConn; window.applyLang=applyLang; window.toggleLang=toggleLang; window.t=t; window.setT=setT; window.setOptT=setOptT; window.applyTheme=applyTheme; window.toggleTheme=toggleTheme;
