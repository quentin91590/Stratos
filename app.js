// app.js (v2 robuste) — copie/colle tel quel
(() => {
  /* ========== Helpers ========== */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

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
      const fmt = v => v ? new Intl.NumberFormat('fr-FR').format(Number(v)) : '—';
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

  function setActive(btn, on) { if (btn) { btn.classList.toggle('is-active', !!on); btn.setAttribute('aria-selected', !!on); } }
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
    if (!parcCheck) return;
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
    cb.addEventListener('change', () => { checkWholeSite(siteBtn, cb.checked); });
  });

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

  /* ========== Filtres (sidebar) ========== */
  /* ========== Filtres (sidebar) — v2 sans comparaison ========== */
  const FILTERS = {
    year: 2024,            // une seule année,
    norm: 'kwhm2',         // 'kwh' | 'kwhm2'
    climate: { dju: true, cdd: false },
    benchmark: { type: 'internal', refYear: 2024 }
  };

  // met à jour l’année côté état + synchronise les deux sélecteurs
  function setYear(y) {
    const yr = Number(y);
    FILTERS.year = yr;
    const top = $('#year-picker');                 // sélecteur du haut à droite
    const side = $('#year-picker-side');           // sélecteur de la sidebar
    if (top && top.value !== String(yr)) top.value = String(yr);
    if (side && side.value !== String(yr)) side.value = String(yr);
    // ici plus tard tu pourras déclencher un refresh des graphes selon FILTERS.year,
  }

  function applyNormalization(val = FILTERS.norm) {
    FILTERS.norm = val;
    document.documentElement.dataset.norm = val;

    // Met à jour les libellés d’unités si data-* est présent
    $$('.kpi-unit').forEach(u => {
      const k1 = u.getAttribute('data-kwh');
      const k2 = u.getAttribute('data-kwhm2');
      if (!k1 || !k2) return;
      u.textContent = (val === 'kwhm2') ? k2 : k1;
    });

    // Ajuste les titres de KPI pour refléter l’intensité vs conso
    const relabel = (tabId, tIntensity, tConso) => {
      const t = document.querySelector(`#${tabId} .kpi-title`);
      if (t) t.textContent = (val === 'kwhm2') ? tIntensity : tConso;
    };
    relabel('tab-energie', 'Intensité énergétique', 'Consommation énergétique');
    relabel('tab-elec', 'Intensité électrique', 'Conso. électrique');
  }

  function applyClimate() {
    const h3H = $('#panel-chaleur h3');
    const h3F = $('#panel-froid h3');
    if (h3H) h3H.textContent = FILTERS.climate.dju ? 'Chaleur (corrigée DJU)' : 'Chaleur (brut)';
    if (h3F) h3F.textContent = FILTERS.climate.cdd ? 'Froid (corrigée CDD)' : 'Froid (brut)';

    const tH = $('#tab-chaleur .kpi-title');
    const tF = $('#tab-froid .kpi-title');
    if (tH) tH.textContent = FILTERS.climate.dju ? 'Intensité de chaleur corrigée' : 'Intensité de chaleur (brut)';
    if (tF) tF.textContent = FILTERS.climate.cdd ? 'Intensité de froid corrigée' : 'Intensité de froid (brut)';
  }

  function applyBenchmark() {
    const el = $('#sum-bench-val');
    if (el) el.textContent =
      (FILTERS.benchmark.type === 'internal' ? 'Interne ' : 'Externe ') +
      String(FILTERS.benchmark.refYear || '');
  }

  function setupFilters() {
    const side = $('#sidebar');
    if (!side) return;

    // — Année (synchronisation bidirectionnelle)
    const topSel = $('#year-picker');                  // sélecteur du haut à droite,
    const sideSel = $('#year-picker-side', side);       // sélecteur de la sidebar,
    if (topSel) topSel.addEventListener('change', e => setYear(e.target.value));
    if (sideSel) sideSel.addEventListener('change', e => setYear(e.target.value));
    // initialise avec la valeur affichée en haut si dispo, sinon le défaut,
    setYear(topSel?.value || FILTERS.year);

    // — Normalisation
    $$('.segmented input[name="norm"]', side).forEach(r =>
      r.addEventListener('change', e => applyNormalization(e.target.value))
    );
    applyNormalization(FILTERS.norm);

    // — Climat
    const dju = $('#toggle-dju', side);
    const cdd = $('#toggle-cdd', side);
    if (dju) dju.addEventListener('change', e => { FILTERS.climate.dju = !!e.target.checked; applyClimate(); });
    if (cdd) cdd.addEventListener('change', e => { FILTERS.climate.cdd = !!e.target.checked; applyClimate(); });
    applyClimate();

    // — Benchmark
    $$('.radio input[name="bench-type"]', side).forEach(r =>
      r.addEventListener('change', e => { FILTERS.benchmark.type = e.target.value; applyBenchmark(); })
    );
  }

  /* ========== Recherche arborescence (EGID / adresse / nom) ========== */
  function setupTreeSearch() {
    const side = $('#sidebar');
    if (!side) return;

    const input = $('#tree-search', side);
    const clearBtn = $('.s-clear', side);
    const tree = $('.tree', side);
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
    const parcRow = $('.tree > .tree-node:not(.toggle)', tree); // “Parc”
    const countEl = $('#tree-search-count', side);

    const show = (el, on) => { if (el) el.hidden = !on; };
    const setExpanded = (siteBtn, on) => {
      if (!siteBtn) return;
      siteBtn.setAttribute('aria-expanded', String(on));
      const list = siteBtn.parentElement.querySelector('.tree-children');
      if (list) list.style.display = on ? 'flex' : 'none';
    };

    const updateCount = () => {
      const visibleLeaves = $$('.tree-leaf', tree).filter(b => !b.hidden).length;
      const visibleGroups = groups.filter(g => !g.hidden).length;
      if (input.value.trim() === '') {
        countEl && (countEl.textContent = 'Tous les éléments');
      } else {
        countEl && (countEl.textContent = `${visibleLeaves} résultat(s) dans ${visibleGroups} site(s)`);
      }
    };

    let t = null;
    const run = () => {
      const q = norm(input.value);
      clearBtn.hidden = !q;

      // reset si vide
      if (!q) {
        groups.forEach(g => {
          const siteBtn = g.querySelector('.tree-node.toggle');
          show(g, true);
          // remet l’état d’ouverture d’origine si besoin, ici on laisse tel quel
          $$('.tree-leaf', g).forEach(leaf => { leaf.hidden = false; leaf.classList.remove('is-match'); });
          siteBtn?.classList.remove('is-match');
        });
        parcRow && (parcRow.hidden = false);
        updateCount();
        return;
      }

      let anyVisible = false;

      groups.forEach(g => {
        const siteBtn = g.querySelector('.tree-node.toggle');
        const list = g.querySelector('.tree-children');
        const leaves = $$('.tree-leaf', list);

        const siteMatch = getHay(siteBtn).includes(q);
        let leafMatches = 0;

        if (siteMatch) {
          // le site correspond → tout afficher dessous
          show(g, true);
          setExpanded(siteBtn, true);
          siteBtn.classList.add('is-match');
          leaves.forEach(leaf => { leaf.hidden = false; leaf.classList.remove('is-match'); });
          anyVisible = true;
        } else {
          siteBtn.classList.remove('is-match');
          // on filtre les bâtiments
          leaves.forEach(leaf => {
            const ok = getHay(leaf).includes(q);
            leaf.hidden = !ok;
            leaf.classList.toggle('is-match', ok);
            if (ok) leafMatches++;
          });
          const hasAny = leafMatches > 0;
          show(g, hasAny);
          if (hasAny) {
            setExpanded(siteBtn, true);
            anyVisible = true;
          } else {
            setExpanded(siteBtn, false);
          }
        }
      });

      // la ligne “Parc” reste affichée si q vide, sinon on la masque si rien n’est visible
      parcRow && (parcRow.hidden = !anyVisible && !!q);
      updateCount();
    };

    const debounced = () => { clearTimeout(t); t = setTimeout(run, 90); };
    input.addEventListener('input', debounced);
    clearBtn?.addEventListener('click', () => { input.value = ''; run(); input.focus(); });

    // Raccourcis clavier: "/" pour focuser, Échap pour effacer
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        input.focus();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        run();
        input.blur();
      }
    });

    run(); // premier rendu
  }


  /* ========== Boot ==========
     On attend DOMContentLoaded (plus sûr que 'load' qui dépend des images/polices) */
  document.addEventListener('DOMContentLoaded', () => {
    try {
      // Aligner la marge sticky avec le header
      syncStickyTop();

      // Initialiser tous les tabsets (Énergie + sections alt)
      $$('.tabset').forEach(initTabset);

      // Démarrer sur Énergie
      selectSection('energie');

      // Sidebar init (si présente)
      checkWholeParc(true);
      updateParcFromSites();
      // >>> Filtres
      setupFilters();
      setupTreeSearch();     // <<< ajoute ceci
    } catch (e) {
      console.error('[init] Erreur d’init :', e);
    }
  });
})();
