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

function alignPanelToTabs(){
  const wrap  = document.querySelector('.kpi-wrap');
  const tabs  = document.querySelector('.kpi-tabs');
  const panel = document.querySelector('.kpi-panels .panel-box');
  if(!wrap || !tabs || !panel) return;

  const wrapRect = wrap.getBoundingClientRect();
  const tabsRect = tabs.getBoundingClientRect();

  panel.style.marginLeft  = (tabsRect.left  - wrapRect.left) + 'px';
  panel.style.marginRight = (wrapRect.right - tabsRect.right) + 'px';
}

// recalculs fiables
window.addEventListener('load', alignPanelToTabs);
window.addEventListener('resize', alignPanelToTabs);

// si les fonts Google changent la largeur, attendre leur chargement
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(alignPanelToTabs);
}

// observer les changements de layout de la grille d’onglets
const tabsEl = document.querySelector('.kpi-tabs');
if ('ResizeObserver' in window && tabsEl) {
  new ResizeObserver(()=> alignPanelToTabs()).observe(tabsEl);
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


function syncStickyTop() {
  const topNav = document.querySelector('.top-nav');
  const header = document.querySelector('.sidebar-header');
  const h = (topNav ? topNav.offsetHeight : 0) + (header ? header.offsetHeight : 0);
  document.documentElement.style.setProperty('--sticky-top', h + 'px');
}

  window.addEventListener('load', syncStickyTop);
  window.addEventListener('resize', syncStickyTop);
function selectSection(name){
  // 1) caler l’offset sticky avant de basculer
  syncStickyTop();

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
    if(active) btn.blur(); // 3) évite que le focus force un scroll
  });

  // 2) remonter proprement en haut pour éviter les à-coups
  window.scrollTo({ top: 0, behavior: 'smooth' });

}


topItems.forEach(btn=> btn.addEventListener('click', ()=> selectSection(btn.dataset.section)));
selectSection('energie');

window.addEventListener('load', () => {
  syncStickyTop();
  selectSection('energie');
  selectTab(initial || tabs[0]);
  checkWholeParc(true);
  updateParcFromSites();
});

const originalSelectSection = selectSection;
selectSection = function(name){
  originalSelectSection(name);
  requestAnimationFrame(alignPanelToTabs);
};

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
    console.assert(tabsEl.hidden && panelsEl.hidden, 'La section Énergie doit se masquer quand on quitte.');
    console.assert(!tabsEl.hidden && !panelsEl.hidden, 'La section Énergie doit réapparaître.');
    const col = getComputedStyle(document.documentElement).getPropertyValue('--section-color').trim();
    console.assert(col === '#facc15', 'La couleur de Financier doit être jaune (#FACC15).');
    selectTab(initial);
  }catch(e){ console.warn('Tests UI: ', e); }
})();
/* ===== Sidebar: cases à cocher + surlignage synchronisés ===== */

// Helpers
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $  = (sel, root=document) => root.querySelector(sel);

// Éléments
const parcBtn   = $('.tree > .tree-node:not(.toggle)');
const parcCheck = parcBtn?.querySelector('.tree-check');
const siteBtns  = $$('.tree-group > .tree-node.toggle');
const siteCheck = (siteBtn) => siteBtn.querySelector('.tree-check');
const siteLeaves = (siteBtn) => {
  const list = siteBtn.nextElementSibling;
  return list ? $$('.tree-leaf', list) : [];
};
const leafCheck = (leafBtn) => leafBtn.querySelector('.tree-check');

// Visuel actif/partiel
function setActive(btn, on){
  btn.classList.toggle('is-active', !!on);
  btn.setAttribute('aria-selected', !!on);
}
function clearPartial(btn){ btn.classList.remove('is-partial'); }

// Met à jour un site depuis ses bâtiments
function updateSiteFromLeaves(siteBtn){
  const leaves = siteLeaves(siteBtn);
  const checks = leaves.map(leafCheck);
  const n = checks.length;
  const sel = checks.filter(c => c.checked).length;
  const cb  = siteCheck(siteBtn);
  if(!cb) return;

  cb.indeterminate = sel>0 && sel<n;
  cb.checked = sel===n && n>0;

  siteBtn.classList.toggle('is-partial', cb.indeterminate);
  setActive(siteBtn, cb.checked);
  if(cb.checked===false && !cb.indeterminate) clearPartial(siteBtn);
}

