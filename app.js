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
/* ===== Sidebar: cases à cocher Parc / Sites / Bâtiments ===== */

// Utils DOM
const $all = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const $one = (sel, root=document) => root.querySelector(sel);

// Racine, sites, bâtiments
const parcBtn   = $one('.tree > .tree-node:not(.toggle)');
const parcCheck = parcBtn?.querySelector('.tree-check');

const siteBtns  = $all('.tree-group > .tree-node.toggle');
const siteCheck = (siteBtn) => siteBtn.querySelector('.tree-check');
const siteLeaves = (siteBtn) => {
  const list = siteBtn.nextElementSibling; // .tree-children
  return list ? $all('.tree-leaf', list) : [];
};
const leafCheck = (leafBtn) => leafBtn.querySelector('.tree-check');

// Style visuel (vert) selon l’état
function setVisualSelected(btn, on) {
  btn.classList.toggle('is-active', !!on);
  btn.classList.toggle('is-partial', false);
  btn.setAttribute('aria-selected', !!on);
}

// Met à jour l’état visuel/checkbox d’un site d’après ses bâtiments
function updateSiteFromLeaves(siteBtn) {
  const leaves = siteLeaves(siteBtn);
  const checks = leaves.map(leafCheck);
  const n = checks.length;
  const sel = checks.filter(c => c.checked).length;
  const cb = siteCheck(siteBtn);

  if (!cb) return;

  cb.indeterminate = sel > 0 && sel < n;
  cb.checked = sel === n && n > 0;

  siteBtn.classList.toggle('is-partial', cb.indeterminate);
  setVisualSelected(siteBtn, cb.checked);
}

// Met à jour l’état du Parc d’après les sites
function updateParcFromSites() {
  if (!parcCheck) return;
  const checks = siteBtns.map(siteCheck).filter(Boolean);
  const n = checks.length;
  const sel = checks.filter(c => c.checked || c.indeterminate).length;
  const allChecked = checks.every(c => c.checked);

  parcCheck.indeterminate = sel > 0 && !allChecked;
  parcCheck.checked = allChecked && n > 0;

  parcBtn.classList.toggle('is-partial', parcCheck.indeterminate);
  setVisualSelected(parcBtn, parcCheck.checked);
}

// Coche/décoche tout un site
function checkWholeSite(siteBtn, on) {
  const cb = siteCheck(siteBtn);
  if (cb) { cb.indeterminate = false; cb.checked = !!on; }
  setVisualSelected(siteBtn, !!on);

  siteLeaves(siteBtn).forEach(leaf => {
    const lcb = leafCheck(leaf);
    if (lcb) lcb.checked = !!on;
    setVisualSelected(leaf, !!on);
  });

  updateSiteFromLeaves(siteBtn);
  updateParcFromSites();
}

// Coche/décoche tout le parc
function checkWholeParc(on) {
  siteBtns.forEach(site => checkWholeSite(site, on));
  updateParcFromSites();
}

// ————— Listeners —————

// 1) Bâtiments (leaf) : change → met à jour site + parc
$all('.tree-leaf').forEach(leafBtn => {
  const cb = leafCheck(leafBtn);
  if (!cb) return;

  // Click sur le bouton (hors chevron) → toggle la case
  leafBtn.addEventListener('click', (e) => {
    if (e.target === cb) return; // déjà géré par change
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Changement de la case
  cb.addEventListener('change', () => {
    setVisualSelected(leafBtn, cb.checked);
    const siteBtn = leafBtn.closest('.tree-group')?.querySelector('.tree-node.toggle');
    if (siteBtn) updateSiteFromLeaves(siteBtn);
    updateParcFromSites();
  });
});

// 2) Sites : change → propage aux bâtiments
siteBtns.forEach(siteBtn => {
  const cb = siteCheck(siteBtn);
  if (!cb) return;

  // Chevron = plier/déplier seulement
  siteBtn.addEventListener('click', (e) => {
    const onChevron = !!e.target.closest('.chev');
    if (onChevron) {
      const expanded = siteBtn.getAttribute('aria-expanded') === 'true';
      siteBtn.setAttribute('aria-expanded', String(!expanded));
      const list = siteBtn.parentElement.querySelector('.tree-children');
      if (list) list.style.display = expanded ? 'none' : 'flex';
      return;
    }
    // Sinon, cliquer le bouton → toggle la case
    if (e.target !== cb) {
      cb.checked = !cb.checked;
      cb.indeterminate = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  cb.addEventListener('change', () => {
    checkWholeSite(siteBtn, cb.checked);
  });
});

// 3) Parc : change → propage à tous les sites/bâtiments
if (parcCheck) {
  parcBtn.addEventListener('click', (e) => {
    if (e.target !== parcCheck) {
      parcCheck.checked = !parcCheck.checked;
      parcCheck.indeterminate = false;
      parcCheck.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  parcCheck.addEventListener('change', () => {
    checkWholeParc(parcCheck.checked);
  });
}

// Init des états au chargement
siteBtns.forEach(updateSiteFromLeaves);
updateParcFromSites();


/* === Expand/Collapse des sites en cliquant sur le chevron uniquement === */
qsa('.tree .toggle').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    if (e.target.closest('.chev')) { // clic sur la flèche => expand/collapse
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const list = btn.parentElement.querySelector('.tree-children');
      if (list) list.style.display = expanded ? 'none' : 'flex';
      return;
    }

    // sinon: sélection du site
    if (e.ctrlKey || e.metaKey) {
      // toggle en bloc
      const bs = siteBuildings(btn);
      const hasUnselected = bs.some(b => !b.classList.contains('is-active'));
      selectSite(btn, hasUnselected); // s'il manque un, on sélectionne tout; sinon on désélectionne tout
    } else {
      // sélection unique: tout ce site uniquement
      selectOnly(siteBuildings(btn));
    }
  });
});

/* === Sélection des bâtiments === */
leaves().forEach(leaf=>{
  leaf.addEventListener('click', (e)=>{
    if (e.ctrlKey || e.metaKey) {
      setSel(leaf, !leaf.classList.contains('is-active'));
    } else {
      selectOnly([leaf]);
      return; // l’état parents/parc sera mis à jour plus bas
    }

    // MAJ états parents et parc
    // remonte jusqu’au .tree-group le plus proche => bouton site (toggle)
    const group = leaf.closest('.tree-group');
    const siteBtn = group ? group.querySelector('.tree-node.toggle') : null;
    if (siteBtn) updateSiteState(siteBtn);
    updateParcState();
  });
});

/* === Sélection du Parc (racine) === */
if (parcBtn) {
  parcBtn.addEventListener('click', (e)=>{
    if (e.ctrlKey || e.metaKey) {
      // toggle global
      const all = leaves();
      const hasUnselected = all.some(b => !b.classList.contains('is-active'));
      selectParc(hasUnselected);
    } else {
      // sélection unique: tout le parc uniquement
      selectOnly(leaves());
    }
  });
}

/* init visuels partiels au chargement */
sites().forEach(updateSiteState);
updateParcState();

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

