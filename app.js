// app.js (v2 robuste) — copie/colle tel quel
(() => {
  /* ========== Helpers ========== */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);
  const NF = new Intl.NumberFormat('fr-FR');
  const isReducedMotionPreferred = () => {
    try {
      return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  };

  const energySubnav = document.getElementById('energy-subnav');
  const topNavMenu = document.querySelector('.top-nav');
  let energySubnavEnabled = false;
  let energySubnavSentinelVisible = true;
  let energySubnavInitialized = false;
  let energySubnavHideTimer = null;
  let energySubnavSyncRaf = null;
  let energySubnavActiveId = null;
  let energySubnavMeasureRaf = null;
  let energySubnavGeometryEnabled = false;
  let energySubnavTabsGrid = null;

  const MAP_SEVERITY_COLORS = {
    low: '#4ade80',
    medium: '#38bdf8',
    high: '#f97316',
    critical: '#ef4444',
  };

  const MAP_CARD_STATE = new WeakMap();

  const ensureMapFrame = (card) => {
    if (!card || !(card instanceof HTMLElement)) return null;
    let state = MAP_CARD_STATE.get(card);
    if (state) return state;
    const viewport = card.querySelector('[data-leaflet-map]');
    if (!viewport) return null;
    let frame = viewport.querySelector('.map-viewport__frame');
    if (!frame) {
      frame = document.createElement('div');
      frame.className = 'map-viewport__frame';
      viewport.appendChild(frame);
    }
    state = { viewport, frame };
    MAP_CARD_STATE.set(card, state);
    return state;
  };

  const projectMapPoints = (points) => {
    if (!Array.isArray(points) || !points.length) {
      return { projectedBounds: null };
    }

    const latLngCandidates = points.filter((point) => {
      const lat = Number(point?.position?.lat);
      const lng = Number(point?.position?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });

    let frameMinX = Infinity;
    let frameMaxX = -Infinity;
    let frameMinY = Infinity;
    let frameMaxY = -Infinity;

    if (latLngCandidates.length >= 2) {
      const lats = latLngCandidates.map(point => Number(point.position.lat));
      const lngs = latLngCandidates.map(point => Number(point.position.lng));
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const latSpan = Math.max(maxLat - minLat, 0.0001);
      const lngSpan = Math.max(maxLng - minLng, 0.0001);

      points.forEach((point) => {
        const lat = Number(point?.position?.lat);
        const lng = Number(point?.position?.lng);
        let x = null;
        let y = null;

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          x = ((lng - minLng) / lngSpan) * 100;
          y = 100 - ((lat - minLat) / latSpan) * 100;
        } else {
          const px = Number(point?.position?.x);
          const py = Number(point?.position?.y);
          if (Number.isFinite(px) && Number.isFinite(py)) {
            x = px;
            y = py;
          }
        }

        if (Number.isFinite(x) && Number.isFinite(y)) {
          point.projected = { x, y };
          frameMinX = Math.min(frameMinX, x);
          frameMaxX = Math.max(frameMaxX, x);
          frameMinY = Math.min(frameMinY, y);
          frameMaxY = Math.max(frameMaxY, y);
        } else {
          point.projected = null;
        }
      });
    } else {
      const valid = points.filter((point) => {
        const px = Number(point?.position?.x);
        const py = Number(point?.position?.y);
        return Number.isFinite(px) && Number.isFinite(py);
      });

      if (!valid.length) {
        points.forEach((point) => { point.projected = null; });
        return { projectedBounds: null };
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      valid.forEach((point) => {
        const px = Number(point.position.x);
        const py = Number(point.position.y);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      });

      const spanX = Math.max(maxX - minX, 0.0001);
      const spanY = Math.max(maxY - minY, 0.0001);

      points.forEach((point) => {
        const px = Number(point?.position?.x);
        const py = Number(point?.position?.y);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          const x = ((px - minX) / spanX) * 100;
          const y = ((py - minY) / spanY) * 100;
          point.projected = { x, y };
          frameMinX = Math.min(frameMinX, x);
          frameMaxX = Math.max(frameMaxX, x);
          frameMinY = Math.min(frameMinY, y);
          frameMaxY = Math.max(frameMaxY, y);
        } else {
          point.projected = null;
        }
      });
    }

    if (!Number.isFinite(frameMinX) || !Number.isFinite(frameMinY) || !Number.isFinite(frameMaxX) || !Number.isFinite(frameMaxY)) {
      return { projectedBounds: null };
    }

    const margin = 4;
    const bounds = {
      minX: Math.max(0, frameMinX - margin),
      minY: Math.max(0, frameMinY - margin),
      maxX: Math.min(100, frameMaxX + margin),
      maxY: Math.min(100, frameMaxY + margin),
    };

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width < 8) {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      bounds.minX = Math.max(0, centerX - 4);
      bounds.maxX = Math.min(100, centerX + 4);
    }
    if (height < 8) {
      const centerY = (bounds.minY + bounds.maxY) / 2;
      bounds.minY = Math.max(0, centerY - 4);
      bounds.maxY = Math.min(100, centerY + 4);
    }

    return { projectedBounds: bounds };
  };

  const toRgbComponents = (input) => {
    if (!input) return null;
    const value = input.trim();
    const rgbMatch = value.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (rgbMatch) {
      return {
        r: Math.min(255, parseInt(rgbMatch[1], 10) || 0),
        g: Math.min(255, parseInt(rgbMatch[2], 10) || 0),
        b: Math.min(255, parseInt(rgbMatch[3], 10) || 0),
      };
    }

    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3) {
        hex = hex.split('').map(ch => ch + ch).join('');
      }
      const num = parseInt(hex, 16);
      if (!Number.isFinite(num)) return null;
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }

    return null;
  };

  const rgbString = (rgb) => (rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : '');
  const rgbaString = (rgb, alpha) => (rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : '');

  function requestSyncStickyTop() {
    if (typeof requestAnimationFrame === 'function') {
      if (energySubnavSyncRaf) cancelAnimationFrame(energySubnavSyncRaf);
      energySubnavSyncRaf = requestAnimationFrame(() => {
        energySubnavSyncRaf = null;
        syncStickyTop();
      });
    } else {
      syncStickyTop();
    }
  }

  function updateEnergySubnavVisibility() {
    if (!energySubnav) return;
    const shouldShow = energySubnavEnabled && !energySubnavSentinelVisible;
    energySubnav.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

    if (shouldShow) {
      if (energySubnavHideTimer) {
        clearTimeout(energySubnavHideTimer);
        energySubnavHideTimer = null;
      }
      if (energySubnav.hidden) {
        energySubnav.hidden = false;
        energySubnav.classList.remove('is-visible');
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => energySubnav.classList.add('is-visible'));
        } else {
          energySubnav.classList.add('is-visible');
        }
      } else {
        energySubnav.classList.add('is-visible');
      }
    } else {
      energySubnav.classList.remove('is-visible');
      if (!energySubnav.hidden) {
        if (energySubnavHideTimer) clearTimeout(energySubnavHideTimer);
        if (isReducedMotionPreferred()) {
          energySubnav.hidden = true;
        } else {
          energySubnavHideTimer = window.setTimeout(() => {
            energySubnav.hidden = true;
            energySubnavHideTimer = null;
          }, 220);
        }
      }
    }

    requestSyncStickyTop();
  }

  function setEnergySubnavActive(tabId) {
    energySubnavActiveId = tabId || null;
    if (!energySubnav || !energySubnavInitialized) return;
    $$('[data-target-tab]', energySubnav).forEach(btn => {
      const active = btn.dataset.targetTab === energySubnavActiveId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function scheduleEnergySubnavMeasure(forceNow = false) {
    if (!energySubnavGeometryEnabled) return;
    if (forceNow) {
      energySubnavMeasureRaf && cancelAnimationFrame(energySubnavMeasureRaf);
      energySubnavMeasureRaf = null;
      return measureEnergySubnavGeometry();
    }
    if (energySubnavMeasureRaf) return;
    energySubnavMeasureRaf = requestAnimationFrame(() => {
      energySubnavMeasureRaf = null;
      measureEnergySubnavGeometry();
    });
  }

  function measureEnergySubnavGeometry() {
    if (!energySubnavGeometryEnabled || !energySubnavTabsGrid || !topNavMenu) return;
    const navRect = topNavMenu.getBoundingClientRect();
    const tabsRect = energySubnavTabsGrid.getBoundingClientRect();
    if (!navRect || !tabsRect) return;
    const revealOffset = 6;
    const shouldHide = (tabsRect.bottom - navRect.bottom) > revealOffset;
    energySubnavSentinelVisible = shouldHide;
    updateEnergySubnavVisibility();
  }

  function setupEnergySubnavGeometry(tabsContainer) {
    if (!tabsContainer || !topNavMenu || energySubnavGeometryEnabled) return;
    energySubnavTabsGrid = tabsContainer;
    energySubnavGeometryEnabled = true;
    const passiveOpts = { passive: true };
    window.addEventListener('scroll', () => scheduleEnergySubnavMeasure(false), passiveOpts);
    window.addEventListener('resize', () => scheduleEnergySubnavMeasure(false));
    window.addEventListener('orientationchange', () => scheduleEnergySubnavMeasure(true));
    scheduleEnergySubnavMeasure(true);
  }

  function ensureEnergySubnav(tabs, selectTabFn, tabsContainer) {
    if (!energySubnav || energySubnavInitialized) return;
    if (!tabs.length) return;

    const frag = document.createDocumentFragment();
    tabs.forEach(tab => {
      if (!(tab instanceof HTMLElement)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'top-subnav-item';
      btn.dataset.targetTab = tab.id || '';
      btn.setAttribute('aria-pressed', 'false');

      const iconSrc = tab.querySelector('.kpi-icon svg');
      if (iconSrc) {
        const iconWrap = document.createElement('span');
        iconWrap.className = 'top-subnav-icon';
        iconWrap.appendChild(iconSrc.cloneNode(true));
        btn.appendChild(iconWrap);
      }

      const label = tab.querySelector('.kpi-label');
      const text = document.createElement('span');
      text.className = 'top-subnav-text';
      text.textContent = label?.textContent?.trim() || tab.textContent.trim();
      btn.appendChild(text);

      try {
        const computed = getComputedStyle(tab);
        const colorValue = computed.getPropertyValue('--status').trim();
        const rgb = toRgbComponents(colorValue);
        if (rgb) {
          btn.style.setProperty('--accent', rgbString(rgb));
          btn.style.setProperty('--accent-soft', rgbaString(rgb, 0.16));
          btn.style.setProperty('--accent-strong', rgbaString(rgb, 0.32));
        }
      } catch (err) {
        console.warn('[energy-subnav] couleur indisponible', err);
      }

      btn.addEventListener('click', () => {
        selectTabFn(tab);
      });

      frag.appendChild(btn);
    });

    energySubnav.appendChild(frag);
    energySubnavInitialized = true;
    if (energySubnavActiveId) {
      setEnergySubnavActive(energySubnavActiveId);
    }
    updateEnergySubnavVisibility();
    setupEnergySubnavGeometry(tabsContainer || null);
  }
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

  const METRIC_UNIT_MAP = {
    general: { kwhm2: 'kWh/m²', kwh: 'kWh' },
    chaleur: { kwhm2: 'kWh/m²', kwh: 'kWh' },
    froid: { kwhm2: 'kWh/m²', kwh: 'kWh' },
    elec: { kwhm2: 'kWh/m²', kwh: 'kWh' },
    co2: { kwhm2: 'kgCO₂e/m²', kwh: 'kgCO₂e' },
    eau: { kwhm2: 'm³/m²', kwh: 'm³' },
  };

  const getUnitLabel = (metricKey, mode) => {
    const map = METRIC_UNIT_MAP[metricKey] || METRIC_UNIT_MAP.general;
    return map?.[mode] || METRIC_UNIT_MAP.general[mode] || (mode === 'kwhm2' ? 'kWh/m²' : 'kWh');
  };

  const getAnnualUnitLabel = (metricKey, mode) => {
    const base = getUnitLabel(metricKey, mode);
    return `${base}/an`;
  };

  const DEFAULT_TILE_LAYOUT = { width: 'half', height: 'medium' };
  const TILE_LAYOUT_BY_TYPE = {
    'mix-primary-pie': { width: 'half', height: 'medium' },
    'mix-primary-donut': { width: 'half', height: 'medium' },
    'mix-primary-bars': { width: 'half', height: 'medium' },
    'mix-secondary-ranking': { width: 'half', height: 'tall' },
    'mix-secondary-pie': { width: 'half', height: 'medium' },
    'mix-secondary-rings': { width: 'half', height: 'medium' },
    'mix-secondary-columns': { width: 'half', height: 'medium' },
    'heat-fuels-donut': { width: 'half', height: 'medium' },
    'heat-fuels-bars': { width: 'half', height: 'medium' },
    'heat-uses-bars': { width: 'half', height: 'medium' },
    'heat-uses-rings': { width: 'half', height: 'medium' },
    'cold-production-donut': { width: 'half', height: 'medium' },
    'cold-production-bars': { width: 'half', height: 'medium' },
    'cold-uses-bars': { width: 'half', height: 'medium' },
    'cold-uses-rings': { width: 'half', height: 'medium' },
    'elec-sources-donut': { width: 'half', height: 'medium' },
    'elec-sources-bars': { width: 'half', height: 'medium' },
    'elec-uses-bars': { width: 'half', height: 'medium' },
    'elec-uses-rings': { width: 'half', height: 'medium' },
    'co2-scopes-donut': { width: 'half', height: 'medium' },
    'co2-sources-bars': { width: 'half', height: 'medium' },
    'co2-ranking': { width: 'half', height: 'tall' },
    'co2-intensity-bars': { width: 'full', height: 'medium' },
    'co2-monthly': { width: 'full', height: 'xl' },
    'co2-distribution': { width: 'full', height: 'medium' },
    'intensity-bars': { width: 'full', height: 'medium' },
    'intensity-line': { width: 'full', height: 'short' },
    'intensity-breakdown': { width: 'full', height: 'tall' },
    'heat-intensity-bars': { width: 'full', height: 'medium' },
    'cold-intensity-bars': { width: 'full', height: 'medium' },
    'elec-intensity-bars': { width: 'full', height: 'medium' },
    'typology-columns': { width: 'full', height: 'xl' },
    'typology-rows': { width: 'full', height: 'xl' },
    'map-bubbles': { width: 'full', height: 'tall' },
    'map-grid': { width: 'full', height: 'medium' },
    'monthly-stacked': { width: 'full', height: 'xl' },
    'monthly-lines': { width: 'full', height: 'xl' },
    'heat-monthly': { width: 'full', height: 'xl' },
    'cold-monthly': { width: 'full', height: 'xl' },
    'elec-monthly': { width: 'full', height: 'xl' },
    'distribution-columns': { width: 'full', height: 'tall' },
    'distribution-line': { width: 'full', height: 'medium' },
    'cold-distribution': { width: 'full', height: 'medium' },
    'elec-distribution': { width: 'full', height: 'medium' },
    'water-sources-donut': { width: 'half', height: 'medium' },
    'water-sources-bars': { width: 'half', height: 'medium' },
    'water-uses-bars': { width: 'half', height: 'medium' },
    'water-uses-rings': { width: 'half', height: 'medium' },
    'water-ranking': { width: 'half', height: 'tall' },
    'water-intensity-bars': { width: 'full', height: 'medium' },
    'water-monthly': { width: 'full', height: 'xl' },
    'water-monthly-lines': { width: 'full', height: 'xl' },
    'water-distribution': { width: 'full', height: 'medium' },
  };

  const TILE_LAYOUT_BY_SLOT = {
    'mix-primary': { width: 'half', height: 'medium' },
    'mix-secondary': { width: 'half', height: 'tall' },
    'energy-trend': { width: 'full', height: 'medium' },
    'typology': { width: 'full', height: 'xl' },
    'energy-map': { width: 'full', height: 'tall' },
    'monthly': { width: 'full', height: 'xl' },
    'intensity-distribution': { width: 'full', height: 'medium' },
    'heat-mix-fuels': { width: 'half', height: 'medium' },
    'heat-uses': { width: 'half', height: 'medium' },
    'heat-trend': { width: 'full', height: 'medium' },
    'heat-typology': { width: 'full', height: 'xl' },
    'heat-map': { width: 'full', height: 'tall' },
    'heat-monthly': { width: 'full', height: 'xl' },
    'heat-distribution': { width: 'full', height: 'medium' },
    'cold-production': { width: 'half', height: 'medium' },
    'cold-uses': { width: 'half', height: 'medium' },
    'cold-ranking': { width: 'half', height: 'tall' },
    'cold-trend': { width: 'full', height: 'medium' },
    'cold-map': { width: 'full', height: 'tall' },
    'cold-monthly': { width: 'full', height: 'xl' },
    'cold-distribution': { width: 'full', height: 'medium' },
    'elec-sources': { width: 'half', height: 'medium' },
    'elec-uses': { width: 'half', height: 'medium' },
    'elec-ranking': { width: 'half', height: 'tall' },
    'elec-trend': { width: 'full', height: 'medium' },
    'elec-map': { width: 'full', height: 'tall' },
    'elec-monthly': { width: 'full', height: 'xl' },
    'elec-distribution': { width: 'full', height: 'medium' },
    'co2-scopes': { width: 'half', height: 'medium' },
    'co2-sources': { width: 'half', height: 'medium' },
    'co2-ranking': { width: 'half', height: 'tall' },
    'co2-trend': { width: 'full', height: 'medium' },
    'co2-monthly': { width: 'full', height: 'xl' },
    'co2-distribution': { width: 'full', height: 'medium' },
    'co2-typology': { width: 'full', height: 'xl' },
    'co2-map': { width: 'full', height: 'tall' },
    'water-sources': { width: 'half', height: 'medium' },
    'water-uses': { width: 'half', height: 'medium' },
    'water-ranking': { width: 'half', height: 'tall' },
    'water-trend': { width: 'full', height: 'medium' },
    'water-typology': { width: 'full', height: 'xl' },
    'water-map': { width: 'full', height: 'tall' },
    'water-monthly': { width: 'full', height: 'xl' },
    'water-distribution': { width: 'full', height: 'medium' },
  };

  const VALID_TILE_WIDTHS = new Set(['full', 'half']);
  const VALID_TILE_HEIGHTS = new Set(['short', 'medium', 'tall', 'xl']);

  const pickLayoutValue = (value, allowed, fallback) => {
    const normalized = (value || '').toString().toLowerCase();
    return allowed.has(normalized) ? normalized : fallback;
  };

  const resolveTileLayout = (slotEl) => {
    if (!slotEl) return { ...DEFAULT_TILE_LAYOUT };
    const type = slotEl.dataset.chartType || '';
    const slot = slotEl.dataset.chartSlot || '';
    const layoutFromType = type ? TILE_LAYOUT_BY_TYPE[type] : null;
    const layoutFromSlot = slot ? TILE_LAYOUT_BY_SLOT[slot] : null;
    return {
      width: layoutFromType?.width || layoutFromSlot?.width || DEFAULT_TILE_LAYOUT.width,
      height: layoutFromType?.height || layoutFromSlot?.height || DEFAULT_TILE_LAYOUT.height,
    };
  };

  const applyTileLayout = (slotEl) => {
    if (!slotEl) return;
    const layout = resolveTileLayout(slotEl);
    const width = pickLayoutValue(layout.width, VALID_TILE_WIDTHS, DEFAULT_TILE_LAYOUT.width);
    const height = pickLayoutValue(layout.height, VALID_TILE_HEIGHTS, DEFAULT_TILE_LAYOUT.height);
    slotEl.dataset.tileWidth = width;
    slotEl.dataset.tileHeight = height;
  };

  let chartTileResizeObserver;
  let chartTileEqualizeRaf;

  const scheduleChartTileEqualize = () => {
    if (chartTileEqualizeRaf) cancelAnimationFrame(chartTileEqualizeRaf);
    chartTileEqualizeRaf = requestAnimationFrame(() => {
      chartTileEqualizeRaf = null;
      equalizeChartTileHeights();
    });
  };

  function equalizeChartTileHeights() {
    const stacks = $$e('.energy-chart-stack');
    if (!stacks.length) return;

    stacks.forEach((stack) => {
      const slots = Array.from(stack.querySelectorAll('[data-chart-slot]'));
      if (!slots.length) return;

      slots.forEach(slot => {
        slot.style.removeProperty('--tile-equal-height');
      });

      // Force layout without the equalized height before measuring.
      stack.getBoundingClientRect();

      const rows = new Map();
      slots.forEach(slot => {
        const top = Math.round(slot.offsetTop);
        const row = rows.get(top) || [];
        row.push(slot);
        rows.set(top, row);
      });

      rows.forEach(group => {
        let maxHeight = 0;
        group.forEach(tile => {
          const rect = tile.getBoundingClientRect();
          if (rect.height > maxHeight) maxHeight = rect.height;
        });
        const safeHeight = Math.ceil(maxHeight);
        group.forEach(tile => {
          tile.style.setProperty('--tile-equal-height', `${safeHeight}px`);
        });
      });
    });
  }

  function refreshChartTileObserver() {
    const stacks = $$e('.energy-chart-stack');
    if (!stacks.length) return;

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    if (!chartTileResizeObserver) {
      chartTileResizeObserver = new ResizeObserver(() => scheduleChartTileEqualize());
    }

    chartTileResizeObserver.disconnect();
    stacks.forEach((stack) => {
      stack.querySelectorAll('[data-chart-slot]').forEach(slot => chartTileResizeObserver.observe(slot));
    });
  }

  const syncChartTileLayouts = () => {
    const slots = $$e('[data-chart-slot]');
    slots.forEach(slot => applyTileLayout(slot));
    refreshChartTileObserver();
    scheduleChartTileEqualize();
  };

  /* ========== Chart tile dragging & reordering ========== */
  const TILE_HANDLE_CLASS = 'chart-tile-handle';
  const TILE_PLACEHOLDER_CLASS = 'chart-tile-placeholder';
  let chartTileDragState = null;
  let chartTileMutationObserver = null;
  const boundTileHandles = new WeakSet();

  const moveTileWithinStack = (tile, offset) => {
    if (!tile || !offset) return false;
    const stack = tile.closest('.energy-chart-stack');
    if (!stack) return false;
    const tiles = Array.from(stack.querySelectorAll('[data-chart-slot]'));
    const index = tiles.indexOf(tile);
    if (index === -1) return false;
    const targetIndex = Math.max(0, Math.min(tiles.length - 1, index + offset));
    if (targetIndex === index) return false;
    const reference = tiles[targetIndex];
    if (targetIndex > index) {
      stack.insertBefore(tile, reference.nextSibling);
    } else {
      stack.insertBefore(tile, reference);
    }
    scheduleChartTileEqualize();
    return true;
  };

  const moveTileToEdge = (tile, position) => {
    if (!tile) return false;
    const stack = tile.closest('.energy-chart-stack');
    if (!stack) return false;
    const tiles = Array.from(stack.querySelectorAll('[data-chart-slot]'));
    if (!tiles.length) return false;
    if (position === 'start' && tiles[0] !== tile) {
      stack.insertBefore(tile, tiles[0]);
      scheduleChartTileEqualize();
      return true;
    }
    if (position === 'end' && tiles[tiles.length - 1] !== tile) {
      stack.append(tile);
      scheduleChartTileEqualize();
      return true;
    }
    return false;
  };

  const finishChartTileDrag = (cancelled = false) => {
    if (!chartTileDragState) return;
    const { tile, placeholder, handle, pointerId, originStack, originNext } = chartTileDragState;

    window.removeEventListener('pointermove', onChartTilePointerMove);
    window.removeEventListener('pointerup', onChartTilePointerUp);
    window.removeEventListener('pointercancel', onChartTilePointerCancel);

    if (handle?.hasPointerCapture?.(pointerId)) {
      try { handle.releasePointerCapture(pointerId); } catch (err) { /* noop */ }
    }

    document.body.classList.remove('chart-tiles-dragging');

    tile.classList.remove('is-dragging');
    tile.removeAttribute('aria-grabbed');
    tile.style.removeProperty('position');
    tile.style.removeProperty('left');
    tile.style.removeProperty('top');
    tile.style.removeProperty('width');
    tile.style.removeProperty('height');
    tile.style.removeProperty('transform');
    tile.style.removeProperty('z-index');
    tile.style.removeProperty('pointer-events');

    if (handle) {
      handle.classList.remove('is-dragging');
      handle.removeAttribute('aria-pressed');
    }

    if (placeholder?.parentNode) {
      if (cancelled && originStack) {
        originStack.insertBefore(tile, originNext || null);
        placeholder.remove();
      } else {
        placeholder.replaceWith(tile);
      }
    } else if (cancelled && originStack) {
      originStack.insertBefore(tile, originNext || null);
    }

    chartTileDragState = null;
    scheduleChartTileEqualize();
  };

  const updatePlaceholderPosition = (clientX, clientY) => {
    if (!chartTileDragState) return;
    const { stack, tile, placeholder } = chartTileDragState;
    if (!stack || !placeholder) return;
    const candidates = Array.from(stack.querySelectorAll('[data-chart-slot]')).filter(el => el !== tile);
    if (!candidates.length) return;

    let target = document.elementFromPoint(clientX, clientY)?.closest('[data-chart-slot]');
    let rect = null;
    if (!target || target === tile || !stack.contains(target)) {
      let nearest = null;
      let nearestRect = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      candidates.forEach((candidate) => {
        const candidateRect = candidate.getBoundingClientRect();
        const cx = candidateRect.left + (candidateRect.width / 2);
        const cy = candidateRect.top + (candidateRect.height / 2);
        const distance = Math.hypot(clientX - cx, clientY - cy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = candidate;
          nearestRect = candidateRect;
        }
      });
      target = nearest;
      rect = nearestRect;
      if (!target || !rect) return;
    }

    if (!rect) {
      rect = target.getBoundingClientRect();
    }
    const before = clientY < rect.top + (rect.height / 2);
    const referenceNode = before ? target : target.nextSibling;
    if (referenceNode !== placeholder) {
      stack.insertBefore(placeholder, referenceNode || null);
    }
  };

  const onChartTilePointerMove = (event) => {
    if (!chartTileDragState) return;
    const { tile, startX, startY } = chartTileDragState;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    tile.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    updatePlaceholderPosition(event.clientX, event.clientY);
  };

  const onChartTilePointerUp = () => finishChartTileDrag(false);
  const onChartTilePointerCancel = () => finishChartTileDrag(true);

  const onChartTileHandlePointerDown = (event) => {
    const handle = event.currentTarget;
    const tile = handle?.closest('[data-chart-slot]');
    if (!tile || chartTileDragState) return;
    if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const stack = tile.closest('.energy-chart-stack');
    if (!stack) return;

    event.preventDefault();
    handle.focus({ preventScroll: true });

    const rect = tile.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = TILE_PLACEHOLDER_CLASS;
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.width = `${rect.width}px`;
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.setAttribute('role', 'presentation');

    const originNext = tile.nextSibling;
    stack.insertBefore(placeholder, tile);

    chartTileDragState = {
      tile,
      stack,
      placeholder,
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originStack: stack,
      originNext,
    };

    tile.classList.add('is-dragging');
    tile.setAttribute('aria-grabbed', 'true');
    tile.style.position = 'fixed';
    tile.style.left = `${rect.left}px`;
    tile.style.top = `${rect.top}px`;
    tile.style.width = `${rect.width}px`;
    tile.style.height = `${rect.height}px`;
    tile.style.transform = 'translate3d(0, 0, 0)';
    tile.style.zIndex = '1000';
    tile.style.pointerEvents = 'none';

    handle.classList.add('is-dragging');
    handle.setAttribute('aria-pressed', 'true');

    document.body.classList.add('chart-tiles-dragging');

    if (handle.setPointerCapture) {
      try { handle.setPointerCapture(event.pointerId); } catch (err) { /* noop */ }
    }

    window.addEventListener('pointermove', onChartTilePointerMove);
    window.addEventListener('pointerup', onChartTilePointerUp);
    window.addEventListener('pointercancel', onChartTilePointerCancel);
  };

  const onChartTileHandleKeyDown = (event) => {
    const handle = event.currentTarget;
    const tile = handle?.closest('[data-chart-slot]');
    if (!tile) return;
    let handled = false;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        handled = moveTileWithinStack(tile, -1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        handled = moveTileWithinStack(tile, 1);
        break;
      case 'Home':
        handled = moveTileToEdge(tile, 'start');
        break;
      case 'End':
        handled = moveTileToEdge(tile, 'end');
        break;
      default:
        break;
    }
    if (handled) {
      event.preventDefault();
      requestAnimationFrame(() => {
        handle.focus({ preventScroll: true });
      });
    }
  };

  const ensureChartTileHandle = (slot) => {
    if (!slot || !(slot instanceof HTMLElement)) return;
    slot.classList.add('has-chart-tile-handle');
    let handle = slot.querySelector(`.${TILE_HANDLE_CLASS}`);
    if (!handle) {
      handle = document.createElement('button');
      handle.type = 'button';
      handle.className = TILE_HANDLE_CLASS;
      handle.setAttribute('aria-label', 'Déplacer ce graphique');
      handle.innerHTML = `
        <span class="chart-tile-handle__icon" aria-hidden="true"></span>
      `;
      slot.prepend(handle);
    }
    if (!boundTileHandles.has(handle)) {
      boundTileHandles.add(handle);
      handle.addEventListener('pointerdown', onChartTileHandlePointerDown);
      handle.addEventListener('keydown', onChartTileHandleKeyDown);
    }
  };

  const ensureChartTileHandles = (scope = document) => {
    if (!scope) return;
    let slots = [];
    if (scope instanceof HTMLElement) {
      if (scope.matches('[data-chart-slot]')) {
        slots = [scope];
      } else {
        slots = Array.from(scope.querySelectorAll('[data-chart-slot]'));
      }
    } else {
      slots = Array.from(document.querySelectorAll('[data-chart-slot]'));
    }
    slots.forEach(ensureChartTileHandle);
  };

  const observeChartTileStacks = () => {
    if (typeof MutationObserver === 'undefined') return;
    if (chartTileMutationObserver) {
      chartTileMutationObserver.disconnect();
    }
    chartTileMutationObserver = new MutationObserver((mutations) => {
      let needsEqualize = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches('[data-chart-slot]')) {
            ensureChartTileHandle(node);
            needsEqualize = true;
          } else {
            ensureChartTileHandles(node);
            needsEqualize = true;
          }
        });
      });
      if (needsEqualize) scheduleChartTileEqualize();
    });
    Array.from(document.querySelectorAll('.energy-chart-stack')).forEach((stack) => {
      chartTileMutationObserver.observe(stack, { childList: true });
    });
  };

  const setupChartTileDragging = () => {
    ensureChartTileHandles();
    observeChartTileStacks();
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
    calendar: {
      keys: ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'],
      short: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'],
      full: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
    },
    climateBaseline: [1.25, 1.18, 1.02, 0.9, 0.78, 0.62, 0.55, 0.6, 0.74, 0.94, 1.08, 1.2],
    typologies: {
      ecole: { label: 'Écoles' },
      piscine: { label: 'Piscines' },
      administration: { label: 'Administrations' },
      bureau: { label: 'Bureaux' },
      culture: { label: 'Culture & loisirs' },
      autre: { label: 'Autres bâtiments' },
    },
    benchmark: {
      intensity: {
        bins: [
          { key: '0-80', label: '0-80', min: 0, max: 80 },
          { key: '80-120', label: '80-120', min: 80, max: 120 },
          { key: '120-160', label: '120-160', min: 120, max: 160 },
          { key: '160-200', label: '160-200', min: 160, max: 200 },
          { key: '200-240', label: '200-240', min: 200, max: 240 },
          { key: '≥240', label: '≥240', min: 240, max: null },
        ],
        curve: [400, 1500, 2300, 2800, 2100, 900],
        totalBuildings: 10000,
      },
      total: {
        bins: [
          { key: '0-150', label: '0-150 MWh', min: 0, max: 150000 },
          { key: '150-250', label: '150-250 MWh', min: 150000, max: 250000 },
          { key: '250-350', label: '250-350 MWh', min: 250000, max: 350000 },
          { key: '350-500', label: '350-500 MWh', min: 350000, max: 500000 },
          { key: '≥500', label: '≥500 MWh', min: 500000, max: null },
        ],
        curve: [600, 1800, 3200, 2600, 1800],
        totalBuildings: 10000,
      },
    },
    mapThresholds: {
      kwhm2: [120, 180, 230],
      kwh: [150000, 300000, 500000],
    },
    buildings: {},
  };

  const assignBuildingsData = (payload, options = {}) => {
    const { globalObject = null, updateGlobal = false } = options;
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const normalizedPayload = payload?.buildings && typeof payload.buildings === 'object'
      ? payload
      : { buildings: payload };

    const buildings = normalizedPayload.buildings;
    if (!buildings || typeof buildings !== 'object' || Array.isArray(buildings)) {
      return false;
    }

    ENERGY_BASE_DATA.buildings = buildings;

    if (updateGlobal && globalObject && typeof globalObject === 'object') {
      const target = globalObject.STRATOS_BUILDINGS;
      if (target && typeof target === 'object') {
        Object.keys(target).forEach((key) => {
          if (!(key in normalizedPayload)) {
            delete target[key];
          }
        });

        const targetBuildings = target.buildings && typeof target.buildings === 'object' ? target.buildings : {};
        Object.keys(targetBuildings).forEach((key) => {
          if (!(key in buildings)) {
            delete targetBuildings[key];
          }
        });
        Object.keys(buildings).forEach((key) => {
          targetBuildings[key] = buildings[key];
        });

        Object.assign(target, normalizedPayload);
        target.buildings = targetBuildings;
      } else {
        globalObject.STRATOS_BUILDINGS = normalizedPayload;
      }
    }

    return true;
  };

  async function loadBuildingsData() {
    const globalObject = typeof window !== 'undefined' ? window : {};
    const inlineDataset = globalObject.STRATOS_BUILDINGS;

    const shouldAttemptFetch = (() => {
      if (typeof window === 'undefined') return true;
      const protocol = window.location?.protocol || '';
      return protocol !== 'file:';
    })();

    if (shouldAttemptFetch) {
      try {
        const response = await fetch('Buildings.json', { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (assignBuildingsData(payload, { globalObject, updateGlobal: true })) {
          return;
        }
        console.warn('Format inattendu pour Buildings.json');
      } catch (error) {
        console.error('Impossible de charger Buildings.json', error);
      }
    }

    if (assignBuildingsData(inlineDataset)) {
      return;
    }

    if (!shouldAttemptFetch) {
      console.warn('Chargement local détecté : utilisation des données intégrées pour les bâtiments.');
    }

    ENERGY_BASE_DATA.buildings = ENERGY_BASE_DATA.buildings || {};
  }

  const syncTreeLeafLabelsFromDataset = () => {
    const registry = ENERGY_BASE_DATA.buildings;
    if (!registry || typeof registry !== 'object') {
      return;
    }

    const textNodeType = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3;

    const ensureLabelElement = (leaf) => {
      let labelEl = leaf.querySelector('.tree-leaf__label');
      if (labelEl) {
        return labelEl;
      }

      Array.from(leaf.childNodes).forEach((node) => {
        if (node.nodeType === textNodeType) {
          leaf.removeChild(node);
        }
      });

      labelEl = document.createElement('span');
      labelEl.className = 'tree-leaf__label';
      const checkbox = leaf.querySelector('.tree-check');
      if (checkbox) {
        checkbox.after(labelEl);
      } else {
        leaf.append(labelEl);
      }

      return labelEl;
    };

    $$('.tree-leaf[data-building]').forEach((leaf) => {
      const buildingId = leaf.dataset?.building;
      if (!buildingId) return;

      const info = registry[buildingId];
      if (!info || typeof info !== 'object') return;

      const label = (info.label ?? '').toString().trim();
      if (!label) return;

      leaf.dataset.label = label;
      const labelEl = ensureLabelElement(leaf);
      if (labelEl.textContent !== label) {
        labelEl.textContent = label;
      }
    });
  };

  const HEAT_BASE_DATA = {
    mix: {
      fuels: {
        gaz: 0.52,
        pac: 0.2,
        reseau: 0.18,
        biomasse: 0.1,
      },
      uses: {
        chauffage: 0.62,
        ecs: 0.24,
        ventilation: 0.14,
      },
      labels: {
        fuels: {
          gaz: 'Gaz naturel',
          pac: 'Pompe à chaleur',
          reseau: 'Réseau de chaleur',
          biomasse: 'Biomasse',
        },
        uses: {
          chauffage: 'Chauffage des locaux',
          ecs: 'Eau chaude sanitaire',
          ventilation: 'Ventilation & CTA',
        },
      },
    },
    trend: [
      { year: 2021, intensity: 126 },
      { year: 2022, intensity: 122 },
      { year: 2023, intensity: 119 },
      { year: 2024, intensity: 118 },
      { year: 2025, intensity: 114 },
    ],
    benchmark: {
      intensity: {
        bins: [
          { key: '0-70', label: '0-70', min: 0, max: 70 },
          { key: '70-110', label: '70-110', min: 70, max: 110 },
          { key: '110-140', label: '110-140', min: 110, max: 140 },
          { key: '140-170', label: '140-170', min: 140, max: 170 },
          { key: '≥170', label: '≥170', min: 170, max: null },
        ],
        curve: [320, 1420, 2380, 1840, 720],
        totalBuildings: 6500,
      },
      total: {
        bins: [
          { key: '0-180', label: '0-180 MWh', min: 0, max: 180000 },
          { key: '180-280', label: '180-280 MWh', min: 180000, max: 280000 },
          { key: '280-380', label: '280-380 MWh', min: 280000, max: 380000 },
          { key: '380-520', label: '380-520 MWh', min: 380000, max: 520000 },
          { key: '≥520', label: '≥520 MWh', min: 520000, max: null },
        ],
        curve: [480, 1500, 2100, 1650, 680],
        totalBuildings: 6500,
      },
    },
    mapThresholds: {
      kwhm2: [90, 130, 180],
      kwh: [120000, 260000, 420000],
    },
  };

  const COLD_BASE_DATA = {
    mix: {
      production: {
        compression: 0.58,
        freecooling: 0.22,
        reseau: 0.12,
        absorption: 0.08,
      },
      uses: {
        confort: 0.46,
        process: 0.32,
        it: 0.22,
      },
      labels: {
        production: {
          compression: 'Groupes à compression',
          freecooling: 'Free-cooling',
          reseau: 'Réseau de froid',
          absorption: 'Groupes à absorption',
        },
        uses: {
          confort: 'Confort',
          process: 'Process industriels',
          it: 'Salles serveurs',
        },
      },
    },
    trend: [
      { year: 2021, intensity: 18 },
      { year: 2022, intensity: 16 },
      { year: 2023, intensity: 14 },
      { year: 2024, intensity: 13 },
      { year: 2025, intensity: 12 },
    ],
    benchmark: {
      intensity: {
        bins: [
          { key: '0-6', label: '0-6', min: 0, max: 6 },
          { key: '6-10', label: '6-10', min: 6, max: 10 },
          { key: '10-14', label: '10-14', min: 10, max: 14 },
          { key: '14-18', label: '14-18', min: 14, max: 18 },
          { key: '≥18', label: '≥18', min: 18, max: null },
        ],
        curve: [520, 980, 1340, 760, 320],
        totalBuildings: 2800,
      },
      total: {
        bins: [
          { key: '0-40', label: '0-40 MWh', min: 0, max: 40000 },
          { key: '40-70', label: '40-70 MWh', min: 40000, max: 70000 },
          { key: '70-110', label: '70-110 MWh', min: 70000, max: 110000 },
          { key: '110-160', label: '110-160 MWh', min: 110000, max: 160000 },
          { key: '≥160', label: '≥160 MWh', min: 160000, max: null },
        ],
        curve: [360, 840, 920, 540, 240],
        totalBuildings: 2800,
      },
    },
    mapThresholds: {
      kwhm2: [8, 12, 18],
      kwh: [45000, 90000, 150000],
    },
  };

  const ELEC_BASE_DATA = {
    mix: {
      sources: {
        reseau: 0.68,
        autoprod: 0.22,
        verte: 0.1,
      },
      uses: {
        eclairage: 0.26,
        hvac: 0.24,
        it: 0.22,
        process: 0.18,
        services: 0.1,
      },
      labels: {
        sources: {
          reseau: 'Réseau public',
          autoprod: 'Autoproduction PV',
          verte: 'Achats verts',
        },
        uses: {
          eclairage: 'Éclairage & auxiliaires',
          hvac: 'Ventilation / CVC',
          it: 'Informatique & data',
          process: 'Process / ateliers',
          services: 'Services généraux',
        },
      },
    },
    trend: [
      { year: 2021, intensity: 86 },
      { year: 2022, intensity: 82 },
      { year: 2023, intensity: 80 },
      { year: 2024, intensity: 78 },
      { year: 2025, intensity: 74 },
    ],
    benchmark: {
      intensity: {
        bins: [
          { key: '0-60', label: '0-60', min: 0, max: 60 },
          { key: '60-90', label: '60-90', min: 60, max: 90 },
          { key: '90-120', label: '90-120', min: 90, max: 120 },
          { key: '120-150', label: '120-150', min: 120, max: 150 },
          { key: '≥150', label: '≥150', min: 150, max: null },
        ],
        curve: [420, 1520, 1980, 1230, 540],
        totalBuildings: 8200,
      },
      total: {
        bins: [
          { key: '0-120', label: '0-120 MWh', min: 0, max: 120000 },
          { key: '120-200', label: '120-200 MWh', min: 120000, max: 200000 },
          { key: '200-280', label: '200-280 MWh', min: 200000, max: 280000 },
          { key: '280-380', label: '280-380 MWh', min: 280000, max: 380000 },
          { key: '≥380', label: '≥380 MWh', min: 380000, max: null },
        ],
        curve: [540, 1560, 1880, 1280, 640],
        totalBuildings: 8200,
      },
    },
    mapThresholds: {
      kwhm2: [55, 75, 95],
      kwh: [140000, 260000, 380000],
    },
  };

  const CO2_BASE_DATA = {
    mix: {
      scopes: {
        scope1: 0.64,
        scope2: 0.36,
      },
      sources: {
        combustibles: 0.52,
        reseauChaleur: 0.18,
        electriciteReseau: 0.21,
        electriciteVerte: 0.09,
      },
      labels: {
        scopes: {
          scope1: 'Direct (scope 1)',
          scope2: 'Indirect (scope 2)',
        },
        sources: {
          combustibles: 'Combustibles fossiles',
          reseauChaleur: 'Réseau de chaleur',
          electriciteReseau: 'Électricité réseau',
          electriciteVerte: 'Électricité verte / PV',
        },
      },
    },
    trend: [
      { year: 2021, intensity: 34 },
      { year: 2022, intensity: 31 },
      { year: 2023, intensity: 28 },
      { year: 2024, intensity: 26 },
      { year: 2025, intensity: 24 },
    ],
    benchmark: {
      intensity: {
        bins: [
          { key: '0-20', label: '0-20', min: 0, max: 20 },
          { key: '20-30', label: '20-30', min: 20, max: 30 },
          { key: '30-40', label: '30-40', min: 30, max: 40 },
          { key: '40-55', label: '40-55', min: 40, max: 55 },
          { key: '≥55', label: '≥55', min: 55, max: null },
        ],
        curve: [420, 1380, 1820, 1240, 560],
        totalBuildings: 7200,
      },
      total: {
        bins: [
          { key: '0-20t', label: '0-20 t', min: 0, max: 20000 },
          { key: '20-35t', label: '20-35 t', min: 20000, max: 35000 },
          { key: '35-50t', label: '35-50 t', min: 35000, max: 50000 },
          { key: '50-70t', label: '50-70 t', min: 50000, max: 70000 },
          { key: '≥70t', label: '≥70 t', min: 70000, max: null },
        ],
        curve: [520, 1580, 1920, 980, 420],
        totalBuildings: 7200,
      },
    },
    mapThresholds: {
      kwhm2: [18, 28, 40],
      kwh: [20000, 40000, 65000],
    },
    factors: {
      scope1: 0.204,
      scope2Electricity: 0.1,
      scope2Cold: 0.05,
    },
  };

  const WATER_BASE_DATA = {
    mix: {
      sources: {
        reseauEau: 0.62,
        nappe: 0.18,
        pluie: 0.12,
        recyclee: 0.08,
      },
      uses: {
        sanitaires: 0.63,
        hvac: 0.14,
        nettoyage: 0.12,
        irrigation: 0.07,
        pertes: 0.04,
      },
      labels: {
        sources: {
          reseauEau: 'Réseau public',
          nappe: 'Nappe phréatique',
          pluie: 'Eau de pluie',
          recyclee: 'Eau recyclée',
        },
        uses: {
          sanitaires: 'Sanitaires',
          hvac: 'HVAC / humidification',
          nettoyage: 'Nettoyage',
          irrigation: 'Irrigation',
          pertes: 'Pertes & fuites',
        },
      },
    },
    trend: [
      { year: 2021, intensity: 1.62 },
      { year: 2022, intensity: 1.56 },
      { year: 2023, intensity: 1.51 },
      { year: 2024, intensity: 1.45 },
      { year: 2025, intensity: 1.4 },
    ],
    benchmark: {
      intensity: {
        bins: [
          { key: '0-0.8', label: '0-0,8', min: 0, max: 0.8 },
          { key: '0.8-1.1', label: '0,8-1,1', min: 0.8, max: 1.1 },
          { key: '1.1-1.4', label: '1,1-1,4', min: 1.1, max: 1.4 },
          { key: '1.4-1.8', label: '1,4-1,8', min: 1.4, max: 1.8 },
          { key: '≥1.8', label: '≥1,8', min: 1.8, max: null },
        ],
        curve: [220, 680, 940, 520, 180],
        totalBuildings: 2540,
      },
      total: {
        bins: [
          { key: '0-1800', label: '0-1 800 m³', min: 0, max: 1800 },
          { key: '1800-2600', label: '1 800-2 600 m³', min: 1800, max: 2600 },
          { key: '2600-3400', label: '2 600-3 400 m³', min: 2600, max: 3400 },
          { key: '3400-4500', label: '3 400-4 500 m³', min: 3400, max: 4500 },
          { key: '≥4500', label: '≥4 500 m³', min: 4500, max: null },
        ],
        curve: [210, 590, 760, 410, 160],
        totalBuildings: 2540,
      },
    },
    mapThresholds: {
      kwhm2: [1.0, 1.4, 1.8],
      kwh: [2200, 3600, 5200],
    },
  };

  const METRIC_KEYS = Object.keys(ENERGY_BASE_DATA.metrics);
  const METRIC_KEY_SET = new Set(METRIC_KEYS);

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

  const looksLikeMetricBundle = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.keys(value).some((key) => METRIC_KEY_SET.has(key));
  };

  const looksLikeMonthlyList = (value) => Array.isArray(value)
    && value.some(entry => entry && typeof entry === 'object' && 'month' in entry);

  const buildYearKeyCandidates = (year) => {
    const candidates = [];
    if (year !== undefined && year !== null) {
      const str = String(year).trim();
      if (str) {
        candidates.push(str);
        const num = Number(str);
        if (Number.isFinite(num)) {
          const intStr = String(Math.trunc(num));
          if (!candidates.includes(intStr)) candidates.push(intStr);
          if (!candidates.includes(num)) candidates.push(num);
        }
      }
    }
    return candidates;
  };

  const pickYearEntry = (source, candidates) => {
    if (!source || typeof source !== 'object') return null;
    for (const key of candidates) {
      if (key === undefined || key === null) continue;
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const value = source[key];
        if (value !== undefined) return value;
      }
    }
    return null;
  };

  const resolveMetricsForYear = (info, year) => {
    const metrics = info?.metrics;
    if (!metrics) return {};
    if (looksLikeMetricBundle(metrics)) return metrics;
    const candidates = buildYearKeyCandidates(year);
    if (metrics.byYear) {
      const fromByYear = pickYearEntry(metrics.byYear, candidates);
      if (looksLikeMetricBundle(fromByYear)) return fromByYear;
    }
    const direct = pickYearEntry(metrics, candidates);
    if (looksLikeMetricBundle(direct)) return direct;
    if (metrics.default && looksLikeMetricBundle(metrics.default)) return metrics.default;
    if (metrics.latest && looksLikeMetricBundle(metrics.latest)) return metrics.latest;
    if (metrics.byYear) {
      const list = Object.values(metrics.byYear).find(looksLikeMetricBundle);
      if (looksLikeMetricBundle(list)) return list;
    }
    const fallback = Object.values(metrics).find(looksLikeMetricBundle);
    if (looksLikeMetricBundle(fallback)) return fallback;
    return {};
  };

  const resolveMonthlyForYear = (info, year) => {
    const monthly = info?.monthly;
    if (!monthly) return [];
    if (looksLikeMonthlyList(monthly)) return monthly;
    const candidates = buildYearKeyCandidates(year);
    if (monthly.byYear) {
      const fromByYear = pickYearEntry(monthly.byYear, candidates);
      if (looksLikeMonthlyList(fromByYear)) return fromByYear;
    }
    const direct = pickYearEntry(monthly, candidates);
    if (looksLikeMonthlyList(direct)) return direct;
    if (looksLikeMonthlyList(monthly.default)) return monthly.default;
    if (looksLikeMonthlyList(monthly.latest)) return monthly.latest;
    if (monthly.byYear) {
      const list = Object.values(monthly.byYear).find(looksLikeMonthlyList);
      if (looksLikeMonthlyList(list)) return list;
    }
    const fallback = Object.values(monthly).find(looksLikeMonthlyList);
    if (looksLikeMonthlyList(fallback)) return fallback;
    return [];
  };

  const MISSING_METRIC_CACHE = { year: null, map: new Map() };
  const TAB_MISSING_RULES = {
    'tab-energie': ['chaleur', 'froid', 'elec'],
    'tab-chaleur': ['chaleur'],
    'tab-froid': ['froid'],
    'tab-elec': ['elec'],
    'tab-co2': ['co2'],
    'tab-eau': ['eau'],
  };

  const computeMissingMetricsForYear = (year) => {
    const result = new Map();
    const list = ENERGY_BASE_DATA.buildings || {};
    const keys = Object.keys(list);
    if (!keys.length) {
      return result;
    }

    keys.forEach((id) => {
      const info = list[id] || {};
      const metrics = resolveMetricsForYear(info, year);
      const missing = new Set();

      METRIC_KEYS.forEach((metricKey) => {
        const value = metrics?.[metricKey];
        if (value === '' || value === null || value === undefined) {
          missing.add(metricKey);
          return;
        }
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) {
          missing.add(metricKey);
        }
      });

      if (missing.size > 0) {
        result.set(id, missing);
      }
    });

    return result;
  };

  const getMissingMetricMap = (year) => {
    if (MISSING_METRIC_CACHE.year !== year) {
      MISSING_METRIC_CACHE.map = computeMissingMetricsForYear(year);
      MISSING_METRIC_CACHE.year = year;
    }
    return MISSING_METRIC_CACHE.map;
  };

  const getActiveEnergyTabId = () => {
    const active = document.querySelector('#energy-block .kpi-tabs [role="tab"][aria-selected="true"]');
    return active?.id || 'tab-energie';
  };

  const updateTreeMissingState = (activeTabId) => {
    const tabId = activeTabId || getActiveEnergyTabId();
    const metricsToCheck = TAB_MISSING_RULES[tabId];
    const map = getMissingMetricMap(FILTERS?.year);
    const shouldFlag = (missingSet) => {
      if (!missingSet || !metricsToCheck || !metricsToCheck.length) return false;
      return metricsToCheck.some(metric => missingSet.has(metric));
    };

    $$('.tree-leaf').forEach((leaf) => {
      const id = leaf?.dataset?.building;
      const missingSet = id ? map.get(id) : null;
      leaf.classList.toggle('is-missing', shouldFlag(missingSet));
    });
  };

  const resolveMixKey = (label) => {
    const norm = normalizeText(label);
    if (!norm) return null;
    if (norm.includes('scope 1') || norm.includes('direct')) return 'scope1';
    if (norm.includes('scope 2') || norm.includes('indirect')) return 'scope2';
    if (norm.includes('combust')) return 'combustibles';
    if (norm.includes('foss')) return 'combustibles';
    if (norm.includes('reseau') && norm.includes('eau')) return 'reseauEau';
    if (norm.includes('reseau de chaleur') || norm.includes('reseau chaleur')) return 'reseauChaleur';
    if (norm.includes('electric') && norm.includes('reseau')) return 'electriciteReseau';
    if ((norm.includes('electric') && norm.includes('vert')) || norm.includes('photovolta') || norm.includes('pv')) return 'electriciteVerte';
    if (norm.includes('chaleur')) return 'chaleur';
    if (norm.includes('electric')) return 'electricite';
    if (norm.includes('froid')) return 'froid';
    if (norm.includes('gaz')) return 'gaz';
    if (norm.includes('pompe') || norm.includes('pac')) return 'pac';
    if (norm.includes('reseau')) return 'reseau';
    if (norm.includes('nappe')) return 'nappe';
    if (norm.includes('pluie')) return 'pluie';
    if (norm.includes('recycl') || norm.includes('reutil')) return 'recyclee';
    if (norm.includes('biomass') || norm.includes('granule')) return 'biomasse';
    if (norm.includes('chauff')) return 'chauffage';
    if (norm.includes('sanit') && norm.includes('chaud')) return 'ecs';
    if (norm.includes('sanit')) return 'sanitaires';
    if (norm.includes('ecs')) return 'ecs';
    if (norm.includes('ventil') || norm.includes('cta')) return 'ventilation';
    if (norm.includes('compression')) return 'compression';
    if (norm.includes('absorption')) return 'absorption';
    if (norm.includes('freecool') || norm.includes('free-cool')) return 'freecooling';
    if (norm.includes('autoprod') || norm.includes('photovolta') || norm.includes('pv')) return 'autoprod';
    if (norm.includes('vert')) return 'verte';
    if (norm.includes('eclair')) return 'eclairage';
    if (norm.includes('hvac') || norm.includes('cvc')) return 'hvac';
    if (norm.includes('process')) return 'process';
    if (norm.includes('confort')) return 'confort';
    if (norm.includes('nettoy') || norm.includes('menage')) return 'nettoyage';
    if (norm.includes('irrig') || norm.includes('arros')) return 'irrigation';
    if (norm.includes('perte') || norm.includes('fuite')) return 'pertes';
    if (norm.includes('serveur') || norm.includes('inform') || norm.endsWith('it')) return 'it';
    if (norm.includes('service')) return 'services';
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

  const formatCount = (value) => {
    const num = Number.isFinite(value) ? value : Number(value);
    if (!Number.isFinite(num)) return '0';
    return NF.format(Math.max(0, Math.round(num)));
  };

  const describeMix = (shares, totalPerM2, mode, sre, unitLabel) => {
    const unit = unitLabel || (mode === 'kwhm2' ? 'kWh/m²' : 'kWh');
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
    const yr = Number(year);
    document.querySelectorAll('.energy-trend-chart').forEach((chart) => {
      chart.querySelectorAll('.chart-bar').forEach(bar => {
        const barYear = Number(bar.dataset.year);
        const isActive = !Number.isNaN(barYear) && barYear === yr;
        bar.classList.toggle('is-selected', isActive);
        bar.toggleAttribute('aria-current', isActive);
      });
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
    updateEnergyVisuals();
    updateTreeMissingState();
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
    const panel = document.getElementById('chart-catalog');
    if (!panel) return;

    const zoneSelector = '.energy-chart-zone';
    const slotSelector = '[data-chart-slot]';
    const selectionClass = 'is-chart-selected';

    const ensureZoneTriggers = () => {
      document.querySelectorAll(zoneSelector).forEach(zone => {
        if (!zone || zone.querySelector('.chart-catalog-trigger')) return;
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'chart-catalog-trigger';
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', 'chart-catalog');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = `
          <span class="chart-catalog-trigger__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
          </span>
          <span class="chart-catalog-trigger__label">Ajouter un graphique</span>
        `;
        const panelHost = zone.querySelector('.chart-catalog');
        if (panelHost) {
          panelHost.before(trigger);
        } else {
          zone.append(trigger);
        }
      });
    };

    ensureZoneTriggers();

    const toggles = Array.from(document.querySelectorAll('.chart-catalog-trigger'));
    if (!toggles.length) return;
    const cards = Array.from(panel.querySelectorAll('.catalog-card[data-chart-type]'));
    const getCardContainer = (card) => card?.closest('li') || null;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const layoutQuery = window.matchMedia('(max-width: 960px)');
    let isOpen = false;
    let restoreFocusAfterClose = false;
    let activeToggle = null;
    let focusTargetOnClose = null;
    let activeSlot = null;
    let activeZone = null;
    let selectedSlot = null;

    const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const getFocusableElements = () => (
      Array.from(panel.querySelectorAll(focusableSelector)).filter(el =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-hidden') !== 'true' &&
        el.tabIndex !== -1 &&
        el.offsetParent !== null
      )
    );

    const getSlots = (scope = document) => Array.from(scope.querySelectorAll(slotSelector));

    const selectSlot = (slot) => {
      if (selectedSlot && selectedSlot !== slot) {
        selectedSlot.classList.remove(selectionClass);
      }
      selectedSlot = slot && document.contains(slot) ? slot : null;
      if (selectedSlot) selectedSlot.classList.add(selectionClass);
      return selectedSlot;
    };

    const ensureSelectedSlot = (zoneEl = null) => {
      const candidates = zoneEl ? getSlots(zoneEl) : getSlots();
      if (selectedSlot && candidates.includes(selectedSlot) && document.contains(selectedSlot)) {
        selectedSlot.classList.add(selectionClass);
        return selectedSlot;
      }
      const fallback = candidates[0] || null;
      return selectSlot(fallback);
    };

    const boundSlots = new WeakSet();
    const bindSlotInteractions = () => {
      getSlots().forEach(slot => {
        ensureChartTileHandle(slot);
        if (boundSlots.has(slot)) return;
        boundSlots.add(slot);
        slot.addEventListener('click', (event) => {
          if (event.target.closest('.chart-delete-btn')) return;
          selectSlot(slot);
        });
        slot.addEventListener('focusin', () => selectSlot(slot));
      });
    };

    const boundDeleteButtons = new WeakSet();
    const handleDelete = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const btn = event.currentTarget;
      const slot = btn?.closest(slotSelector);
      if (!slot) return;
      const zoneEl = slot.closest(zoneSelector);
      const shouldRefocus = slot === selectedSlot;
      const wasActive = slot === activeSlot;
      slot.remove();
      updateEnergyVisuals();
      const next = ensureSelectedSlot(zoneEl || undefined);
      if (wasActive) {
        activeSlot = next || null;
        if (isOpen) {
          if (activeSlot) {
            updateCatalogForSlot(activeSlot);
          } else {
            closePanel({ returnFocus: false });
          }
        }
      }
      if (!next) return;
      if (shouldRefocus) {
        next.focus({ preventScroll: true });
      }
    };

    const bindDeleteInteractions = () => {
      document.querySelectorAll('.chart-delete-btn').forEach(btn => {
        if (boundDeleteButtons.has(btn)) return;
        boundDeleteButtons.add(btn);
        btn.addEventListener('click', handleDelete);
      });
    };

    bindSlotInteractions();
    bindDeleteInteractions();
    ensureSelectedSlot();

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
      if (slotEl) selectSlot(slotEl);
      const group = getSlotGroup(slotEl);
      updateCardVisibility(group);
      markActiveCard(slotEl);
    };

    const getActiveZone = () => {
      if (activeZone) return activeZone;
      const fallbackZone = panel.closest('.energy-chart-zone');
      return fallbackZone || null;
    };

    const ensurePanelWithinZone = (zoneEl) => {
      if (!zoneEl) return;
      if (!zoneEl.contains(panel)) zoneEl.append(panel);
    };

    const clearZoneState = () => {
      const zoneEl = getActiveZone();
      if (zoneEl) zoneEl.classList.remove('catalog-open');
    };

    const cloneSlotForCard = (card) => {
      const zoneEl = getActiveZone();
      if (!zoneEl) return null;
      const stack = zoneEl.querySelector('.energy-chart-stack');
      const host = stack || zoneEl;
      const sourceGroup = card.dataset.chartGroup || getSlotGroup(activeSlot) || '';
      let templateSource = null;
      if (sourceGroup) {
        templateSource = host.querySelector(`[data-chart-group="${sourceGroup}"]`)
          || document.querySelector(`[data-chart-group="${sourceGroup}"]`);
      }
      if (!templateSource) {
        templateSource = activeSlot || host.querySelector(slotSelector);
      }
      if (!templateSource) {
        templateSource = document.querySelector(slotSelector);
      }
      if (!templateSource) return null;

      const slot = templateSource.cloneNode(true);
      slot.classList.remove(selectionClass, 'is-empty');
      slot.removeAttribute('data-tile-width');
      slot.removeAttribute('data-tile-height');
      slot.style.removeProperty('--tile-equal-height');
      delete slot.dataset.chartType;
      if (sourceGroup) {
        slot.dataset.chartGroup = sourceGroup;
      } else if (templateSource.dataset.chartGroup) {
        slot.dataset.chartGroup = templateSource.dataset.chartGroup;
      } else {
        delete slot.dataset.chartGroup;
      }
      const body = slot.querySelector('[data-chart-role="body"]');
      if (body) {
        body.replaceChildren();
      } else {
        const newBody = document.createElement('div');
        newBody.className = 'chart-body';
        newBody.dataset.chartRole = 'body';
        slot.append(newBody);
      }
      const captionEl = slot.querySelector('[data-chart-role="caption"]');
      if (captionEl) {
        captionEl.textContent = '';
      } else {
        const caption = document.createElement('figcaption');
        caption.dataset.chartRole = 'caption';
        slot.append(caption);
      }
      const cardTitle = card.querySelector('.catalog-card__title')?.textContent?.trim();
      if (cardTitle) {
        slot.setAttribute('aria-label', cardTitle);
      }
      if (!slot.hasAttribute('tabindex')) {
        slot.tabIndex = 0;
      }
      host.append(slot);
      ensureChartTileHandle(slot);
      bindSlotInteractions();
      bindDeleteInteractions();
      selectSlot(slot);
      return slot;
    };

    const applyChartToSlot = (chartType, targetSlot = null) => {
      const slot = targetSlot || activeSlot;
      if (!slot) return false;
      const template = document.getElementById(`chart-template-${chartType}`);
      if (!template) return false;
      const body = slot.querySelector('[data-chart-role="body"]');
      if (!body) return false;
      body.replaceChildren(template.content.cloneNode(true));
      const captionEl = slot.querySelector('[data-chart-role="caption"]');
      if (captionEl) captionEl.textContent = template.dataset.caption || '';
      slot.dataset.chartType = chartType;
      applyTileLayout(slot);
      if (chartType === 'intensity-bars') {
        highlightEnergyTrend(FILTERS.year);
      }
      updateEnergyVisuals();
      return true;
    };

    const positionCatalog = (trigger) => {
      if (!trigger) return;
      const zoneEl = getActiveZone();
      if (!zoneEl) {
        panel.style.removeProperty('--catalog-top');
        panel.style.removeProperty('--catalog-right');
        return;
      }
      if (layoutQuery.matches) {
        panel.style.removeProperty('--catalog-top');
        panel.style.removeProperty('--catalog-right');
        return;
      }

      const zoneRect = zoneEl.getBoundingClientRect();
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
      const zoneEl = trigger.closest(zoneSelector) || null;
      const previousZone = getActiveZone();
      if (previousZone && previousZone !== zoneEl) {
        previousZone.classList.remove('catalog-open');
      }

      activeToggle = trigger;
      activeZone = zoneEl;

      if (activeZone) {
        ensurePanelWithinZone(activeZone);
        activeZone.classList.add('catalog-open');
      }

      activeSlot = ensureSelectedSlot(activeZone || undefined);
      if (!activeSlot) {
        setToggleState(activeToggle, false);
        activeToggle = null;
        activeZone = null;
        return;
      }

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
      if (!returnFocus) {
        activeToggle = null;
      }
      activeSlot = null;

      if (prefersReducedMotion()) {
        clearZoneState();
        panel.hidden = true;
        clearCatalogPosition();
        if (focusTargetOnClose) {
          focusTargetOnClose.focus({ preventScroll: true });
        }
        focusTargetOnClose = null;
        restoreFocusAfterClose = false;
        activeZone = null;
        return;
      }

      restoreFocusAfterClose = returnFocus;
      panel.addEventListener('transitionend', handleTransitionEnd);
      clearZoneState();
      activeZone = null;
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
        const type = card.dataset.chartType;
        if (!type) return;
        const slot = cloneSlotForCard(card);
        if (!slot) return;
        activeSlot = slot;
        if (applyChartToSlot(type, slot)) {
          updateCatalogForSlot(slot);
          closePanel({ returnFocus: false });
          requestAnimationFrame(() => {
            if (document.contains(slot)) {
              slot.focus({ preventScroll: true });
            }
          });
        } else {
          slot.remove();
          activeSlot = ensureSelectedSlot(activeZone || undefined);
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

    if (container.id === 'energy-block') {
      const tabsArray = Array.from(tabs);
      const tabsGrid = container.querySelector('.kpi-tabs');
      ensureEnergySubnav(tabsArray, selectTab, tabsGrid);
      const sentinel = container.querySelector('.kpi-subnav-sentinel');
      if (!energySubnavGeometryEnabled && sentinel && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          const entry = entries[0];
          energySubnavSentinelVisible = entry?.isIntersecting !== false;
          updateEnergySubnavVisibility();
        }, { threshold: 0, rootMargin: '-90px 0px 0px 0px' });
        observer.observe(sentinel);
      } else {
        energySubnavSentinelVisible = true;
        updateEnergySubnavVisibility();
      }
    }

    function selectTab(tab) {
      if (!tab) return;

      // États ARIA
      tabs.forEach(t => { t.setAttribute('aria-selected', 'false'); t.setAttribute('aria-expanded', 'false'); });
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('aria-expanded', 'true');

      // Panneaux
      const target = tab.getAttribute('aria-controls');
      panels.forEach(p => p.hidden = (p.id !== target));

      if (container.id === 'energy-block') {
        setEnergySubnavActive(tab.id);
        scheduleEnergySubnavMeasure(true);
        updateTreeMissingState(tab.id);
      }

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
    const topNavWrap = document.querySelector('.top-nav-wrap');
    const header = document.querySelector('.sidebar-header');
    const h = (topNavWrap ? topNavWrap.offsetHeight : 0) + (header ? header.offsetHeight : 0);
    document.documentElement.style.setProperty('--sticky-top', h + 'px');
  }
  function selectSection(name) {
    syncStickyTop();
    const root = document.documentElement;

    energySubnavEnabled = (name === 'energie');
    if (energySubnavGeometryEnabled) {
      scheduleEnergySubnavMeasure(true);
    }
    updateEnergySubnavVisibility();

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
    const monthKeys = ENERGY_BASE_DATA.calendar?.keys || [];
    const monthCount = monthKeys.length || 12;
    const selectedYear = FILTERS?.year;
    const monthlyTotals = Array.from({ length: monthCount }, () => ({
      chaleur: 0,
      elec: 0,
      froid: 0,
      eau: 0,
      climate: 0,
      weight: 0,
    }));
    const typologyTotals = {};
    const distributionRecords = [];
    const mapPoints = [];

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
        const buildingInfo = ENERGY_BASE_DATA.buildings?.[buildingId] || {};
        const buildingMetrics = resolveMetricsForYear(buildingInfo, selectedYear);
        const buildingMonthly = resolveMonthlyForYear(buildingInfo, selectedYear);
        const existingSummary = buildingSummaries[buildingId];
        const summary = existingSummary || {
          id: buildingId,
          label: resolveLeafLabel(leaf) || buildingInfo.label || buildingId || 'Bâtiment',
          sre: 0,
          metrics: {},
          typologyKey: buildingInfo.typology || 'autre',
          typologyLabel: ENERGY_BASE_DATA.typologies?.[buildingInfo.typology || 'autre']?.label || buildingInfo.typology || 'Autres',
        };

        summary.sre += sre;
        summary.year = selectedYear || summary.year || null;

        const typologyKey = summary.typologyKey || buildingInfo.typology || 'autre';
        const typologyDef = ENERGY_BASE_DATA.typologies?.[typologyKey] || {};
        const typologySummary = typologyTotals[typologyKey] || {
          key: typologyKey,
          label: typologyDef.label || typologyKey,
          energy: 0,
          energyByMetric: {},
          sre: 0,
          count: 0,
        };
        if (!existingSummary) {
          typologySummary.count += 1;
        }

        METRIC_KEYS.forEach((key) => {
          const candidate = Number(buildingMetrics?.[key]);
          const intensity = Number.isFinite(candidate) ? candidate : fallbackIntensity[key];
          const energyValue = intensity * sre;
          totals[key].energy += energyValue;
          totals[key].sre += sre;

          const metricEntry = summary.metrics[key] || { energy: 0, sre: 0 };
          metricEntry.energy += energyValue;
          metricEntry.sre += sre;
          summary.metrics[key] = metricEntry;

          const typologyEnergyMap = typologySummary.energyByMetric || {};
          typologyEnergyMap[key] = (typologyEnergyMap[key] || 0) + energyValue;
          typologySummary.energyByMetric = typologyEnergyMap;

          if (key === 'general') {
            typologySummary.energy += energyValue;
            typologySummary.sre += sre;
          }
        });

        if (Array.isArray(buildingMonthly)) {
          buildingMonthly.forEach((entry, idx) => {
            const bucket = monthlyTotals[idx];
            if (!bucket) return;
            bucket.chaleur += Number(entry?.chaleur) || 0;
            bucket.elec += Number(entry?.elec) || 0;
            bucket.froid += Number(entry?.froid) || 0;
            bucket.eau += Number(entry?.eau) || 0;
            const climate = Number(entry?.climate);
            if (Number.isFinite(climate)) {
              bucket.climate += climate * sre;
              bucket.weight += sre;
            }
          });
        }

        summary.position = summary.position || buildingInfo.position || null;
        summary.monthly = summary.monthly || buildingMonthly || null;
        typologyTotals[typologyKey] = typologySummary;
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

      const info = ENERGY_BASE_DATA.buildings?.[summary.id] || {};
      const metricsMap = {};
      METRIC_KEYS.forEach((metricKey) => {
        const metricData = summary.metrics[metricKey] || {};
        const metricSre = Number(metricData.sre) || 0;
        const metricIntensity = Number(metricData.intensity);
        const resolvedIntensity = Number.isFinite(metricIntensity) ? metricIntensity : fallbackIntensity[metricKey];
        const totalEnergy = Number(metricData.total);
        const resolvedTotal = Number.isFinite(totalEnergy) ? totalEnergy : resolvedIntensity * metricSre;
        metricsMap[metricKey] = {
          intensity: resolvedIntensity,
          total: resolvedTotal,
          sre: metricSre,
        };
      });

      const generalData = metricsMap.general || {};
      const intensityValue = Number(generalData.intensity) || fallbackIntensity.general || 0;
      const totalEnergy = Number(generalData.total) || 0;
      const sre = Number(generalData.sre) || Number(summary.sre) || Number(info?.sre) || 0;
      const typologyKey = summary.typologyKey || info.typology || 'autre';
      const typologyLabel = summary.typologyLabel || ENERGY_BASE_DATA.typologies?.[typologyKey]?.label || typologyKey;
      const position = summary.position || info.position || null;

      distributionRecords.push({
        id: summary.id,
        label: summary.label,
        intensity: intensityValue,
        total: totalEnergy,
        sre,
        metrics: metricsMap,
        year: summary.year || selectedYear || null,
      });

      const hasCoordinates = position
        && ((Number.isFinite(position.x) && Number.isFinite(position.y))
          || (Number.isFinite(position.lat) && Number.isFinite(position.lng)));
      if (hasCoordinates) {
        mapPoints.push({
          id: summary.id,
          label: summary.label,
          typology: typologyKey,
          typologyLabel,
          intensity: intensityValue,
          total: totalEnergy,
          sre,
          position,
          metrics: metricsMap,
          year: summary.year || selectedYear || null,
        });
      }
    });

    const fallbackClimate = ENERGY_BASE_DATA.climateBaseline || [];
    const monthLabels = ENERGY_BASE_DATA.calendar?.short || [];
    const monthlyAggregated = monthlyTotals.map((entry, idx) => {
      const total = entry.chaleur + entry.elec + entry.froid;
      const weight = entry.weight;
      const key = monthKeys[idx] || `m${idx + 1}`;
      const label = monthLabels[idx] || key;
      const climate = weight > 0
        ? entry.climate / weight
        : Number(fallbackClimate[idx]) || 0;
      return {
        key,
        label,
        chaleur: entry.chaleur,
        elec: entry.elec,
        froid: entry.froid,
        eau: entry.eau,
        total,
        climate,
      };
    });

    const co2Factors = CO2_BASE_DATA.factors || {};
    const fScope1 = Number(co2Factors.scope1) || 0;
    const fScope2Elec = Number(co2Factors.scope2Electricity) || 0;
    const fScope2Cold = Number(co2Factors.scope2Cold) || fScope2Elec;

    const monthlyWithCo2 = monthlyAggregated.map((item) => {
      const scope1 = Math.max(0, (item.chaleur || 0) * fScope1);
      const scope2Elec = Math.max(0, (item.elec || 0) * fScope2Elec);
      const scope2Cold = Math.max(0, (item.froid || 0) * fScope2Cold);
      const scope2 = scope2Elec + scope2Cold;
      return {
        ...item,
        co2scope1: scope1,
        co2scope2: scope2,
        co2total: scope1 + scope2,
      };
    });

    const typologyList = Object.values(typologyTotals).map((item) => {
      const def = ENERGY_BASE_DATA.typologies?.[item.key] || {};
      const energyByMetric = item.energyByMetric || {};
      const energyGeneral = Number(energyByMetric.general) || Number(item.energy) || 0;
      return {
        key: item.key,
        label: item.label || def.label || item.key,
        energy: energyGeneral,
        energyByMetric,
        sre: item.sre,
        count: item.count || 0,
      };
    }).sort((a, b) => (b.energy || 0) - (a.energy || 0));

    return {
      metrics: aggregated,
      buildings: buildingSummaries,
      typologies: typologyList,
      monthly: monthlyWithCo2,
      mapPoints,
      distribution: {
        records: distributionRecords,
        benchmark: ENERGY_BASE_DATA.benchmark,
        benchmarkByMetric: {
          general: ENERGY_BASE_DATA.benchmark,
          chaleur: HEAT_BASE_DATA.benchmark,
          froid: COLD_BASE_DATA.benchmark,
          elec: ELEC_BASE_DATA.benchmark,
          co2: CO2_BASE_DATA.benchmark,
          eau: WATER_BASE_DATA.benchmark,
        },
      },
    };
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

  const updateWaterSummary = (mode, aggregated) => {
    const valueEl = document.querySelector('[data-water-total]');
    if (!valueEl) return;
    const unitEl = document.querySelector('[data-water-total-unit]');
    const metricConfig = ENERGY_BASE_DATA.metrics?.eau || {};
    const waterMetric = aggregated?.eau || {};
    const intensity = Number(waterMetric.intensity);
    const total = Number(waterMetric.total);
    const sre = Number(waterMetric.sre) || Number(aggregated?.general?.sre) || 0;
    const fallbackIntensity = Number(metricConfig.intensity);
    let value = mode === 'kwhm2' ? intensity : total;
    if (!Number.isFinite(value) || value <= 0) {
      if (mode === 'kwhm2') {
        value = Number.isFinite(fallbackIntensity) ? fallbackIntensity : 0;
      } else {
        value = (Number.isFinite(fallbackIntensity) ? fallbackIntensity : 0) * (Number.isFinite(sre) ? sre : 0);
      }
    }
    const decimals = mode === 'kwhm2' ? (metricConfig.decimals || 0) : 0;
    valueEl.textContent = formatEnergyDisplay(value, mode, decimals);
    if (unitEl) {
      unitEl.textContent = getUnitLabel('eau', mode);
    }
  };

  const updateEnergyMeters = (aggregated) => {
    const intensities = [
      ...ENERGY_BASE_DATA.trend.map(item => item.intensity),
      ...METRIC_KEYS.map(key => Number(aggregated?.[key]?.intensity) || 0),
    ].filter(value => Number.isFinite(value) && value >= 0);
    const maxIntensity = intensities.length ? Math.max(...intensities) : 0;
    const map = {
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

  const updateEnergyTrendCharts = (mode, aggregatedMetrics = {}) => {
    document.querySelectorAll('.energy-trend-chart').forEach((chart) => {
      const scope = chart.dataset.chartScope || 'general';
      let metricKey = chart.dataset.chartMetric;
      if (!metricKey) {
        if (scope === 'chaleur') metricKey = 'chaleur';
        else if (scope === 'froid') metricKey = 'froid';
        else if (scope === 'elec') metricKey = 'elec';
        else if (scope === 'co2') metricKey = 'co2';
        else if (scope === 'eau') metricKey = 'eau';
        else metricKey = 'general';
      }
      const unitLabel = getUnitLabel(metricKey, mode);
      const baseTrend = scope === 'chaleur'
        ? HEAT_BASE_DATA.trend
        : scope === 'froid'
          ? COLD_BASE_DATA.trend
          : scope === 'elec'
            ? ELEC_BASE_DATA.trend
            : scope === 'co2'
              ? CO2_BASE_DATA.trend
              : scope === 'eau'
                ? WATER_BASE_DATA.trend
                : ENERGY_BASE_DATA.trend;
      const metricData = aggregatedMetrics[metricKey] || aggregatedMetrics.general || {};
      const sre = mode === 'kwhm2' ? 1 : (Number(metricData.sre) || Number(aggregatedMetrics.general?.sre) || computeFallbackSre());
      const metricDef = ENERGY_BASE_DATA.metrics[metricKey] || { decimals: 0 };
      const decimals = mode === 'kwhm2' ? (metricDef.decimals || 0) : 0;

      chart.querySelectorAll('.chart-unit').forEach(unit => { unit.textContent = unitLabel; });

      const barsWrap = chart.querySelector('.chart-bars');
      const values = [];
      baseTrend.forEach(({ year, intensity }) => {
        const bar = chart.querySelector(`.chart-bar[data-year="${year}"]`);
        if (!bar) return;
        const resolvedIntensity = Number(intensity) || 0;
        const displayValue = mode === 'kwhm2' ? resolvedIntensity : resolvedIntensity * sre;
        values.push(displayValue);
        const valueText = formatEnergyDisplay(displayValue, mode, decimals);
        const barValue = bar.querySelector('.bar-value');
        if (barValue) barValue.textContent = valueText;
        bar.setAttribute('aria-label', `${year} : ${valueText} ${unitLabel}`);
        bar.style.setProperty('--value', Number(displayValue) || 0);
      });

      if (barsWrap) {
        if (values.length) {
          const maxValue = Math.max(...values);
          const scale = maxValue > 0 ? (150 / maxValue) : 0;
          if (scale > 0) barsWrap.style.setProperty('--bar-scale', `${scale}px`);
          else barsWrap.style.removeProperty('--bar-scale');
        } else {
          barsWrap.style.removeProperty('--bar-scale');
        }
      }
    });
  };

  const updateMixCards = (mode, aggregated) => {
    const fallbackSre = computeFallbackSre();

    const updateLegendValues = (containerList, shares, baseAmount, unitLabel) => {
      containerList.forEach((el) => {
        const label = el.querySelector('.mix-label')?.textContent || '';
        const valueEl = el.querySelector('.mix-value');
        const key = resolveMixKey(label);
        if (!valueEl || !key || !(key in shares)) return;
        const share = shares[key] || 0;
        const value = baseAmount * share;
        const formatted = formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0);
        const pct = Math.round(share * 100);
        valueEl.textContent = `${formatted} ${unitLabel} (${pct} %)`;
      });
    };

    const updateBars = (bars, shares, baseAmount, unitLabel) => {
      bars.forEach((bar) => {
        const label = bar.querySelector('.mix-bar__label')?.textContent || '';
        const valueEl = bar.querySelector('.mix-bar__value');
        const key = resolveMixKey(label);
        if (!valueEl || !key || !(key in shares)) return;
        const share = shares[key] || 0;
        const value = baseAmount * share;
        const formatted = formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0);
        const pct = Math.round(share * 100);
        valueEl.textContent = `${formatted} ${unitLabel} (${pct} %)`;
        bar.style.setProperty('--mix-value', `${Math.round(share * 100)}`);
      });
    };

    const updateRings = (rings, shares, baseAmount, unitLabel) => {
      rings.forEach((ring) => {
        const label = ring.querySelector('.mix-ring__label')?.textContent || '';
        const valueEl = ring.querySelector('.mix-ring__value');
        const key = resolveMixKey(label);
        if (!valueEl || !key || !(key in shares)) return;
        const share = shares[key] || 0;
        const value = baseAmount * share;
        const formatted = formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0);
        const pct = Math.round(share * 100);
        valueEl.textContent = `${pct} %`;
        ring.style.setProperty('--mix-value', `${Math.round(share * 100)}`);
        ring.setAttribute('aria-label', `${label} : ${formatted} ${unitLabel} (${pct} %)`);
      });
    };

    document.querySelectorAll('.energy-mix-card').forEach((card) => {
      const scope = card.dataset.chartScope || 'general';
      const metricKey = card.dataset.chartMetric
        || (scope === 'chaleur'
          ? 'chaleur'
          : scope === 'froid'
            ? 'froid'
            : scope === 'elec'
              ? 'elec'
              : scope === 'co2'
                ? 'co2'
                : 'general');
      const unit = getUnitLabel(metricKey, mode);
      const subtitle = card.querySelector('.mix-subtitle');
      if (subtitle) subtitle.textContent = `Répartition en ${unit}`;

      if (scope === 'chaleur') {
        const datasetName = card.dataset.heatDataset || 'fuels';
        const shares = datasetName === 'uses'
          ? HEAT_BASE_DATA.mix.uses
          : HEAT_BASE_DATA.mix.fuels;
        const labels = datasetName === 'uses'
          ? HEAT_BASE_DATA.mix.labels.uses
          : HEAT_BASE_DATA.mix.labels.fuels;
        if (!shares || !labels) return;

        const heatMetric = aggregated?.chaleur || {};
        const perM2 = Number(heatMetric.intensity) || Number(ENERGY_BASE_DATA.metrics.chaleur?.intensity) || 0;
        const sre = Number(heatMetric.sre) || Number(aggregated?.general?.sre) || fallbackSre || 1;
        const total = Number(heatMetric.total) || perM2 * sre;
        const baseAmount = mode === 'kwhm2' ? perM2 : total;

        updateLegendValues(card.querySelectorAll('.mix-legend li'), shares, baseAmount, unit);
        updateLegendValues(card.querySelectorAll('.mix-columns-legend li'), shares, baseAmount, unit);
        updateBars(card.querySelectorAll('.mix-bar'), shares, baseAmount, unit);
        updateRings(card.querySelectorAll('.mix-ring'), shares, baseAmount, unit);

        const donut = card.querySelector('.mix-donut.heat');
        if (donut) {
          donut.style.setProperty('--mix-gaz', `${(shares.gaz || 0) * 100}`);
          donut.style.setProperty('--mix-pac', `${(shares.pac || 0) * 100}`);
          donut.style.setProperty('--mix-reseau', `${(shares.reseau || 0) * 100}`);
          donut.style.setProperty('--mix-biomasse', `${(shares.biomasse || 0) * 100}`);
          const center = donut.querySelector('.mix-donut__center');
          if (center) center.textContent = formatCompactEnergy(baseAmount);
          const labelEl = donut.querySelector('.mix-donut__label');
          if (labelEl) labelEl.textContent = unit;
        }

        const roleImg = card.querySelector('[role="img"]');
        if (roleImg) {
          const labelBase = card.getAttribute('aria-label') || 'Mix chaleur';
          const description = Object.entries(labels).map(([key, text]) => {
            const share = shares[key] || 0;
            const value = baseAmount * share;
            return `${text} : ${formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit} (${Math.round(share * 100)} %)`;
          }).join(', ');
          roleImg.setAttribute('aria-label', `${labelBase} : ${description}.`);
        }
        card.classList.toggle('is-empty', baseAmount <= 0);
        return;
      }

      if (scope === 'froid') {
        const datasetName = card.dataset.coldDataset || 'production';
        const shares = datasetName === 'uses'
          ? COLD_BASE_DATA.mix.uses
          : COLD_BASE_DATA.mix.production;
        const labels = datasetName === 'uses'
          ? COLD_BASE_DATA.mix.labels.uses
          : COLD_BASE_DATA.mix.labels.production;
        if (!shares || !labels) return;

        const coldMetric = aggregated?.froid || {};
        const perM2 = Number(coldMetric.intensity) || Number(ENERGY_BASE_DATA.metrics.froid?.intensity) || 0;
        const sre = Number(coldMetric.sre) || Number(aggregated?.general?.sre) || fallbackSre || 1;
        const total = Number(coldMetric.total) || perM2 * sre;
        const baseAmount = mode === 'kwhm2' ? perM2 : total;

        updateLegendValues(card.querySelectorAll('.mix-legend li'), shares, baseAmount, unit);
        updateLegendValues(card.querySelectorAll('.mix-columns-legend li'), shares, baseAmount, unit);
        updateBars(card.querySelectorAll('.mix-bar'), shares, baseAmount, unit);
        updateRings(card.querySelectorAll('.mix-ring'), shares, baseAmount, unit);

        const donut = card.querySelector('.mix-donut.cold');
        if (donut) {
          donut.style.setProperty('--mix-compression', `${(shares.compression || 0) * 100}`);
          donut.style.setProperty('--mix-freecooling', `${(shares.freecooling || 0) * 100}`);
          donut.style.setProperty('--mix-reseau', `${(shares.reseau || 0) * 100}`);
          donut.style.setProperty('--mix-absorption', `${(shares.absorption || 0) * 100}`);
          const center = donut.querySelector('.mix-donut__center');
          if (center) center.textContent = formatCompactEnergy(baseAmount);
          const labelEl = donut.querySelector('.mix-donut__label');
          if (labelEl) labelEl.textContent = unit;
        }

        const roleImg = card.querySelector('[role="img"]');
        if (roleImg) {
          const labelBase = card.getAttribute('aria-label') || 'Mix froid';
          const description = Object.entries(labels).map(([key, text]) => {
            const share = shares[key] || 0;
            const value = baseAmount * share;
            return `${text} : ${formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit} (${Math.round(share * 100)} %)`;
          }).join(', ');
          roleImg.setAttribute('aria-label', `${labelBase} : ${description}.`);
        }
        card.classList.toggle('is-empty', baseAmount <= 0);
        return;
      }

      if (scope === 'elec') {
        const datasetName = card.dataset.elecDataset || 'sources';
        const shares = datasetName === 'uses'
          ? ELEC_BASE_DATA.mix.uses
          : ELEC_BASE_DATA.mix.sources;
        const labels = datasetName === 'uses'
          ? ELEC_BASE_DATA.mix.labels.uses
          : ELEC_BASE_DATA.mix.labels.sources;
        if (!shares || !labels) return;

        const elecMetric = aggregated?.elec || {};
        const perM2 = Number(elecMetric.intensity) || Number(ENERGY_BASE_DATA.metrics.elec?.intensity) || 0;
        const sre = Number(elecMetric.sre) || Number(aggregated?.general?.sre) || fallbackSre || 1;
        const total = Number(elecMetric.total) || perM2 * sre;
        const baseAmount = mode === 'kwhm2' ? perM2 : total;

        updateLegendValues(card.querySelectorAll('.mix-legend li'), shares, baseAmount, unit);
        updateLegendValues(card.querySelectorAll('.mix-columns-legend li'), shares, baseAmount, unit);
        updateBars(card.querySelectorAll('.mix-bar'), shares, baseAmount, unit);
        updateRings(card.querySelectorAll('.mix-ring'), shares, baseAmount, unit);

        const donut = card.querySelector('.mix-donut.elec');
        if (donut) {
          donut.style.setProperty('--mix-reseau', `${(shares.reseau || 0) * 100}`);
          donut.style.setProperty('--mix-autoprod', `${(shares.autoprod || 0) * 100}`);
          donut.style.setProperty('--mix-verte', `${(shares.verte || 0) * 100}`);
          const center = donut.querySelector('.mix-donut__center');
          if (center) center.textContent = formatCompactEnergy(baseAmount);
          const labelEl = donut.querySelector('.mix-donut__label');
          if (labelEl) labelEl.textContent = unit;
        }

        const roleImg = card.querySelector('[role="img"]');
        if (roleImg) {
          const labelBase = card.getAttribute('aria-label') || 'Mix électrique';
          const description = Object.entries(labels).map(([key, text]) => {
            const share = shares[key] || 0;
            const value = baseAmount * share;
            return `${text} : ${formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit} (${Math.round(share * 100)} %)`;
          }).join(', ');
          roleImg.setAttribute('aria-label', `${labelBase} : ${description}.`);
        }
        card.classList.toggle('is-empty', baseAmount <= 0);
        return;
      }

      if (scope === 'co2') {
        const datasetName = card.dataset.co2Dataset || 'scopes';
        const shares = datasetName === 'sources'
          ? CO2_BASE_DATA.mix.sources
          : CO2_BASE_DATA.mix.scopes;
        const labels = datasetName === 'sources'
          ? CO2_BASE_DATA.mix.labels.sources
          : CO2_BASE_DATA.mix.labels.scopes;
        if (!shares || !labels) return;

        const co2Metric = aggregated?.co2 || {};
        const perM2 = Number(co2Metric.intensity) || Number(ENERGY_BASE_DATA.metrics.co2?.intensity) || 0;
        const sre = Number(co2Metric.sre) || Number(aggregated?.general?.sre) || fallbackSre || 1;
        const total = Number(co2Metric.total) || perM2 * sre;
        const baseAmount = mode === 'kwhm2' ? perM2 : total;

        updateLegendValues(card.querySelectorAll('.mix-legend li'), shares, baseAmount, unit);
        updateLegendValues(card.querySelectorAll('.mix-columns-legend li'), shares, baseAmount, unit);
        updateBars(card.querySelectorAll('.mix-bar'), shares, baseAmount, unit);
        updateRings(card.querySelectorAll('.mix-ring'), shares, baseAmount, unit);

        const donut = card.querySelector('.mix-donut.co2');
        if (donut) {
          donut.style.setProperty('--mix-scope1', `${(shares.scope1 || 0) * 100}`);
          donut.style.setProperty('--mix-scope2', `${(shares.scope2 || 0) * 100}`);
          const center = donut.querySelector('.mix-donut__center');
          if (center) center.textContent = formatCompactEnergy(baseAmount);
          const labelEl = donut.querySelector('.mix-donut__label');
          if (labelEl) labelEl.textContent = unit;
        }

        const roleImg = card.querySelector('[role="img"]');
        if (roleImg) {
          const labelBase = card.getAttribute('aria-label') || 'Répartition CO₂';
          const description = Object.entries(labels).map(([key, text]) => {
            const share = shares[key] || 0;
            const value = baseAmount * share;
            return `${text} : ${formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit} (${Math.round(share * 100)} %)`;
          }).join(', ');
          roleImg.setAttribute('aria-label', `${labelBase} : ${description}.`);
        }
        card.classList.toggle('is-empty', baseAmount <= 0);
        return;
      }

      if (scope === 'eau') {
        const datasetName = card.dataset.waterDataset || 'sources';
        const shares = datasetName === 'uses'
          ? WATER_BASE_DATA.mix.uses
          : WATER_BASE_DATA.mix.sources;
        const labels = datasetName === 'uses'
          ? WATER_BASE_DATA.mix.labels.uses
          : WATER_BASE_DATA.mix.labels.sources;
        if (!shares || !labels) return;

        const waterMetric = aggregated?.eau || {};
        const perM2 = Number(waterMetric.intensity) || Number(ENERGY_BASE_DATA.metrics.eau?.intensity) || 0;
        const sre = Number(waterMetric.sre) || Number(aggregated?.general?.sre) || fallbackSre || 1;
        const total = Number(waterMetric.total) || perM2 * sre;
        const baseAmount = mode === 'kwhm2' ? perM2 : total;
        const unit = getUnitLabel('eau', mode);

        updateLegendValues(card.querySelectorAll('.mix-legend li'), shares, baseAmount, unit);
        updateLegendValues(card.querySelectorAll('.mix-columns-legend li'), shares, baseAmount, unit);
        updateBars(card.querySelectorAll('.mix-bar'), shares, baseAmount, unit);
        updateRings(card.querySelectorAll('.mix-ring'), shares, baseAmount, unit);

        const donut = card.querySelector('.mix-donut.water');
        if (donut && datasetName !== 'uses') {
          donut.style.setProperty('--mix-reseau-eau', `${(shares.reseauEau || 0) * 100}`);
          donut.style.setProperty('--mix-nappe', `${(shares.nappe || 0) * 100}`);
          donut.style.setProperty('--mix-pluie', `${(shares.pluie || 0) * 100}`);
          donut.style.setProperty('--mix-recyclee', `${(shares.recyclee || 0) * 100}`);
          const center = donut.querySelector('.mix-donut__center');
          if (center) center.textContent = formatCompactEnergy(baseAmount);
          const labelEl = donut.querySelector('.mix-donut__label');
          if (labelEl) labelEl.textContent = unit;
        }

        const roleImg = card.querySelector('[role="img"]');
        if (roleImg) {
          const labelBase = card.getAttribute('aria-label') || 'Répartition de l’eau';
          const description = Object.entries(labels).map(([key, text]) => {
            const share = shares[key] || 0;
            const value = baseAmount * share;
            return `${text} : ${formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit} (${Math.round(share * 100)} %)`;
          }).join(', ');
          roleImg.setAttribute('aria-label', `${labelBase} : ${description}.`);
        }

        card.classList.toggle('is-empty', baseAmount <= 0);
        return;
      }

      const generalMetric = aggregated?.general || {};
      const totalPerM2 = Number(generalMetric.intensity) || Number(ENERGY_BASE_DATA.metrics.general?.intensity) || 0;
      const sre = Number(generalMetric.sre) || fallbackSre || 1;
      const baseTotal = Number(generalMetric.total) || totalPerM2 * sre;
      const baseAmount = mode === 'kwhm2' ? totalPerM2 : baseTotal;

      const slot = card.dataset.chartSlot || '';
      const shares = slot === 'mix-secondary'
        ? ENERGY_BASE_DATA.mix.secondary
        : ENERGY_BASE_DATA.mix.primary;
      if (!shares) return;

      updateLegendValues(card.querySelectorAll('.mix-legend li'), shares, baseAmount, unit);
      updateLegendValues(card.querySelectorAll('.mix-columns-legend li'), shares, baseAmount, unit);
      updateBars(card.querySelectorAll('.mix-bar'), shares, baseAmount, unit);
      updateRings(card.querySelectorAll('.mix-ring'), shares, baseAmount, unit);

      const donutCenter = card.querySelector('.mix-donut__center');
      if (donutCenter) {
        const share = shares.chaleur || 0;
        const value = baseAmount * share;
        donutCenter.textContent = `${formatCompactEnergy(value)} ${unit}`;
      }

      const donut = card.querySelector('.mix-donut');
      if (donut && !donut.classList.contains('heat')) {
        donut.style.setProperty('--mix-chaleur', `${(shares.chaleur || 0) * 100}%`);
        donut.style.setProperty('--mix-elec', `${(shares.electricite || 0) * 100}%`);
        donut.style.setProperty('--mix-froid', `${(shares.froid || 0) * 100}%`);
      }

      const roleImg = card.querySelector('[role="img"]');
      if (roleImg) {
        const labelBase = card.getAttribute('aria-label') || 'Mix énergétique';
        roleImg.setAttribute('aria-label', `${labelBase} : ${describeMix(shares, totalPerM2, mode, sre, unit)}.`);
      }
      card.classList.toggle('is-empty', baseAmount <= 0);
    });
  };

  const updateTopConsumersCards = (mode, buildingSummaries) => {
    const rankingCards = document.querySelectorAll('.energy-ranking-card');
    if (!rankingCards.length) return;

    rankingCards.forEach((card) => {
      const scope = card.dataset.chartScope || '';
      const metricKey = card.dataset.rankingMetric
        || (scope === 'chaleur'
          ? 'chaleur'
          : scope === 'froid'
            ? 'froid'
            : scope === 'elec'
              ? 'elec'
              : scope === 'co2'
                ? 'co2'
                : 'general');
      const metricDef = ENERGY_BASE_DATA.metrics[metricKey] || ENERGY_BASE_DATA.metrics.general || { decimals: 0 };
      const unit = getUnitLabel(metricKey, mode);
      const decimals = mode === 'kwhm2' ? (metricDef.decimals || 0) : 0;

      const entries = Object.values(buildingSummaries || {}).map((entry) => {
        const metrics = entry?.metrics?.[metricKey] || {};
        const value = mode === 'kwhm2'
          ? Number(metrics.intensity)
          : Number(metrics.total);
        return {
          id: entry?.id || '',
          label: entry?.label || entry?.id || '',
          value: Number.isFinite(value) ? value : 0,
        };
      }).filter(item => item.value > 0);

      entries.sort((a, b) => b.value - a.value);
      const topFive = entries.slice(0, 5);
      const maxValue = topFive.reduce((acc, item) => (item.value > acc ? item.value : acc), 0);

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

  const updateTypologyChart = (mode, typologies = []) => {
    const cards = document.querySelectorAll('.energy-typology-card');
    if (!cards.length) return;

    cards.forEach((card) => {
      const metricKey = card.dataset.chartMetric
        || (card.dataset.chartScope === 'chaleur'
          ? 'chaleur'
          : card.dataset.chartScope === 'froid'
            ? 'froid'
            : card.dataset.chartScope === 'elec'
              ? 'elec'
              : card.dataset.chartScope === 'co2'
                ? 'co2'
                : 'general');
      const unit = getAnnualUnitLabel(metricKey, mode);
      card.querySelectorAll('.chart-unit').forEach(el => { el.textContent = unit; });

      const dataset = Array.isArray(typologies)
        ? typologies.map(item => {
          const energyByMetric = item?.energyByMetric || {};
          const energy = Number(energyByMetric[metricKey]) || (metricKey === 'general' ? Number(item?.energy) || 0 : 0);
          const sre = Number(item?.sre) || 0;
          const value = mode === 'kwhm2'
            ? (sre > 0 ? energy / sre : 0)
            : energy;
          return {
            key: item?.key || item?.label || 'autre',
            label: item?.label || item?.key || 'Autre',
            value,
            energy,
            sre,
            buildings: Number(item?.count) || 0,
          };
        }).filter(entry => entry.energy > 0)
        : [];

      dataset.sort((a, b) => (b.value || 0) - (a.value || 0));
      const maxValue = dataset.reduce((max, item) => (item.value > max ? item.value : max), 0);
      const totalBuildings = dataset.reduce((acc, item) => acc + (item.buildings || 0), 0);
      const hasData = dataset.length > 0;

      const barsWrap = card.querySelector('[data-typology-bars]');
      if (barsWrap) {
        barsWrap.innerHTML = '';
        if (!hasData) {
          const empty = document.createElement('p');
          empty.className = 'chart-empty';
          empty.textContent = 'Aucune typologie disponible pour la sélection.';
          barsWrap.append(empty);
        } else {
          const scale = maxValue > 0 ? (140 / maxValue) : 0;
          if (scale > 0) barsWrap.style.setProperty('--typology-scale', `${scale}px`);
          else barsWrap.style.removeProperty('--typology-scale');

          dataset.forEach((item) => {
            const bar = document.createElement('div');
            bar.className = 'typology-bar';
            bar.dataset.key = item.key;
            bar.setAttribute('role', 'listitem');

            const fill = document.createElement('span');
            fill.className = 'typology-bar__fill';
            fill.style.setProperty('--value', Math.max(item.value, 0));
            fill.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'typology-bar__label';
            label.textContent = item.label;

            const valueEl = document.createElement('span');
            valueEl.className = 'typology-bar__value';
            valueEl.textContent = `${formatEnergyDisplay(item.value, mode, mode === 'kwhm2' ? 0 : 0)} ${unit}`;

            const countEl = document.createElement('span');
            countEl.className = 'typology-bar__count';
            countEl.textContent = `${formatCount(item.buildings)} bât.`;

            bar.setAttribute('aria-label', `${item.label} : ${valueEl.textContent}, ${countEl.textContent}`);
            bar.append(fill, valueEl, label, countEl);
            barsWrap.append(bar);
          });
        }
      }

      const tableBody = card.querySelector('[data-typology-table]');
      if (tableBody) {
        tableBody.innerHTML = '';
        dataset.forEach((item) => {
          const row = document.createElement('tr');
          const labelCell = document.createElement('td');
          labelCell.textContent = item.label;
          const valueCell = document.createElement('td');
          valueCell.textContent = `${formatEnergyDisplay(item.value, mode, mode === 'kwhm2' ? 0 : 0)} ${unit}`;
          const countCell = document.createElement('td');
          countCell.textContent = formatCount(item.buildings);
          row.append(labelCell, valueCell, countCell);
          tableBody.append(row);
        });
      }

      const summary = card.querySelector('[data-typology-summary]');
      if (summary) {
        if (hasData) {
          summary.textContent = `${formatCount(totalBuildings)} bâtiment(s) répartis sur ${dataset.length} typologie(s).`;
        } else {
          summary.textContent = 'Sélectionnez un périmètre pour afficher la répartition par typologie.';
        }
      }

      card.classList.toggle('is-empty', !hasData);
    });
  };

  const updateEnergyMap = (mode, mapPoints = [], aggregatedMetrics = {}) => {
    const cards = document.querySelectorAll('.energy-map-card');
    if (!cards.length) return;
    cards.forEach((card) => {
      const metricKey = card.dataset.chartMetric
        || (card.dataset.chartScope === 'chaleur'
          ? 'chaleur'
          : card.dataset.chartScope === 'froid'
            ? 'froid'
            : card.dataset.chartScope === 'elec'
              ? 'elec'
              : card.dataset.chartScope === 'co2'
                ? 'co2'
                : 'general');
      const unit = getUnitLabel(metricKey, mode);
      card.querySelectorAll('.chart-unit').forEach(el => { el.textContent = unit; });

      const markersWrap = card.querySelector('[data-map-markers]');
      const legendList = card.querySelector('[data-map-legend]');
      const emptyState = card.querySelector('[data-map-empty]');
      const mapContainer = card.querySelector('[data-leaflet-map]');

      const points = Array.isArray(mapPoints)
        ? mapPoints.map(point => {
          const metrics = point?.metrics?.[metricKey] || {};
          return {
            ...point,
            intensity: Number(metrics.intensity),
            total: Number(metrics.total),
            sre: Number(metrics.sre) || Number(point.sre) || 0,
          };
        }).filter(point => Number.isFinite(mode === 'kwhm2' ? point.intensity : point.total))
        : [];

      if (markersWrap) markersWrap.innerHTML = '';
      const hasData = points.length > 0;
      if (emptyState) emptyState.hidden = hasData;
      card.classList.toggle('is-empty', !hasData);

      if (!hasData) {
        if (mapContainer) {
          const existingState = MAP_CARD_STATE.get(card);
          if (existingState?.frame) {
            existingState.frame.hidden = true;
          }
        }
        return;
      }

      const thresholdsSource = metricKey === 'chaleur'
        ? HEAT_BASE_DATA.mapThresholds
        : metricKey === 'froid'
          ? COLD_BASE_DATA.mapThresholds
          : metricKey === 'elec'
            ? ELEC_BASE_DATA.mapThresholds
            : metricKey === 'co2'
              ? CO2_BASE_DATA.mapThresholds
              : metricKey === 'eau'
                ? WATER_BASE_DATA.mapThresholds
                : ENERGY_BASE_DATA.mapThresholds;
      const thresholds = thresholdsSource?.[mode] || [];
      const metricLabel = metricKey === 'chaleur'
        ? 'chaleur'
        : metricKey === 'froid'
          ? 'froid'
          : metricKey === 'elec'
            ? 'électricité'
            : metricKey === 'co2'
              ? 'émissions'
              : metricKey === 'eau'
                ? 'eau'
                : 'énergie';

      const classify = (value) => {
        if (!Number.isFinite(value)) return 'medium';
        const [t1, t2, t3] = thresholds;
        if (!thresholds.length) return 'medium';
        if (thresholds.length === 1) {
          return value <= t1 ? 'low' : 'high';
        }
        if (value <= t1) return 'low';
        if (thresholds.length === 2) return value <= t2 ? 'medium' : 'high';
        if (value <= t2) return 'medium';
        if (value <= t3) return 'high';
        return 'critical';
      };

      const maxSre = points.reduce((acc, point) => (point.sre > acc ? point.sre : acc), 0);
      const projection = projectMapPoints(points);
      const mapState = mapContainer ? ensureMapFrame(card) : null;

      if (mapState && mapState.frame) {
        const bounds = projection.projectedBounds;
        if (bounds) {
          mapState.frame.style.left = `${bounds.minX}%`;
          mapState.frame.style.top = `${bounds.minY}%`;
          mapState.frame.style.width = `${Math.max(2, bounds.maxX - bounds.minX)}%`;
          mapState.frame.style.height = `${Math.max(2, bounds.maxY - bounds.minY)}%`;
          mapState.frame.hidden = false;
        } else {
          mapState.frame.hidden = true;
        }
      }

      if (markersWrap) {
        const markerTag = (markersWrap.tagName === 'UL' || markersWrap.tagName === 'OL') ? 'li' : 'div';

        points.forEach((point) => {
          if (!point || !point.projected) return;
          const value = mode === 'kwhm2' ? Number(point.intensity) || 0 : Number(point.total) || 0;
          const sre = Number(point.sre) || 0;
          const severity = classify(value);
          const marker = document.createElement(markerTag);
          marker.className = `map-marker map-marker--${severity}`;
          const size = maxSre > 0 ? 24 + ((Math.min(sre, maxSre) / maxSre) * 28) : 24;
          marker.style.setProperty('--marker-size', `${size}px`);
          marker.style.left = `${point.projected.x}%`;
          marker.style.top = `${point.projected.y}%`;
          marker.setAttribute('role', 'listitem');
          const formattedValue = formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 0 : 0);
          marker.setAttribute('aria-label', `${point.label} : ${formattedValue} ${unit} (${metricLabel}), ${formatCount(sre)} m²`);
          marker.title = `${point.label} — ${formattedValue} ${unit}`;

          const dot = document.createElement('span');
          dot.className = 'map-marker__dot';
          dot.setAttribute('aria-hidden', 'true');

          const label = document.createElement('span');
          label.className = 'map-marker__label';
          label.textContent = point.label;

          marker.append(dot, label);
          markersWrap.append(marker);
        });
      }

      if (legendList) {
        legendList.innerHTML = '';
        const ranges = [];
        const formatter = (value) => `${formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 0 : 0)} ${unit}`;
        if (thresholds.length >= 3) {
          const [t1, t2, t3] = thresholds;
          ranges.push({ label: `≤ ${formatter(t1)}`, cls: 'map-legend__dot--low' });
          ranges.push({ label: `${formatter(t1)} – ${formatter(t2)}`, cls: 'map-legend__dot--medium' });
          ranges.push({ label: `${formatter(t2)} – ${formatter(t3)}`, cls: 'map-legend__dot--high' });
          ranges.push({ label: `> ${formatter(t3)}`, cls: 'map-legend__dot--critical' });
        } else if (thresholds.length === 2) {
          const [t1, t2] = thresholds;
          ranges.push({ label: `≤ ${formatter(t1)}`, cls: 'map-legend__dot--low' });
          ranges.push({ label: `${formatter(t1)} – ${formatter(t2)}`, cls: 'map-legend__dot--medium' });
          ranges.push({ label: `> ${formatter(t2)}`, cls: 'map-legend__dot--high' });
        } else if (thresholds.length === 1) {
          ranges.push({ label: `≤ ${formatter(thresholds[0])}`, cls: 'map-legend__dot--low' });
          ranges.push({ label: `> ${formatter(thresholds[0])}`, cls: 'map-legend__dot--high' });
        } else {
          ranges.push({ label: 'Consommation moyenne', cls: 'map-legend__dot--medium' });
        }
        ranges.forEach((range) => {
          const item = document.createElement('li');
          const dot = document.createElement('span');
          dot.className = `map-legend__dot ${range.cls}`;
          dot.setAttribute('aria-hidden', 'true');
          const text = document.createElement('span');
          text.textContent = range.label;
          item.append(dot, text);
          legendList.append(item);
        });
      }
    });
  };

  const updateMonthlyChart = (mode, monthly = [], aggregatedMetrics = {}) => {
    const cards = document.querySelectorAll('.energy-monthly-card');
    if (!cards.length) return;
    const selectedYearLabel = FILTERS?.year ? String(FILTERS.year) : '';
    const cssClassForSeries = (seriesKey) => {
      if (seriesKey === 'elec') return 'electricite';
      if (seriesKey === 'eau') return 'eau';
      if (seriesKey === 'co2scope1') return 'scope1';
      if (seriesKey === 'co2scope2') return 'scope2';
      return seriesKey;
    };

    const seriesLabel = (seriesKey) => {
      if (seriesKey === 'co2scope1') return CO2_BASE_DATA.mix.labels.scopes.scope1 || 'Scope 1';
      if (seriesKey === 'co2scope2') return CO2_BASE_DATA.mix.labels.scopes.scope2 || 'Scope 2';
      if (seriesKey === 'chaleur') return 'Chaleur';
      if (seriesKey === 'elec') return 'Électricité';
      if (seriesKey === 'froid') return 'Froid';
      if (seriesKey === 'eau') return 'Eau';
      return seriesKey;
    };

    cards.forEach((card) => {
      const metricKey = card.dataset.chartMetric
        || (card.dataset.chartScope === 'chaleur'
          ? 'chaleur'
          : card.dataset.chartScope === 'froid'
            ? 'froid'
            : card.dataset.chartScope === 'elec'
              ? 'elec'
              : card.dataset.chartScope === 'co2'
                ? 'co2'
                : 'general');
      const unit = getUnitLabel(metricKey, mode);
      card.querySelectorAll('.chart-unit').forEach(el => { el.textContent = unit; });

      const barsWrap = card.querySelector('[data-monthly-bars]');
      const line = card.querySelector('[data-monthly-line]');
      const summary = card.querySelector('[data-monthly-summary]');
      if (!barsWrap) return;

      const seriesAttr = card.dataset.monthlySeries || 'chaleur,elec,froid';
      const series = seriesAttr.split(',').map(s => s.trim()).filter(Boolean);
      const metricData = aggregatedMetrics[metricKey] || aggregatedMetrics.general || {};
      const sre = Number(metricData.sre) || 0;
      const divisor = mode === 'kwhm2' && sre > 0 ? sre : 1;
      const metricDef = ENERGY_BASE_DATA.metrics[metricKey] || { decimals: 0 };
      const valueDecimals = mode === 'kwhm2' ? (metricDef.decimals || 0) : 0;

      const dataset = Array.isArray(monthly)
        ? monthly.map(item => {
          const key = item?.key || item?.month;
          const label = item?.label || item?.month || '';
          const climate = Number(item?.climate) || 0;
          const values = {};
          series.forEach((seriesKey) => {
            const rawValue = Number(item?.[seriesKey]) || 0;
            values[seriesKey] = divisor > 0 ? rawValue / divisor : 0;
          });
          const total = series.reduce((acc, seriesKey) => acc + (values[seriesKey] || 0), 0);
          return { key, label, values, total, climate };
        })
        : [];

      const maxTotal = dataset.reduce((acc, item) => (item.total > acc ? item.total : acc), 0);
      const maxClimate = dataset.reduce((acc, item) => (item.climate > acc ? item.climate : acc), 0);
      const hasData = dataset.length > 0;

      barsWrap.innerHTML = '';
      if (!hasData) {
        const empty = document.createElement('p');
        empty.className = 'chart-empty';
        empty.textContent = 'Aucune donnée mensuelle disponible pour ce périmètre.';
        barsWrap.append(empty);
      } else {
        const scale = maxTotal > 0 ? (140 / maxTotal) : 0;
        if (scale > 0) barsWrap.style.setProperty('--monthly-scale', `${scale}px`);
        else barsWrap.style.removeProperty('--monthly-scale');

        dataset.forEach((item) => {
          const bar = document.createElement('div');
          bar.className = 'monthly-bar';
          bar.dataset.monthKey = item.key || '';
          bar.setAttribute('role', 'listitem');

          const stack = document.createElement('div');
          stack.className = 'monthly-stack';

          const segmentsDescription = [];
          series.forEach((seriesKey) => {
            const cssKey = cssClassForSeries(seriesKey);
            const value = item.values[seriesKey] || 0;
            const segment = document.createElement('span');
            segment.className = `monthly-segment monthly-segment--${cssKey}`;
            segment.style.setProperty('--value', Math.max(value, 0));
            segment.setAttribute('aria-hidden', 'true');
            stack.append(segment);
            segmentsDescription.push(`${seriesLabel(seriesKey)} ${formatEnergyDisplay(value, mode, valueDecimals)} ${unit}`);
          });

          const totalValue = formatEnergyDisplay(item.total, mode, valueDecimals);
          bar.setAttribute('aria-label', `${item.label} : ${totalValue} ${unit} — ${segmentsDescription.join(', ')}`);

          const valueEl = document.createElement('span');
          valueEl.className = 'monthly-total';
          valueEl.textContent = totalValue;
          valueEl.setAttribute('aria-hidden', 'true');

          const labelEl = document.createElement('span');
          labelEl.className = 'monthly-label';
          labelEl.textContent = item.label;

          bar.append(stack, valueEl, labelEl);
          barsWrap.append(bar);
        });
      }

      if (line) {
        const polyline = line.querySelector('polyline');
        if (polyline) {
          if (!hasData || maxClimate <= 0) {
            polyline.setAttribute('points', '');
          } else {
            const step = dataset.length > 1 ? 100 / (dataset.length - 1) : 100;
            const pointsStr = dataset.map((item, idx) => {
              const x = dataset.length > 1 ? idx * step : 50;
              const y = 100 - ((item.climate / maxClimate) * 100);
              return `${x.toFixed(2)},${Math.max(0, Math.min(100, y)).toFixed(2)}`;
            }).join(' ');
            polyline.setAttribute('points', pointsStr);
          }
        }
      }

      if (summary) {
        if (!hasData) {
          summary.textContent = 'Sélection vide — aucune tendance mensuelle.';
        } else {
          const average = dataset.reduce((acc, item) => acc + item.total, 0) / dataset.length;
          const yearPhrase = selectedYearLabel ? ` en ${selectedYearLabel}` : '';
          summary.textContent = `Moyenne mensuelle${yearPhrase} : ${formatEnergyDisplay(average, mode, valueDecimals)} ${unit}`;
        }
      }

      card.classList.toggle('is-empty', !hasData);
    });
  };

  const updateDistributionChart = (mode, distribution = {}, aggregatedMetrics = {}) => {
    const cards = document.querySelectorAll('.energy-distribution-card');
    if (!cards.length) return;
    const defaultIntensityBins = [
      { key: '0-80', label: '0-80', min: 0, max: 80 },
      { key: '80-120', label: '80-120', min: 80, max: 120 },
      { key: '120-160', label: '120-160', min: 120, max: 160 },
      { key: '160-200', label: '160-200', min: 160, max: 200 },
      { key: '200-260', label: '200-260', min: 200, max: 260 },
      { key: '≥260', label: '≥260', min: 260, max: null },
    ];
    const defaultTotalBins = [
      { key: '0-200', label: '0-200 MWh', min: 0, max: 200000 },
      { key: '200-300', label: '200-300 MWh', min: 200000, max: 300000 },
      { key: '300-400', label: '300-400 MWh', min: 300000, max: 400000 },
      { key: '400-500', label: '400-500 MWh', min: 400000, max: 500000 },
      { key: '≥500', label: '≥500 MWh', min: 500000, max: null },
    ];

    cards.forEach((card) => {
      const metricKey = card.dataset.chartMetric
        || (card.dataset.chartScope === 'chaleur'
          ? 'chaleur'
          : card.dataset.chartScope === 'froid'
            ? 'froid'
            : card.dataset.chartScope === 'elec'
              ? 'elec'
              : card.dataset.chartScope === 'co2'
                ? 'co2'
                : 'general');
      const unit = getUnitLabel(metricKey, mode);
      card.querySelectorAll('.chart-unit').forEach(el => { el.textContent = unit; });

      const barsWrap = card.querySelector('[data-distribution-bars]');
      const line = card.querySelector('[data-distribution-line]');
      const selectionLegend = card.querySelector('[data-distribution-selection]');
      const benchmarkLegend = card.querySelector('[data-distribution-benchmark]');
      if (!barsWrap) return;

      const records = Array.isArray(distribution?.records) ? distribution.records : [];
      const values = records.map((record) => {
        const metrics = record?.metrics?.[metricKey];
        if (!metrics) return NaN;
        const value = mode === 'kwhm2' ? Number(metrics.intensity) : Number(metrics.total);
        return Number.isFinite(value) ? value : NaN;
      }).filter(Number.isFinite);

      const benchmarkMap = distribution?.benchmarkByMetric || {};
      const benchmarkSource = benchmarkMap[metricKey]
        || (metricKey === 'chaleur'
          ? HEAT_BASE_DATA.benchmark
          : metricKey === 'froid'
            ? COLD_BASE_DATA.benchmark
            : metricKey === 'elec'
              ? ELEC_BASE_DATA.benchmark
              : metricKey === 'co2'
                ? CO2_BASE_DATA.benchmark
                : benchmarkMap.general || distribution?.benchmark || ENERGY_BASE_DATA.benchmark);
      const benchConfig = mode === 'kwhm2'
        ? (benchmarkSource.intensity || {})
        : (benchmarkSource.total || {});

      const bins = Array.isArray(benchConfig.bins) && benchConfig.bins.length
        ? benchConfig.bins
        : (mode === 'kwhm2' ? defaultIntensityBins : defaultTotalBins);
      const benchmarkValues = Array.isArray(benchConfig.curve) && benchConfig.curve.length
        ? benchConfig.curve.slice(0, bins.length)
        : new Array(bins.length).fill(0);
      const benchmarkTotal = Number(benchConfig.totalBuildings) || 0;

      const selectionCounts = bins.map((bin) => {
        const count = values.reduce((acc, value) => {
          if (bin.max == null) {
            return value >= bin.min ? acc + 1 : acc;
          }
          return (value >= bin.min && value < bin.max) ? acc + 1 : acc;
        }, 0);
        return { ...bin, count };
      });

      const maxCount = selectionCounts.reduce((acc, bin) => (bin.count > acc ? bin.count : acc), 0);
      const totalSelection = selectionCounts.reduce((acc, bin) => acc + bin.count, 0);
      const hasData = totalSelection > 0;

      barsWrap.innerHTML = '';
      if (maxCount > 0) {
        const scale = 120 / maxCount;
        barsWrap.style.setProperty('--distribution-scale', `${scale}px`);
      } else {
        barsWrap.style.removeProperty('--distribution-scale');
      }

      selectionCounts.forEach((bin) => {
        const bar = document.createElement('div');
        bar.className = 'distribution-bar';
        bar.dataset.binKey = bin.key;
        bar.setAttribute('role', 'listitem');

        const fill = document.createElement('span');
        fill.className = 'distribution-bar__fill';
        fill.style.setProperty('--value', Math.max(bin.count, 0));
        fill.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'distribution-bar__label';
        label.textContent = bin.label;

        const valueEl = document.createElement('span');
        valueEl.className = 'distribution-bar__value';
        valueEl.textContent = `${formatCount(bin.count)} bât.`;

        bar.setAttribute('aria-label', `${bin.label} : ${formatCount(bin.count)} bâtiment(s)`);
        bar.append(fill, label, valueEl);
        barsWrap.append(bar);
      });

      if (line) {
        const polyline = line.querySelector('polyline');
        if (polyline) {
          const maxBench = benchmarkValues.reduce((acc, value) => (value > acc ? value : acc), 0);
          if (maxBench <= 0) {
            polyline.setAttribute('points', '');
          } else {
            const step = benchmarkValues.length > 1 ? 100 / (benchmarkValues.length - 1) : 100;
            const pointsStr = benchmarkValues.map((value, idx) => {
              const x = benchmarkValues.length > 1 ? idx * step : 50;
              const y = 100 - ((value / maxBench) * 100);
              return `${x.toFixed(2)},${Math.max(0, Math.min(100, y)).toFixed(2)}`;
            }).join(' ');
            polyline.setAttribute('points', pointsStr);
          }
        }
      }

      if (selectionLegend) {
        selectionLegend.textContent = `${formatCount(totalSelection)} bât.`;
      }
      if (benchmarkLegend) {
        benchmarkLegend.textContent = benchmarkTotal ? `${formatCount(benchmarkTotal)} bât.` : 'Référence';
      }

      card.classList.toggle('is-empty', !hasData);
    });
  };

  function updateEnergyVisuals() {
    const mode = FILTERS.norm || 'kwhm2';
    const allLeaves = $$('.tree-leaf');
    const selectedLeaves = allLeaves.filter(leaf => leafCheck(leaf)?.checked);
    const activeLeaves = selectedLeaves.length ? selectedLeaves : allLeaves;
    const fallbackSre = computeFallbackSre(allLeaves);
    const {
      metrics: aggregated,
      buildings,
      typologies,
      monthly,
      mapPoints,
      distribution,
    } = computeAggregatedMetrics(activeLeaves, fallbackSre);
    const effectiveSre = Number(aggregated?.general?.sre) || fallbackSre || 0;

    updateEnergyKpis(mode, aggregated);
    updateWaterSummary(mode, aggregated);
    updateEnergyTrendCharts(mode, aggregated);
    updateMixCards(mode, aggregated);
    updateEnergyMeters(aggregated);
    updateTopConsumersCards(mode, buildings);
    updateTypologyChart(mode, typologies);
    updateEnergyMap(mode, mapPoints, aggregated);
    updateMonthlyChart(mode, monthly, aggregated);
    updateDistributionChart(mode, distribution, aggregated);
    syncChartTileLayouts();
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
  async function initializeApp() {
    await loadBuildingsData();
    syncTreeLeafLabelsFromDataset();

    syncStickyTop();
    $$('.tabset').forEach(initTabset);
    selectSection('energie');

    // Par défaut on coche tout le parc et on affiche immédiatement les totaux.
    hydrateTreeCheckboxMap();
    checkWholeParc(true);
    syncTreeSelectionState();
    updateTreeMissingState();

    wireYearPicker();
    setupChartCatalog();
    setupChartTileDragging();
    setupEnergyFilters();
    setupTreeSearch();

    // 👇 ajoute ceci
    setupSidebarMultiSelects();

    window.addEventListener('resize', scheduleChartTileEqualize);

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
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializeApp().catch((error) => {
      console.error('Erreur lors de l\'initialisation de Stratos', error);
    });
  });




})();
