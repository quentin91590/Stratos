const tabs = document.querySelectorAll('.kpi-tabs [role="tab"]');
const panels = document.querySelectorAll('.kpi-panels [role="tabpanel"]');
const panelsWrap = document.querySelector('.kpi-panels');
const sticky = document.querySelector('.panel-sticky');
const panelBox = document.querySelector('.panel-box');
const topSentinel = panelBox ? panelBox.querySelector('.panel-top-sentinel') : null;
let atTopVisible = true;
let idleTimer = null;

if(topSentinel && 'IntersectionObserver' in window){
  const io = new IntersectionObserver(entries => {
    atTopVisible = entries[0].isIntersecting;
    if(atTopVisible && sticky){ sticky.classList.remove('is-idle'); }
  }, {root: null, threshold: 0.01});
  io.observe(topSentinel);
}
function handleScroll(){
  if(!sticky) return;
  sticky.classList.remove('is-idle');
  if(idleTimer) clearTimeout(idleTimer);
  if(atTopVisible) return;
  idleTimer = setTimeout(()=> sticky.classList.add('is-idle'), 900);
}

function updateTrendPadding(){
  document.querySelectorAll('.kpi-value-wrap').forEach(w=>{
    const t = w.querySelector('.kpi-trend');
    if(!t) return;
    const wpx = Math.ceil(t.getBoundingClientRect().width);
    w.style.setProperty('--trend-w', wpx + 'px');
  });
}

function selectTab(tab){
  tabs.forEach(t=>{t.setAttribute('aria-selected','false'); t.setAttribute('aria-expanded','false');});
  tab.setAttribute('aria-selected','true');
  tab.setAttribute('aria-expanded','true');
  panels.forEach(p=>p.hidden = (p.id !== tab.getAttribute('aria-controls')));
  const c = getComputedStyle(tab).getPropertyValue('--status').trim();
  if(c) panelsWrap.style.setProperty('--active-color', c);
  const activeTop = document.querySelector('.top-item.is-active');
  if(activeTop && activeTop.dataset.section === 'energie'){
    document.documentElement.style.setProperty('--section-color', '#60a5fa');
  }
  const label = tab.querySelector('.kpi-label');
  const ofEl = document.getElementById('panel-of');
  if(label && ofEl) ofEl.textContent = label.textContent;
  if(sticky){
    const psIcon = sticky.querySelector('.ps-icon');
    const srcIcon = tab.querySelector('.kpi-icon');
    if(psIcon && srcIcon){ psIcon.innerHTML = srcIcon.innerHTML; }
    const psDot = sticky.querySelector('.ps-dot');
    if(psDot && c){ psDot.style.background = c; }
  }
  const nSites = tab.dataset.sites || '';
  const nSre = tab.dataset.sre || '';
  const s1 = document.getElementById('sum-sites-val');
  const s2 = document.getElementById('sum-sre-val');
  const fmt = v => v? new Intl.NumberFormat('fr-FR').format(Number(v)) : '—';
  if(s1) s1.textContent = fmt(nSites);
  if(s2) s2.textContent = fmt(nSre);

  updateTrendPadding();
  handleScroll();
  document.querySelectorAll('.kpi .arr').forEach(a=>a.classList.remove('animate-up','animate-down'));
  const tr = tab.querySelector('.kpi-trend');
  if(tr){
    const a = tr.querySelector('.arr');
    if(a){ a.classList.add(tr.classList.contains('trend-down') ? 'animate-down' : 'animate-up'); }
  }
}

const initial = document.querySelector('.kpi[aria-selected="true"]') || tabs[0];
selectTab(initial);

tabs.forEach(tab=>tab.addEventListener('click', ()=>selectTab(tab)));
window.addEventListener('resize', updateTrendPadding);
window.addEventListener('scroll', handleScroll, {passive:true});
handleScroll();

const idxOf = el => Array.from(tabs).indexOf(el);
document.querySelector('.kpi-tabs').addEventListener('keydown', (e)=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
  e.preventDefault();
  const current = document.activeElement.closest('[role="tab"]') || initial;
  let idx = idxOf(current);
  if(e.key==='ArrowRight') idx = (idx+1)%tabs.length;
  if(e.key==='ArrowLeft') idx = (idx-1+tabs.length)%tabs.length;
  if(e.key==='Home') idx = 0;
  if(e.key==='End') idx = tabs.length-1;
  tabs[idx].focus(); selectTab(tabs[idx]);
});

window.addEventListener('load', updateTrendPadding);

/* ===== Top menu (sections) ===== */
const topItems = document.querySelectorAll('.top-nav .top-item');
function selectSection(name){
  const root = document.documentElement;
  const isEnergy = (name === 'energie');
  const tabsEl = document.querySelector('.kpi-tabs');
  const panelsEl = document.querySelector('.kpi-panels');
  if(tabsEl) tabsEl.hidden = !isEnergy;
  if(panelsEl) panelsEl.hidden = !isEnergy;
  ['travaux','regs','financier'].forEach(n=>{
    const el = document.getElementById('section-'+n);
    if(el) el.hidden = (n !== name);
  });
  if(isEnergy){
    root.style.setProperty('--section-color', '#60a5fa');
  } else {
    const map = { travaux:'#b45309', regs:'#ef4444', financier:'#facc15' };
    root.style.setProperty('--section-color', map[name] || '#94a3b8');
  }
  topItems.forEach(btn=>{
    const active = (btn.dataset.section === name);
    btn.classList.toggle('is-active', active);
    if(active) btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current');
  });
  if(isEnergy){ updateTrendPadding(); handleScroll(); }
}

topItems.forEach(btn=> btn.addEventListener('click', ()=> selectSection(btn.dataset.section)));
selectSection('energie');

/* ===== Tiny tests (console) ===== */
(function runTests(){
  try{
    console.assert(tabs.length === 6, 'Il doit y avoir 6 onglets');
    const before = document.querySelector('.kpi[aria-selected="true"]');
    const target = document.getElementById('tab-chaleur');
    selectTab(target);
    const after = document.querySelector('.kpi[aria-selected="true"]');
    console.assert(after === target, 'selectTab doit activer l\'onglet cliqué');
    console.assert(!document.getElementById('panel-energie').hidden && before.id==='tab-energie' ? false : true, 'Le panneau précédent doit se masquer');
    console.assert(!document.getElementById('panel-chaleur').hidden, 'Le panneau chaleur doit être visible');
    const wrap = target.querySelector('.kpi-value-wrap');
    const tw = getComputedStyle(wrap).getPropertyValue('--trend-w');
    console.assert(parseInt(tw) >= 0, 'La largeur de tendance doit être mesurée');
    const tabsEl = document.querySelector('.kpi-tabs');
    const panelsEl = document.querySelector('.kpi-panels');
    selectSection('travaux');
    console.assert(tabsEl.hidden && panelsEl.hidden, 'La section Énergie doit se masquer quand on quitte.');
    selectSection('energie');
    console.assert(!tabsEl.hidden && !panelsEl.hidden, 'La section Énergie doit réapparaître.');
    selectSection('financier');
    const col = getComputedStyle(document.documentElement).getPropertyValue('--section-color').trim();
    console.assert(col === '#facc15', 'La couleur de Financier doit être jaune (#FACC15).');
    selectTab(initial);
  }catch(e){ console.warn('Tests UI: ', e); }
})();