// Met à jour le Parc depuis l’état des sites
function updateParcFromSites(){
  if(!parcCheck) return;
  const checks = siteBtns.map(siteCheck).filter(Boolean);
  const n = checks.length;
  const allChecked = checks.every(c => c.checked);
  const any = checks.some(c => c.checked || c.indeterminate);

  parcCheck.indeterminate = any && !allChecked;
  parcCheck.checked = allChecked && n>0;

  parcBtn.classList.toggle('is-partial', parcCheck.indeterminate);
  setActive(parcBtn, parcCheck.checked);
  if(!parcCheck.checked && !parcCheck.indeterminate) clearPartial(parcBtn);
}

// Coche/décoche un site entier
function checkWholeSite(siteBtn, on){
  const cb = siteCheck(siteBtn);
  if(cb){ cb.indeterminate = false; cb.checked = !!on; }
  setActive(siteBtn, !!on);
  siteLeaves(siteBtn).forEach(leaf=>{
    const lcb = leafCheck(leaf);
    if(lcb) lcb.checked = !!on;
    setActive(leaf, !!on);
  });
  updateSiteFromLeaves(siteBtn);
  updateParcFromSites();
}

// Coche/décoche tout le parc
function checkWholeParc(on){
  siteBtns.forEach(site => checkWholeSite(site, on));
  updateParcFromSites();
}

// ——— Listeners ———

// Bâtiments : clic bouton → toggle la case; change → MAJ parents
$$('.tree-leaf').forEach(leafBtn=>{
  const cb = leafCheck(leafBtn);
  if(!cb) return;

  leafBtn.addEventListener('click', (e)=>{
    if(e.target === cb) return; // le change fera le reste
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', {bubbles:true}));
  });

  cb.addEventListener('change', ()=>{
    setActive(leafBtn, cb.checked);
    const siteBtn = leafBtn.closest('.tree-group')?.querySelector('.tree-node.toggle');
    if(siteBtn) updateSiteFromLeaves(siteBtn);
    updateParcFromSites();
  });
});

// Sites : chevron = plier/déplier; clic bouton = toggle case
siteBtns.forEach(siteBtn=>{
  const cb = siteCheck(siteBtn);
  if(!cb) return;

  siteBtn.addEventListener('click', (e)=>{
    const onChevron = !!e.target.closest('.chev');
    if(onChevron){
      const expanded = siteBtn.getAttribute('aria-expanded') === 'true';
      siteBtn.setAttribute('aria-expanded', String(!expanded));
      const list = siteBtn.parentElement.querySelector('.tree-children');
      if(list) list.style.display = expanded ? 'none' : 'flex';
      return;
    }
    if(e.target !== cb){
      cb.checked = !cb.checked;
      cb.indeterminate = false;
      cb.dispatchEvent(new Event('change', {bubbles:true}));
    }
  });

  cb.addEventListener('change', ()=>{
    checkWholeSite(siteBtn, cb.checked);
  });
});

// Parc : clic bouton = toggle case; change = propage à tout
if(parcBtn && parcCheck){
  parcBtn.addEventListener('click', (e)=>{
    if(e.target !== parcCheck){
      parcCheck.checked = !parcCheck.checked;
      parcCheck.indeterminate = false;
      parcCheck.dispatchEvent(new Event('change', {bubbles:true}));
    }
  });
  parcCheck.addEventListener('change', ()=>{
    checkWholeParc(parcCheck.checked);
  });
}

// Init
siteBtns.forEach(updateSiteFromLeaves);
updateParcFromSites();

/* ==== Sidebar responsive (hamburger) ==== */
const body = document.body;
const burger = document.querySelector('.hamburger');
const sidebar = document.getElementById('sidebar');
const overlay = document.querySelector('.side-overlay');

function toggleMenu(open) {
  const willOpen = (typeof open === 'boolean') ? open : !body.classList.contains('menu-open');
  body.classList.toggle('menu-open', willOpen);
  if (burger) burger.setAttribute('aria-expanded', String(willOpen));
  if (overlay) overlay.hidden = !willOpen;
}

if (burger) burger.addEventListener('click', () => toggleMenu());
if (overlay) overlay.addEventListener('click', () => toggleMenu(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleMenu(false);
});

// Au chargement, coche tout le parc et donc tous les sites/bâtiments
checkWholeParc(true);
updateParcFromSites();

