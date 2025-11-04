// app.js (v2 robuste) — copie/colle tel quel
(() => {
  /* ========== Helpers ========== */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);
  const NF = new Intl.NumberFormat('fr-FR');
  // --- Etat global des filtres (si pas déjà défini)
  window.FILTERS = window.FILTERS || { year: '2024', norm: 'kwh', climate: true, benchmark: { type: 'internal' } };
  const FILTERS = window.FILTERS;
  // Sélecteurs bornés au bloc énergie
  const $e = (sel) => document.querySelector('#energy-block ' + sel);
  const $$e = (sel) => Array.from(document.querySelectorAll('#energy-block ' + sel));

  // Libellés de base selon normalisation (tuile + panneau)
  const TITLE_BASE_MAP = {
    'tab-energie': { kwhm2: 'Consommation énergétique par m²', kwh: 'Consommation énergétique' },
    'tab-chaleur': { kwhm2: 'Consommation de chaleur par m²', kwh: 'Consommation chaleur' },
    'tab-froid': { kwhm2: 'Consommation de froid par m²', kwh: 'Consommation froid' },
    'tab-elec': { kwhm2: 'Consommation électrique par m²', kwh: 'Consommation électrique' },
    'tab-co2': { kwhm2: 'Emission de CO₂ par m²', kwh: 'Émissions CO₂' },
    'tab-eau': { kwhm2: 'Consommation d’eau par m²', kwh: 'Consommation d’eau' },
  };

  const PANEL_BASE_MAP = {
    'panel-energie': { kwhm2: 'Consommation énergétique par m²', kwh: 'Consommation énergétique' },
    'panel-chaleur': { kwhm2: 'Consommation de chaleur par m²', kwh: 'Consommation chaleur' },
    'panel-froid': { kwhm2: 'Consommation de froid par m²', kwh: 'Consommation froid' },
    'panel-elec': { kwhm2: 'Consommation électrique par m²', kwh: 'Consommation électrique' },
    'panel-co2': { kwhm2: 'Emission de CO₂ par m²', kwh: 'Émissions CO₂' },
    'panel-eau': { kwhm2: 'Consommation d’eau par m²', kwh: 'Consommation d’eau' },
  };

  // Met à jour l'année partout (custom picker + éventuel select natif s'il existe encore)
  // --- Year handling (OK) ---------------------------------------
  function highlightEnergyTrend(year) {
    const chart = document.querySelector('.energy-trend-chart');
    if (!chart) return;

    const yr = Number(year);
    chart.querySelectorAll('.chart-bar').forEach(bar => {
      const barYear = Number(bar.dataset.year);
      const isActive = !Number.isNaN(barYear) && barYear === yr;
      bar.classList.toggle('is-selected', isActive);
      bar.toggleAttribute('aria-current', isActive);
    });
  }

  function setYear(y) {
    const yr = Number(y);
    FILTERS.year = yr;

    // Picker custom (en haut à droite)
    const wrap = document.getElementById('year-picker');
    if (wrap) {
      const label = wrap.querySelector('.year-current');
      if (label) label.textContent = String(yr);

      wrap.querySelectorAll('[role="option"]').forEach(li => {
        const selected = li.dataset.value === String(yr);
        li.setAttribute('aria-selected', selected ? 'true' : 'false');
        li.classList.toggle('is-selected', selected);
      });
    }
    highlightEnergyTrend(yr);
  }

  // Initialise le picker custom (clavier + souris + fermeture extérieure)
  function wireYearPicker() {
    const wrap = document.getElementById('year-picker');
    if (!wrap) return;

    const btn = wrap.querySelector('.year-btn');
    const menu = wrap.querySelector('.year-menu');
    if (!btn || !menu) {
      console.warn('[year-picker] markup incomplet (year-btn / year-menu manquants)');
      return;
    }

    const opts = Array.from(menu.querySelectorAll('[role="option"]'));
    let activeIndex = Math.max(0, opts.findIndex(li => li.dataset.value === String(FILTERS.year)));
    let isOpen = false;

    const setActive = (i) => {
      opts.forEach(li => li.classList.remove('is-active'));
      const li = opts[i];
      if (li) { li.classList.add('is-active'); li.scrollIntoView({ block: 'nearest' }); }
    };

    const onDocClick = (e) => {
      if (!wrap.contains(e.target)) toggle(false);
    };

    const toggle = (open) => {
      isOpen = !!open;
      btn.setAttribute('aria-expanded', String(isOpen));
      menu.hidden = !isOpen;
      wrap.classList.toggle('is-open', isOpen);
      menu.classList.toggle('is-open', isOpen);
      if (isOpen) {
        // recalcule l’index actif à l’ouverture
        activeIndex = Math.max(0, opts.findIndex(li => li.dataset.value === String(FILTERS.year)));
        setActive(activeIndex);
        menu.focus({ preventScroll: true });
        // capture=true évite certains cas où le handler est ajouté pendant la phase de bubble
        document.addEventListener('click', onDocClick, { capture: true });
      } else {
        document.removeEventListener('click', onDocClick, { capture: true });
        btn.focus({ preventScroll: true });
      }
    };

    const selectIndex = (i) => {
      const li = opts[i]; if (!li) return;
      setYear(li.dataset.value);
      activeIndex = i;
      toggle(false);
    };

    // Souris
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // évite la fermeture immédiate par le handler global
      toggle(btn.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', (e) => {
      const li = e.target.closest('[role="option"]');
      if (li) selectIndex(opts.indexOf(li));
    });

    // Clavier (ouverture depuis le bouton)
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(true);
      }
    });

    // Clavier (navigation dans le menu)
    menu.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); activeIndex = Math.min(opts.length - 1, activeIndex + 1); setActive(activeIndex); break;
        case 'ArrowUp': e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); setActive(activeIndex); break;
        case 'Home': e.preventDefault(); activeIndex = 0; setActive(activeIndex); break;
        case 'End': e.preventDefault(); activeIndex = opts.length - 1; setActive(activeIndex); break;
        case 'Enter':
        case ' ': e.preventDefault(); selectIndex(activeIndex); break;
        case 'Escape': e.preventDefault(); toggle(false); break;
      }
    });

    // Init affichage
    setYear(FILTERS.year);
  }


  /* ========== Sticky (uniquement pour le bloc Énergie) ========== */
  function setupSticky(container) {
    const sticky = container.querySelector('.panel-sticky');
    const topSentinel = container.querySelector('.panel-top-sentinel');
    if (!sticky || !topSentinel) return;

    let atTopVisible = true;
    let idleTimer = null;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        atTopVisible = entries[0]?.isIntersecting ?? true;
        if (atTopVisible) sticky.classList.remove('is-idle');
      }, { root: null, threshold: 0.01 });
      io.observe(topSentinel);
    }

    function handleScroll() {
      sticky.classList.remove('is-idle');
      if (idleTimer) clearTimeout(idleTimer);
      if (atTopVisible) return;
      idleTimer = setTimeout(() => sticky.classList.add('is-idle'), 900);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  /* ========== Tabset générique (Énergie + sections alt) ========== */
  function updateTrendPadding(scope = document) {
    scope.querySelectorAll('.kpi-value-wrap').forEach(w => {
      const t = w.querySelector('.kpi-trend');
      if (!t) return;
      const wpx = Math.ceil(t.getBoundingClientRect().width);
      w.style.setProperty('--trend-w', wpx + 'px');
    });
  }

  function initTabset(container) {
    if (!container) { console.warn('[tabset] container manquant'); return; }

    const tabs = container.querySelectorAll('[role="tab"]');
    const panels = container.querySelectorAll('[role="tabpanel"]');
    const panelsWrap = container.querySelector('.kpi-panels');
    const sticky = container.querySelector('.panel-sticky'); // présent seulement sur Énergie

    // --- [ADD] assure un chevron animé pour chaque onglet ---
    tabs.forEach(tab => {
      if (!tab.querySelector('.kpi-chevron')) {
        const chev = document.createElement('span');
        chev.className = 'kpi-chevron';
        chev.setAttribute('aria-hidden', 'true');
        chev.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>`;
        tab.appendChild(chev); // le chevron vient en dernier, comme dans Énergie
      }
    });

    if (tabs.length === 0) {
      console.warn('[tabset] aucun onglet trouvé dans', container);
      return;
    }

    // Vérifie le mapping aria-controls -> panel
    tabs.forEach(tab => {
      const id = tab.getAttribute('aria-controls');
      if (!id || !container.querySelector('#' + CSS.escape(id))) {
        console.warn('[tabset] aria-controls sans panneau correspondant:', tab);
      }
    });

    function selectTab(tab) {
      if (!tab) return;

      // États ARIA
      tabs.forEach(t => { t.setAttribute('aria-selected', 'false'); t.setAttribute('aria-expanded', 'false'); });
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('aria-expanded', 'true');

      // Panneaux
      const target = tab.getAttribute('aria-controls');
      panels.forEach(p => p.hidden = (p.id !== target));

      // Couleur active
      try {
        const c = getComputedStyle(tab).getPropertyValue('--status').trim();
        if (c && panelsWrap) panelsWrap.style.setProperty('--active-color', c);
        // Sticky (énergie)
        if (sticky) {
          const psIcon = sticky.querySelector('.ps-icon');
          const srcIcon = tab.querySelector('.kpi-icon');
          if (psIcon && srcIcon && srcIcon.firstElementChild) {
            psIcon.innerHTML = '';
            psIcon.appendChild(srcIcon.firstElementChild.cloneNode(true));
          }
          const psDot = sticky.querySelector('.ps-dot');
          if (psDot && c) psDot.style.background = c;
          const label = tab.querySelector('.kpi-label');
          const ofEl = sticky.querySelector('#panel-of');
          if (label && ofEl) ofEl.textContent = label.textContent;
        }
      } catch (e) { console.warn('[tabset] color/sticky:', e); }

      // Synthèse (présente uniquement dans Énergie, sinon no-op)
      const nSites = tab.dataset.sites || '';
      const nSre = tab.dataset.sre || '';
      const s1 = document.getElementById('sum-sites-val');
      const s2 = document.getElementById('sum-sre-val');
      const fmt = (v) => (v !== undefined && v !== null && v !== '' ? NF.format(Number(v)) : '—');
      if (s1) s1.textContent = fmt(nSites);
      if (s2) s2.textContent = fmt(nSre);

      // Trend padding + anim
      updateTrendPadding(container);
      container.querySelectorAll('.kpi .arr').forEach(a => a.classList.remove('animate-up', 'animate-down'));
      const tr = tab.querySelector('.kpi-trend');
      if (tr) {
        const a = tr.querySelector('.arr');
        if (a) { a.classList.add(tr.classList.contains('trend-down') ? 'animate-down' : 'animate-up'); }
      }
    }

    // Click
    tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab)));

    // A11y clavier
    const tabsEl = container.querySelector('.kpi-tabs');
    const idxOf = el => Array.from(tabs).indexOf(el);
    if (tabsEl) {
      tabsEl.addEventListener('keydown', (e) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const current = document.activeElement.closest('[role="tab"]') || tabs[0];
        let idx = idxOf(current);
        if (e.key === 'ArrowRight') idx = (idx + 1) % tabs.length;
        if (e.key === 'ArrowLeft') idx = (idx - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') idx = 0;
        if (e.key === 'End') idx = tabs.length - 1;
        tabs[idx].focus(); selectTab(tabs[idx]);
      });
    }

    // Init
    const initial = container.querySelector('[role="tab"][aria-selected="true"]') || tabs[0];
    // Laisse le layout se poser pour des mesures correctes
    requestAnimationFrame(() => { selectTab(initial); updateTrendPadding(container); });

    // Sticky si dispo
    setupSticky(container);
  }

  /* ========== Top menu (sections) ========== */
  const topItems = document.querySelectorAll('.top-nav .top-item');
  function syncStickyTop() {
    const topNav = document.querySelector('.top-nav');
    const header = document.querySelector('.sidebar-header');
    const h = (topNav ? topNav.offsetHeight : 0) + (header ? header.offsetHeight : 0);
    document.documentElement.style.setProperty('--sticky-top', h + 'px');
  }
  function selectSection(name) {
    syncStickyTop();
    const root = document.documentElement;

    // Affiche uniquement le tabset de la section active
    const energyBlock = document.getElementById('energy-block');
    if (energyBlock) energyBlock.hidden = (name !== 'energie');

    ['etat', 'travaux', 'financier'].forEach(n => {
      const el = document.getElementById('section-' + n);
      if (el) el.hidden = (n !== name);
    });

    // Couleur
    if (name === 'energie') root.style.setProperty('--section-color', '#60a5fa');
    else {
      const map = { etat: '#10b981', travaux: '#b45309', financier: '#facc15' };
      root.style.setProperty('--section-color', map[name] || '#94a3b8');
    }

    // Visuel actif
    topItems.forEach(btn => {
      const active = (btn.dataset.section === name);
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
      if (active) btn.blur();
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  topItems.forEach(btn => btn.addEventListener('click', () => selectSection(btn.dataset.section)));

  window.addEventListener('resize', syncStickyTop);

  /* ========== Sidebar (cases + hamburger) ========== */
  const parcBtn = $('.tree > .tree-node:not(.toggle)');
  const parcCheck = parcBtn?.querySelector('.tree-check');
  const siteBtns = $$('.tree-group > .tree-node.toggle');
  const siteCheck = (siteBtn) => siteBtn.querySelector('.tree-check');
  const siteLeaves = (siteBtn) => {
    const list = siteBtn?.nextElementSibling;
    return list ? $$('.tree-leaf', list) : [];
  };
  const leafCheck = (leafBtn) => leafBtn?.querySelector('.tree-check');

  function getLeafSre(leafBtn) {
    if (!leafBtn) return 0;
    const raw = Number.parseFloat(leafBtn.dataset?.sre);
    return Number.isFinite(raw) ? raw : 0;
  }

  function computeSelectedPerimeter() {
    let buildings = 0;
    let sre = 0;
    $$('.tree-leaf').forEach(leaf => {
      const cb = leafCheck(leaf);
      if (cb?.checked) {
        buildings += 1;
        sre += getLeafSre(leaf);
      }
    });
    return { buildings, sre };
  }

  function updatePerimeterBadges() {
    const { buildings, sre } = computeSelectedPerimeter();
    const safeSre = Number.isFinite(sre) ? Math.round(sre) : 0;
    document.querySelectorAll('.kpi[role="tab"][data-sites]').forEach(tab => {
      tab.dataset.sites = String(buildings);
      tab.dataset.sre = String(safeSre);
    });

    const sitesEl = document.getElementById('sum-sites-val');
    const sreEl = document.getElementById('sum-sre-val');
    if (sitesEl) sitesEl.textContent = buildings ? NF.format(buildings) : '0';
    if (sreEl) sreEl.textContent = buildings ? NF.format(safeSre) : '0';
  }

  function setActive(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-selected', String(!!on)); // pas un bool direct
  }

  function clearPartial(btn) { btn?.classList.remove('is-partial'); }

  function updateSiteFromLeaves(siteBtn) {
    if (!siteBtn) return;
    const leaves = siteLeaves(siteBtn);
    const checks = leaves.map(leafCheck).filter(Boolean);
    const n = checks.length;
    const sel = checks.filter(c => c.checked).length;
    const cb = siteCheck(siteBtn);
    if (!cb) return;
    cb.indeterminate = sel > 0 && sel < n;
    cb.checked = sel === n && n > 0;
    siteBtn.classList.toggle('is-partial', cb.indeterminate);
    setActive(siteBtn, cb.checked);
    if (cb.checked === false && !cb.indeterminate) clearPartial(siteBtn);
  }
  function updateParcFromSites() {
    if (!parcCheck) {
      updatePerimeterBadges();
      return;
    }
    const checks = siteBtns.map(siteCheck).filter(Boolean);
    const n = checks.length;
    const allChecked = checks.every(c => c.checked);
    const any = checks.some(c => c.checked || c.indeterminate);
    parcCheck.indeterminate = any && !allChecked;
    parcCheck.checked = allChecked && n > 0;
    if (parcBtn) {
      parcBtn.classList.toggle('is-partial', parcCheck.indeterminate);
      setActive(parcBtn, parcCheck.checked);
      if (!parcCheck.checked && !parcCheck.indeterminate) clearPartial(parcBtn);
    }
    updatePerimeterBadges();
  }
  function checkWholeSite(siteBtn, on) {
    if (!siteBtn) return;
    const cb = siteCheck(siteBtn);
    if (cb) { cb.indeterminate = false; cb.checked = !!on; }
    setActive(siteBtn, !!on);
    siteLeaves(siteBtn).forEach(leaf => {
      const lcb = leafCheck(leaf);
      if (lcb) lcb.checked = !!on;
      setActive(leaf, !!on);
    });
    updateSiteFromLeaves(siteBtn);
    updateParcFromSites();
  }
  function checkWholeParc(on) {
    siteBtns.forEach(site => checkWholeSite(site, on));
    updateParcFromSites();
  }

  $$('.tree-leaf').forEach(leafBtn => {
    const cb = leafCheck(leafBtn);
    if (!cb) return;
    leafBtn.addEventListener('click', (e) => {
      if (e.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    cb.addEventListener('change', () => {
      setActive(leafBtn, cb.checked);
      const siteBtn = leafBtn.closest('.tree-group')?.querySelector('.tree-node.toggle');
      if (siteBtn) updateSiteFromLeaves(siteBtn);
      updateParcFromSites();
    });
  });

  // === Sites : interactions de ligne (toggle ouverture, (dé)cocher, état partiel) ===
  siteBtns.forEach(siteBtn => {
    const cb = siteCheck(siteBtn);
    if (!cb) return;

    siteBtn.addEventListener('click', (e) => {
      const onChevron = !!e.target.closest?.('.chev');
      if (onChevron) {
        const expanded = siteBtn.getAttribute('aria-expanded') === 'true';
        siteBtn.setAttribute('aria-expanded', String(!expanded));
        const list = siteBtn.parentElement.querySelector('.tree-children');
        if (list) list.style.display = expanded ? 'none' : 'flex';
        return;
      }
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

  // === Root "Parc" : (dé)sélectionner tout, bindé une seule fois ===
  if (parcBtn && parcCheck && !parcBtn.dataset.bound) {
    parcBtn.dataset.bound = '1';

    // Cliquer n'importe où sur la ligne (sauf directement sur la checkbox)
    parcBtn.addEventListener('click', (e) => {
      if (e.target === parcCheck) return;
      parcCheck.indeterminate = false;
      parcCheck.checked = !parcCheck.checked;
      parcCheck.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Quand la checkbox change -> (dé)sélectionne tout le parc
    parcCheck.addEventListener('change', () => {
      checkWholeParc(parcCheck.checked);

      // // Option : auto-déployer les groupes après (dé)sélection,
      // siteBtns.forEach(site => {
      //   const list = site.parentElement.querySelector('.tree-children');
      //   site.setAttribute('aria-expanded', 'true');
      //   if (list) list.style.display = 'flex';
      // });
    });
  }


  const body = document.body;
  const burger = document.querySelector('.hamburger');
  const overlay = document.querySelector('.side-overlay');
  function toggleMenu(open) {
    const willOpen = (typeof open === 'boolean') ? open : !body.classList.contains('menu-open');
    body.classList.toggle('menu-open', willOpen);
    if (burger) burger.setAttribute('aria-expanded', String(willOpen));
    if (overlay) overlay.hidden = !willOpen;
  }
  if (burger) burger.addEventListener('click', () => toggleMenu());
  if (overlay) overlay.addEventListener('click', () => toggleMenu(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

  function applyNormalization(mode) {
    FILTERS.norm = mode;

    // (1) Unités des tuiles KPI (lit les data-* sur .kpi-unit)
    $$e('.kpi .kpi-unit').forEach(unitEl => {
      const txt = (mode === 'kwhm2')
        ? (unitEl.dataset.kwhm2 || unitEl.textContent)
        : (unitEl.dataset.kwh || unitEl.textContent);
      unitEl.textContent = txt;
    });

    // (2) Titres des tuiles KPI
    $$e('.kpi[role="tab"]').forEach(btn => {
      const id = btn.id;
      const base = (TITLE_BASE_MAP[id] && TITLE_BASE_MAP[id][mode]) || '';
      const tEl = btn.querySelector('.kpi-title');
      if (!tEl || !base) return;

      // Ajoute le suffixe climat uniquement pour Chaleur / Froid
      let finalTitle = base;
      if (id === 'tab-chaleur' || id === 'tab-froid') {
        finalTitle = FILTERS.climate ? (base + ' corrigée') : (base + ' (brut)');
      }
      tEl.textContent = finalTitle;
    });

    // (3) Titres des panneaux (h3)
    Object.entries(PANEL_BASE_MAP).forEach(([panelId, map]) => {
      const sec = document.getElementById(panelId);
      const h3 = sec?.querySelector('h3');
      if (!h3) return;

      let title = map[mode] || h3.textContent;

      if (panelId === 'panel-chaleur') {
        title += FILTERS.climate ? ' (corrigée DJU)' : ' (brut)';
      }
      if (panelId === 'panel-froid') {
        title += FILTERS.climate ? ' (corrigé CDD)' : ' (brut)';
      }
      h3.textContent = title;
    });
  }

  function setupEnergyFilters() {
    const scope = document.getElementById('energy-filters');
    if (!scope) return;

    // Normalisation
    scope.querySelectorAll('input[name="norm-energy"]').forEach(r =>
      r.addEventListener('change', e => applyNormalization(e.target.value))
    );
    applyNormalization(FILTERS.norm);


    // Radio Oui/Non pour Correction climatique
    const climRadios = scope.querySelectorAll('input[name="climate-correction"]');
    if (climRadios.length === 2) {
      climRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          FILTERS.climate = (scope.querySelector('#clim-avec').checked);
          applyNormalization(FILTERS.norm);
        });
      });
      // Init dès le chargement
      FILTERS.climate = (scope.querySelector('#clim-avec').checked);
      applyNormalization(FILTERS.norm);
    }


    // Benchmark
    scope.querySelectorAll('input[name="bench-type-energy"]').forEach(r =>
      r.addEventListener('change', e => { FILTERS.benchmark.type = e.target.value; })
    );
  }


  /* ========== Recherche arborescence (sélection verte, replie le reste, backspace-aware) ========== */
  function setupTreeSearch() {
    const side = $('#sidebar');
    if (!side) return;

    const input = $('#tree-search', side);
    const clearBtn = $('.s-clear', side);
    const tree = $('.tree', side);
    const countEl = $('#tree-search-count', side);
    if (!input || !tree) return;

    const norm = (s) => (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const getHay = (el) => {
      const t = el?.textContent || '';
      const d1 = el?.dataset?.egid || '';
      const d2 = el?.dataset?.addr || '';
      const d3 = el?.dataset?.tags || '';
      return norm([t, d1, d2, d3].join(' '));
    };

    const groups = $$('.tree-group', tree);

    const setExpanded = (siteBtn, on) => {
      if (!siteBtn) return;
      siteBtn.setAttribute('aria-expanded', String(on));
      const list = siteBtn.parentElement.querySelector('.tree-children');
      if (list) list.style.display = on ? 'flex' : 'none';
    };

    const selectLeaf = (leafBtn, on) => {
      const lcb = leafCheck(leafBtn);
      if (lcb) lcb.checked = !!on;
      setActive(leafBtn, !!on); // vert,
    };

    const selectSite = (siteBtn, on) => {
      checkWholeSite(siteBtn, on); // coche/décoche tout + vert,
    };

    const deselectAllAndCollapse = () => {
      siteBtns.forEach(siteBtn => {
        const scb = siteCheck(siteBtn);
        if (scb) { scb.checked = false; scb.indeterminate = false; }
        setActive(siteBtn, false);
        siteLeaves(siteBtn).forEach(leaf => selectLeaf(leaf, false));
        setExpanded(siteBtn, false); // on replie tout par défaut,
      });
      updateParcFromSites();
    };

    const openAllGroups = () => {
      siteBtns.forEach(siteBtn => setExpanded(siteBtn, true));
    };

    const updateCount = () => {
      const nSelLeaves = $$('.tree-leaf .tree-check', tree).filter(c => c.checked).length;
      const nFullSites = siteBtns.filter(btn => {
        const scb = siteCheck(btn);
        return !!scb && scb.checked === true && scb.indeterminate === false;
      }).length;
      if (countEl) {
        if (nSelLeaves === 0 && nFullSites === 0) {
          countEl.textContent = 'Aucun élément sélectionné';
        } else {
          const { sre } = computeSelectedPerimeter();
          const safe = Number.isFinite(sre) ? Math.round(sre) : 0;
          const formattedSre = NF.format(safe);
          countEl.textContent = `${nSelLeaves} bâtiment(s) sélectionné(s), ${nFullSites} site(s) entiers — ${formattedSre} m² SRE`;
        }
      }
    };

    const run = () => {
      const q = norm(input.value);
      clearBtn.hidden = !q;

      // Quand le champ est vide (ex: après avoir effacé au clavier) → tout re-sélectionner,
      if (!q) {
        siteBtns.forEach(siteBtn => checkWholeSite(siteBtn, true)); // tout cocher,
        updateParcFromSites();
        openAllGroups(); // si tu préfères laisser replié, commente cette ligne,
        if (countEl) countEl.textContent = 'Tous les éléments';
        return;
      }

      // 1) identifier les correspondances,
      const matchedSites = new Set();
      const matchedLeavesBySite = new Map();

      groups.forEach(g => {
        const siteBtn = g.querySelector('.tree-node.toggle');
        const leaves = siteLeaves(siteBtn);
        const siteHit = getHay(siteBtn).includes(q);

        if (siteHit) {
          matchedSites.add(siteBtn);
        } else {
          const hits = [];
          leaves.forEach(leaf => { if (getHay(leaf).includes(q)) hits.push(leaf); });
          if (hits.length) matchedLeavesBySite.set(siteBtn, hits);
        }
      });

      // 2) tout désélectionner + replier,
      deselectAllAndCollapse();

      // 3) ouvrir uniquement les sites concernés,
      siteBtns.forEach(siteBtn => {
        const shouldOpen = matchedSites.has(siteBtn) || matchedLeavesBySite.has(siteBtn);
        setExpanded(siteBtn, shouldOpen);
      });

      // 4) sélectionner entièrement les sites matchés,
      matchedSites.forEach(siteBtn => selectSite(siteBtn, true));

      // 5) sélectionner seulement les feuilles matchées dans les autres sites,
      matchedLeavesBySite.forEach((leaves, siteBtn) => {
        if (matchedSites.has(siteBtn)) return; // déjà tout coché,
        leaves.forEach(leaf => selectLeaf(leaf, true));
        updateSiteFromLeaves(siteBtn);         // état partiel,
      });

      // 6) sync global + compteur,
      updateParcFromSites();
      updateCount();
    };

    let t = null;
    const debounced = () => { clearTimeout(t); t = setTimeout(run, 90); };

    // saisie (y compris Backspace/Delete) → recalcul progressif de la sélection,
    input.addEventListener('input', debounced);

    // Entrée → vider le champ MAIS conserver la sélection actuelle,
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.value = '';
        clearBtn.hidden = true;
        if (countEl) countEl.textContent = 'Tous les éléments';
        // pas de run() ici → la sélection reste telle quelle,
        input.blur();
      }
    });

    // Bouton ✕ → effacer + re-sélectionner TOUT + tout ouvrir,
    clearBtn?.addEventListener('click', () => {
      input.value = '';
      clearBtn.hidden = true;

      siteBtns.forEach(siteBtn => checkWholeSite(siteBtn, true));
      updateParcFromSites();
      openAllGroups();

      if (countEl) countEl.textContent = 'Tous les éléments';
      input.focus();
    });

    // Raccourcis: “/” focus, Échap efface sans toucher à la sélection,
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault(); input.focus();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        clearBtn.hidden = true;
        if (countEl) countEl.textContent = 'Tous les éléments';
        input.blur();
        // pas de run() → ,on conserve la sélection actuelle,
      }
    });

    // état initial,
    if (countEl) countEl.textContent = 'Tous les éléments';
  }
  // === Multi-select dans la sidebar (Canton / Affectation / Année) ===
  function setupSidebarMultiSelects() {
    const side = document.querySelector('#sidebar');
    if (!side) return;

    const updateDisplay = (ms) => {
      const checks = ms.querySelectorAll('.ms-menu input:checked');
      const valueEl = ms.querySelector('.ms-value');
      const hidden = ms.querySelector('.ms-hidden');
      const placeholder = ms.dataset.placeholder || 'Sélectionner...';

      if (checks.length === 0) {
        valueEl.textContent = placeholder;
        hidden.value = '';
      } else if (checks.length === 1) {
        valueEl.textContent = checks[0].parentElement.textContent.trim();
        hidden.value = checks[0].value;
      } else {
        valueEl.textContent = checks.length + ' sélectionnés';
        hidden.value = Array.from(checks).map(c => c.value).join(',');
      }
    };

    const closeAll = (except) => {
      side.querySelectorAll('.ms[aria-open="true"]').forEach(ms => {
        if (ms !== except) {
          ms.setAttribute('aria-open', 'false');
          ms.querySelector('.ms-btn')?.setAttribute('aria-expanded', 'false');
        }
      });
    };

    // Délégation d'événements limitée à la sidebar
    side.addEventListener('click', (e) => {
      // Toggle bouton
      const btn = e.target.closest('.ms-btn');
      if (btn && side.contains(btn)) {
        const ms = btn.closest('.ms');
        const open = ms.getAttribute('aria-open') === 'true';
        closeAll(ms);
        ms.setAttribute('aria-open', String(!open));
        btn.setAttribute('aria-expanded', String(!open));
        return;
      }

      // Option avec checkbox
      const opt = e.target.closest('.ms-option');
      if (opt && side.contains(opt)) {
        const ms = opt.closest('.ms');
        const cb = opt.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.checked = !cb.checked;
          updateDisplay(ms);
          e.preventDefault();
        }
        return;
      }

      // Effacer
      const clear = e.target.closest('.ms-clear');
      if (clear && side.contains(clear)) {
        const ms = clear.closest('.ms');
        ms.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
        updateDisplay(ms);
        return;
      }

      // Clic extérieur (dans la sidebar)
      if (!e.target.closest('.ms')) {
        closeAll();
      }
    });

    // Init affichage
    side.querySelectorAll('.ms').forEach(ms => updateDisplay(ms));
  }

  /* ========== Boot ==========
     On attend DOMContentLoaded (plus sûr que 'load' qui dépend des images/polices) */
  document.addEventListener('DOMContentLoaded', () => {
  syncStickyTop();
  $$('.tabset').forEach(initTabset);
  selectSection('energie');

  checkWholeParc(true);
  updateParcFromSites();

  wireYearPicker();
  setupEnergyFilters();
  setupTreeSearch();

  // 👇 ajoute ceci
  setupSidebarMultiSelects();

  // === Toggle bouton filtres (à placer ici) ===
  const toggleBtn = document.getElementById('filters-toggle-btn');
  const filtersPanel = document.getElementById('filters-panel');
  if (toggleBtn && filtersPanel) {
    toggleBtn.addEventListener('click', () => {
      const open = filtersPanel.hidden;
      filtersPanel.hidden = !open;
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleBtn.classList.toggle('is-open', open);
    });
  }
});




})();
