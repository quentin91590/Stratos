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

  const ENERGY_BASE_DATA = {
    metrics: {
      general: { intensity: 196, decimals: 0 },
      chaleur: { intensity: 118, decimals: 0 },
      froid: { intensity: 13, decimals: 0 },
      elec: { intensity: 78, decimals: 0 },
      co2: { intensity: 26, decimals: 0 },
      eau: { intensity: 1.45, decimals: 2 },
    },
    thresholds: {
      legal: 180,
      target: 170,
    },
    trend: [
      { year: 2021, intensity: 210 },
      { year: 2022, intensity: 198 },
      { year: 2023, intensity: 190 },
      { year: 2024, intensity: 184 },
      { year: 2025, intensity: 176 },
    ],
    mix: {
      primary: { chaleur: 0.8, electricite: 0.15, froid: 0.05 },
      secondary: { chaleur: 0.7, electricite: 0.2, froid: 0.1 },
    },
    buildings: {
      'bat-a': {
        metrics: { general: 182, chaleur: 108, froid: 11, elec: 74, co2: 24, eau: 1.28 },
      },
      'bat-b': {
        metrics: { general: 205, chaleur: 126, froid: 14, elec: 82, co2: 28, eau: 1.52 },
      },
      'bat-c': {
        metrics: { general: 191, chaleur: 115, froid: 13, elec: 77, co2: 25, eau: 1.36 },
      },
      'bat-d': {
        metrics: { general: 214, chaleur: 134, froid: 16, elec: 89, co2: 30, eau: 1.62 },
      },
      'bat-e': {
        metrics: { general: 174, chaleur: 101, froid: 9, elec: 70, co2: 22, eau: 1.18 },
      },
    },
  };

  const METRIC_KEYS = Object.keys(ENERGY_BASE_DATA.metrics);

  const MIX_LABELS = {
    chaleur: 'Chaleur',
    electricite: 'Électricité',
    froid: 'Froid',
  };

  const MIX_KEYS = Object.keys(MIX_LABELS);

  const normalizeText = (value) => (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const resolveMixKey = (label) => {
    const norm = normalizeText(label);
    if (!norm) return null;
    if (norm.includes('chaleur')) return 'chaleur';
    if (norm.includes('electric')) return 'electricite';
    if (norm.includes('froid')) return 'froid';
    return null;
  };

  const formatNumber = (value, { decimals = 0 } = {}) => {
    if (!Number.isFinite(value)) return '0';
    const opts = { maximumFractionDigits: decimals };
    if (decimals > 0) opts.minimumFractionDigits = decimals;
    return new Intl.NumberFormat('fr-FR', opts).format(value);
  };

  const formatEnergyDisplay = (value, mode, decimals = 0) => {
    if (!Number.isFinite(value) || value <= 0) {
      return mode === 'kwhm2' ? '0' : '0';
    }
    const rounded = mode === 'kwhm2'
      ? Number(value.toFixed(Math.max(decimals, 0)))
      : Math.round(value);
    return formatNumber(rounded, { decimals: mode === 'kwhm2' ? decimals : 0 });
  };

  const formatCompactEnergy = (value) => {
    if (!Number.isFinite(value) || value <= 0) return '0';
    return new Intl.NumberFormat('fr-FR', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const describeMix = (shares, totalPerM2, mode, sre) => {
    const unit = mode === 'kwhm2' ? 'kWh/m²' : 'kWh';
    const parts = [];
    MIX_KEYS.forEach((key) => {
      const share = shares[key] || 0;
      const perM2Value = totalPerM2 * share;
      const baseValue = mode === 'kwhm2' ? perM2Value : perM2Value * sre;
      const formatted = formatEnergyDisplay(baseValue, mode, mode === 'kwhm2' ? 1 : 0);
      const pct = Math.round(share * 100);
      parts.push(`${MIX_LABELS[key]} : ${formatted} ${unit} (${pct} %)`);
    });
    return parts.join(', ');
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

  /* ========== Catalogue de graphiques (pinceau) ========== */
  function setupChartCatalog() {
    const zone = document.querySelector('.energy-chart-zone');
    if (!zone) return;

    const toggles = Array.from(zone.querySelectorAll('.chart-edit-toggle'));
    const panel = zone.querySelector('#chart-catalog');
    if (!toggles.length || !panel) return;
    const cards = Array.from(panel.querySelectorAll('.catalog-card[data-chart-type]'));
    const getCardContainer = (card) => card?.closest('li') || null;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const layoutQuery = window.matchMedia('(max-width: 960px)');
    let isOpen = false;
    let restoreFocusAfterClose = false;
    let activeToggle = null;
    let focusTargetOnClose = null;
    let activeSlot = null;

    const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const getFocusableElements = () => (
      Array.from(panel.querySelectorAll(focusableSelector)).filter(el =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-hidden') !== 'true' &&
        el.tabIndex !== -1 &&
        el.offsetParent !== null
      )
    );

    const getSlotFromToggle = (trigger) => {
      if (!trigger) return null;
      const slotName = trigger.dataset.chartTarget || trigger.closest('[data-chart-slot]')?.dataset.chartSlot;
      if (!slotName) return null;
      return zone.querySelector(`[data-chart-slot="${slotName}"]`);
    };

    const setCardState = (card, isActive) => {
      if (!card) return;
      card.classList.toggle('is-active', isActive);
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    };

    const getSlotGroup = (slotEl) => slotEl?.dataset.chartGroup || slotEl?.dataset.chartSlot || null;

    const updateCardVisibility = (group) => {
      cards.forEach(card => {
        const matches = !group || card.dataset.chartGroup === group;
        const container = getCardContainer(card);
        if (container) {
          container.hidden = !matches;
        }
      });
    };

    const markActiveCard = (slotEl) => {
      if (!cards.length) return;
      const currentType = slotEl?.dataset.chartType || null;
      const group = getSlotGroup(slotEl);
      cards.forEach(card => {
        const matchesGroup = !group || card.dataset.chartGroup === group;
        const isActive = matchesGroup && card.dataset.chartType === currentType;
        setCardState(card, isActive);
      });
    };

    const updateCatalogForSlot = (slotEl) => {
      const group = getSlotGroup(slotEl);
      updateCardVisibility(group);
      markActiveCard(slotEl);
    };

    const applyChartToSlot = (chartType) => {
      if (!activeSlot) return false;
      const template = document.getElementById(`chart-template-${chartType}`);
      if (!template) return false;
      const body = activeSlot.querySelector('[data-chart-role="body"]');
      if (!body) return false;
      body.replaceChildren(template.content.cloneNode(true));
      const captionEl = activeSlot.querySelector('[data-chart-role="caption"]');
      if (captionEl) captionEl.textContent = template.dataset.caption || '';
      activeSlot.dataset.chartType = chartType;
      if (chartType === 'intensity-bars') {
        highlightEnergyTrend(FILTERS.year);
      }
      updateEnergyVisuals();
      return true;
    };

    const positionCatalog = (trigger) => {
      if (!trigger) return;
      if (layoutQuery.matches) {
        panel.style.removeProperty('--catalog-top');
        panel.style.removeProperty('--catalog-right');
        return;
      }

      const zoneRect = zone.getBoundingClientRect();
      const buttonRect = trigger.getBoundingClientRect();
      const rawWidth = panel.offsetWidth || panel.getBoundingClientRect().width || 0;
      const panelWidth = Math.max(rawWidth, 0);
      const top = Math.max(buttonRect.top - zoneRect.top, 0);
      const availableRight = zoneRect.right - buttonRect.right;
      const maxRight = Math.max(zoneRect.width - panelWidth, 0);
      const anchorMode = (panel.dataset.catalogAnchor || 'contain').toLowerCase();

      let resolvedRight;
      if (anchorMode === 'trigger') {
        resolvedRight = availableRight;
      } else {
        resolvedRight = Math.min(Math.max(availableRight, 0), maxRight);
      }

      if (!Number.isFinite(resolvedRight)) {
        resolvedRight = 0;
      }

      panel.style.setProperty('--catalog-top', `${top}px`);
      panel.style.setProperty('--catalog-right', `${resolvedRight}px`);
    };

    const clearCatalogPosition = () => {
      panel.style.removeProperty('--catalog-top');
      panel.style.removeProperty('--catalog-right');
    };

    const focusFirstElement = () => {
      const focusables = getFocusableElements();
      const target = focusables[0] || panel;
      target.focus({ preventScroll: true });
    };

    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const onDocClick = (event) => {
      if (panel.contains(event.target) || toggles.some(btn => btn.contains(event.target))) return;
      closePanel({ returnFocus: false });
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    };

    const handleTransitionEnd = (event) => {
      if (event.target !== panel || event.propertyName !== 'opacity') return;
      panel.removeEventListener('transitionend', handleTransitionEnd);
      if (isOpen) return;
      panel.hidden = true;
      clearCatalogPosition();
      if (restoreFocusAfterClose && focusTargetOnClose) {
        focusTargetOnClose.focus({ preventScroll: true });
      }
      focusTargetOnClose = null;
      restoreFocusAfterClose = false;
    };

    const setToggleState = (btn, expanded) => {
      if (!btn) return;
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.classList.toggle('is-in-catalog', expanded);
    };

    const openPanel = (trigger) => {
      if (!trigger) return;
      if (activeToggle && activeToggle !== trigger) {
        setToggleState(activeToggle, false);
      }
      activeToggle = trigger;
      activeSlot = getSlotFromToggle(trigger);
      isOpen = true;
      restoreFocusAfterClose = false;
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
      setToggleState(activeToggle, true);
      panel.scrollTop = 0;
      positionCatalog(trigger);
      updateCatalogForSlot(activeSlot);
      // Force a reflow so the transition plays even when the panel was hidden
      void panel.getBoundingClientRect();
      zone.classList.add('catalog-open');
      panel.addEventListener('keydown', trapFocus);
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKeydown);
      requestAnimationFrame(() => focusFirstElement());
    };

    const closePanel = ({ returnFocus = true } = {}) => {
      if (!isOpen) return;
      isOpen = false;
      panel.setAttribute('aria-hidden', 'true');
      focusTargetOnClose = returnFocus ? activeToggle : null;
      setToggleState(activeToggle, false);
      panel.removeEventListener('keydown', trapFocus);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKeydown);
      activeToggle = returnFocus ? activeToggle : null;
      activeSlot = null;

      if (prefersReducedMotion()) {
        zone.classList.remove('catalog-open');
        panel.hidden = true;
        clearCatalogPosition();
        if (focusTargetOnClose) {
          focusTargetOnClose.focus({ preventScroll: true });
        }
        focusTargetOnClose = null;
        restoreFocusAfterClose = false;
        return;
      }

      restoreFocusAfterClose = returnFocus;
      panel.addEventListener('transitionend', handleTransitionEnd);
      zone.classList.remove('catalog-open');
      if (!returnFocus) {
        activeToggle = null;
      }
    };

    const handleResize = () => {
      if (!isOpen || !activeToggle) return;
      requestAnimationFrame(() => positionCatalog(activeToggle));
    };

    const handleLayoutChange = () => {
      if (!isOpen || !activeToggle) return;
      positionCatalog(activeToggle);
    };

    window.addEventListener('resize', handleResize);
    if (typeof layoutQuery.addEventListener === 'function') {
      layoutQuery.addEventListener('change', handleLayoutChange);
    } else if (typeof layoutQuery.addListener === 'function') {
      layoutQuery.addListener(handleLayoutChange);
    }

    toggles.forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isOpen && activeToggle === btn) closePanel();
        else openPanel(btn);
      });

      btn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (isOpen && activeToggle === btn) closePanel();
          else openPanel(btn);
        }
      });
    });

    cards.forEach(card => {
      card.addEventListener('click', (event) => {
        event.preventDefault();
        if (!activeSlot) return;
        const type = card.dataset.chartType;
        if (!type) return;
        if (applyChartToSlot(type)) {
          updateCatalogForSlot(activeSlot);
          closePanel();
        }
      });
    });
  }

  /* ========== Tabset générique (Énergie + sections alt) ========== */
  function updateTrendPadding(scope = document) {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    scope.querySelectorAll('.kpi-value-wrap').forEach(w => {
      const valueEl = w.querySelector('.kpi-value');
      if (!valueEl) return;

      w.style.removeProperty('--value-size');
      const basePx = Number.parseFloat(getComputedStyle(valueEl).fontSize) || (rootFontSize * 2);

      const rawText = (valueEl.textContent || '').trim();
      const digitsOnly = rawText.replace(/[^0-9]/g, '');
      const compactText = digitsOnly.length ? digitsOnly : rawText.replace(/\s+/g, '');
      const effectiveLength = Math.max(compactText.length, 1);
      const extra = Math.max(effectiveLength - 4, 0);
      const shrinkFactor = Math.max(0.55, 1 - (extra * 0.09));
      const baseRem = basePx / rootFontSize;
      const finalRem = Math.min(baseRem, Math.max(1.05, baseRem * shrinkFactor));

      w.style.setProperty('--value-size', `${finalRem.toFixed(3)}rem`);
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
  const handleKpiResize = () => updateTrendPadding();
  window.addEventListener('resize', handleKpiResize);

  /* ========== Sidebar (cases + hamburger) ========== */
  const treeCheckboxMap = new WeakMap();

  function hydrateTreeCheckboxMap() {
    $$('.tree-check').forEach(cb => {
      if (!(cb instanceof HTMLElement)) return;

      const leafItem = cb.closest('li');
      if (leafItem) {
        const leafBtn = leafItem.querySelector('.tree-leaf');
        if (leafBtn) {
          treeCheckboxMap.set(leafBtn, cb);
          return;
        }
      }

      const siteGroup = cb.closest('.tree-group');
      if (siteGroup) {
        const siteBtn = siteGroup.querySelector('.tree-node.toggle');
        if (siteBtn) {
          treeCheckboxMap.set(siteBtn, cb);
          return;
        }
      }

      if (!leafItem && !siteGroup) {
        const treeRoot = cb.closest('.tree');
        const rootBtn = treeRoot?.querySelector('.tree > .tree-node:not(.toggle)');
        if (rootBtn) treeCheckboxMap.set(rootBtn, cb);
      }
    });
  }

  hydrateTreeCheckboxMap();

  const parcBtn = $('.tree > .tree-node:not(.toggle)');
  const siteBtns = $$('.tree-group > .tree-node.toggle');
  const resolveTreeCheckbox = (btn, fallback) => {
    if (!btn) return null;
    const cached = treeCheckboxMap.get(btn);
    if (cached instanceof HTMLInputElement) return cached;
    const resolved = typeof fallback === 'function' ? fallback() : null;
    if (resolved instanceof HTMLInputElement) {
      treeCheckboxMap.set(btn, resolved);
      return resolved;
    }
    return null;
  };

  const findSiblingTreeCheck = (parent, exclude) => {
    if (!parent) return null;
    const children = Array.from(parent.children || []);
    for (const child of children) {
      if (child === exclude) continue;
      if (child instanceof HTMLInputElement && child.classList.contains('tree-check')) {
        return child;
      }
    }
    return null;
  };

  const getParcCheck = () => resolveTreeCheckbox(parcBtn, () => {
    if (!parcBtn) return null;
    const inside = parcBtn.querySelector?.('.tree-check');
    if (inside instanceof HTMLInputElement) return inside;
    return findSiblingTreeCheck(parcBtn.parentElement, parcBtn);
  });

  const siteCheck = (siteBtn) => resolveTreeCheckbox(siteBtn, () => {
    if (!siteBtn) return null;
    const inside = siteBtn.querySelector?.('.tree-check');
    if (inside instanceof HTMLInputElement) return inside;
    return findSiblingTreeCheck(siteBtn.parentElement, siteBtn);
  });
  const siteLeaves = (siteBtn) => {
    const parent = siteBtn?.parentElement;
    if (!parent) return [];
    const list = Array.from(parent.children).find(child => child.classList?.contains('tree-children'));
    return list ? $$('.tree-leaf', list) : [];
  };
  const leafCheck = (leafBtn) => resolveTreeCheckbox(leafBtn, () => {
    if (!leafBtn) return null;
    const inside = leafBtn.querySelector?.('.tree-check');
    if (inside instanceof HTMLInputElement) return inside;
    const li = leafBtn.closest('li');
    return findSiblingTreeCheck(li, leafBtn);
  });

  const computeFallbackSre = (leaves) => {
    const list = Array.isArray(leaves) && leaves.length ? leaves : $$('.tree-leaf');
    return list.reduce((total, leaf) => {
      const raw = Number.parseFloat(leaf?.dataset?.sre);
      return Number.isFinite(raw) ? total + raw : total;
    }, 0);
  };

  const computeAggregatedMetrics = (leaves, fallbackSre) => {
    const aggregated = {};
    const totals = {};
    const fallbackIntensity = {};
    const buildingSummaries = {};

    const resolveLeafLabel = (leaf) => {
      if (!leaf) return '';
      const dataLabel = leaf.dataset?.label;
      if (dataLabel) return dataLabel.trim();
      const text = leaf.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    };

    METRIC_KEYS.forEach((key) => {
      totals[key] = { energy: 0, sre: 0 };
      const baseMetric = ENERGY_BASE_DATA.metrics[key];
      fallbackIntensity[key] = Number(baseMetric?.intensity) || 0;
    });

    if (Array.isArray(leaves) && leaves.length) {
      leaves.forEach((leaf) => {
        const sre = Number.parseFloat(leaf?.dataset?.sre);
        if (!Number.isFinite(sre) || sre <= 0) return;
        const buildingId = leaf.dataset?.building || '';
        const buildingMetrics = ENERGY_BASE_DATA.buildings?.[buildingId]?.metrics || {};
        const summary = buildingSummaries[buildingId] || {
          id: buildingId,
          label: resolveLeafLabel(leaf) || buildingId || 'Bâtiment',
          sre: 0,
          metrics: {},
        };

        summary.sre += sre;

        METRIC_KEYS.forEach((key) => {
          const candidate = Number(buildingMetrics[key]);
          const intensity = Number.isFinite(candidate) ? candidate : fallbackIntensity[key];
          totals[key].energy += intensity * sre;
          totals[key].sre += sre;

          const metricEntry = summary.metrics[key] || { energy: 0, sre: 0 };
          metricEntry.energy += intensity * sre;
          metricEntry.sre += sre;
          summary.metrics[key] = metricEntry;
        });

        buildingSummaries[buildingId] = summary;
      });
    }

    const safeFallbackSre = Number.isFinite(fallbackSre) && fallbackSre > 0
      ? fallbackSre
      : 0;

    METRIC_KEYS.forEach((key) => {
      const hasData = totals[key].sre > 0;
      const totalSre = hasData ? totals[key].sre : safeFallbackSre;
      const intensity = hasData && totals[key].sre > 0
        ? totals[key].energy / totals[key].sre
        : fallbackIntensity[key];
      const totalEnergy = hasData
        ? totals[key].energy
        : intensity * totalSre;
      aggregated[key] = {
        intensity,
        total: totalEnergy,
        sre: totalSre,
      };
    });

    Object.values(buildingSummaries).forEach((summary) => {
      METRIC_KEYS.forEach((key) => {
        const metricData = summary.metrics[key];
        if (!metricData) return;
        const energy = Number(metricData.energy) || 0;
        const sre = Number(metricData.sre) || 0;
        const intensity = sre > 0 ? energy / sre : fallbackIntensity[key];
        summary.metrics[key] = {
          intensity,
          total: energy,
          sre,
        };
      });
    });

    return { metrics: aggregated, buildings: buildingSummaries };
  };

  const updateEnergyKpis = (mode, aggregated) => {
    const map = {
      general: '#tab-energie .kpi-value',
      chaleur: '#tab-chaleur .kpi-value',
      froid: '#tab-froid .kpi-value',
      elec: '#tab-elec .kpi-value',
      co2: '#tab-co2 .kpi-value',
      eau: '#tab-eau .kpi-value',
    };

    Object.entries(map).forEach(([key, selector]) => {
      const el = document.querySelector(selector);
      const metric = ENERGY_BASE_DATA.metrics[key];
      const data = aggregated?.[key];
      if (!el || !metric || !data) return;
      const value = mode === 'kwhm2' ? data.intensity : data.total;
      const decimals = mode === 'kwhm2' ? (metric.decimals || 0) : 0;
      el.textContent = formatEnergyDisplay(value, mode, decimals);
    });
  };

  const updateEnergyThresholds = (mode, sre) => {
    const legalEl = document.querySelector('[data-energy-legal]');
    const targetEl = document.querySelector('[data-energy-target]');
    const legalUnit = document.querySelector('[data-energy-unit="legal"]');
    const targetUnit = document.querySelector('[data-energy-unit="target"]');
    if (!legalEl || !targetEl) return;

    const legalValue = mode === 'kwhm2'
      ? ENERGY_BASE_DATA.thresholds.legal
      : ENERGY_BASE_DATA.thresholds.legal * sre;
    const targetValue = mode === 'kwhm2'
      ? ENERGY_BASE_DATA.thresholds.target
      : ENERGY_BASE_DATA.thresholds.target * sre;
    const unit = mode === 'kwhm2' ? 'kWh/m²' : 'kWh';

    legalEl.textContent = formatEnergyDisplay(legalValue, mode, 0);
    targetEl.textContent = formatEnergyDisplay(targetValue, mode, 0);
    if (legalUnit) legalUnit.textContent = unit;
    if (targetUnit) targetUnit.textContent = unit;
  };

  const updateEnergyMeters = (aggregated) => {
    const intensities = [
      ...ENERGY_BASE_DATA.trend.map(item => item.intensity),
      ...METRIC_KEYS.map(key => Number(aggregated?.[key]?.intensity) || 0),
    ].filter(value => Number.isFinite(value) && value >= 0);
    const maxIntensity = intensities.length ? Math.max(...intensities) : 0;
    const map = {
      general: '#panel-energie .meter > div',
      chaleur: '#panel-chaleur .meter > div',
      froid: '#panel-froid .meter > div',
      elec: '#panel-elec .meter > div',
      co2: '#panel-co2 .meter > div',
      eau: '#panel-eau .meter > div',
    };

    Object.entries(map).forEach(([key, selector]) => {
      const el = document.querySelector(selector);
      const metric = ENERGY_BASE_DATA.metrics[key];
      if (!el || !metric || maxIntensity <= 0) return;
      const value = Number(aggregated?.[key]?.intensity);
      const fallback = Number(metric.intensity) || 0;
      const percent = Math.max(0, Math.min(100, ((Number.isFinite(value) ? value : fallback) / maxIntensity) * 100));
      el.style.width = `${percent}%`;
    });
  };

  const updateEnergyTrendChart = (mode, sre) => {
    const chart = document.querySelector('.energy-trend-chart');
    if (!chart) return;
    const unitLabel = mode === 'kwhm2' ? 'kWh/m²' : 'kWh';
    chart.querySelectorAll('.chart-unit').forEach(unit => { unit.textContent = unitLabel; });

    const barsWrap = chart.querySelector('.chart-bars');
    const values = [];
    ENERGY_BASE_DATA.trend.forEach(({ year, intensity }) => {
      const bar = chart.querySelector(`.chart-bar[data-year="${year}"]`);
      if (!bar) return;
      const displayValue = mode === 'kwhm2' ? intensity : intensity * sre;
      values.push(displayValue);
      const valueText = formatEnergyDisplay(displayValue, mode, 0);
      const barValue = bar.querySelector('.bar-value');
      if (barValue) barValue.textContent = valueText;
      bar.setAttribute('aria-label', `${year} : ${valueText} ${unitLabel}`);
      bar.style.setProperty('--value', Number(displayValue) || 0);
    });

    if (barsWrap && values.length) {
      const maxValue = Math.max(...values);
      const scale = maxValue > 0 ? (150 / maxValue) : 0;
      if (scale > 0) barsWrap.style.setProperty('--bar-scale', `${scale}px`);
      else barsWrap.style.removeProperty('--bar-scale');
    }
  };

  const updateMixCards = (mode, aggregated) => {
    const general = aggregated?.general || {};
    const totalPerM2 = Number(general.intensity) || Number(ENERGY_BASE_DATA.metrics.general?.intensity) || 0;
    const sre = Number(general.sre) || computeFallbackSre();
    const unit = mode === 'kwhm2' ? 'kWh/m²' : 'kWh';
    document.querySelectorAll('.energy-mix-card').forEach((card) => {
      const slot = card.dataset.chartSlot || '';
      const shares = slot === 'mix-secondary'
        ? ENERGY_BASE_DATA.mix.secondary
        : ENERGY_BASE_DATA.mix.primary;
      if (!shares) return;

      const subtitle = card.querySelector('.mix-subtitle');
      if (subtitle) subtitle.textContent = `Répartition en ${unit}`;

      const updateLegendItem = (container, valueEl, labelText) => {
        const key = resolveMixKey(labelText);
        if (!valueEl || !key) return;
        const share = shares[key] || 0;
        const perM2Value = totalPerM2 * share;
        const baseValue = mode === 'kwhm2' ? perM2Value : perM2Value * sre;
        const formatted = formatEnergyDisplay(baseValue, mode, mode === 'kwhm2' ? 1 : 0);
        const pct = Math.round(share * 100);
        valueEl.textContent = `${formatted} ${unit} (${pct} %)`;
      };

      card.querySelectorAll('.mix-legend li').forEach((li) => {
        const label = li.querySelector('.mix-label')?.textContent || '';
        const valueEl = li.querySelector('.mix-value');
        updateLegendItem(li, valueEl, label);
      });

      card.querySelectorAll('.mix-columns-legend li').forEach((li) => {
        const label = li.querySelector('.mix-label')?.textContent || '';
        const valueEl = li.querySelector('.mix-value');
        updateLegendItem(li, valueEl, label);
      });

      card.querySelectorAll('.mix-bar').forEach((bar) => {
        const label = bar.querySelector('.mix-bar__label')?.textContent || '';
        const valueEl = bar.querySelector('.mix-bar__value');
        updateLegendItem(bar, valueEl, label);
      });

      card.querySelectorAll('.mix-ring').forEach((ring) => {
        const label = ring.querySelector('.mix-ring__label')?.textContent || '';
        const valueEl = ring.querySelector('.mix-ring__value');
        updateLegendItem(ring, valueEl, label);
      });

      const donutCenter = card.querySelector('.mix-donut__center');
      if (donutCenter) {
        const share = shares.chaleur || 0;
        const perM2Value = totalPerM2 * share;
        const baseValue = mode === 'kwhm2' ? perM2Value : perM2Value * sre;
        donutCenter.textContent = `${formatCompactEnergy(baseValue)} ${unit}`;
      }

      const roleImg = card.querySelector('[role="img"]');
      if (roleImg) {
        const labelBase = card.getAttribute('aria-label') || 'Mix énergétique';
        roleImg.setAttribute('aria-label', `${labelBase} : ${describeMix(shares, totalPerM2, mode, sre)}.`);
      }
    });
  };

  const updateTopConsumersCards = (mode, buildingSummaries) => {
    const rankingCards = document.querySelectorAll('.energy-ranking-card');
    if (!rankingCards.length) return;

    const unit = mode === 'kwhm2' ? 'kWh/m²' : 'kWh';
    const generalMetric = ENERGY_BASE_DATA.metrics.general || { decimals: 0 };
    const decimals = mode === 'kwhm2' ? (generalMetric.decimals || 0) : 0;

    const entries = Object.values(buildingSummaries || {}).map((entry) => {
      const metrics = entry?.metrics?.general || {};
      const value = mode === 'kwhm2'
        ? Number(metrics.intensity)
        : Number(metrics.total);
      return {
        id: entry?.id || '',
        label: entry?.label || entry?.id || '',
        value: Number.isFinite(value) ? value : 0,
      };
    });

    entries.sort((a, b) => b.value - a.value);
    const topFive = entries.slice(0, 5);
    const maxValue = topFive.reduce((acc, item) => (item.value > acc ? item.value : acc), 0);

    rankingCards.forEach((card) => {
      card.querySelectorAll('[data-ranking-unit]').forEach((el) => {
        el.textContent = unit;
      });

      const list = card.querySelector('[data-ranking-list]');
      if (!list) return;
      list.innerHTML = '';

      if (!topFive.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'ranking-item ranking-item--empty';
        emptyItem.textContent = 'Aucune donnée disponible';
        list.append(emptyItem);
        return;
      }

      topFive.forEach((entry, index) => {
        const li = document.createElement('li');
        li.className = 'ranking-item';
        if (entry.id) li.dataset.buildingId = entry.id;

        const rank = document.createElement('span');
        rank.className = 'ranking-rank';
        rank.textContent = String(index + 1);

        const main = document.createElement('div');
        main.className = 'ranking-main';

        const name = document.createElement('span');
        name.className = 'ranking-name';
        name.textContent = entry.label || `Bâtiment ${index + 1}`;

        const bar = document.createElement('div');
        bar.className = 'ranking-bar';

        const barFill = document.createElement('div');
        barFill.className = 'ranking-bar__fill';
        const rawPercent = maxValue > 0 ? (entry.value / maxValue) * 100 : 0;
        const percent = rawPercent > 0 ? Math.max(rawPercent, 6) : 0;
        barFill.style.width = `${Math.min(percent, 100)}%`;
        bar.append(barFill);

        main.append(name, bar);

        const valueEl = document.createElement('span');
        valueEl.className = 'ranking-value';
        valueEl.textContent = `${formatEnergyDisplay(entry.value, mode, decimals)} ${unit}`;

        li.append(rank, main, valueEl);
        list.append(li);
      });
    });
  };

  function updateEnergyVisuals() {
    const mode = FILTERS.norm || 'kwhm2';
    const allLeaves = $$('.tree-leaf');
    const selectedLeaves = allLeaves.filter(leaf => leafCheck(leaf)?.checked);
    const activeLeaves = selectedLeaves.length ? selectedLeaves : allLeaves;
    const fallbackSre = computeFallbackSre(allLeaves);
    const { metrics: aggregated, buildings } = computeAggregatedMetrics(activeLeaves, fallbackSre);
    const effectiveSre = Number(aggregated?.general?.sre) || fallbackSre || 0;

    updateEnergyKpis(mode, aggregated);
    updateEnergyThresholds(mode, effectiveSre);
    updateEnergyTrendChart(mode, effectiveSre);
    updateMixCards(mode, aggregated);
    updateEnergyMeters(aggregated);
    updateTopConsumersCards(mode, buildings);
    updateTrendPadding();
  }

  function syncTreeSelectionState() {
    $$('.tree-leaf').forEach(leafBtn => {
      const cb = leafCheck(leafBtn);
      setActive(leafBtn, !!cb?.checked);
    });
    siteBtns.forEach(siteBtn => updateSiteFromLeaves(siteBtn));
    updateParcFromSites();
  }

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

    updateEnergyVisuals();
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
    const parcCheck = getParcCheck();
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
  const initialParcCheck = getParcCheck();
  if (parcBtn && initialParcCheck && !parcBtn.dataset.bound) {
    parcBtn.dataset.bound = '1';

    // Cliquer n'importe où sur la ligne (sauf directement sur la checkbox)
    parcBtn.addEventListener('click', (e) => {
      const parcCheck = getParcCheck();
      if (!parcCheck) return;
      if (e.target === parcCheck) return;
      parcCheck.indeterminate = false;
      parcCheck.checked = !parcCheck.checked;
      parcCheck.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Quand la checkbox change -> (dé)sélectionne tout le parc
    initialParcCheck.addEventListener('change', () => {
      const parcCheck = getParcCheck();
      checkWholeParc(parcCheck?.checked);

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

    updateEnergyVisuals();
  }

  function setupEnergyFilters() {
    const scope = document.getElementById('energy-filters');
    if (!scope) return;

    // Normalisation
    const normInputs = scope.querySelectorAll('input[name="norm-energy"]');
    normInputs.forEach(r =>
      r.addEventListener('change', e => applyNormalization(e.target.value))
    );
    const defaultNormInput = scope.querySelector(`#norm-${FILTERS.norm}`) || normInputs[0];
    if (defaultNormInput) {
      defaultNormInput.checked = true;
      applyNormalization(defaultNormInput.value);
    } else {
      applyNormalization(FILTERS.norm);
    }


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

    // Par défaut on coche tout le parc et on affiche immédiatement les totaux.
    hydrateTreeCheckboxMap();
    checkWholeParc(true);
    syncTreeSelectionState();

    wireYearPicker();
    setupChartCatalog();
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
