// app.js (v2 robuste) — copie/colle tel quel
(() => {
  /* ========== Helpers ========== */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);
  const NF = new Intl.NumberFormat('fr-FR');
  const PERCENT_FORMAT = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const PARETO_MIN_LEFT_GAP = 68;
  const PARETO_MIN_RIGHT_GAP = 40;
  const PARETO_LEFT_LABEL_PADDING = 16;
  const PARETO_RIGHT_LABEL_PADDING = 16;
  const PARETO_SCALE_OFFSET = 12;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const clamp = (value, min, max) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.min(Math.max(num, min), max);
  };

  const clampPercent = (value) => clamp(value, 0, 100);

  const formatPercentCoord = (value) => clampPercent(value).toFixed(2);

  const buildSmoothParetoPath = (points, tension = 0.55) => {
    if (!Array.isArray(points) || points.length === 0) {
      return '';
    }

    const normalizedPoints = points.map((point) => ({
      x: clampPercent(point?.x ?? 0),
      y: clampPercent(point?.y ?? 0),
    }));

    if (normalizedPoints.length === 1) {
      const [p] = normalizedPoints;
      return `M ${formatPercentCoord(p.x)} ${formatPercentCoord(p.y)}`;
    }

    if (normalizedPoints.length === 2) {
      const [p1, p2] = normalizedPoints;
      return `M ${formatPercentCoord(p1.x)} ${formatPercentCoord(p1.y)} L ${formatPercentCoord(p2.x)} ${formatPercentCoord(p2.y)}`;
    }

    const smoothness = clamp01(typeof tension === 'number' ? tension : 0.65);
    const pathParts = [`M ${formatPercentCoord(normalizedPoints[0].x)} ${formatPercentCoord(normalizedPoints[0].y)}`];

    for (let i = 0; i < normalizedPoints.length - 1; i += 1) {
      const p0 = normalizedPoints[i - 1] || normalizedPoints[i];
      const p1 = normalizedPoints[i];
      const p2 = normalizedPoints[i + 1];
      const p3 = normalizedPoints[i + 2] || p2;

      const cp1 = {
        x: p1.x + ((p2.x - p0.x) * smoothness) / 6,
        y: p1.y + ((p2.y - p0.y) * smoothness) / 6,
      };
      const cp2 = {
        x: p2.x - ((p3.x - p1.x) * smoothness) / 6,
        y: p2.y - ((p3.y - p1.y) * smoothness) / 6,
      };

      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      cp1.x = clamp(cp1.x, minX, maxX);
      cp2.x = clamp(cp2.x, minX, maxX);
      cp1.y = clamp(cp1.y, minY, maxY);
      cp2.y = clamp(cp2.y, minY, maxY);

      pathParts.push(
        `C ${formatPercentCoord(cp1.x)} ${formatPercentCoord(cp1.y)} ${formatPercentCoord(cp2.x)} ${formatPercentCoord(cp2.y)} ${formatPercentCoord(p2.x)} ${formatPercentCoord(p2.y)}`,
      );
    }

    return pathParts.join(' ');
  };

  const ensureSvgPathElement = (element) => {
    if (!element) return null;
    if (element instanceof SVGPathElement) return element;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
    if (element instanceof SVGPolylineElement || tagName === 'polyline') {
      const pathEl = document.createElementNS(SVG_NS, 'path');
      if (element.hasAttributes()) {
        Array.from(element.attributes).forEach((attr) => {
          if (attr.name === 'points') return;
          pathEl.setAttribute(attr.name, attr.value);
        });
      }
      Object.entries(element.dataset || {}).forEach(([key, value]) => {
        pathEl.dataset[key] = value;
      });
      if (typeof element.className === 'string' && element.className) {
        pathEl.setAttribute('class', element.className);
      } else if (element.className && typeof element.className.baseVal === 'string' && element.className.baseVal) {
        pathEl.setAttribute('class', element.className.baseVal);
      }
      pathEl.setAttribute('d', '');
      element.replaceWith(pathEl);
      return pathEl;
    }
    return element instanceof SVGPathElement ? element : null;
  };

  const hexToRgb = (hex) => {
    if (typeof hex !== 'string') return null;
    let normalized = hex.trim().replace(/^#/, '');
    if (normalized.length === 3) {
      normalized = normalized.split('').map((c) => `${c}${c}`).join('');
    }
    if (normalized.length !== 6) return null;
    const value = Number.parseInt(normalized, 16);
    if (Number.isNaN(value)) return null;
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  };

  const mixWithWhite = (hex, amount = 0.5) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const ratio = clamp01(amount);
    const blend = (channel) => Math.round(channel + (255 - channel) * ratio);
    return `rgb(${blend(rgb.r)}, ${blend(rgb.g)}, ${blend(rgb.b)})`;
  };

  const withAlpha = (hex, alpha = 1) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const ratio = clamp01(alpha);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${ratio})`;
  };

  const CSS_PALETTE_MAP = {
    red: '--c-red',
    orange1: '--c-orange-1',
    orange2: '--c-orange-2',
    orange3: '--c-orange-3',
    yellow: '--c-yellow',
    green: '--c-green',
    teal: '--c-teal',
    tealMuted: '--c-teal-muted',
    blueSoft: '--c-blue-soft',
    blueDeep: '--c-blue-deep',
  };

  const FALLBACK_PALETTE = {
    red: '#F94144',
    orange1: '#F3722C',
    orange2: '#F8961E',
    orange3: '#F9844A',
    yellow: '#F9C74F',
    green: '#90BE6D',
    teal: '#43AA8B',
    tealMuted: '#4D908E',
    blueSoft: '#577590',
    blueDeep: '#277DA1',
  };

  const readCssPalette = () => {
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(CSS_PALETTE_MAP).map(([key, varName]) => {
        const value = styles.getPropertyValue(varName).trim();
        return [key, value || FALLBACK_PALETTE[key]];
      }),
    );
  };

  const COLOR_PALETTE = readCssPalette();

  if (typeof window !== 'undefined') {
    window.STRATOS_PALETTE = Object.freeze({ ...COLOR_PALETTE });
  }

  const paletteColor = (key) => COLOR_PALETTE[key] || FALLBACK_PALETTE[key];

  const TREEMAP_COLORS = [
    paletteColor('blueDeep'),
    paletteColor('tealMuted'),
    paletteColor('blueSoft'),
    paletteColor('green'),
    paletteColor('orange1'),
    paletteColor('teal'),
    paletteColor('orange3'),
    paletteColor('yellow'),
    paletteColor('red'),
  ];

  const SECTION_COLOR_KEYS = {
    energie: 'blueDeep',
    general: 'blueSoft',
    etat: 'teal',
    travaux: 'orange1',
    financier: 'yellow',
  };

  const computeTreemapLayout = (items, x = 0, y = 0, width = 1, height = 1, splitHorizontal = width >= height) => {
    if (!Array.isArray(items) || !items.length) return [];

    const fallbackLayout = () => {
      if (splitHorizontal) {
        const cellWidth = width / items.length;
        return items.map((item, index) => ({
          item,
          x: x + cellWidth * index,
          y,
          width: cellWidth,
          height,
        }));
      }
      const cellHeight = height / items.length;
      return items.map((item, index) => ({
        item,
        x,
        y: y + cellHeight * index,
        width,
        height: cellHeight,
      }));
    };

    if (items.length === 1) {
      return [{ item: items[0], x, y, width, height }];
    }

    const safeTotal = items.reduce((sum, entry) => sum + Math.max(entry?.value || 0, 0), 0);
    if (safeTotal <= 0) {
      return fallbackLayout();
    }

    let pivot = 0;
    let accumulator = 0;
    const target = safeTotal / 2;
    while (pivot < items.length && accumulator < target) {
      accumulator += Math.max(items[pivot]?.value || 0, 0);
      pivot += 1;
    }

    if (pivot <= 0) pivot = 1;
    if (pivot >= items.length) pivot = items.length - 1;

    const firstGroup = items.slice(0, pivot);
    const secondGroup = items.slice(pivot);
    const firstTotal = firstGroup.reduce((sum, entry) => sum + Math.max(entry?.value || 0, 0), 0);
    const ratio = safeTotal > 0 ? firstTotal / safeTotal : firstGroup.length / items.length;

    if (ratio <= 0 || ratio >= 1) {
      return fallbackLayout();
    }

    if (splitHorizontal) {
      const width1 = width * ratio;
      const width2 = width - width1;
      if (width1 <= 0 || width2 <= 0) return fallbackLayout();
      return [
        ...computeTreemapLayout(firstGroup, x, y, width1, height, !splitHorizontal),
        ...computeTreemapLayout(secondGroup, x + width1, y, width2, height, !splitHorizontal),
      ];
    }

    const height1 = height * ratio;
    const height2 = height - height1;
    if (height1 <= 0 || height2 <= 0) return fallbackLayout();

    return [
      ...computeTreemapLayout(firstGroup, x, y, width, height1, !splitHorizontal),
      ...computeTreemapLayout(secondGroup, x, y + height1, width, height2, !splitHorizontal),
    ];
  };
  const isReducedMotionPreferred = () => {
    try {
      return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  };

  const measureParetoLabelWidth = (() => {
    const MIN_WIDTH = 96;
    const MAX_WIDTH = 640;
    const MAX_LINES = 2;
    const HORIZONTAL_PADDING = 16;
    let measureEl = null;

    const ensureMeasureElement = () => {
      if (measureEl && measureEl.isConnected) {
        return measureEl;
      }

      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'position:absolute',
        'left:-9999px',
        'top:-9999px',
        'pointer-events:none',
        'visibility:hidden',
        'z-index:-1',
        'font-weight:600',
        'font-size:0.72rem',
        'line-height:1.3',
        'font-family:Inter, system-ui, "Segoe UI", sans-serif',
        'padding:4px 10px',
        'max-width:none',
        'box-sizing:border-box',
        'display:block',
        'white-space:normal',
      ].join(';');
      const host = document.body || document.documentElement;
      if (host) {
        host.appendChild(el);
        measureEl = el;
        return measureEl;
      }

      return null;
    };

    const parsePx = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const fallbackWidth = (text = '') => {
      if (!text) return MIN_WIDTH;
      const averageCharWidth = 7;
      const estimated = text.length * averageCharWidth + HORIZONTAL_PADDING;
      const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, estimated));
      return Math.round(clamped);
    };

    return (rawLabel = '') => {
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
      if (!label) return MIN_WIDTH;

      const element = ensureMeasureElement();
      if (!element) {
        return fallbackWidth(label);
      }

      element.textContent = label;
      element.style.whiteSpace = 'nowrap';
      element.style.width = 'auto';

      const singleLineWidth = Math.ceil(element.scrollWidth);

      const words = label.split(/\s+/).filter(Boolean);
      let longestWordWidth = singleLineWidth;
      if (words.length) {
        longestWordWidth = words.reduce((max, word) => {
          element.textContent = word;
          const width = Math.ceil(element.scrollWidth);
          return width > max ? width : max;
        }, 0);
      }

      element.textContent = label;
      element.style.whiteSpace = 'normal';
      element.style.display = 'block';

      const computed = window.getComputedStyle(element);
      const paddingTop = parsePx(computed.paddingTop);
      const paddingBottom = parsePx(computed.paddingBottom);
      const fontSize = parsePx(computed.fontSize) || 11.5;
      let lineHeight = parsePx(computed.lineHeight);
      if (!lineHeight) {
        const numeric = Number.parseFloat(computed.lineHeight);
        if (Number.isFinite(numeric)) {
          lineHeight = numeric;
        } else {
          lineHeight = fontSize * 1.3;
        }
      }
      const maxHeight = paddingTop + paddingBottom + lineHeight * MAX_LINES + 0.5;

      const paddedLongestWord = Math.ceil(longestWordWidth) + HORIZONTAL_PADDING;
      const paddedSingleLine = Math.ceil(singleLineWidth) + HORIZONTAL_PADDING;

      const minCandidate = Math.max(
        Math.ceil(singleLineWidth / MAX_LINES) + HORIZONTAL_PADDING,
        paddedLongestWord,
        MIN_WIDTH,
      );
      const maxCandidate = Math.max(
        minCandidate,
        Math.min(MAX_WIDTH, Math.max(paddedSingleLine, paddedLongestWord, MIN_WIDTH)),
      );

      let low = minCandidate;
      let high = maxCandidate;
      let best = maxCandidate;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        element.style.width = `${mid}px`;
        const height = element.scrollHeight;
        if (height <= maxHeight) {
          best = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }

      const finalWidth = Math.min(
        MAX_WIDTH,
        Math.max(best, paddedLongestWord, MIN_WIDTH),
      );
      return Math.round(finalWidth);
    };
  })();

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
  let energySubnavShowDebounce = null;

  const MAP_SEVERITY_COLORS = {
    low: paletteColor('green'),
    medium: paletteColor('blueDeep'),
    high: paletteColor('orange1'),
    critical: paletteColor('red'),
  };

  const measureElementWidth = (element) => {
    if (!element) return 0;
    const rect = typeof element.getBoundingClientRect === 'function'
      ? element.getBoundingClientRect()
      : null;
    const candidates = [
      rect && Number.isFinite(rect.width) ? rect.width : 0,
      typeof element.offsetWidth === 'number' && Number.isFinite(element.offsetWidth) ? element.offsetWidth : 0,
      typeof element.scrollWidth === 'number' && Number.isFinite(element.scrollWidth) ? element.scrollWidth : 0,
    ];
    return candidates.reduce((max, value) => (Number.isFinite(value) && value > max ? value : max), 0);
  };

  const MAP_CARD_STATE = new WeakMap();
  let MAP_DOMAIN_CACHE = null;
  const TOUCH_ACTION_OVERRIDES = new WeakMap();

  const lockTouchAction = (element, value = 'none') => {
    if (!element) return;
    if (!TOUCH_ACTION_OVERRIDES.has(element)) {
      const previous = element.style?.touchAction || '';
      TOUCH_ACTION_OVERRIDES.set(element, previous || null);
    }
    try {
      element.style.touchAction = value;
    } catch (err) {
      /* noop */
    }
  };

  const unlockTouchAction = (element) => {
    if (!element || !TOUCH_ACTION_OVERRIDES.has(element)) return;
    const previous = TOUCH_ACTION_OVERRIDES.get(element);
    TOUCH_ACTION_OVERRIDES.delete(element);
    try {
      if (previous === null || previous === '') {
        element.style.removeProperty('touch-action');
      } else {
        element.style.touchAction = previous;
      }
    } catch (err) {
      /* noop */
    }
  };

  const getGlobalTouchActionTargets = () => {
    const targets = new Set();
    const scrollingEl = document.scrollingElement;
    if (scrollingEl instanceof HTMLElement) {
      targets.add(scrollingEl);
    }
    const docEl = document.documentElement;
    if (docEl instanceof HTMLElement) {
      targets.add(docEl);
    }
    const body = document.body;
    if (body instanceof HTMLElement) {
      targets.add(body);
    }
    return Array.from(targets);
  };

  const lockGlobalTouchAction = () => {
    const targets = getGlobalTouchActionTargets();
    targets.forEach(target => lockTouchAction(target));
    return targets;
  };

  const unlockGlobalTouchAction = (targets) => {
    if (!targets || typeof targets[Symbol.iterator] !== 'function') return;
    Array.from(targets).forEach(target => unlockTouchAction(target));
  };

  const ensureMapFrame = (card) => {
    if (!card || !(card instanceof HTMLElement)) return null;
    let state = MAP_CARD_STATE.get(card) || null;
    const viewport = card.querySelector('[data-leaflet-map]');
    if (!viewport) return state;
    const canvas = card.querySelector('.map-canvas');

    if (!state) {
      state = {
        viewport,
        canvas: canvas || null,
        controls: null,
        map: null,
        markersLayer: null,
        tileLayer: null,
      };
    } else {
      state.viewport = viewport;
      state.canvas = canvas || null;
    }

    if (!state.controls && state.canvas) {
      let controls = state.canvas.querySelector('.map-controls');
      if (!controls) {
        controls = document.createElement('div');
        controls.className = 'map-controls';

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.type = 'button';
        zoomOutBtn.className = 'map-controls__btn map-controls__btn--out';
        zoomOutBtn.setAttribute('aria-label', 'Dézoomer la carte');
        zoomOutBtn.textContent = '−';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.type = 'button';
        zoomInBtn.className = 'map-controls__btn map-controls__btn--in';
        zoomInBtn.setAttribute('aria-label', 'Zoomer la carte');
        zoomInBtn.textContent = '+';

        controls.append(zoomOutBtn, zoomInBtn);
        state.canvas.appendChild(controls);
      }
      state.controls = controls;
    }

    if (!state.map && typeof L !== 'undefined') {
      viewport.innerHTML = '';
      const mapInstance = L.map(viewport, {
        zoomControl: false,
        attributionControl: true,
      });
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        minZoom: 2,
        attribution: '&copy; OpenStreetMap contributeurs',
        crossOrigin: true,
      });
      tileLayer.addTo(mapInstance);
      const markersLayer = L.layerGroup().addTo(mapInstance);
      const defaultCenter = getDefaultMapLatLng();
      mapInstance.setView([defaultCenter.lat, defaultCenter.lng], 6);
      state.map = mapInstance;
      state.tileLayer = tileLayer;
      state.markersLayer = markersLayer;
      requestAnimationFrame(() => {
        mapInstance.invalidateSize();
      });
    }

    if (state.controls && state.map && state.controls.dataset.boundZoom !== 'leaflet') {
      const zoomInBtn = state.controls.querySelector('.map-controls__btn--in');
      const zoomOutBtn = state.controls.querySelector('.map-controls__btn--out');
      if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
          state.map.zoomIn();
        });
      }
      if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
          state.map.zoomOut();
        });
      }
      state.controls.dataset.boundZoom = 'leaflet';
    }

    MAP_CARD_STATE.set(card, state);
    return state;
  };

  const computeGlobalMapDomain = () => {
    const buildings = ENERGY_BASE_DATA.buildings || {};
    const latLngPoints = [];
    const cartPoints = [];

    Object.values(buildings).forEach((info) => {
      const position = info?.position || {};
      const lat = Number(position.lat);
      const lng = Number(position.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        latLngPoints.push({ lat, lng });
      }
      const x = Number(position.x);
      const y = Number(position.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        cartPoints.push({ x, y });
      }
    });

    if (latLngPoints.length >= 1) {
      const lats = latLngPoints.map(point => point.lat);
      const lngs = latLngPoints.map(point => point.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const spanLat = Math.max(maxLat - minLat, 0.0001);
      const spanLng = Math.max(maxLng - minLng, 0.0001);
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const centerX = ((centerLng - minLng) / spanLng) * 100;
      const centerY = 100 - ((centerLat - minLat) / spanLat) * 100;
      return {
        type: 'geo',
        minLat,
        maxLat,
        minLng,
        maxLng,
        spanLat,
        spanLng,
        centerX: Number.isFinite(centerX) ? centerX : 50,
        centerY: Number.isFinite(centerY) ? centerY : 50,
      };
    }

    if (cartPoints.length >= 1) {
      const xs = cartPoints.map(point => point.x);
      const ys = cartPoints.map(point => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(maxX - minX, 0.0001);
      const spanY = Math.max(maxY - minY, 0.0001);
      const centerX = ((minX + maxX) / 2 - minX) / spanX * 100;
      const centerY = ((minY + maxY) / 2 - minY) / spanY * 100;
      return {
        type: 'cartesian',
        minX,
        maxX,
        minY,
        maxY,
        spanX,
        spanY,
        centerX: Number.isFinite(centerX) ? centerX : 50,
        centerY: Number.isFinite(centerY) ? centerY : 50,
      };
    }

    return null;
  };

  const getGlobalMapDomain = () => {
    if (MAP_DOMAIN_CACHE) return MAP_DOMAIN_CACHE;
    MAP_DOMAIN_CACHE = computeGlobalMapDomain();
    return MAP_DOMAIN_CACHE;
  };

  const getDefaultMapLatLng = () => {
    const domain = getGlobalMapDomain();
    if (domain && domain.type === 'geo') {
      const lat = (Number(domain.minLat) + Number(domain.maxLat)) / 2;
      const lng = (Number(domain.minLng) + Number(domain.maxLng)) / 2;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    return { lat: 46.8182, lng: 8.2275 };
  };

  const escapeHtml = (value) => {
    if (value == null) return '';
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case '\u0027':
          return '&#39;';
        default:
          return char;
      }
    });
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

  function updateEnergySubnavVisibility(immediate = false) {
    if (!energySubnav) return;
    const shouldShow = energySubnavEnabled && !energySubnavSentinelVisible;

    if (shouldShow) {
      // Annule tout timer de masquage en cours
      if (energySubnavHideTimer) {
        clearTimeout(energySubnavHideTimer);
        energySubnavHideTimer = null;
      }
      if (energySubnavShowDebounce) {
        clearTimeout(energySubnavShowDebounce);
        energySubnavShowDebounce = null;
      }
      energySubnav.setAttribute('aria-hidden', 'false');
      energySubnav.hidden = false;
      requestAnimationFrame(() => energySubnav.classList.add('is-visible'));
    } else {
      // Debounce pour éviter le clignotement lors du scroll rapide
      if (energySubnavShowDebounce) {
        clearTimeout(energySubnavShowDebounce);
      }
      const hideDelay = immediate ? 0 : 120;
      energySubnavShowDebounce = setTimeout(() => {
        energySubnavShowDebounce = null;
        energySubnav.setAttribute('aria-hidden', 'true');
        energySubnav.classList.remove('is-visible');
        // Délai court pour laisser la transition CSS se terminer
        if (energySubnavHideTimer) clearTimeout(energySubnavHideTimer);
        energySubnavHideTimer = window.setTimeout(() => {
          energySubnav.hidden = true;
          energySubnavHideTimer = null;
        }, 280);
      }, hideDelay);
    }
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
    'general-pareto': { width: 'full', height: 'tall' },
    'heat-pareto': { width: 'full', height: 'tall' },
    'cold-pareto': { width: 'full', height: 'tall' },
    'elec-pareto': { width: 'full', height: 'tall' },
    'co2-pareto': { width: 'full', height: 'tall' },
    'water-pareto': { width: 'full', height: 'tall' },
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
    'general-pareto': { width: 'full', height: 'tall' },
    'heat-pareto': { width: 'full', height: 'tall' },
    'cold-pareto': { width: 'full', height: 'tall' },
    'elec-pareto': { width: 'full', height: 'tall' },
    'co2-pareto': { width: 'full', height: 'tall' },
    'water-pareto': { width: 'full', height: 'tall' },
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
    const { tile, placeholder, handle, pointerId, originStack, originNext, touchActionTargets } = chartTileDragState;

    window.removeEventListener('pointermove', onChartTilePointerMove);
    window.removeEventListener('pointerup', onChartTilePointerUp);
    window.removeEventListener('pointercancel', onChartTilePointerCancel);

    if (handle?.hasPointerCapture?.(pointerId)) {
      try { handle.releasePointerCapture(pointerId); } catch (err) { /* noop */ }
    }

    document.body.classList.remove('chart-tiles-dragging');

    unlockGlobalTouchAction(touchActionTargets);

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
    event.preventDefault();
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

    const pointerType = event.pointerType || '';
    const touchActionTargets = new Set();
    if (pointerType === 'touch') {
      lockTouchAction(handle);
      touchActionTargets.add(handle);
      lockGlobalTouchAction().forEach(target => touchActionTargets.add(target));
    }

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
      pointerType,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originStack: stack,
      originNext,
      touchActionTargets,
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

    window.addEventListener('pointermove', onChartTilePointerMove, { passive: false });
    window.addEventListener('pointerup', onChartTilePointerUp, { passive: false });
    window.addEventListener('pointercancel', onChartTilePointerCancel, { passive: false });
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
        <span class="chart-tile-handle__icon" aria-hidden="true">
          <span class="chart-tile-handle__dot"></span>
          <span class="chart-tile-handle__dot"></span>
          <span class="chart-tile-handle__dot"></span>
          <span class="chart-tile-handle__dot"></span>
          <span class="chart-tile-handle__dot"></span>
          <span class="chart-tile-handle__dot"></span>
        </span>
      `;
      slot.append(handle);
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
      general: { intensity: 196, decimals: 0, totalDecimals: 0 },
      chaleur: { intensity: 118, decimals: 0, totalDecimals: 0 },
      froid: { intensity: 13, decimals: 0, totalDecimals: 0 },
      elec: { intensity: 78, decimals: 0, totalDecimals: 0 },
      co2: { intensity: 26, decimals: 0, totalDecimals: 0 },
      eau: { intensity: 1.45, decimals: 2, totalDecimals: 0 },
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
      habitat_collectif: { label: 'Habitat collectif' },
      habitat_individuel: { label: 'Habitat individuel' },
      administration: { label: 'Administration' },
      ecoles: { label: 'Écoles' },
      commerce: { label: 'Commerce' },
      restauration: { label: 'Restauration' },
      lieux_rassemblement: { label: 'Lieux de rassemblement' },
      hopitaux: { label: 'Hôpitaux' },
      industrie: { label: 'Industrie' },
      depots: { label: 'Dépôts' },
      installations_sportives: { label: 'Installations sportives' },
      piscines_couvertes: { label: 'Piscines couvertes' },
      autre: { label: 'Autre' },
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
    MAP_DOMAIN_CACHE = null;

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

      const typology = (info.typology ?? '').toString().trim();
      if (typology) {
        leaf.dataset.typology = typology;
      } else {
        delete leaf.dataset.typology;
      }

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

  const MISSING_METRIC_MESSAGES = {
    general: 'Consommation énergétique indisponible sur les SI',
    chaleur: 'Consommation de chaleur indisponible sur les SI',
    froid: 'Consommation de froid indisponible sur les SI',
    elec: 'Consommation électrique indisponible sur les SI',
    co2: 'Émissions CO₂ indisponibles sur les SI',
    eau: 'Consommation d’eau indisponible sur les SI',
  };

  const stopTreeLeafInfoPropagation = (event) => {
    event.stopPropagation();
    if (event.type === 'mousedown' || event.type === 'mouseup') {
      event.preventDefault();
    }
  };

  const missingInfoRegistry = new WeakMap();
  let openMissingInfoState = null;
  let missingInfoListenersReady = false;
  let missingInfoIdCounter = 0;

  const positionMissingInfoPopover = (state) => {
    if (!state || !state.popover || !state.icon) return;
    const rect = state.icon.getBoundingClientRect();
    const top = rect.top + rect.height / 2;
    const left = rect.right + 14;
    state.popover.style.top = `${top}px`;
    state.popover.style.left = `${left}px`;
  };

  const updateOpenMissingInfoPosition = () => {
    if (!openMissingInfoState) return;
    positionMissingInfoPopover(openMissingInfoState);
  };

  const closeMissingInfoPopover = (state) => {
    if (!state) return;
    const { popover, icon } = state;
    if (!popover || !icon) return;
    popover.classList.remove('is-visible');
    popover.setAttribute('aria-hidden', 'true');
    popover.hidden = true;
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    icon.setAttribute('aria-expanded', 'false');
    if (openMissingInfoState === state) {
      openMissingInfoState = null;
    }
  };

  const handleMissingInfoOutsideClick = (event) => {
    if (!openMissingInfoState) return;
    const { icon, popover } = openMissingInfoState;
    if (!icon || !popover) return;
    if (icon.contains(event.target) || popover.contains(event.target)) {
      return;
    }
    closeMissingInfoPopover(openMissingInfoState);
  };

  const handleMissingInfoEscape = (event) => {
    if (event.key !== 'Escape' || !openMissingInfoState) return;
    const { icon } = openMissingInfoState;
    closeMissingInfoPopover(openMissingInfoState);
    if (icon && typeof icon.focus === 'function') {
      icon.focus();
    }
  };

  const ensureMissingInfoListeners = () => {
    if (missingInfoListenersReady) return;
    document.addEventListener('click', handleMissingInfoOutsideClick);
    document.addEventListener('keydown', handleMissingInfoEscape);
    window.addEventListener('resize', updateOpenMissingInfoPosition);
    window.addEventListener('scroll', updateOpenMissingInfoPosition, true);
    missingInfoListenersReady = true;
  };

  const handleMissingInfoToggle = (event) => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const icon = event.currentTarget;
    const state = missingInfoRegistry.get(icon);
    if (!state || !state.popover) return;

    const isOpen = state.popover.classList.contains('is-visible');
    if (isOpen) {
      closeMissingInfoPopover(state);
      return;
    }

    ensureMissingInfoListeners();
    if (openMissingInfoState && openMissingInfoState !== state) {
      closeMissingInfoPopover(openMissingInfoState);
    }

    positionMissingInfoPopover(state);
    state.popover.hidden = false;
    state.popover.classList.add('is-visible');
    state.popover.setAttribute('aria-hidden', 'false');
    icon.setAttribute('aria-expanded', 'true');
    openMissingInfoState = state;
  };

  const buildMissingReasonMessage = (missingSet, metricsToCheck) => {
    if (!missingSet || !missingSet.size) return '';
    const keys = Array.isArray(metricsToCheck) && metricsToCheck.length
      ? metricsToCheck.filter((metric) => missingSet.has(metric))
      : Array.from(missingSet);
    if (!keys.length) return '';
    const messages = keys.map((key) => MISSING_METRIC_MESSAGES[key] || `Données ${key} indisponibles`);
    return messages.join('\n');
  };

  const syncTreeLeafMissingInfo = (leaf, message) => {
    if (!leaf || !(leaf instanceof HTMLElement)) return;
    const existing = leaf.querySelector('.tree-leaf__missing-info');
    if (!message) {
      if (existing) {
        const state = missingInfoRegistry.get(existing);
        if (state) {
          closeMissingInfoPopover(state);
          if (state.popover && state.popover.parentElement) {
            state.popover.remove();
          }
          missingInfoRegistry.delete(existing);
        }
        existing.remove();
      }
      leaf.removeAttribute('data-missing-reason');
      return;
    }

    let icon = existing;
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'tree-leaf__missing-info';
      icon.setAttribute('role', 'button');
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-expanded', 'false');
      icon.setAttribute('aria-label', 'Afficher les informations manquantes');
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
          <line x1="12" y1="8" x2="12" y2="8" stroke="currentColor" stroke-linecap="round" stroke-width="2.2" />
          <line x1="12" y1="11" x2="12" y2="16" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
        </svg>
      `;
      ['mousedown', 'mouseup', 'touchstart', 'touchend'].forEach((type) => {
        icon.addEventListener(type, stopTreeLeafInfoPropagation);
      });
      icon.addEventListener('click', handleMissingInfoToggle);
      icon.addEventListener('keydown', handleMissingInfoToggle);
    }

    let state = missingInfoRegistry.get(icon);
    if (!state) {
      const popover = document.createElement('div');
      popover.className = 'tree-leaf__missing-popover';
      popover.setAttribute('role', 'status');
      popover.setAttribute('aria-live', 'polite');
      popover.setAttribute('aria-hidden', 'true');
      popover.hidden = true;
      const popoverId = `missing-info-${++missingInfoIdCounter}`;
      popover.id = popoverId;
      icon.setAttribute('aria-controls', popoverId);
      state = { icon, popover };
      missingInfoRegistry.set(icon, state);
    }

    if (state.popover && document.body && state.popover.parentElement !== document.body) {
      document.body.append(state.popover);
    }

    const lines = message.split('\n').filter((line) => line.trim().length);
    if (state.popover) {
      if (!lines.length) {
        state.popover.textContent = message;
      } else {
        const fragment = document.createDocumentFragment();
        lines.forEach((line) => {
          const div = document.createElement('div');
          div.className = 'tree-leaf__missing-popover-line';
          div.textContent = line;
          fragment.appendChild(div);
        });
        state.popover.replaceChildren(fragment);
      }
      const isOpen = state.popover.classList.contains('is-visible');
      state.popover.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      state.popover.hidden = !isOpen;
    }

    leaf.setAttribute('data-missing-reason', message);
    leaf.append(icon);
    if (state.popover && document.body && state.popover.parentElement !== document.body) {
      document.body.append(state.popover);
    }
    icon.setAttribute('aria-expanded', state.popover?.classList.contains('is-visible') ? 'true' : 'false');
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
      const flagged = shouldFlag(missingSet);
      leaf.classList.toggle('is-missing', flagged);
      const message = flagged ? buildMissingReasonMessage(missingSet, metricsToCheck) : '';
      syncTreeLeafMissingInfo(leaf, message);
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

  const computeParetoScaleTicks = (maxValue, intervals = 4) => {
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
      return { max: 0, step: 0, ticks: [0] };
    }
    const safeIntervals = Math.max(1, Math.round(intervals));
    const safeMax = Math.abs(maxValue);

    const niceFractions = [1, 1.2, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 8, 10];
    const computeStep = (intervalCount) => {
      if (!Number.isFinite(intervalCount) || intervalCount <= 0) return 0;
      const rawStep = safeMax / intervalCount;
      if (!Number.isFinite(rawStep) || rawStep <= 0) return 0;
      const exponent = Math.floor(Math.log10(rawStep));
      const magnitude = 10 ** exponent;
      const fraction = rawStep / magnitude;
      let selected = niceFractions[niceFractions.length - 1];
      for (let i = 0; i < niceFractions.length; i += 1) {
        if (fraction <= niceFractions[i] + 1e-9) {
          selected = niceFractions[i];
          break;
        }
      }
      return magnitude * selected;
    };

    const candidateIntervals = new Set([
      safeIntervals,
      safeIntervals + 1,
      safeIntervals - 1,
      safeIntervals + 2,
    ]);

    const evaluated = [];
    candidateIntervals.forEach((candidate) => {
      if (!Number.isFinite(candidate) || candidate <= 0) return;
      const step = computeStep(candidate);
      if (!Number.isFinite(step) || step <= 0) return;
      const scaleMax = step * candidate;
      if (!Number.isFinite(scaleMax) || scaleMax <= 0) return;
      const overshootRatio = Math.max(0, scaleMax - safeMax) / (safeMax || 1);
      evaluated.push({
        intervals: Math.round(candidate),
        step,
        scaleMax,
        overshootRatio,
        intervalDistance: Math.abs(Math.round(candidate) - safeIntervals),
      });
    });

    if (!evaluated.length) {
      const fallbackStep = safeMax / safeIntervals;
      const ticks = [];
      for (let i = 0; i <= safeIntervals; i += 1) {
        ticks.push(Number.parseFloat((fallbackStep * i).toFixed(6)));
      }
      return {
        max: Number.parseFloat((fallbackStep * safeIntervals).toFixed(6)),
        step: fallbackStep,
        ticks,
      };
    }

    evaluated.sort((a, b) => {
      if (Math.abs(a.overshootRatio - b.overshootRatio) > 1e-9) {
        return a.overshootRatio - b.overshootRatio;
      }
      if (a.intervalDistance !== b.intervalDistance) {
        return a.intervalDistance - b.intervalDistance;
      }
      if (a.scaleMax !== b.scaleMax) {
        return a.scaleMax - b.scaleMax;
      }
      return a.intervals - b.intervals;
    });

    const best = evaluated[0];
    const intervalCount = Math.max(1, best?.intervals || safeIntervals);
    const step = Number.isFinite(best?.step) && best.step > 0 ? best.step : safeMax / intervalCount;
    const ticks = [];
    for (let i = 0; i <= intervalCount; i += 1) {
      ticks.push(Number.parseFloat((step * i).toFixed(6)));
    }

    const maxTick = ticks[ticks.length - 1] || 0;
    return { max: Number.isFinite(maxTick) ? maxTick : safeMax, step, ticks };
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

    if (panel.parentElement !== document.body) {
      document.body.append(panel);
    }

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
    const scopeByGroup = new Map();
    const scopeByType = new Map();
    const closeButton = panel.querySelector('.catalog-close');

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const LONG_PRESS_DELAY = 480;
    const LONG_PRESS_MOVE_TOLERANCE = 12;
    const CATALOG_PLACEHOLDER_MIN_HEIGHT = 220;
    let isOpen = false;
    let restoreFocusAfterClose = false;
    let activeToggle = null;
    let focusTargetOnClose = null;
    let activeSlot = null;
    let activeZone = null;
    let selectedSlot = null;
    let pendingLongPress = null;
    let dragState = null;

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
        registerSlotScope(slot);
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

    function getSlotGroup(slotEl) {
      return slotEl?.dataset.chartGroup || slotEl?.dataset.chartSlot || null;
    }

    function getSlotScope(slotEl) {
      return slotEl?.dataset.chartScope || slotEl?.dataset.chartMetric || null;
    }

    function registerScopeEntry(map, key, scope) {
      if (!map || !key || !scope) return;
      const existing = map.get(key);
      if (existing) {
        existing.add(scope);
      } else {
        map.set(key, new Set([scope]));
      }
    }

    function registerSlotScope(slotEl) {
      if (!slotEl || !(slotEl instanceof HTMLElement)) return;
      const scope = getSlotScope(slotEl);
      if (!scope) return;
      const group = slotEl.dataset.chartGroup || null;
      const type = slotEl.dataset.chartType || null;
      registerScopeEntry(scopeByGroup, group, scope);
      registerScopeEntry(scopeByType, type, scope);
    }

    const inferScopeFromKey = (value) => {
      if (!value) return null;
      const normalized = String(value).toLowerCase();
      if (normalized.includes('water') || normalized.includes('eau')) return 'eau';
      if (normalized.includes('heat') || normalized.includes('chaleur')) return 'chaleur';
      if (normalized.includes('cold') || normalized.includes('froid')) return 'froid';
      if (normalized.includes('elec')) return 'elec';
      if (normalized.includes('co2')) return 'co2';
      if (normalized.includes('energy') || normalized.includes('mix') || normalized.includes('typology') || normalized.includes('distribution') || normalized.includes('monthly') || normalized.includes('intensity')) {
        return 'general';
      }
      return null;
    };

    const getCardScopes = (card) => {
      if (!card) return [];
      const scopes = new Set();
      const attr = card.dataset.chartScope;
      if (attr) {
        attr.split(/\s+/).forEach(token => {
          const normalized = token.trim();
          if (normalized) scopes.add(normalized);
        });
      }
      const group = card.dataset.chartGroup || null;
      if (group && scopeByGroup.has(group)) {
        scopeByGroup.get(group).forEach(scope => scopes.add(scope));
      }
      const type = card.dataset.chartType || null;
      if (type && scopeByType.has(type)) {
        scopeByType.get(type).forEach(scope => scopes.add(scope));
      }
      if (!scopes.size) {
        const fallback = inferScopeFromKey(group || type || attr || '');
        if (fallback) scopes.add(fallback);
      }
      return Array.from(scopes);
    };

    const shouldShowCardForScope = (card, scope) => {
      if (!scope) return true;
      const scopes = getCardScopes(card);
      if (!scopes.length) {
        return scope === 'general';
      }
      return scopes.includes(scope);
    };

    const getZoneForSlot = (slotEl) => {
      if (slotEl && typeof slotEl.closest === 'function') {
        const zone = slotEl.closest(zoneSelector);
        if (zone) return zone;
      }
      if (activeZone && document.contains(activeZone)) {
        return activeZone;
      }
      return null;
    };

    const getZoneChartTypes = (zoneEl) => {
      const types = new Set();
      if (!zoneEl) return types;
      getSlots(zoneEl).forEach(slot => {
        const type = slot?.dataset?.chartType;
        if (type) types.add(type);
      });
      return types;
    };

    const updateCardVisibility = (slotEl = activeSlot) => {
      const scope = getSlotScope(slotEl);
      const zoneEl = getZoneForSlot(slotEl);
      const usedTypes = getZoneChartTypes(zoneEl);
      cards.forEach(card => {
        const container = getCardContainer(card);
        if (!container) return;
        const type = card.dataset.chartType || '';
        const visible = shouldShowCardForScope(card, scope) && (!type || !usedTypes.has(type));
        container.hidden = !visible;
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
      updateCardVisibility(slotEl || activeSlot);
      markActiveCard(slotEl);
    };

    const getActiveZone = () => {
      if (activeZone) return activeZone;
      const fallbackZone = panel.closest('.energy-chart-zone');
      return fallbackZone || null;
    };

    const ensurePanelWithinZone = () => {
      if (panel.parentElement !== document.body) {
        document.body.append(panel);
      }
    };

    const clearZoneState = () => {
      const zoneEl = getActiveZone();
      if (zoneEl) zoneEl.classList.remove('catalog-open');
    };

    const cloneSlotForCard = (card, options = {}) => {
      const { zone: zoneOverride = null, reference: referenceNode = null } = options;
      const zoneEl = zoneOverride || getActiveZone();
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
      const insertionReference = (referenceNode && referenceNode.parentNode === host) ? referenceNode : null;
      host.insertBefore(slot, insertionReference);
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
      registerSlotScope(slot);
      applyTileLayout(slot);
      if (chartType === 'intensity-bars') {
        highlightEnergyTrend(FILTERS.year);
      }
      updateEnergyVisuals();
      return true;
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
      if (event.target !== panel || event.propertyName !== 'transform') return;
      panel.removeEventListener('transitionend', handleTransitionEnd);
      if (isOpen) return;
      panel.hidden = true;
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

    function cancelPendingLongPress() {
      const state = pendingLongPress;
      if (!state) return;
      pendingLongPress = null;
      clearTimeout(state.timer);
      const { card, pointerId, pointerType, lockedTargets } = state;
      if (!state.triggered) {
        if (card && typeof card.releasePointerCapture === 'function') {
          try { card.releasePointerCapture(pointerId); } catch (err) { /* noop */ }
        }
        if (lockedTargets) {
          lockedTargets.forEach(target => unlockTouchAction(target));
        }
        if (pointerType === 'touch' && lockedTargets && !lockedTargets.has(card)) {
          unlockTouchAction(card);
        }
      } else if (!dragState || dragState.card !== card) {
        if (lockedTargets) {
          lockedTargets.forEach(target => unlockTouchAction(target));
        }
      }
    }

    function activatePendingDrag(state) {
      if (!state || state.triggered) return;
      state.triggered = true;
      clearTimeout(state.timer);
      if (pendingLongPress === state) {
        pendingLongPress = null;
      }
      const { card, pointerId, lockedTargets } = state;
      if (!card) return;
      card.dataset.longPressActive = 'true';
      if (card && typeof card.releasePointerCapture === 'function') {
        try { card.releasePointerCapture(pointerId); } catch (err) { /* noop */ }
      }
      const started = startChartDrag(card, state.latestEvent, lockedTargets);
      if (!started && lockedTargets) {
        lockedTargets.forEach(target => unlockTouchAction(target));
      }
    }

    function getPlaceholderHost(zoneEl) {
      if (!zoneEl) return null;
      return zoneEl.querySelector('.energy-chart-stack') || zoneEl;
    }

    function clearPlaceholderVisualState(placeholder) {
      if (!placeholder) return;
      placeholder.classList.remove('is-drop-target-placeholder');
      placeholder.removeAttribute('data-drop-position');
    }

    function resetPlaceholderLayoutAttributes(placeholder) {
      if (!placeholder) return;
      placeholder.removeAttribute('data-tile-width');
      placeholder.removeAttribute('data-tile-height');
      if (placeholder.style && typeof placeholder.style.removeProperty === 'function') {
        placeholder.style.removeProperty('--tile-equal-height');
      }
    }

    function applyPlaceholderLayoutFromSlot(slotEl, placeholder) {
      if (!placeholder) return;
      resetPlaceholderLayoutAttributes(placeholder);
      if (!slotEl) return;
      if (slotEl.hasAttribute('data-tile-width')) {
        placeholder.setAttribute('data-tile-width', slotEl.getAttribute('data-tile-width'));
      }
      if (slotEl.hasAttribute('data-tile-height')) {
        placeholder.setAttribute('data-tile-height', slotEl.getAttribute('data-tile-height'));
      }
      if (slotEl.style && typeof slotEl.style.getPropertyValue === 'function') {
        const equalHeight = slotEl.style.getPropertyValue('--tile-equal-height');
        if (equalHeight) {
          placeholder.style.setProperty('--tile-equal-height', equalHeight);
        }
      }
    }

    function removeDragPlaceholder() {
      if (!dragState) return;
      const { placeholder } = dragState;
      if (placeholder) {
        clearPlaceholderVisualState(placeholder);
        resetPlaceholderLayoutAttributes(placeholder);
      }
      if (placeholder?.parentNode) {
        placeholder.remove();
      }
      dragState.placeholderZone = null;
      dragState.placeholderHost = null;
    }

    function ensureDragPlaceholder(zoneEl) {
      if (!dragState || !zoneEl) return null;
      const host = getPlaceholderHost(zoneEl);
      if (!host) return null;
      let { placeholder } = dragState;
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = `${TILE_PLACEHOLDER_CLASS} chart-catalog-drop-placeholder`;
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.dataset.catalogPlaceholder = 'true';
        dragState.placeholder = placeholder;
      }
      clearPlaceholderVisualState(placeholder);
      resetPlaceholderLayoutAttributes(placeholder);
      if (placeholder.parentNode !== host) {
        placeholder.remove();
        host.appendChild(placeholder);
      }
      dragState.placeholderZone = zoneEl;
      dragState.placeholderHost = host;
      return placeholder;
    }

    function updatePlaceholderSize(referenceEl, zoneEl) {
      if (!dragState?.placeholder) return;
      const placeholder = dragState.placeholder;
      let rect = null;
      if (referenceEl?.getBoundingClientRect) {
        rect = referenceEl.getBoundingClientRect();
      }
      if (!rect) {
        const sample = zoneEl?.querySelector(slotSelector) || document.querySelector(slotSelector);
        if (sample && sample !== referenceEl && sample.getBoundingClientRect) {
          rect = sample.getBoundingClientRect();
        }
      }
      if (rect && Number.isFinite(rect.height)) {
        placeholder.style.height = `${rect.height}px`;
        if (Number.isFinite(rect.width)) {
          placeholder.style.width = `${rect.width}px`;
        } else {
          placeholder.style.removeProperty('width');
        }
        dragState.placeholderSize = { height: rect.height, width: rect.width };
      } else {
        const fallbackHeight = dragState.placeholderSize?.height;
        const fallbackWidth = dragState.placeholderSize?.width;
        placeholder.style.height = `${Number.isFinite(fallbackHeight) ? fallbackHeight : CATALOG_PLACEHOLDER_MIN_HEIGHT}px`;
        if (Number.isFinite(fallbackWidth)) {
          placeholder.style.width = `${fallbackWidth}px`;
        } else {
          placeholder.style.removeProperty('width');
        }
      }
    }

    function syncDragPlaceholder(zoneEl, slotEl, before) {
      if (!dragState) return null;
      if (!zoneEl) {
        removeDragPlaceholder();
        return null;
      }
      const placeholder = ensureDragPlaceholder(zoneEl);
      if (!placeholder) return null;
      applyPlaceholderLayoutFromSlot(slotEl, placeholder);
      updatePlaceholderSize(slotEl, zoneEl);
      const host = dragState.placeholderHost;
      if (!host) return placeholder;
      let referenceNode = null;
      if (slotEl && host.contains(slotEl)) {
        const insertBefore = typeof before === 'boolean' ? before : true;
        referenceNode = insertBefore ? slotEl : slotEl.nextElementSibling;
      }
      host.insertBefore(placeholder, referenceNode || null);
      return placeholder;
    }

    function clearDragHover() {
      if (dragState?.hoverSlot) {
        const slot = dragState.hoverSlot;
        slot.removeAttribute('data-drop-position');
        dragState.hoverSlot = null;
      }
      if (dragState?.hoverZone) {
        dragState.hoverZone.classList.remove('is-drop-target-zone');
        dragState.hoverZone = null;
      }
      if (dragState) {
        dragState.hoverBefore = null;
        clearPlaceholderVisualState(dragState.placeholder);
        removeDragPlaceholder();
      }
    }

    function getDropInfo(clientX, clientY) {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return { element: null, zone: null, slot: null, before: null };
      }
      const ghost = dragState?.ghost || null;
      let element = null;
      if (ghost) {
        const previousVisibility = ghost.style.visibility;
        ghost.style.visibility = 'hidden';
        element = document.elementFromPoint(clientX, clientY);
        ghost.style.visibility = previousVisibility;
      } else {
        element = document.elementFromPoint(clientX, clientY);
      }
      const slot = element?.closest?.(slotSelector) || null;
      const zone = slot ? slot.closest(zoneSelector) : element?.closest?.(zoneSelector) || null;
      let before = null;
      if (slot) {
        const rect = slot.getBoundingClientRect();
        if (rect && Number.isFinite(rect.top) && Number.isFinite(rect.left)) {
          const useHorizontal = rect.width > rect.height;
          if (useHorizontal) {
            const midpoint = rect.left + (rect.width / 2);
            before = clientX < midpoint;
          } else {
            const midpoint = rect.top + (rect.height / 2);
            before = clientY < midpoint;
          }
        }
      }
      return { element, zone, slot, before };
    }

    function updateDragPosition(clientX, clientY) {
      if (!dragState || !dragState.ghost) return;
      const x = clientX - (dragState.offsetX || 0);
      const y = clientY - (dragState.offsetY || 0);
      dragState.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    function updateDragHover(clientX, clientY) {
      if (!dragState) return;
      const info = getDropInfo(clientX, clientY);
      if (!info.zone) {
        removeDragPlaceholder();
      } else if (dragState.placeholderZone && dragState.placeholderZone !== info.zone) {
        removeDragPlaceholder();
      }
      if (dragState.hoverSlot && dragState.hoverSlot !== info.slot) {
        dragState.hoverSlot.removeAttribute('data-drop-position');
      }
      if (dragState.hoverZone && dragState.hoverZone !== info.zone) {
        dragState.hoverZone.classList.remove('is-drop-target-zone');
      }
      dragState.hoverSlot = info.slot || null;
      dragState.hoverZone = info.zone || null;
      dragState.hoverBefore = typeof info.before === 'boolean' ? info.before : null;
      if (dragState.hoverZone) {
        dragState.hoverZone.classList.add('is-drop-target-zone');
      }
      const placeholder = syncDragPlaceholder(info.zone || null, info.slot || null, dragState.hoverBefore);
      if (placeholder) {
        placeholder.classList.add('is-drop-target-placeholder');
        if (typeof dragState.hoverBefore === 'boolean') {
          placeholder.setAttribute('data-drop-position', dragState.hoverBefore ? 'before' : 'after');
        } else if (!info.slot) {
          placeholder.setAttribute('data-drop-position', 'append');
        } else {
          placeholder.removeAttribute('data-drop-position');
        }
      }
    }

    function applyDropResult(clientX, clientY) {
      if (!dragState) return false;
      const { type, card } = dragState;
      if (!type || !card) return false;

      const info = getDropInfo(clientX, clientY);
      const slotEl = info.slot && document.contains(info.slot) ? info.slot : null;
      let zoneEl = info.zone && document.contains(info.zone) ? info.zone : null;

      if (slotEl) {
        const zoneForSlot = slotEl.closest(zoneSelector);
        if (!zoneForSlot) return false;
        activeZone = zoneForSlot;
        const body = slotEl.querySelector('[data-chart-role="body"]');
        const isSlotEmpty = (!slotEl.dataset.chartType && (!body || body.childElementCount === 0));

        if (!isSlotEmpty) {
          const referenceNode = info.before === false ? slotEl.nextElementSibling : slotEl;
          const newSlot = cloneSlotForCard(card, {
            zone: zoneForSlot,
            reference: referenceNode || null,
          });
          if (!newSlot) return false;
          activeSlot = newSlot;
          const applied = applyChartToSlot(type, newSlot);
          if (!applied) {
            newSlot.remove();
            activeSlot = ensureSelectedSlot(zoneForSlot) || null;
            return false;
          }
          requestAnimationFrame(() => {
            if (document.contains(newSlot)) {
              newSlot.focus({ preventScroll: true });
            }
          });
          return true;
        }

        selectSlot(slotEl);
        activeSlot = slotEl;
        const applied = applyChartToSlot(type, slotEl);
        if (applied) {
          requestAnimationFrame(() => {
            if (document.contains(slotEl)) {
              slotEl.focus({ preventScroll: true });
            }
          });
        }
        return applied;
      }

      if (!zoneEl) return false;

      activeZone = zoneEl;
      const reference = ensureSelectedSlot(zoneEl) || null;
      activeSlot = reference;
      const slot = cloneSlotForCard(card);
      if (!slot) return false;
      activeSlot = slot;
      const applied = applyChartToSlot(type, slot);
      if (!applied) {
        slot.remove();
        activeSlot = ensureSelectedSlot(zoneEl) || null;
        return false;
      }
      requestAnimationFrame(() => {
        if (document.contains(slot)) {
          slot.focus({ preventScroll: true });
        }
      });
      return true;
    }

    function finishDrag(event, canceled = false) {
      if (!dragState) return;
      window.removeEventListener('pointermove', onDragPointerMove);
      window.removeEventListener('pointerup', onDragPointerUp);
      window.removeEventListener('pointercancel', onDragPointerCancel);
      const { ghost, card, touchActionTargets, preventWindowTouchMove } = dragState;
      let dropSuccess = false;
      if (!canceled && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        dropSuccess = applyDropResult(event.clientX, event.clientY);
      }
      clearDragHover();
      if (ghost && ghost.parentNode) ghost.remove();
      document.body.classList.remove('chart-catalog-dragging');
      unlockGlobalTouchAction(touchActionTargets);
      if (preventWindowTouchMove) {
        window.removeEventListener('touchmove', preventWindowTouchMove, false);
      }
      if (card) delete card.dataset.longPressActive;
      dragState = null;
      return dropSuccess;
    }

    function onDragPointerMove(event) {
      if (!dragState) return;
      if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) return;
      event.preventDefault();
      updateDragPosition(event.clientX, event.clientY);
      updateDragHover(event.clientX, event.clientY);
    }

    function onDragPointerUp(event) {
      if (!dragState) return;
      if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) return;
      event.preventDefault();
      finishDrag(event, false);
    }

    function onDragPointerCancel(event) {
      if (!dragState) return;
      if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) return;
      finishDrag(event, true);
    }

    function startChartDrag(card, originEvent, lockedTargets = null) {
      if (!card) return false;
      const type = card.dataset.chartType;
      if (!type) return false;

      pendingLongPress = null;
      const rect = card.getBoundingClientRect();
      const clientX = originEvent?.clientX ?? (rect.left + rect.width / 2);
      const clientY = originEvent?.clientY ?? (rect.top + rect.height / 2);
      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;
      const pointerType = originEvent?.pointerType || '';

      const ghost = document.createElement('div');
      ghost.className = 'chart-catalog-drag-ghost';
      const preview = card.querySelector('.catalog-card__preview');
      const text = card.querySelector('.catalog-card__text');
      if (preview) ghost.append(preview.cloneNode(true));
      if (text) ghost.append(text.cloneNode(true));
      document.body.append(ghost);

      const touchActionTargets = new Set();
      if (lockedTargets && typeof lockedTargets.forEach === 'function') {
        lockedTargets.forEach(target => {
          if (!target) return;
          if (!TOUCH_ACTION_OVERRIDES.has(target)) {
            lockTouchAction(target);
          }
          touchActionTargets.add(target);
        });
      }
      if (TOUCH_ACTION_OVERRIDES.has(card)) {
        touchActionTargets.add(card);
      }
      if (pointerType === 'touch') {
        lockGlobalTouchAction().forEach(target => touchActionTargets.add(target));
      }

      const preventWindowTouchMove = (evt) => {
        if (evt?.cancelable !== false) {
          evt.preventDefault();
        }
      };
      if (pointerType === 'touch') {
        window.addEventListener('touchmove', preventWindowTouchMove, { passive: false });
      }

      dragState = {
        card,
        type,
        pointerType,
        pointerId: originEvent?.pointerId ?? null,
        ghost,
        offsetX,
        offsetY,
        hoverZone: null,
        hoverSlot: null,
        hoverBefore: null,
        placeholder: null,
        placeholderZone: null,
        placeholderHost: null,
        placeholderSize: null,
        touchActionTargets,
        preventWindowTouchMove: pointerType === 'touch' ? preventWindowTouchMove : null,
      };

      document.body.classList.add('chart-catalog-dragging');
      closePanel({ returnFocus: false });
      updateDragPosition(clientX, clientY);
      updateDragHover(clientX, clientY);

      window.addEventListener('pointermove', onDragPointerMove, { passive: false });
      window.addEventListener('pointerup', onDragPointerUp, { passive: false });
      window.addEventListener('pointercancel', onDragPointerCancel, { passive: false });
      return true;
    }

    function scheduleLongPress(card, event) {
      if (!isOpen || !card) return;
      const pointerType = event.pointerType || '';
      const isMouse = pointerType === 'mouse';
      if (isMouse && event.button !== 0 && event.buttons !== 1) return;

      cancelPendingLongPress();
      const lockedTargets = pointerType === 'touch' ? new Set() : null;
      if (pointerType === 'touch') {
        lockTouchAction(card);
        lockedTargets.add(card);
        if (panel) {
          lockTouchAction(panel);
          lockedTargets.add(panel);
        }
      }
      const pointerId = event.pointerId;
      const state = {
        card,
        pointerId,
        startX: event.clientX,
        startY: event.clientY,
        latestEvent: event,
        triggered: false,
        pointerType,
        lockedTargets,
        timer: window.setTimeout(() => {
          activatePendingDrag(state);
        }, LONG_PRESS_DELAY),
      };
      pendingLongPress = state;
      if (typeof card.setPointerCapture === 'function') {
        try { card.setPointerCapture(pointerId); } catch (err) { /* noop */ }
      }
    }

    function handleCardPointerMove(event) {
      if (!pendingLongPress || event.pointerId !== pendingLongPress.pointerId) return;
      pendingLongPress.latestEvent = event;
      if (pendingLongPress.triggered) return;
      const dx = event.clientX - pendingLongPress.startX;
      const dy = event.clientY - pendingLongPress.startY;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
        const pointerType = pendingLongPress.pointerType || '';
        if (pointerType === 'touch') {
          cancelPendingLongPress();
        } else {
          const state = pendingLongPress;
          activatePendingDrag(state);
        }
      }
    }

    function handleCardPointerEnd(event) {
      if (pendingLongPress && event.pointerId === pendingLongPress.pointerId) {
        cancelPendingLongPress();
      }
    }

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
        ensurePanelWithinZone();
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
      panel.classList.add('is-open');
      panel.scrollTop = 0;
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
      cancelPendingLongPress();
      isOpen = false;
      panel.setAttribute('aria-hidden', 'true');
      focusTargetOnClose = returnFocus ? activeToggle : null;
      setToggleState(activeToggle, false);
      panel.classList.remove('is-open');
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

    if (closeButton) {
      closeButton.addEventListener('click', () => closePanel());
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
        if (card.dataset.longPressActive === 'true') {
          event.preventDefault();
          event.stopPropagation();
          delete card.dataset.longPressActive;
          return;
        }
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

      card.addEventListener('pointerdown', (event) => scheduleLongPress(card, event));
      card.addEventListener('pointermove', handleCardPointerMove);
      card.addEventListener('pointerup', handleCardPointerEnd);
      card.addEventListener('pointercancel', handleCardPointerEnd);
      card.addEventListener('lostpointercapture', handleCardPointerEnd);
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
    // Force le sentinel comme visible car on va scroller vers le haut
    // La subnav ne doit s'afficher que quand les KPI tabs ne sont plus visibles après scroll
    energySubnavSentinelVisible = true;
    updateEnergySubnavVisibility(true); // immediate = true pour éviter le délai au changement de section
    if (energySubnavGeometryEnabled) {
      // Délai pour laisser le scroll vers le haut se faire avant de remesurer
      setTimeout(() => scheduleEnergySubnavMeasure(true), 350);
    }

    // Affiche uniquement le tabset de la section active
    const energyBlock = document.getElementById('energy-block');
    if (energyBlock) energyBlock.hidden = (name !== 'energie');

    ['general', 'etat', 'travaux', 'financier'].forEach(n => {
      const el = document.getElementById('section-' + n);
      if (el) el.hidden = (n !== name);
    });

    // Couleur
    const sectionKey = SECTION_COLOR_KEYS[name];
    const sectionColor = sectionKey ? paletteColor(sectionKey) : '#94a3b8';
    root.style.setProperty('--section-color', sectionColor);

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

  let activeTypologyFilter = null;

  function refreshActiveTypologyNodes() {
    const nodes = document.querySelectorAll('[data-typology-node]');
    nodes.forEach((node) => {
      const key = node?.dataset?.typologyKey || '';
      const isActive = !!activeTypologyFilter && key === activeTypologyFilter;
      node.classList.toggle('is-selected', isActive);
      if (isActive) {
        node.setAttribute('aria-current', 'true');
      } else {
        node.removeAttribute('aria-current');
      }
    });
  }

  function clearActiveTypologyFilter() {
    if (!activeTypologyFilter) return;
    activeTypologyFilter = null;
    refreshActiveTypologyNodes();
  }

  function updateTreeSelectionSummaryDisplay() {
    const countEl = document.getElementById('tree-search-count');
    if (!countEl) return;

    const selectedLeaves = $$('.tree-leaf .tree-check').filter(c => c.checked).length;
    const selectedFullSites = siteBtns.filter((btn) => {
      const scb = siteCheck(btn);
      return !!scb && scb.checked === true && scb.indeterminate === false;
    }).length;

    if (selectedLeaves === 0 && selectedFullSites === 0) {
      countEl.textContent = 'Aucun élément sélectionné';
      return;
    }

    const { sre } = computeSelectedPerimeter();
    const safe = Number.isFinite(sre) ? Math.round(sre) : 0;
    const formattedSre = NF.format(safe);
    countEl.textContent = `${selectedLeaves} bâtiment(s) sélectionné(s), ${selectedFullSites} site(s) entiers — ${formattedSre} m² SRE`;
  }

  function toggleTypologyFilter(typologyKey) {
    const normalizedKey = (typologyKey ?? '').toString().trim();
    if (!normalizedKey || normalizedKey === activeTypologyFilter) {
      activeTypologyFilter = null;
      checkWholeParc(true);
      const countEl = document.getElementById('tree-search-count');
      if (countEl) countEl.textContent = 'Tous les éléments';
      refreshActiveTypologyNodes();
      return;
    }

    activeTypologyFilter = normalizedKey;

    const leaves = $$('.tree-leaf[data-building]');
    leaves.forEach((leaf) => {
      const cb = leafCheck(leaf);
      const leafTypology = leaf?.dataset?.typology || 'autre';
      const matches = leafTypology === normalizedKey;
      if (cb) {
        cb.checked = matches;
        cb.indeterminate = false;
      }
      setActive(leaf, matches);
    });

    siteBtns.forEach((siteBtn) => {
      updateSiteFromLeaves(siteBtn);
    });

    updateParcFromSites();
    refreshActiveTypologyNodes();
  }

  function setupTypologyInteractiveNode(element, typologyKey) {
    if (!(element instanceof HTMLElement)) return;
    const key = (typologyKey ?? '').toString().trim();
    if (!key) return;

    element.dataset.typologyNode = '1';
    element.dataset.typologyKey = key;
    if (element.tabIndex < 0) {
      element.tabIndex = 0;
    }

    const label = element.getAttribute('aria-label');
    if (label && !label.toLowerCase().includes('filtrer')) {
      element.setAttribute('aria-label', `${label} — Cliquer pour filtrer cette typologie`);
    }

    const title = element.getAttribute('title');
    if (title && !title.toLowerCase().includes('filtrer')) {
      element.setAttribute('title', `${title} — Cliquer pour filtrer cette typologie`);
    }

    element.addEventListener('click', (event) => {
      event.preventDefault();
      toggleTypologyFilter(key);
    });

    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleTypologyFilter(key);
      }
    });

    const isActive = !!activeTypologyFilter && activeTypologyFilter === key;
    element.classList.toggle('is-selected', isActive);
    if (isActive) {
      element.setAttribute('aria-current', 'true');
    } else {
      element.removeAttribute('aria-current');
    }
  }

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
      const decimals = mode === 'kwhm2' ? (metricDef.decimals || 0) : (Number.isFinite(metricDef.totalDecimals) ? metricDef.totalDecimals : 0);

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

        let name;
        const label = entry.label || `Bâtiment ${index + 1}`;
        if (entry.id) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ranking-name ranking-name--link';
          btn.textContent = label;
          btn.dataset.buildingId = entry.id;
          btn.addEventListener('click', (event) => {
            event.preventDefault();
            const success = selectTreeLeafByBuilding(entry.id, {
              expandSite: true,
              focus: true,
              scrollIntoView: true,
            });
            if (success && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
          name = btn;
        } else {
          name = document.createElement('span');
          name.className = 'ranking-name';
          name.textContent = label;
        }
        if (!name) {
          name = document.createElement('span');
          name.className = 'ranking-name';
          name.textContent = label;
        }

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

  const updateParetoCharts = (mode, buildingSummaries = {}, options = {}) => {
    const paretoFigures = document.querySelectorAll('[data-chart-type$="pareto"]');
    if (!paretoFigures.length) return;

    const { allBuildings = null, selectedIds = [], hasExplicitSelection = false } = options || {};
    const normalizeIds = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (value instanceof Set) return Array.from(value);
      return [value];
    };
    const normalizedSelectedIds = hasExplicitSelection
      ? normalizeIds(selectedIds).map((id) => {
        if (id === undefined || id === null) return '';
        return String(id).trim();
      }).filter(Boolean)
      : [];
    const selectionSet = normalizedSelectedIds.length ? new Set(normalizedSelectedIds) : null;
    const hasSelection = hasExplicitSelection && selectionSet && selectionSet.size > 0;

    paretoFigures.forEach((figure) => {
      const scope = figure.dataset.chartScope || '';
      const metricKey = figure.dataset.chartMetric
        || (scope === 'chaleur'
          ? 'chaleur'
          : scope === 'froid'
            ? 'froid'
            : scope === 'elec'
              ? 'elec'
              : scope === 'co2'
                ? 'co2'
                : scope === 'eau'
                  ? 'eau'
                  : 'general');
      const metricDef = ENERGY_BASE_DATA.metrics[metricKey] || ENERGY_BASE_DATA.metrics.general || { decimals: 0 };
      const useIntensity = mode === 'kwhm2';
      const displayMode = useIntensity ? 'kwhm2' : 'kwh';
      const unit = getUnitLabel(metricKey, displayMode);
      const decimals = useIntensity
        ? (Number.isFinite(metricDef.decimals) ? metricDef.decimals : 0)
        : (Number.isFinite(metricDef.totalDecimals) ? metricDef.totalDecimals : 0);

      const chartEl = figure.querySelector('[data-pareto-chart]');
      const barsContainer = figure.querySelector('[data-pareto-bars]');
      const valueScaleEl = figure.querySelector('[data-pareto-scale-values]');
      const percentScaleEl = figure.querySelector('.pareto-chart__scale:not(.pareto-chart__scale--values)');
      const svg = figure.querySelector('[data-pareto-line]');
      const polyline = svg?.querySelector('[data-pareto-polyline]') || null;
      const lineElement = ensureSvgPathElement(polyline);
      const markersContainer = figure.querySelector('[data-pareto-markers]');
      const tooltipHost = figure.querySelector('.pareto-chart__inner');
      let tooltipLayer = figure.querySelector('[data-pareto-tooltips]');
      const isGeneralPareto = figure?.dataset?.chartSlot === 'general-pareto';
      if (!tooltipLayer && tooltipHost) {
        tooltipLayer = document.createElement('div');
        tooltipLayer.className = 'pareto-chart__tooltip-layer';
        tooltipLayer.setAttribute('data-pareto-tooltips', '');
        tooltipHost.append(tooltipLayer);
      }
      const noteEl = figure.querySelector('[data-pareto-note]');
      const totalEl = figure.querySelector('[data-pareto-total]');
      const coverageEl = figure.querySelector('[data-pareto-coverage]');
      const countEl = figure.querySelector('[data-pareto-count]');

      figure.querySelectorAll('[data-pareto-unit]').forEach((el) => {
        el.textContent = unit;
      });

      const sourceMap = (allBuildings && typeof allBuildings === 'object' && Object.keys(allBuildings).length)
        ? allBuildings
        : buildingSummaries;

      const entries = Object.values(sourceMap || {}).map((summary) => {
        const metrics = summary?.metrics?.[metricKey] || {};
        const total = Number(metrics.total);
        const sre = Number(metrics.sre) || 0;
        const intensity = Number(metrics.intensity);
        const resolvedIntensity = Number.isFinite(intensity)
          ? intensity
          : (Number.isFinite(total) && sre > 0 ? total / sre : 0);
        const resolvedTotal = Number.isFinite(total)
          ? total
          : (Number.isFinite(resolvedIntensity) && sre > 0 ? resolvedIntensity * sre : 0);
        const rawValue = useIntensity ? resolvedIntensity : resolvedTotal;
        const rawId = summary?.id;
        const id = rawId === undefined || rawId === null ? '' : String(rawId).trim();
        const resolvedId = id || (rawId === undefined || rawId === null ? '' : String(rawId));
        return {
          id: resolvedId,
          label: summary?.label || summary?.id || '',
          value: Number.isFinite(rawValue) ? rawValue : 0,
          total: Number.isFinite(resolvedTotal) ? resolvedTotal : 0,
          sre: Number.isFinite(sre) ? sre : 0,
          isActive: !hasSelection || (resolvedId && selectionSet?.has(resolvedId)),
        };
      }).filter(entry => entry.value > 0);

      entries.sort((a, b) => b.value - a.value);

      const activeEntries = hasSelection ? entries.filter(entry => entry.isActive) : entries;
      const totalValue = activeEntries.reduce((sum, entry) => sum + entry.value, 0);
      const totalEnergy = activeEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
      const totalSre = activeEntries.reduce((sum, entry) => sum + (Number(entry.sre) || 0), 0);
      const maxValue = entries.reduce((acc, entry) => (entry.value > acc ? entry.value : acc), 0);
      const count = entries.length;
      const activeCount = activeEntries.length;

      let scaleMax = maxValue;
      let scaleTicks = [];
      let scaleIntervals = 0;

      if (count && maxValue > 0) {
        const scaleInfo = computeParetoScaleTicks(maxValue, 4);
        if (scaleInfo && typeof scaleInfo === 'object') {
          if (Number.isFinite(scaleInfo.max) && scaleInfo.max > 0) {
            scaleMax = scaleInfo.max;
          }
          if (Array.isArray(scaleInfo.ticks)) {
            scaleTicks = scaleInfo.ticks
              .map((tick) => (Number.isFinite(tick) ? Number(tick) : Number.parseFloat(tick)))
              .filter((tick) => Number.isFinite(tick));
            scaleTicks.sort((a, b) => b - a);
            const hasZeroTick = scaleTicks.some((tick) => Math.abs(tick) < 1e-9);
            if (!hasZeroTick) {
              scaleTicks.push(0);
              scaleTicks.sort((a, b) => b - a);
            }
            if (scaleTicks.length && Number.isFinite(scaleTicks[0]) && scaleTicks[0] > 0) {
              scaleMax = scaleTicks[0];
            }
            if (scaleTicks.length > 1) {
              scaleIntervals = scaleTicks.length - 1;
            }
          }
        }
      }

      if (chartEl) {
        if (!scaleIntervals || scaleMax <= 0) {
          chartEl.style.removeProperty('--pareto-scale-step');
          chartEl.style.removeProperty('--pareto-scale-intervals');
        } else {
          const stepPercent = 100 / scaleIntervals;
          chartEl.style.setProperty('--pareto-scale-step', `${stepPercent.toFixed(6)}%`);
          chartEl.style.setProperty('--pareto-scale-intervals', String(scaleIntervals));
        }
      }

      let leftLabelsWidth = 0;
      if (valueScaleEl) {
        if (!scaleIntervals || scaleMax <= 0 || !scaleTicks.length) {
          valueScaleEl.innerHTML = '';
          valueScaleEl.setAttribute('hidden', '');
          if (chartEl) {
            chartEl.style.setProperty('--pareto-left-gap', `${PARETO_MIN_LEFT_GAP}px`);
          }
        } else {
          const formatScaleValue = (rawValue) => {
            if (!Number.isFinite(rawValue) || rawValue <= 0) {
              return `0 ${unit}`.trim();
            }
            const absValue = Math.abs(rawValue);
            let decimalsForScale = 0;
            if (displayMode === 'kwhm2') {
              decimalsForScale = Math.max(decimals, absValue < 1 ? 2 : decimals);
            } else if (absValue < 1) {
              decimalsForScale = 2;
            } else if (absValue < 10) {
              decimalsForScale = 1;
            }
            const formatted = formatNumber(rawValue, { decimals: Math.min(decimalsForScale, 6) });
            return `${formatted} ${unit}`.trim();
          };

          valueScaleEl.innerHTML = '';
          scaleTicks.forEach((tick) => {
            const item = document.createElement('li');
            item.textContent = formatScaleValue(tick);
            valueScaleEl.append(item);
          });
          valueScaleEl.removeAttribute('hidden');
          if (chartEl) {
            leftLabelsWidth = measureElementWidth(valueScaleEl);
            const computedLeftGap = Math.max(
              PARETO_MIN_LEFT_GAP,
              Math.ceil(leftLabelsWidth + PARETO_SCALE_OFFSET + PARETO_LEFT_LABEL_PADDING),
            );
            chartEl.style.setProperty('--pareto-left-gap', `${computedLeftGap}px`);
          }
        }
      } else if (chartEl) {
        chartEl.style.setProperty('--pareto-left-gap', `${PARETO_MIN_LEFT_GAP}px`);
      }

      let rightLabelsWidth = 0;
      if (chartEl) {
        rightLabelsWidth = measureElementWidth(percentScaleEl);
        const computedRightGap = Math.max(
          PARETO_MIN_RIGHT_GAP,
          Math.ceil(rightLabelsWidth + PARETO_SCALE_OFFSET + PARETO_RIGHT_LABEL_PADDING),
        );
        chartEl.style.setProperty('--pareto-right-gap', `${computedRightGap}px`);
        const chartRect = chartEl.getBoundingClientRect();
        const chartWidth = chartRect?.width || chartEl.clientWidth || 0;
        const axisDemand = leftLabelsWidth + rightLabelsWidth;
        const shouldUseCompactAxes = Boolean(
          chartWidth &&
          !isGeneralPareto &&
          (chartWidth < 720 || axisDemand > chartWidth * 0.32),
        );
        chartEl.classList.toggle('pareto-chart--compact', shouldUseCompactAxes);
      }

      if (tooltipLayer) {
        tooltipLayer.innerHTML = '';
      }

      if (barsContainer) {
        barsContainer.innerHTML = '';
        barsContainer.classList.toggle('is-empty', count === 0);
        barsContainer.style.setProperty('--pareto-count', String(Math.max(count, 1)));
        barsContainer.classList.toggle('has-dimmed-items', hasSelection && activeCount < count);

        if (!count) {
          const empty = document.createElement('p');
          empty.className = 'chart-empty';
          empty.textContent = 'Aucune donnée disponible pour la sélection.';
          barsContainer.append(empty);
        } else {
          entries.forEach((entry, index) => {
            const rawPercent = scaleMax > 0 ? (entry.value / scaleMax) * 100 : 0;
            const percent = Math.max(0, Math.min(100, rawPercent));
            const label = entry.label || `Bâtiment ${index + 1}`;
            const valueText = `${formatEnergyDisplay(entry.value, displayMode, decimals)} ${unit}`;
            const computedWidth = measureParetoLabelWidth(label);
            const bar = document.createElement('div');
            bar.className = 'pareto-chart__bar';
            bar.setAttribute('role', 'listitem');
            bar.tabIndex = 0;
            bar.style.setProperty('--value', percent.toFixed(4));
            bar.dataset.label = label;
            bar.dataset.value = valueText;
            if (entry.id) {
              bar.dataset.buildingId = entry.id;
              bar.classList.add('pareto-chart__bar--interactive');
              const activateSelection = (event) => {
                if (event) event.preventDefault();
                selectTreeLeafByBuilding(entry.id, {
                  focus: true,
                  expandSite: true,
                  scrollIntoView: true,
                });
              };
              bar.addEventListener('click', activateSelection);
              bar.addEventListener('keydown', (event) => {
                if (event?.key === 'Enter' || event?.key === ' ') {
                  activateSelection(event);
                }
              });
            }
            const ariaSuffix = hasSelection && !entry.isActive ? ' — hors sélection' : '';
            if (hasSelection && !entry.isActive) {
              bar.classList.add('is-dimmed');
              bar.dataset.selectionState = 'inactive';
            } else {
              bar.dataset.selectionState = 'active';
            }
            bar.setAttribute('aria-label', `${label} : ${valueText}${ariaSuffix}`);
            bar.title = `${label} • ${valueText}${ariaSuffix}`;

            const tooltip = document.createElement('div');
            tooltip.className = 'pareto-chart__tooltip';
            tooltip.style.setProperty('--pareto-label-width', `${computedWidth.toFixed(2)}px`);
            tooltip.setAttribute('aria-hidden', 'true');
            tooltip.dataset.visible = 'false';

            const valueBadge = document.createElement('span');
            valueBadge.className = 'pareto-chart__tooltip-value';
            valueBadge.textContent = valueText;

            const labelBadge = document.createElement('span');
            labelBadge.className = 'pareto-chart__tooltip-label';
            labelBadge.textContent = label;

            tooltip.append(valueBadge, labelBadge);
            if (hasSelection && !entry.isActive) {
              const noteBadge = document.createElement('span');
              noteBadge.className = 'pareto-chart__tooltip-note';
              noteBadge.textContent = 'Hors sélection';
              tooltip.append(noteBadge);
            }

            if (tooltipLayer) {
              const slotKey = (figure.getAttribute('data-chart-slot') || figure.id || 'pareto').replace(/[^a-zA-Z0-9_-]/g, '-');
              const tooltipId = `${slotKey}-tooltip-${index}`;
              tooltip.id = tooltipId;
              tooltipLayer.append(tooltip);
              bar.setAttribute('aria-describedby', tooltipId);
            } else {
              bar.append(tooltip);
            }

            const repositionTooltip = () => {
              if (!tooltipLayer) return;
              const barRect = bar.getBoundingClientRect();
              const layerRect = tooltipLayer.getBoundingClientRect();
              const left = barRect.left + (barRect.width / 2) - layerRect.left;
              const bottom = layerRect.bottom - barRect.top;
              tooltip.style.setProperty('--tooltip-left', `${left}px`);
              tooltip.style.setProperty('--tooltip-bottom', `${Math.max(0, bottom)}px`);
            };

            const activateTooltip = () => {
              tooltip.dataset.visible = 'true';
              tooltip.setAttribute('aria-hidden', 'false');
              bar.classList.add('is-tooltip-active');
              if (!tooltipLayer) return;
              repositionTooltip();
              window.addEventListener('resize', repositionTooltip);
              window.addEventListener('scroll', repositionTooltip, true);
            };

            const deactivateTooltip = () => {
              tooltip.dataset.visible = 'false';
              tooltip.setAttribute('aria-hidden', 'true');
              bar.classList.remove('is-tooltip-active');
              if (!tooltipLayer) return;
              window.removeEventListener('resize', repositionTooltip);
              window.removeEventListener('scroll', repositionTooltip, true);
            };

            bar.addEventListener('mouseenter', activateTooltip);
            bar.addEventListener('mouseleave', deactivateTooltip);
            bar.addEventListener('focus', activateTooltip);
            bar.addEventListener('blur', deactivateTooltip);
            bar.addEventListener('touchstart', activateTooltip, { passive: true });
            bar.addEventListener('touchend', deactivateTooltip);
            bar.addEventListener('touchcancel', deactivateTooltip);

            barsContainer.append(bar);
          });
        }
      }

      if (markersContainer) {
        markersContainer.innerHTML = '';
        markersContainer.setAttribute('hidden', '');
      }

      const noteMessages = [];
      if (!activeCount) {
        noteMessages.push('Aucune consommation disponible pour afficher un Pareto.');
      }
      if (mode === 'kwhm2' && activeCount) {
        noteMessages.push('La courbe de Pareto est masquée en mode kWh/m² ; les barres affichent la consommation par m².');
      }
      if (noteEl) {
        if (noteMessages.length) {
          noteEl.textContent = noteMessages.join(' ');
          noteEl.hidden = false;
        } else {
          noteEl.textContent = '';
          noteEl.hidden = true;
        }
      }

      const totalFormatted = useIntensity
        ? `${formatEnergyDisplay(totalSre > 0 ? totalEnergy / totalSre : 0, 'kwhm2', decimals)} ${unit}`
        : `${formatEnergyDisplay(totalValue, 'kwh', decimals)} ${unit}`;
      if (totalEl) {
        totalEl.textContent = useIntensity
          ? `Moyenne pondérée : ${totalFormatted}`
          : `Total : ${totalFormatted}`;
      }

      const topCount = activeCount ? Math.max(1, Math.round(activeCount * 0.2)) : 0;
      const topValue = topCount > 0
        ? activeEntries.slice(0, topCount).reduce((sum, entry) => sum + (useIntensity ? entry.total : entry.value), 0)
        : 0;
      const shareBase = useIntensity ? totalEnergy : totalValue;
      const share = shareBase > 0 ? (topValue / shareBase) * 100 : 0;
      let shareText = 'Top 20 % : 0 %';
      if (share > 0) {
        shareText = share < 0.1
          ? 'Top 20 % : <0,1 %'
          : `Top 20 % : ${PERCENT_FORMAT.format(Math.min(share, 100))} %`;
      }
      if (coverageEl) coverageEl.textContent = shareText;
      if (countEl) countEl.textContent = `${formatCount(activeCount)} bât.`;

      figure.classList.toggle('is-empty', activeCount === 0 || totalValue <= 0);

      if (svg) {
        const targetLine = lineElement instanceof SVGPathElement ? lineElement : ensureSvgPathElement(svg?.querySelector('[data-pareto-polyline]') || null);
        if (!count || totalValue <= 0 || mode === 'kwhm2' || !targetLine) {
          svg.setAttribute('hidden', '');
          if (targetLine instanceof SVGPathElement) {
            targetLine.setAttribute('d', '');
          } else if (targetLine instanceof SVGPolylineElement) {
            targetLine.setAttribute('points', '');
          }
          if (markersContainer) {
            markersContainer.innerHTML = '';
            markersContainer.setAttribute('hidden', '');
          }
        } else {
          svg.removeAttribute('hidden');
          const pathPoints = [];
          const markerData = [];
          let cumulative = 0;
          const columnWidth = count > 0 ? 100 / count : 100;

          entries.forEach((entry, index) => {
            if (entry.isActive) {
              cumulative += entry.value;
            }
            let shareValue = totalValue > 0 ? (cumulative / totalValue) * 100 : 0;
            if (index === count - 1 && shareValue < 100) {
              shareValue = 100;
            }

            const clampedShare = Math.min(100, Math.max(0, shareValue));
            const centerX = Math.min(100, Math.max(0, (index + 0.5) * columnWidth));
            const y = Math.max(0, 100 - clampedShare);

            pathPoints.push({ x: centerX, y });
            if (entry.isActive) {
              markerData.push({
                x: centerX,
                y,
                share: clampedShare,
                label: entry.label || `Bâtiment ${index + 1}`,
              });
            }
          });

          if (targetLine instanceof SVGPathElement) {
            targetLine.setAttribute('d', buildSmoothParetoPath(pathPoints));
          } else if (targetLine instanceof SVGPolylineElement) {
            const fallbackPoints = pathPoints.map((point) => `${formatPercentCoord(point.x)},${formatPercentCoord(point.y)}`);
            targetLine.setAttribute('points', fallbackPoints.join(' '));
          }

          if (markersContainer) {
            markersContainer.innerHTML = '';
            markerData.forEach((marker) => {
              const markerEl = document.createElement('span');
              markerEl.className = 'pareto-chart__marker';
              markerEl.style.setProperty('--x', marker.x.toFixed(2));
              markerEl.style.setProperty('--y', marker.y.toFixed(2));
              const shareDisplay = marker.share > 0 && marker.share < 0.1
                ? '<0,1 %'
                : `${PERCENT_FORMAT.format(marker.share)} %`;
              markerEl.dataset.share = shareDisplay;
              markerEl.tabIndex = 0;
              markerEl.setAttribute('role', 'img');
              markerEl.setAttribute('aria-label', `${marker.label || ''} : ${shareDisplay} cumulés`);
              markerEl.title = `${marker.label || ''} • ${shareDisplay}`.trim();
              markersContainer.append(markerEl);
            });

            if (markerData.length) {
              markersContainer.removeAttribute('hidden');
            } else {
              markersContainer.setAttribute('hidden', '');
            }
          }
        }
      }
    });
  };

  const GENERAL_PARETO_METRICS = ['general', 'chaleur', 'froid', 'elec', 'eau', 'co2'];
  const GENERAL_PARETO_TITLES = {
    general: 'énergie',
    chaleur: 'chaleur',
    froid: 'froid',
    elec: 'électricité',
    eau: 'eau',
    co2: 'carbone',
  };
  const GENERAL_PARETO_DESCRIPTIONS = {
    general: 'consommation énergétique',
    chaleur: 'consommation de chaleur',
    froid: 'consommation de froid',
    elec: 'consommation électrique',
    eau: 'consommation d’eau',
    co2: 'émissions de CO₂',
  };
  const GENERAL_PARETO_MAIN_LABELS = {
    general: 'Consommation totale',
    chaleur: 'Consommation totale',
    froid: 'Consommation totale',
    elec: 'Consommation totale',
    eau: 'Volume total',
    co2: 'Émissions totales',
  };

  const setupGeneralParetoControls = () => {
    const figure = document.querySelector('[data-chart-slot="general-pareto"]');
    if (!figure) return;
    const select = figure.querySelector('[data-pareto-metric-switch]');

    const titleEl = figure.querySelector('.chart-card-title');
    const subtitleEl = figure.querySelector('.chart-card-subtitle');
    const chartLabelEl = figure.querySelector('.chart-title span:not([data-pareto-unit])');

    const applyMetric = (rawMetric, { silent = false } = {}) => {
      const normalized = typeof rawMetric === 'string' ? rawMetric.trim().toLowerCase() : '';
      const metric = GENERAL_PARETO_METRICS.includes(normalized) ? normalized : 'general';
      if (select instanceof HTMLSelectElement && select.value !== metric) {
        select.value = metric;
      }

      figure.dataset.chartMetric = metric;
      figure.dataset.paretoMetric = metric;

      const title = GENERAL_PARETO_TITLES[metric] || GENERAL_PARETO_TITLES.general;
      const description = GENERAL_PARETO_DESCRIPTIONS[metric] || GENERAL_PARETO_DESCRIPTIONS.general;
      const mainLabel = GENERAL_PARETO_MAIN_LABELS[metric] || GENERAL_PARETO_MAIN_LABELS.general;
      if (titleEl) {
        titleEl.textContent = `Pareto ${title}`;
      }
      if (subtitleEl) {
        subtitleEl.textContent = `Contribution cumulée des bâtiments — ${description}`;
      }
      if (chartLabelEl) {
        chartLabelEl.textContent = mainLabel;
      }
      figure.setAttribute('aria-label', `Pareto ${description} par bâtiment`);

      if (!silent) {
        updateEnergyVisuals();
      }
    };

    if (select instanceof HTMLSelectElement) {
      select.addEventListener('change', (event) => {
        const target = event.target;
        const value = (target && typeof target.value === 'string') ? target.value : select.value;
        applyMetric(value);
      });
    }

    const initialMetric = select instanceof HTMLSelectElement && select.value
      ? select.value
      : 'general';
    applyMetric(initialMetric, { silent: true });
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
        }).filter(entry => entry.value > 0)
        : [];

      dataset.sort((a, b) => (b.value || 0) - (a.value || 0));
      const totalValue = dataset.reduce((sum, item) => sum + (item.value || 0), 0);
      const totalBuildings = dataset.reduce((acc, item) => acc + (item.buildings || 0), 0);
      const hasData = dataset.length > 0;

      const treemap = card.querySelector('[data-typology-treemap]');
      const bars = card.querySelector('[data-typology-bars]');
      const renderBars = mode === 'kwhm2' && !!bars;

      if (treemap) {
        treemap.hidden = !!renderBars;
        if (renderBars) {
          treemap.innerHTML = '';
          treemap.classList.remove('is-empty');
        }
      }

      if (bars) {
        bars.toggleAttribute('hidden', !renderBars);
        bars.setAttribute('aria-hidden', String(!renderBars));
        bars.style.display = renderBars ? '' : 'none';
      }

      if (renderBars && bars) {
        bars.innerHTML = '';
        bars.classList.toggle('is-empty', !hasData);
        if (!hasData) {
          const empty = document.createElement('p');
          empty.className = 'chart-empty';
          empty.textContent = 'Aucune typologie disponible pour la sélection.';
          bars.append(empty);
        } else {
          const paletteSize = TREEMAP_COLORS.length;
          const maxValue = dataset.reduce((acc, item) => (item.value > acc ? item.value : acc), 0);

          dataset.forEach((item, index) => {
            const bar = document.createElement('div');
            bar.className = 'typology-bar';
            bar.setAttribute('role', 'listitem');

            const baseColor = TREEMAP_COLORS[index % paletteSize];
            bar.style.setProperty('--bar-color-strong', baseColor);
            bar.style.setProperty('--bar-color-soft', mixWithWhite(baseColor, 0.55));

            const percent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
            bar.style.setProperty('--bar-fill', percent.toFixed(4));

            const valueEl = document.createElement('div');
            valueEl.className = 'typology-bar__value';
            valueEl.textContent = `${formatEnergyDisplay(item.value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit}`;

            const column = document.createElement('div');
            column.className = 'typology-bar__column';

            const track = document.createElement('div');
            track.className = 'typology-bar__column-track';

            const fill = document.createElement('div');
            fill.className = 'typology-bar__column-fill';
            track.append(fill);
            column.append(track);

            const label = document.createElement('div');
            label.className = 'typology-bar__label';
            label.textContent = item.label;

            const share = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            let shareText = '0 %';
            if (share > 0) {
              shareText = share < 0.1 ? '<0,1 %' : `${PERCENT_FORMAT.format(share)} %`;
            }

            const footer = document.createElement('div');
            footer.className = 'typology-bar__footer';

            const shareEl = document.createElement('span');
            shareEl.className = 'typology-bar__share';
            shareEl.textContent = shareText;
            if (share <= 0) shareEl.hidden = true;

            const countEl = document.createElement('span');
            countEl.className = 'typology-bar__count';
            countEl.textContent = `${formatCount(item.buildings)} bât.`;

            footer.append(shareEl, countEl);

            bar.setAttribute('aria-label', `${item.label} : ${valueEl.textContent}, ${countEl.textContent}${share > 0 ? ` (${shareText})` : ''}`);
            bar.title = `${item.label} • ${valueEl.textContent} • ${countEl.textContent}${share > 0 ? ` (${shareText})` : ''}`;

            bar.append(valueEl, column, label, footer);
            setupTypologyInteractiveNode(bar, item.key);
            bars.append(bar);
          });
        }
      } else if (treemap) {
        treemap.innerHTML = '';
        treemap.classList.toggle('is-empty', !hasData);
        if (!hasData) {
          const empty = document.createElement('p');
          empty.className = 'chart-empty';
          empty.textContent = 'Aucune typologie disponible pour la sélection.';
          treemap.append(empty);
        } else {
          const layout = computeTreemapLayout(dataset);
          const paletteSize = TREEMAP_COLORS.length;

          layout.forEach(({ item, x, y, width, height }, index) => {
            const node = document.createElement('div');
            node.className = 'typology-node';
            node.dataset.key = item.key;
            node.setAttribute('role', 'listitem');
            node.style.setProperty('--x', x.toFixed(6));
            node.style.setProperty('--y', y.toFixed(6));
            node.style.setProperty('--w', width.toFixed(6));
            node.style.setProperty('--h', height.toFixed(6));

            const baseColor = TREEMAP_COLORS[index % paletteSize];
            node.style.setProperty('--treemap-color-strong', baseColor);
            node.style.setProperty('--treemap-color-soft', mixWithWhite(baseColor, 0.72));
            node.style.setProperty('--treemap-color-outline', withAlpha(baseColor, 0.45));

            const header = document.createElement('div');
            header.className = 'typology-node__header';

            const label = document.createElement('span');
            label.className = 'typology-node__label';
            label.textContent = item.label;

            const share = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            let shareText = '0 %';
            if (share > 0) {
              shareText = share < 0.1 ? '<0,1 %' : `${PERCENT_FORMAT.format(share)} %`;
            }

            const shareEl = document.createElement('span');
            shareEl.className = 'typology-node__share';
            shareEl.textContent = shareText;
            if (share <= 0) shareEl.hidden = true;

            const footer = document.createElement('div');
            footer.className = 'typology-node__footer';

            const valueEl = document.createElement('span');
            valueEl.className = 'typology-node__value';
            valueEl.textContent = `${formatEnergyDisplay(item.value, mode, mode === 'kwhm2' ? 0 : 0)} ${unit}`;

            const countEl = document.createElement('span');
            countEl.className = 'typology-node__count';
            countEl.textContent = `${formatCount(item.buildings)} bât.`;

            header.append(label, shareEl);
            footer.append(valueEl, countEl);

            const area = width * height;
            const minDim = Math.min(width, height);
            if (area < 0.15 || minDim < 0.25) node.classList.add('is-compact');
            if (area < 0.09 || minDim < 0.18) node.classList.add('is-tight');
            if (area < 0.05 || minDim < 0.12) node.classList.add('is-mini');
            if (area < 0.025 || minDim < 0.08) node.classList.add('is-micro');
            if (area < 0.012 || minDim < 0.05) node.classList.add('is-nano');
            if (area < 0.005 || minDim < 0.03) node.classList.add('is-hidden-text');

            node.setAttribute('aria-label', `${item.label} : ${valueEl.textContent}, ${countEl.textContent} (${shareText})`);
            node.title = `${item.label} • ${valueEl.textContent} • ${countEl.textContent} (${shareText})`;

            node.append(header, footer);
            setupTypologyInteractiveNode(node, item.key);
            treemap.append(node);
          });
        }
      }

      if (!renderBars && bars) {
        bars.innerHTML = '';
        bars.classList.remove('is-empty');
      }

      const tableBody = card.querySelector('[data-typology-table]');
      if (tableBody) {
        tableBody.innerHTML = '';
        dataset.forEach((item) => {
          const row = document.createElement('tr');
          const labelCell = document.createElement('td');
          labelCell.textContent = item.label;
          const valueCell = document.createElement('td');
          valueCell.textContent = `${formatEnergyDisplay(item.value, mode, mode === 'kwhm2' ? 1 : 0)} ${unit}`;
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

      if (markersWrap) {
        markersWrap.innerHTML = '';
        if (mapContainer) {
          markersWrap.classList.add('sr-only');
          markersWrap.removeAttribute('aria-hidden');
        } else {
          markersWrap.classList.remove('sr-only');
          markersWrap.removeAttribute('aria-hidden');
        }
      }
      const hasData = points.length > 0;
      if (emptyState) emptyState.hidden = hasData;
      card.classList.toggle('is-empty', !hasData);

      if (!hasData) {
        if (mapContainer) {
          const existingState = MAP_CARD_STATE.get(card) || ensureMapFrame(card);
          if (existingState?.markersLayer) {
            existingState.markersLayer.clearLayers();
          }
          if (existingState?.map) {
            const center = getDefaultMapLatLng();
            existingState.map.setView([center.lat, center.lng], 6);
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
      const mapState = mapContainer ? ensureMapFrame(card) : null;
      if (mapState?.markersLayer) {
        mapState.markersLayer.clearLayers();
      }

      const markerTag = markersWrap && (markersWrap.tagName === 'UL' || markersWrap.tagName === 'OL') ? 'li' : 'div';
      const latLngPoints = [];

      points.forEach((point) => {
        if (!point) return;
        const lat = Number(point?.position?.lat);
        const lng = Number(point?.position?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const value = mode === 'kwhm2' ? Number(point.intensity) || 0 : Number(point.total) || 0;
        const sre = Number(point.sre) || 0;
        const severity = classify(value);
        const size = maxSre > 0 ? 24 + ((Math.min(sre, maxSre) / maxSre) * 28) : 24;
        const formattedValue = formatEnergyDisplay(value, mode, mode === 'kwhm2' ? 0 : 0);
        const ariaLabel = `${point.label} : ${formattedValue} ${unit} (${metricLabel}), ${formatCount(sre)} m²`;

        if (mapState?.markersLayer && typeof L !== 'undefined') {
          const markerHtml = `
            <span class="map-marker__dot" aria-hidden="true" style="width:${size}px;height:${size}px;"></span>
            <span class="map-marker__label">${escapeHtml(point.label || '')}</span>
          `.trim();
          const icon = L.divIcon({
            className: `map-marker map-marker--${severity}`,
            html: markerHtml,
          });
          const markerInstance = L.marker([lat, lng], {
            icon,
            title: `${point.label} — ${formattedValue} ${unit}`,
            riseOnHover: true,
          });
          markerInstance.addTo(mapState.markersLayer);
          if (point.label) {
            markerInstance.bindTooltip(`${point.label}`, { direction: 'top', offset: [0, -size / 2], opacity: 0.85 });
          }
          const markerElement = typeof markerInstance.getElement === 'function'
            ? markerInstance.getElement()
            : null;
          if (markerElement) {
            markerElement.setAttribute('aria-label', ariaLabel);
          }
        }

        if (markersWrap && markerTag && mapContainer) {
          const markerItem = document.createElement(markerTag);
          markerItem.textContent = `${point.label} — ${formattedValue} ${unit} (${metricLabel}), ${formatCount(sre)} m²`;
          markerItem.setAttribute('role', 'listitem');
          markersWrap.append(markerItem);
        }

        latLngPoints.push({ lat, lng });
      });

      if (mapState?.map) {
        mapState.map.invalidateSize();
        if (latLngPoints.length === 1) {
          mapState.map.setView([latLngPoints[0].lat, latLngPoints[0].lng], 13);
        } else if (latLngPoints.length > 1) {
          const bounds = L.latLngBounds(latLngPoints);
          mapState.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
        } else {
          const center = getDefaultMapLatLng();
          mapState.map.setView([center.lat, center.lng], 6);
        }
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

    const calendar = ENERGY_BASE_DATA?.calendar || {};
    const calendarKeys = Array.isArray(calendar.keys) ? calendar.keys : [];
    const calendarShort = Array.isArray(calendar.short) ? calendar.short : [];
    const calendarFull = Array.isArray(calendar.full) ? calendar.full : [];
    const normalizeMonthKey = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
    const computeLabelVariants = (item, fallbackIndex = -1) => {
      const rawLabel = typeof item?.label === 'string' ? item.label.trim() : '';
      const normalizedKey = normalizeMonthKey(item?.key || item?.month);
      let index = typeof fallbackIndex === 'number' && fallbackIndex >= 0 ? fallbackIndex : -1;
      if (index < 0 && normalizedKey) {
        index = calendarKeys.findIndex((key) => normalizeMonthKey(key) === normalizedKey);
      }

      const fallbackShort = index >= 0 && typeof calendarShort[index] === 'string'
        ? calendarShort[index].trim()
        : '';
      const fallbackFull = index >= 0 && typeof calendarFull[index] === 'string'
        ? calendarFull[index].trim()
        : '';
      const baseLabel = rawLabel || fallbackShort || fallbackFull || (normalizedKey ? normalizedKey.slice(0, 3).toUpperCase() : '');
      const baseChars = Array.from(baseLabel);
      const compactLabel = baseChars.length <= 3 ? baseLabel : baseChars.slice(0, 3).join('');
      let tinyLabel = baseChars[0] || '';
      if (!tinyLabel && normalizedKey) {
        const keyChars = Array.from(normalizedKey.toUpperCase());
        tinyLabel = keyChars[0] || '';
      }
      if (!tinyLabel && compactLabel) {
        tinyLabel = Array.from(compactLabel)[0] || '';
      }
      return {
        base: baseLabel,
        compact: compactLabel || baseLabel,
        tiny: tinyLabel || (baseChars[0] || ''),
        full: rawLabel || fallbackFull || baseLabel,
      };
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
      const viewport = card.querySelector('.monthly-chart__viewport');
      let tooltipLayer = viewport?.querySelector('[data-monthly-tooltips]');
      if (!barsWrap) return;

      const seriesAttr = card.dataset.monthlySeries || 'chaleur,elec,froid';
      const series = seriesAttr.split(',').map(s => s.trim()).filter(Boolean);
      const metricData = aggregatedMetrics[metricKey] || aggregatedMetrics.general || {};
      const sre = Number(metricData.sre) || 0;
      const divisor = mode === 'kwhm2' && sre > 0 ? sre : 1;
      const metricDef = ENERGY_BASE_DATA.metrics[metricKey] || { decimals: 0 };
      const valueDecimals = mode === 'kwhm2' ? (metricDef.decimals || 0) : 0;

      const dataset = Array.isArray(monthly)
        ? monthly.map((item, dataIndex) => {
          const key = item?.key || item?.month;
          const label = item?.label || item?.month || '';
          const climate = Number(item?.climate) || 0;
          const values = {};
          series.forEach((seriesKey) => {
            const rawValue = Number(item?.[seriesKey]) || 0;
            values[seriesKey] = divisor > 0 ? rawValue / divisor : 0;
          });
          const total = series.reduce((acc, seriesKey) => acc + (values[seriesKey] || 0), 0);
          return { key, label, values, total, climate, orderIndex: dataIndex };
        })
        : [];

      const maxTotal = dataset.reduce((acc, item) => (item.total > acc ? item.total : acc), 0);
      const maxClimate = dataset.reduce((acc, item) => (item.climate > acc ? item.climate : acc), 0);
      const hasData = dataset.length > 0;

      barsWrap.innerHTML = '';
      delete barsWrap.dataset.density;
      barsWrap.setAttribute('role', 'list');
      if (!tooltipLayer && viewport) {
        tooltipLayer = document.createElement('div');
        tooltipLayer.className = 'monthly-tooltips';
        tooltipLayer.setAttribute('data-monthly-tooltips', '');
        viewport.append(tooltipLayer);
      }
      if (tooltipLayer) {
        tooltipLayer.innerHTML = '';
      }
      if (!hasData) {
        const empty = document.createElement('p');
        empty.className = 'chart-empty';
        empty.textContent = 'Aucune donnée mensuelle disponible pour ce périmètre.';
        barsWrap.append(empty);
        if (tooltipLayer) {
          tooltipLayer.innerHTML = '';
        }
      } else {
        const scale = maxTotal > 0 ? (140 / maxTotal) : 0;
        if (scale > 0) barsWrap.style.setProperty('--monthly-scale', `${scale}px`);
        else barsWrap.style.removeProperty('--monthly-scale');

        const hideAllTooltips = () => {
          if (!tooltipLayer) return;
          tooltipLayer.querySelectorAll('.monthly-tooltip[data-visible="true"]').forEach((tooltipEl) => {
            if (typeof tooltipEl._cleanup === 'function') {
              tooltipEl._cleanup();
              tooltipEl._cleanup = null;
            }
            if (tooltipEl._bar) {
              tooltipEl._bar.classList.remove('is-tooltip-active');
            }
            tooltipEl.dataset.visible = 'false';
            tooltipEl.setAttribute('aria-hidden', 'true');
          });
          barsWrap.querySelectorAll('.monthly-bar.is-tooltip-active').forEach((barEl) => {
            barEl.classList.remove('is-tooltip-active');
          });
        };

        if (tooltipLayer && !card.dataset.monthlyTooltipInit) {
          const handleCardLeave = () => {
            hideAllTooltips();
          };
          const handleCardFocusOut = (event) => {
            if (!card.contains(event.relatedTarget)) {
              hideAllTooltips();
            }
          };
          const handleCardKey = (event) => {
            if (event.key === 'Escape') {
              hideAllTooltips();
            }
          };
          card.addEventListener('mouseleave', handleCardLeave);
          card.addEventListener('focusout', handleCardFocusOut);
          card.addEventListener('keydown', handleCardKey);
          card.dataset.monthlyTooltipInit = 'true';
        }

        dataset.forEach((item, index) => {
          const bar = document.createElement('div');
          bar.className = 'monthly-bar';
          bar.dataset.monthKey = item.key || '';
          bar.setAttribute('role', 'listitem');
          bar.tabIndex = 0;

          const stack = document.createElement('div');
          stack.className = 'monthly-stack';
          stack.setAttribute('role', 'presentation');

          const segmentsDescription = [];
          const tooltipEntries = [];
          const monthIndex = typeof item.orderIndex === 'number' && item.orderIndex >= 0 ? item.orderIndex : index;
          const labelVariants = computeLabelVariants(item, monthIndex);
          const displayLabel = labelVariants.base || item.label || item.key || `M${index + 1}`;
          const accessibleLabel = labelVariants.full || displayLabel;
          series.forEach((seriesKey) => {
            const cssKey = cssClassForSeries(seriesKey);
            const value = Math.max(item.values[seriesKey] || 0, 0);
            const sharePercent = item.total > 0 ? (value / item.total) * 100 : 0;
            let shareText = '0 %';
            if (sharePercent > 0) {
              if (sharePercent < 0.1) {
                shareText = '<0,1 %';
              } else {
                shareText = `${PERCENT_FORMAT.format(Math.min(sharePercent, 100))} %`;
              }
            }
            const energyText = formatEnergyDisplay(value, mode, valueDecimals);
            const segment = document.createElement('span');
            segment.className = `monthly-segment monthly-segment--${cssKey}`;
            segment.style.setProperty('--value', value);
            segment.setAttribute('aria-hidden', 'true');
            stack.append(segment);
            segmentsDescription.push(`${seriesLabel(seriesKey)} ${energyText} ${unit} (${shareText})`);
            if (value > 0) {
              tooltipEntries.push({
                cssKey,
                label: seriesLabel(seriesKey),
                valueText: energyText,
                shareText,
              });
            }
          });

          const totalValue = formatEnergyDisplay(item.total, mode, valueDecimals);
          const totalText = `${totalValue} ${unit}`;
          bar.setAttribute('aria-label', `${accessibleLabel} : ${totalText} — ${segmentsDescription.join(', ')}`);

          const tooltipLines = [
            `${accessibleLabel}`,
            ...tooltipEntries.map(({ label, valueText, shareText }) => `${label} : ${valueText} ${unit} (${shareText})`),
          ].filter(Boolean);
          bar.setAttribute('title', tooltipLines.join('\n'));

          let tooltipId = '';
          let tooltip = null;
          if (tooltipLayer) {
            tooltip = document.createElement('div');
            tooltip.className = 'monthly-tooltip';
            tooltip.setAttribute('role', 'tooltip');
            tooltip.dataset.visible = 'false';
            tooltip.setAttribute('aria-hidden', 'true');

            const totalBadge = document.createElement('span');
            totalBadge.className = 'monthly-tooltip__value';
            totalBadge.textContent = totalText;
            tooltip.append(totalBadge);

            if (tooltipEntries.length) {
              const body = document.createElement('div');
              body.className = 'monthly-tooltip__body';
              const list = document.createElement('ul');
              list.className = 'monthly-tooltip__breakdown';
              tooltipEntries.forEach(({ cssKey, label, valueText, shareText }) => {
                const li = document.createElement('li');
                const dot = document.createElement('span');
                dot.className = `monthly-tooltip__dot monthly-tooltip__dot--${cssKey}`;
                dot.setAttribute('aria-hidden', 'true');
                const text = document.createElement('span');
                text.className = 'monthly-tooltip__entry-text';
                text.textContent = `${label} : ${valueText} ${unit} (${shareText})`;
                li.append(dot, text);
                list.append(li);
              });
              body.append(list);
              tooltip.append(body);
            }

            tooltipId = `${card.dataset.chartSlot || 'monthly'}-tooltip-${index}`;
            tooltip.id = tooltipId;
            tooltipLayer.append(tooltip);
            bar.setAttribute('aria-describedby', tooltipId);
            tooltip._bar = bar;
          }

          const labelEl = document.createElement('span');
          labelEl.className = 'monthly-label';
          labelEl.dataset.variantBase = displayLabel;
          labelEl.dataset.variantCompact = labelVariants.compact || displayLabel;
          labelEl.dataset.variantTiny = labelVariants.tiny || Array.from(displayLabel)[0] || '';
          labelEl.textContent = displayLabel;

          const stackWrap = document.createElement('div');
          stackWrap.className = 'monthly-stack-wrap';
          stackWrap.append(stack);

          bar.append(stackWrap, labelEl);
          barsWrap.append(bar);

          if (tooltip) {
            const repositionTooltip = () => {
              if (!tooltipLayer) return;
              const layerRect = tooltipLayer.getBoundingClientRect();
              const stackRect = stack.getBoundingClientRect();
              const centerX = stackRect.left + (stackRect.width / 2) - layerRect.left;
              const clampedX = Math.max(16, Math.min(layerRect.width - 16, centerX));
              const offsetFromBottom = layerRect.bottom - stackRect.top + 12;
              tooltip.style.setProperty('--tooltip-left', `${clampedX}px`);
              tooltip.style.setProperty('--tooltip-bottom', `${Math.max(12, offsetFromBottom)}px`);
            };

            const cleanup = () => {
              window.removeEventListener('resize', repositionTooltip);
              window.removeEventListener('scroll', repositionTooltip, true);
            };

            const showTooltip = () => {
              hideAllTooltips();
              bar.classList.add('is-tooltip-active');
              tooltip.dataset.visible = 'true';
              tooltip.setAttribute('aria-hidden', 'false');
              repositionTooltip();
              tooltip._cleanup = cleanup;
              window.addEventListener('resize', repositionTooltip);
              window.addEventListener('scroll', repositionTooltip, true);
            };

            const hideTooltip = () => {
              if (typeof tooltip._cleanup === 'function') {
                tooltip._cleanup();
                tooltip._cleanup = null;
              }
              tooltip.dataset.visible = 'false';
              tooltip.setAttribute('aria-hidden', 'true');
              bar.classList.remove('is-tooltip-active');
            };

            bar.addEventListener('mouseenter', showTooltip);
            bar.addEventListener('mouseleave', hideTooltip);
            bar.addEventListener('focus', showTooltip);
            bar.addEventListener('blur', hideTooltip);
            bar.addEventListener('touchstart', showTooltip, { passive: true });
            bar.addEventListener('touchend', hideTooltip, { passive: true });
            bar.addEventListener('touchcancel', hideTooltip);
            bar.addEventListener('keydown', (event) => {
              if (event.key === 'Escape') {
                hideTooltip();
              }
            });
          }
        });

        const applyLabelVariant = (density) => {
          const variantKey = density === 'ultra'
            ? 'variantTiny'
            : density === 'compact'
              ? 'variantCompact'
              : 'variantBase';
          barsWrap.querySelectorAll('.monthly-label').forEach((labelEl) => {
            const nextText = labelEl.dataset[variantKey] || labelEl.dataset.variantBase || '';
            labelEl.textContent = nextText;
          });
        };

        const updateDensity = () => {
          const totalBars = dataset.length;
          if (!totalBars) {
            delete barsWrap.dataset.density;
            applyLabelVariant('normal');
            return;
          }

          const wrapRect = barsWrap.getBoundingClientRect();
          const gapStyles = window.getComputedStyle(barsWrap);
          const gapValue = Number.parseFloat(gapStyles.columnGap || gapStyles.gap || gapStyles.rowGap || '0') || 0;

          let containerWidth = 0;
          const measurementTarget = viewport || barsWrap;
          if (measurementTarget) {
            containerWidth = measurementTarget.clientWidth || 0;
            if (!containerWidth && typeof measurementTarget.getBoundingClientRect === 'function') {
              const measurementRect = measurementTarget.getBoundingClientRect();
              containerWidth = measurementRect.width || 0;
              if (containerWidth && measurementTarget !== barsWrap) {
                const measurementStyles = window.getComputedStyle(measurementTarget);
                const paddingLeft = Number.parseFloat(measurementStyles.paddingLeft || '0') || 0;
                const paddingRight = Number.parseFloat(measurementStyles.paddingRight || '0') || 0;
                containerWidth -= paddingLeft + paddingRight;
              }
            }
          }

          if (!containerWidth) {
            containerWidth = wrapRect.width || 0;
          }

          containerWidth = Math.max(0, containerWidth);

          const availableWidth = containerWidth - Math.max(0, totalBars - 1) * gapValue;
          const perBar = availableWidth / totalBars;

          let density = 'normal';
          if (!Number.isFinite(perBar) || perBar <= 0) {
            density = 'ultra';
          } else {
            if (perBar < 34) density = 'compact';
            if (perBar < 22) density = 'ultra';
          }

          if (density === 'normal') {
            delete barsWrap.dataset.density;
          } else {
            barsWrap.dataset.density = density;
          }
          applyLabelVariant(density);
        };

        applyLabelVariant(barsWrap.dataset.density || 'normal');
        card._activeMonthlyDensityUpdate = updateDensity;
        updateDensity();
        const densityUpdateRef = updateDensity;
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => {
            if (typeof card._activeMonthlyDensityUpdate === 'function') {
              if (card._activeMonthlyDensityUpdate === densityUpdateRef) {
                densityUpdateRef();
              } else {
                card._activeMonthlyDensityUpdate();
              }
            }
          });
        }

        if (typeof ResizeObserver === 'function') {
          const observerTarget = viewport || barsWrap;
          if (observerTarget) {
            if (!card._monthlyDensityObserver) {
              const densityObserver = new ResizeObserver(() => {
                if (typeof card._activeMonthlyDensityUpdate === 'function') {
                  card._activeMonthlyDensityUpdate();
                }
              });
              densityObserver.observe(observerTarget);
              card._monthlyDensityObserver = densityObserver;
              card._monthlyDensityObserverTarget = observerTarget;
            } else if (card._monthlyDensityObserverTarget !== observerTarget) {
              card._monthlyDensityObserver.disconnect();
              card._monthlyDensityObserver.observe(observerTarget);
              card._monthlyDensityObserverTarget = observerTarget;
            }
          }
        } else if (!card._monthlyDensityWindowListener) {
          const handleResize = () => {
            if (typeof card._activeMonthlyDensityUpdate === 'function') {
              card._activeMonthlyDensityUpdate();
            }
          };
          window.addEventListener('resize', handleResize);
          card._monthlyDensityWindowListener = handleResize;
        }
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
    const hasExplicitSelection = selectedLeaves.length > 0;
    const activeLeaves = hasExplicitSelection ? selectedLeaves : allLeaves;
    const fallbackSre = computeFallbackSre(allLeaves);
    const {
      metrics: aggregated,
      buildings,
      typologies,
      monthly,
      mapPoints,
      distribution,
    } = computeAggregatedMetrics(activeLeaves, fallbackSre);
    let paretoAllBuildings = buildings;
    if (hasExplicitSelection && selectedLeaves.length < allLeaves.length) {
      const { buildings: fullBuildingSummaries } = computeAggregatedMetrics(allLeaves, fallbackSre);
      paretoAllBuildings = fullBuildingSummaries;
    }
    const selectedBuildingIds = [];
    if (hasExplicitSelection) {
      selectedLeaves.forEach((leaf) => {
        const buildingId = leaf?.dataset?.building;
        if (typeof buildingId === 'string') {
          const normalized = buildingId.trim();
          if (normalized) {
            selectedBuildingIds.push(normalized);
          }
        } else if (buildingId !== undefined && buildingId !== null) {
          const normalized = String(buildingId).trim();
          if (normalized) {
            selectedBuildingIds.push(normalized);
          }
        }
      });
    }
    const effectiveSre = Number(aggregated?.general?.sre) || fallbackSre || 0;

    updateEnergyKpis(mode, aggregated);
    updateWaterSummary(mode, aggregated);
    updateEnergyTrendCharts(mode, aggregated);
    updateMixCards(mode, aggregated);
    updateEnergyMeters(aggregated);
    updateTopConsumersCards(mode, buildings);
    updateParetoCharts(mode, buildings, {
      allBuildings: paretoAllBuildings,
      selectedIds: selectedBuildingIds,
      hasExplicitSelection,
    });
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

  const PILL_METRIC_TAB_IDS = {
    general: 'tab-energie',
    chaleur: 'tab-chaleur',
    froid: 'tab-froid',
    elec: 'tab-elec',
    co2: 'tab-co2',
    eau: 'tab-eau',
  };

  const PILL_METRIC_KEYS = Object.keys(PILL_METRIC_TAB_IDS);

  function computePillMetricStats(selectedLeaves) {
    const stats = {};
    PILL_METRIC_KEYS.forEach((key) => {
      stats[key] = { count: 0, sre: 0 };
    });

    if (!Array.isArray(selectedLeaves) || selectedLeaves.length === 0) {
      return stats;
    }

    const selectedYear = FILTERS?.year;

    selectedLeaves.forEach((leaf) => {
      const sre = getLeafSre(leaf);
      if (!Number.isFinite(sre) || sre <= 0) return;

      const buildingId = leaf?.dataset?.building || '';
      if (!buildingId) return;
      const info = ENERGY_BASE_DATA.buildings?.[buildingId];
      if (!info) return;

      const metrics = resolveMetricsForYear(info, selectedYear) || {};
      const valChaleur = Number(metrics?.chaleur);
      const valFroid = Number(metrics?.froid);
      const valElec = Number(metrics?.elec);
      const valCo2 = Number(metrics?.co2);
      const valEau = Number(metrics?.eau);

      const hasChaleur = Number.isFinite(valChaleur) && valChaleur > 0;
      const hasFroid = Number.isFinite(valFroid) && valFroid > 0;
      const hasElec = Number.isFinite(valElec) && valElec > 0;
      const hasCo2 = Number.isFinite(valCo2) && valCo2 > 0;
      const hasEau = Number.isFinite(valEau) && valEau > 0;

      if (hasChaleur) {
        stats.chaleur.count += 1;
        stats.chaleur.sre += sre;
      }
      if (hasFroid) {
        stats.froid.count += 1;
        stats.froid.sre += sre;
      }
      if (hasElec) {
        stats.elec.count += 1;
        stats.elec.sre += sre;
      }
      if (hasCo2) {
        stats.co2.count += 1;
        stats.co2.sre += sre;
      }
      if (hasEau) {
        stats.eau.count += 1;
        stats.eau.sre += sre;
      }

      if (hasChaleur || hasFroid || hasElec) {
        stats.general.count += 1;
        stats.general.sre += sre;
      }
    });

    return stats;
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
    const selectedLeaves = [];
    $$('.tree-leaf').forEach((leaf) => {
      const cb = leafCheck(leaf);
      if (cb?.checked) selectedLeaves.push(leaf);
    });

    const stats = computePillMetricStats(selectedLeaves);

    Object.entries(PILL_METRIC_TAB_IDS).forEach(([metric, tabId]) => {
      const tab = document.getElementById(tabId);
      if (!tab) return;
      const entry = stats[metric] || { count: 0, sre: 0 };
      const count = Number.isFinite(entry.count) ? entry.count : 0;
      const sreValue = Number.isFinite(entry.sre) ? Math.round(entry.sre) : 0;
      tab.dataset.sites = String(count);
      tab.dataset.sre = String(sreValue);
    });

    const sitesEl = document.getElementById('sum-sites-val');
    const sreEl = document.getElementById('sum-sre-val');
    const formatNumber = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return '0';
      return NF.format(num);
    };

    const activeTab = document.querySelector('#energy-block [role="tab"][aria-selected="true"]');
    const fallbackEntry = stats.general || { count: 0, sre: 0 };
    const activeSites = activeTab?.dataset?.sites ?? String(fallbackEntry.count || 0);
    const activeSre = activeTab?.dataset?.sre ?? String(Math.round(fallbackEntry.sre || 0));
    if (sitesEl) sitesEl.textContent = formatNumber(activeSites);
    if (sreEl) sreEl.textContent = formatNumber(activeSre);

    updateEnergyVisuals();
  }

  function setActive(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-selected', String(!!on)); // pas un bool direct
  }

  function selectTreeLeafByBuilding(buildingId, options = {}) {
    const normalized = (buildingId ?? '').toString().trim();
    if (!normalized) return false;

    const { focus = false, expandSite = false, scrollIntoView = false } = options || {};

    const escapeValue = (value) => {
      try {
        if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
          return CSS.escape(value);
        }
      } catch (err) {
        // ignore
      }
      return value.replace(/(["\\])/g, '\\$1');
    };

    const selector = `.tree-leaf[data-building="${escapeValue(normalized)}"]`;
    const leaf = document.querySelector(selector);
    if (!leaf) return false;

    clearActiveTypologyFilter();

    const allLeaves = $$('.tree-leaf');
    allLeaves.forEach((leafBtn) => {
      const cb = leafCheck(leafBtn);
      if (!cb) return;
      const isTarget = leafBtn === leaf;
      cb.checked = isTarget;
      cb.indeterminate = false;
      setActive(leafBtn, isTarget);
    });

    siteBtns.forEach((siteBtn) => {
      const scb = siteCheck(siteBtn);
      if (!scb) return;
      scb.checked = false;
      scb.indeterminate = false;
      setActive(siteBtn, false);
      clearPartial(siteBtn);
    });

    const targetSite = leaf.closest('.tree-group')?.querySelector('.tree-node.toggle') || null;
    if (targetSite) {
      if (expandSite) {
        targetSite.setAttribute('aria-expanded', 'true');
        const list = targetSite.parentElement?.querySelector('.tree-children');
        if (list) list.style.display = 'flex';
      }
      updateSiteFromLeaves(targetSite);
    }

    const parcCheck = getParcCheck();
    if (parcCheck) {
      parcCheck.checked = false;
      parcCheck.indeterminate = false;
      if (parcBtn) {
        setActive(parcBtn, false);
        clearPartial(parcBtn);
      }
    }

    updateParcFromSites();

    if (focus && typeof leaf.focus === 'function') {
      leaf.focus();
    }
    if (scrollIntoView && typeof leaf.scrollIntoView === 'function') {
      leaf.scrollIntoView({ block: 'nearest' });
    }

    return true;
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
      updateTreeSelectionSummaryDisplay();
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
    updateTreeSelectionSummaryDisplay();
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
      clearActiveTypologyFilter();
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
      clearActiveTypologyFilter();
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
      clearActiveTypologyFilter();
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
      clearActiveTypologyFilter();

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
      clearActiveTypologyFilter();
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

  const getSidebarSelectedAffectations = (side) => {
    if (!side) return [];
    const checks = side.querySelectorAll('.ms[data-name="affectation"] .ms-menu input:checked');
    return Array.from(checks).map(cb => cb.value).filter(Boolean);
  };

  function applySidebarFilters() {
    const side = document.querySelector('#sidebar');
    if (!side) return;

    clearActiveTypologyFilter();

    const affectations = getSidebarSelectedAffectations(side);
    const hasAffectationFilter = affectations.length > 0;
    const affectationSet = new Set(affectations);
    const registry = ENERGY_BASE_DATA.buildings || {};

    $$('.tree-leaf').forEach((leaf) => {
      const cb = leafCheck(leaf);
      if (!cb) return;

      const buildingId = leaf.dataset?.building || '';
      const info = registry[buildingId];
      const typology = leaf.dataset?.typology || info?.typology || 'autre';
      const matchesAffectation = !hasAffectationFilter || affectationSet.has(typology);

      cb.checked = matchesAffectation;
      cb.indeterminate = false;
      setActive(leaf, matchesAffectation);
    });

    siteBtns.forEach((siteBtn) => updateSiteFromLeaves(siteBtn));
    updateParcFromSites();
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
          const clickedCheckboxDirectly = e.target === cb;
          if (!clickedCheckboxDirectly) {
            e.preventDefault();
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        return;
      }

      // Effacer
      const clear = e.target.closest('.ms-clear');
      if (clear && side.contains(clear)) {
        const ms = clear.closest('.ms');
        ms.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
        updateDisplay(ms);
        if (ms?.dataset?.name === 'affectation') {
          applySidebarFilters();
        }
        return;
      }

      // Clic extérieur (dans la sidebar)
      if (!e.target.closest('.ms')) {
        closeAll();
      }
    });

    side.addEventListener('change', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.type !== 'checkbox') return;
      const ms = input.closest('.ms');
      if (!ms || !side.contains(ms)) return;
      updateDisplay(ms);
      if (ms?.dataset?.name === 'affectation') {
        applySidebarFilters();
      }
    });

    // Init affichage
    side.querySelectorAll('.ms').forEach(ms => updateDisplay(ms));
    applySidebarFilters();
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
    setupGeneralParetoControls();
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
