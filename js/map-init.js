import { driveImgHtml, escapeAttr, escapeHtml, getPopupPhotoCandidates, normalizeName } from './utils.js';
import { processColors } from './ui-controls.js';
import { buildVisitedFilter, getPointFromCoordsOrCity } from './data-loader.js';

const EPS = 1e-6;
const TERRAIN_WIDTH_BREAKPOINT = 768;
const LOW_POWER_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g']);
const DEFAULT_POWER_MODE = 'auto';
const PREWARMED_PHOTO_URLS_MAX = 160;
const prewarmedPhotoUrls = new Set();

const sameCoord = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const isCompactViewport = () => {
  if (typeof window === 'undefined') return false;
  if (typeof window.innerWidth !== 'number') return false;
  return window.innerWidth > 0 && window.innerWidth < TERRAIN_WIDTH_BREAKPOINT;
};

export function resolvePowerMode(params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')) {
  const forced = String(params.get('power') || '').toLowerCase();
  if (forced === 'low' || forced === 'high' || forced === 'auto') return forced;
  return DEFAULT_POWER_MODE;
}

export function getRuntimePerformanceProfile({ powerMode = DEFAULT_POWER_MODE } = {}) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isLowPower: false,
      shouldReduceInteractions: false,
      animationDuration: 700,
      powerMode: powerMode || DEFAULT_POWER_MODE,
    };
  }

  const hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
  const lowCpu = hardwareConcurrency > 0 && hardwareConcurrency <= 4;

  const deviceMemory = Number(navigator.deviceMemory || 0);
  const lowMemory = deviceMemory > 0 && deviceMemory <= 4;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  const saveData = connection?.saveData === true;
  const slowNetwork = LOW_POWER_CONNECTION_TYPES.has(effectiveType);
  const mobileContext = isCompactViewport();
  const reduceMotion = prefersReducedMotion();

  const autoLowPower = lowCpu || lowMemory || slowNetwork || saveData || reduceMotion || mobileContext;
  const resolvedMode = powerMode === 'low' || powerMode === 'high' ? powerMode : DEFAULT_POWER_MODE;
  const isLowPower = resolvedMode === 'low' ? true : (resolvedMode === 'high' ? false : autoLowPower);
  return {
    isLowPower,
    shouldReduceInteractions: isLowPower || reduceMotion,
    animationDuration: isLowPower ? 320 : (reduceMotion ? 420 : 700),
    powerMode: resolvedMode,
    effectiveType: effectiveType || 'unknown',
  };
}

function dedupeFeatures(arr) {
  const seen = new Set();
  const out = [];
  for (const feature of arr) {
    const coords = feature.geometry.coordinates;
    const key = JSON.stringify([
      +coords[0].toFixed(7),
      +coords[1].toFixed(7),
      feature.properties?.timestamp || '',
      feature.properties?.farmName || '',
      feature.properties?.roasterName || '',
      feature.properties?.uploader || '',
      feature.properties?.process || '',
      feature.properties?.recipe || '',
      feature.properties?.photoUrl || '',
    ]);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(feature);
    }
  }
  return out;
}

function ensureTerrain(map, { enable3dLayers = true, forceDisable3D = false } = {}) {
  const shouldDisable3D = !enable3dLayers || forceDisable3D || prefersReducedMotion() || isCompactViewport();
  const terrainIsActive = typeof map.getTerrain === 'function' && !!map.getTerrain();

  if (shouldDisable3D) {
    if (terrainIsActive) {
      try {
        map.setTerrain(null);
      } catch (err) {
        console.warn('setTerrain(null) failed', err);
        // Если не удалось снять террейн, не продолжаем очистку,
        // чтобы не удалить источник, который ещё используется движком.
        return;
      }
    }

    try {
      if (typeof map.getLayer === 'function' && map.getLayer('sky')) {
        map.removeLayer('sky');
      }
    } catch (err) {
      console.warn('removeLayer(sky) failed', err);
    }

    try {
      if (typeof map.setFog === 'function') {
        map.setFog(null);
      }
    } catch (err) {
      console.warn('setFog(null) failed', err);
    }

    const scheduleSourceRemoval = () => {
      try {
        const terrainStillActive = typeof map.getTerrain === 'function' && !!map.getTerrain();
        if (typeof map.getSource === 'function' && !terrainStillActive && map.getSource('terrain-dem')) {
          map.removeSource('terrain-dem');
        }
      } catch (err) {
        console.warn('removeSource(terrain-dem) failed', err);
      }
    };

    if (terrainIsActive && typeof map.once === 'function') {
      // Mapbox GL updates the style asynchronously when the terrain changes.
      // Removing the source too early leads to the internal terrain code trying
      // to access a source cache that has already been disposed of, which
      // triggers the "Cannot read properties of undefined (reading 'get')"
      // error.  We therefore wait for the next styledata event before cleaning
      // up the DEM source.
      map.once('styledata', scheduleSourceRemoval);
    } else {
      scheduleSourceRemoval();
    }

    map.resize();
    return;
  }

  try {
    if (typeof map.getSource === 'function' && !map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', { type: 'raster-dem', url: 'mapbox://mapbox.terrain-rgb', tileSize: 512 });
    }
  } catch (err) {
    console.warn('addSource(terrain-dem) failed', err);
    return;
  }

  try {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.6 });
  } catch (err) {
    console.warn('setTerrain(...) failed', err);
    return;
  }

  try {
    if (typeof map.getLayer === 'function' && !map.getLayer('sky')) {
      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [10, 25],
          'sky-atmosphere-sun-intensity': 10,
        },
      });
    }
  } catch (err) {
    console.warn('addLayer(sky) failed', err);
  }

  try {
    map.setFog({
      range: [0.6, 12],
      color: '#f6efe7',
      'high-color': '#d4c7b8',
      'horizon-blend': 0.2,
      'star-intensity': 0,
    });
  } catch (err) {
    console.warn('setFog(...) failed', err);
  }

  map.resize();
}

function flagFromRow(flagEmojiCell, iso2Cell, flagMode) {
  const emoji = String(flagEmojiCell || '').trim();
  if (flagMode === 'emoji') return emoji || '🏳️';
  const code = String(iso2Cell || '').trim().toLowerCase();
  if (code.length === 2) {
    return `<img src="https://flagcdn.com/24x18/${code}.png" alt="${code.toUpperCase()}" width="24" height="18" style="vertical-align:-2px;border-radius:2px">`;
  }
  return emoji || '🏳️';
}

function popupHTML(p, flagMode) {
  const flag = flagFromRow(p.flagEmoji, p.countryIso2, flagMode);
  const country = p.originCountry ? ((flag ? `${flag} ` : '') + escapeHtml(p.originCountry)) : '';
  const region = escapeHtml(p.originRegion || '');
  const place = [country, region].filter(Boolean).join(', ');
  const roaster = (p.roasterName ? escapeHtml(p.roasterName) : '') +
    (p.roasterCity ? ` (${escapeHtml(p.roasterCity)})` : '');
  const photo = `<div class="popup-cover-box">${p.photoUrl ? driveImgHtml(p.photoUrl) : ''}</div>`;

  const rows = [];
  if (p.brewMethod) rows.push(emojiRow('🧉', 'Method', escapeHtml(p.brewMethod)));

  if (p.whereConsumed || p.consumedCity || p.consumedAddr || p.cafeUrl) {
    const bits = [];
    if (p.whereConsumed) bits.push(escapeHtml(p.whereConsumed));
    if (p.consumedCity) bits.push(escapeHtml(p.consumedCity));
    let whereHtml = bits.join(' — ');
    if (p.cafeUrl) whereHtml += ` <a href="${escapeAttr(p.cafeUrl)}" target="_blank" rel="noopener" title="Ссылка на заведение">🔗</a>`;
    rows.push(emojiRow('📍', 'Where', whereHtml));
    if (p.consumedAddr) rows.push(`<div class="row" style="margin-left:1.6em;color:#666">${escapeHtml(p.consumedAddr)}</div>`);
  }

  if (p.recipe) rows.push(emojiRow('📋', 'Recipe', escapeHtml(p.recipe)));
  if (roaster) rows.push(emojiRow('🏭', 'Roaster', roaster));
  if (p.uploader) rows.push(emojiRow('👤', 'By', escapeHtml(p.uploader)));

  const processType = p.process_norm || 'other';
  const colors = processColors(processType);
  const badge = p.process
    ? `<div class="process-badge" style="background:${colors.bg};border-color:${colors.br};color:${colors.txt}">${escapeHtml(p.process)}</div>`
    : '';

  return `
    <div class="popup-card">
      ${badge}
      ${photo}
      <div class="popup-body">
        <div class="popup-title">${escapeHtml(p.farmName || 'Без названия')}</div>
        <div class="meta">${place || '—'}</div>
        ${rows.join('')}
      </div>
    </div>
  `;

  function emojiRow(emoji, title, val) {
    return `<div class="row"><span class="row-emoji" title="${escapeAttr(title)}">${emoji}</span><span>${val || ''}</span></div>`;
  }
}

function prewarmPopupPhoto(feature) {
  if (typeof Image === 'undefined') return;
  const photoUrl = feature?.properties?.photoUrl;
  if (!photoUrl) return;
  const candidates = getPopupPhotoCandidates(photoUrl);
  for (const src of candidates) {
    if (!src || prewarmedPhotoUrls.has(src)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    prewarmedPhotoUrls.add(src);
    if (prewarmedPhotoUrls.size > PREWARMED_PHOTO_URLS_MAX) {
      const [first] = prewarmedPhotoUrls;
      if (first) prewarmedPhotoUrls.delete(first);
    }
  }
}

export function createMapController({ mapboxgl, accessToken, theme, flagMode, enable3dLayers = true, viewMode = 'cities', powerMode = DEFAULT_POWER_MODE }) {
  if (!mapboxgl || typeof mapboxgl.Map !== 'function') {
    throw new Error('Mapbox GL JS is not available');
  }
  mapboxgl.accessToken = accessToken;
  const initialView = { center: [12, 20], zoom: 1.6 };

  const perfProfile = getRuntimePerformanceProfile({ powerMode });

  const map = new mapboxgl.Map({
    container: 'map',
    style: theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
    center: initialView.center,
    zoom: initialView.zoom,
    attributionControl: true,
    renderWorldCopies: false,
  });
  map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
  map.doubleClickZoom.disable();

  if (perfProfile.shouldReduceInteractions) {
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
  }

  const state = {
    cityCoords: {},
    flagMode: (flagMode || 'img').toLowerCase(),
    layersInitialized: false,
    interactionsBound: false,
    routesVisible: true,
    countriesVisible: true,
    allow3DLayers: enable3dLayers !== false,
    viewMode: viewMode === 'points' ? 'points' : 'cities',
    pointFeatures: [],
    animationDuration: perfProfile.animationDuration,
    reduceInteractions: perfProfile.shouldReduceInteractions,
    lowPowerMode: perfProfile.isLowPower,
  };

  const withMapReady = (fn) => {
    if (typeof fn !== 'function') return;

    if (map.isStyleLoaded && map.isStyleLoaded()) {
      fn();
      return;
    }

    const runWhenStyleReady = () => {
      if (map.isStyleLoaded && map.isStyleLoaded()) {
        fn();
        return;
      }
      map.once('idle', runWhenStyleReady);
    };

    // `load` fires only once for the initial style. When data arrives during
    // transient style updates (e.g. right after terrain/fog toggles), waiting
    // on `load` can miss forever and map layers stay empty. `idle` is emitted
    // after render cycles both before and after load, so we retry there until
    // style is ready.
    map.once('idle', runWhenStyleReady);
  };

  const resetView = () => {
    withMapReady(() => {
      map.easeTo({
        center: initialView.center,
        zoom: initialView.zoom,
        bearing: 0,
        pitch: 0,
        duration: state.animationDuration,
      });
    });
  };

  const applyTerrainPreference = () => {
    withMapReady(() => ensureTerrain(map, {
      enable3dLayers: state.allow3DLayers,
      forceDisable3D: state.lowPowerMode,
    }));
  };

  const applyViewMode = () => {
    withMapReady(() => {
      const showCities = state.viewMode === 'cities';
      const pointsVisibility = showCities ? 'none' : 'visible';
      const citiesVisibility = showCities ? 'visible' : 'none';
      ['clusters', 'cluster-count', 'unclustered'].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', pointsVisibility);
      });
      if (map.getLayer('city-points')) {
        map.setLayoutProperty('city-points', 'visibility', citiesVisibility);
      }
    });
  };

  map.on('load', () => {
    applyTerrainPreference();
    applyViewMode();
  });

  const motionQuery = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  if (motionQuery) {
    const handleMotionChange = () => applyTerrainPreference();
    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', handleMotionChange);
    } else if (typeof motionQuery.addListener === 'function') {
      motionQuery.addListener(handleMotionChange);
    }
  }

  const fitToData = (geojson) => {
    if (!geojson?.features?.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    geojson.features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
    map.fitBounds(bounds, { padding: 40, duration: state.animationDuration, maxZoom: 10 });
  };

  const highlightRouteFor = (properties, coord) => {
    if (!map.getLayer('route-highlight')) return;
    if (map.getLayoutProperty('route-highlight', 'visibility') !== 'visible') {
      map.setLayoutProperty('route-highlight', 'visibility', 'visible');
    }

    const filters = ['any'];
    let farmLng5 = Number.isFinite(properties.farmLng5) ? +properties.farmLng5 : null;
    let farmLat5 = Number.isFinite(properties.farmLat5) ? +properties.farmLat5 : null;

    if ((farmLng5 === null || farmLat5 === null) && Array.isArray(coord)) {
      farmLng5 = +coord[0].toFixed(5);
      farmLat5 = +coord[1].toFixed(5);
    }

    const roasterPoint = getPointFromCoordsOrCity(
      properties.roasterLat,
      properties.roasterLng,
      properties.roasterCity,
      state.cityCoords,
    );
    const consumedPoint = getPointFromCoordsOrCity(
      properties.consumedLat,
      properties.consumedLng,
      properties.consumedCity,
      state.cityCoords,
    );

    if (roasterPoint && farmLng5 !== null && farmLat5 !== null) {
      const rLng5 = +roasterPoint.lng.toFixed(5);
      const rLat5 = +roasterPoint.lat.toFixed(5);
      filters.push(['all',
        ['==', ['get', 'kind'], 'farm_to_roaster'],
        ['==', ['get', 'farmLng5'], farmLng5],
        ['==', ['get', 'farmLat5'], farmLat5],
        ['==', ['get', 'roasterLng5'], rLng5],
        ['==', ['get', 'roasterLat5'], rLat5],
      ]);
    }

    if (roasterPoint && consumedPoint) {
      const rLng5 = +roasterPoint.lng.toFixed(5);
      const rLat5 = +roasterPoint.lat.toFixed(5);
      const uLng5 = +consumedPoint.lng.toFixed(5);
      const uLat5 = +consumedPoint.lat.toFixed(5);
      filters.push(['all',
        ['==', ['get', 'kind'], 'roaster_to_consumed'],
        ['==', ['get', 'roasterLng5'], rLng5],
        ['==', ['get', 'roasterLat5'], rLat5],
        ['==', ['get', 'consumedLng5'], uLng5],
        ['==', ['get', 'consumedLat5'], uLat5],
      ]);
    }

    map.setFilter('route-highlight', filters.length > 1 ? filters : ['==', ['get', 'kind'], '___nope___']);
  };

  const clearRouteHighlight = () => {
    if (!map.getLayer('route-highlight')) return;
    map.setFilter('route-highlight', ['==', ['get', 'kind'], '___nope___']);
    if (!state.routesVisible) {
      map.setLayoutProperty('route-highlight', 'visibility', 'none');
    }
  };

  const setViewMode = (mode) => {
    const next = mode === 'points' ? 'points' : 'cities';
    if (state.viewMode !== next) {
      state.viewMode = next;
      if (next === 'cities') clearRouteHighlight();
    }
    applyViewMode();
  };

  const ensureCountriesLayers = () => {
    if (!map.getSource('countries')) {
      map.addSource('countries', { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' });
    }
    const beforeId = 'admin-1-boundary-bg';
    if (!map.getLayer('countries-visited-fill')) {
      map.addLayer({
        id: 'countries-visited-fill',
        type: 'fill',
        source: 'countries',
        'source-layer': 'country_boundaries',
        paint: { 'fill-color': '#76a96b', 'fill-opacity': 0.35 },
      }, beforeId);
      map.setLayoutProperty('countries-visited-fill', 'visibility', 'none');
    }
    if (!map.getLayer('countries-visited-outline')) {
      map.addLayer({
        id: 'countries-visited-outline',
        type: 'line',
        source: 'countries',
        'source-layer': 'country_boundaries',
        paint: { 'line-color': '#567a58', 'line-width': 0.8, 'line-opacity': 0.85 },
      }, beforeId);
      map.setLayoutProperty('countries-visited-outline', 'visibility', 'none');
    }
  };

  const updateVisitedCountries = (isoList) => {
    const list = Array.isArray(isoList) ? isoList : [];
    const filter = buildVisitedFilter(list);
    if (map.getLayer('countries-visited-fill')) map.setFilter('countries-visited-fill', filter);
    if (map.getLayer('countries-visited-outline')) map.setFilter('countries-visited-outline', filter);
  };

  const setCountriesVisibility = (stateVisible) => {
    state.countriesVisible = Boolean(stateVisible);
    const vis = state.countriesVisible ? 'visible' : 'none';
    if (map.getLayer('countries-visited-fill')) map.setLayoutProperty('countries-visited-fill', 'visibility', vis);
    if (map.getLayer('countries-visited-outline')) map.setLayoutProperty('countries-visited-outline', 'visibility', vis);
  };

  const setRoutesVisibility = (stateVisible) => {
    state.routesVisible = Boolean(stateVisible);
    const vis = state.routesVisible ? 'visible' : 'none';
    ['route-farm-roaster', 'route-roaster-consumed', 'route-highlight'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
    if (!state.routesVisible) {
      clearRouteHighlight();
    }
  };

  const ensureSources = ({ geojsonPoints, lineFeatures, cityPoints }) => {
    if (!map.getSource('brews')) {
      map.addSource('brews', {
        type: 'geojson',
        data: geojsonPoints,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });
    } else {
      map.getSource('brews').setData(geojsonPoints);
    }
    if (!map.getSource('routes')) {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: lineFeatures } });
    } else {
      map.getSource('routes').setData({ type: 'FeatureCollection', features: lineFeatures });
    }
    if (!map.getSource('city-points')) {
      map.addSource('city-points', { type: 'geojson', data: cityPoints });
    } else {
      map.getSource('city-points').setData(cityPoints);
    }
  };

  const initializeLayers = () => {
    if (state.layersInitialized) return;

    if (!map.getLayer('route-farm-roaster')) {
      map.addLayer({
        id: 'route-farm-roaster',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'farm_to_roaster'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2e7d32',
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 0.9, 4, 1.8, 6, 2.8, 10, 4.8],
        },
      });
    }
    if (!map.getLayer('route-roaster-consumed')) {
      map.addLayer({
        id: 'route-roaster-consumed',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'roaster_to_consumed'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c8a27a',
          'line-opacity': 0.75,
          'line-dasharray': [2.5, 2.5],
          'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 1.2, 4, 2.4, 6, 3.6, 10, 6],
        },
      });
    }
    if (!map.getLayer('route-highlight')) {
      map.addLayer({
        id: 'route-highlight',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], '___nope___'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'kind'],
            'farm_to_roaster', '#2e7d32',
            'roaster_to_consumed', '#c8a27a',
            /* other */ '#ff7f00',
          ],
          'line-opacity': 0.95,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1.5, 2.5, 4, 4, 7, 5.5, 10, 8],
        },
      });
      map.setLayoutProperty('route-highlight', 'visibility', 'none');
    }

    if (!map.getLayer('clusters')) {
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'brews',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#9ecae1', 10, '#6baed6', 30, '#3182bd'],
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'brews',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#08306b' },
      });
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'brews',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
        paint: {
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
          'circle-color': [
            'match', ['get', 'process_norm'],
            'washed', '#2e7d32',
            'natural', '#c0392b',
            'honey', '#c77f0a',
            'anaerobic', '#6a3cbc',
            'experimental', '#2c5aa0',
            /* other */ '#777777',
          ],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.5, 5, 6, 6, 12, 8, 16, 10],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });
    }

    if (!map.getLayer('city-points')) {
      map.addLayer({
        id: 'city-points',
        type: 'circle',
        source: 'city-points',
        layout: {
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
        paint: {
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
          'circle-color': [
            'match', ['get', 'kind'],
            'both', '#8e44ad',
            'roaster', '#006d2c',
            'consumed', '#08519c',
            '#666666',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1.5,
            ['interpolate', ['linear'], ['get', 'size'], 1, 5, 3, 7, 6, 9, 10, 12],
            6,
            ['interpolate', ['linear'], ['get', 'size'], 1, 6, 3, 8, 6, 11, 10, 14],
            12,
            ['interpolate', ['linear'], ['get', 'size'], 1, 7, 3, 9, 6, 12, 10, 16],
          ],
        },
      });
    }

    ensureCountriesLayers();
    setCountriesVisibility(state.countriesVisible);
    setRoutesVisibility(state.routesVisible);

    bindInteractions();
    state.layersInitialized = true;
    applyViewMode();
  };

  const bindInteractions = () => {
    if (state.interactionsBound) return;

    map.on('click', 'clusters', (e) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      map.getSource('brews').getClusterExpansionZoom(feature.properties.cluster_id, (err, zoom) => {
        if (!err) map.easeTo({ center: feature.geometry.coordinates, zoom, duration: state.animationDuration });
      });
    });

    map.on('click', 'unclustered', (e) => {
      const clicked = e.features[0];
      const coord = clicked.geometry.coordinates;
      const buf = 6;
      const box = [[e.point.x - buf, e.point.y - buf], [e.point.x + buf, e.point.y + buf]];
      const inBox = map.queryRenderedFeatures(box, { layers: ['unclustered'] });
      const nearSame = inBox.filter((f) => sameCoord(f.geometry.coordinates, coord));
      const features = dedupeFeatures(nearSame.length ? nearSame : [clicked]);
      showMultiPopup(features, coord);
    });

    map.on('click', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: ['unclustered', 'clusters'] });
      if (!feats.length) clearRouteHighlight();
    });

    if (!state.reduceInteractions) {
      map.on('mouseenter', 'clusters', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'clusters', () => map.getCanvas().style.cursor = '');
      map.on('mouseenter', 'unclustered', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'unclustered', () => map.getCanvas().style.cursor = '');
    }

    map.on('click', 'city-points', (e) => {
      const feature = e.features[0];
      const city = feature.properties?.city || '';
      const kind = feature.properties?.kind || 'both';
      const matches = collectFeaturesForCity(city, kind);

      if (matches.length) {
        showMultiPopup(matches, feature.geometry.coordinates);
        return;
      }

      new mapboxgl.Popup({ offset: 10 })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(cityPopupHTML(feature.properties))
        .addTo(map);
    });

    if (!state.reduceInteractions) {
      map.on('mouseenter', 'city-points', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'city-points', () => map.getCanvas().style.cursor = '');
    }

    state.interactionsBound = true;
  };

  const collectFeaturesForCity = (city, kind) => {
    const target = normalizeName(city).toLowerCase();
    if (!target) return [];

    const includeRoaster = kind === 'roaster' || kind === 'both';
    const includeConsumed = kind === 'consumed' || kind === 'both';

    const related = [];
    for (const feature of state.pointFeatures || []) {
      const props = feature.properties || {};
      const roasterCity = normalizeName(props.roasterCity).toLowerCase();
      const consumedCity = normalizeName(props.consumedCity).toLowerCase();

      if (includeRoaster && roasterCity && roasterCity === target) {
        related.push(feature);
        continue;
      }

      if (includeConsumed && consumedCity && consumedCity === target) {
        related.push(feature);
      }
    }

    return dedupeFeatures(related);
  };

  const cityPopupHTML = (props) => {
    const rows = [];
    if (props.roasters && props.roasters.length) {
      rows.push(row('🏭', props.roasters.join(', ')));
    }
    const placeBits = [];
    if (props.places && props.places.length) placeBits.push(...props.places);
    if (props.home) placeBits.push('дом');
    if (placeBits.length) {
      rows.push(row('🔻', placeBits.join(', ')));
    }
    return `
      <div class="popup-card">
        <div class="popup-body">
          <div class="popup-title">${escapeHtml(props.city)}</div>
          ${rows.join('')}
        </div>
      </div>
    `;

    function row(emoji, text) {
      return `<div class="row"><span class="row-emoji">${emoji}</span><span>${escapeHtml(text)}</span></div>`;
    }
  };

  const showMultiPopup = (features, coord) => {
    let index = 0;
    for (const feature of features) prewarmPopupPhoto(feature);
    const popup = new mapboxgl.Popup({ offset: 12, maxWidth: '360px' }).setLngLat(coord);

    const render = () => {
      const feature = features[index];
      const properties = feature.properties;
      const nav = (features.length > 1)
        ? `<div class="popup-nav" style="display:flex;align-items:center;justify-content:space-between;margin:8px 14px 14px;gap:8px">
             <button type="button" data-prev style="padding:8px 12px;border:1px solid var(--glass-br);background:var(--glass);border-radius:10px;cursor:pointer;touch-action:manipulation">◀</button>
             <div class="idx" style="font:12px/1.1 system-ui;color:var(--muted)">${index + 1} из ${features.length}</div>
             <button type="button" data-next style="padding:8px 12px;border:1px solid var(--glass-br);background:var(--glass);border-radius:10px;cursor:pointer;touch-action:manipulation">▶</button>
           </div>`
        : '';
      popup.setHTML(popupHTML(properties, state.flagMode) + nav);

      setTimeout(() => {
        const el = popup.getElement();
        el?.querySelector('[data-prev]')?.addEventListener('click', () => {
          index = (index - 1 + features.length) % features.length;
          render();
        }, { passive: true });
        el?.querySelector('[data-next]')?.addEventListener('click', () => {
          index = (index + 1) % features.length;
          render();
        }, { passive: true });
      }, 0);

      highlightRouteFor(properties, feature.geometry.coordinates);
    };

    popup.on('close', clearRouteHighlight);
    popup.addTo(map);
    render();
  };

  const updateData = ({ geojsonPoints, lineFeatures, cityPoints, visitedCountries, cityCoords, pointFeatures }, { fit = false } = {}) => {
    state.cityCoords = cityCoords || {};
    state.pointFeatures = pointFeatures || state.pointFeatures;
    withMapReady(() => {
      ensureSources({ geojsonPoints, lineFeatures, cityPoints });
      initializeLayers();
      updateVisitedCountries(visitedCountries);
      clearRouteHighlight();
      if (fit) {
        fitToData(geojsonPoints);
      }
      applyViewMode();
    });
  };

  const set3DLayersEnabled = (enabled) => {
    state.allow3DLayers = enabled !== false;
    applyTerrainPreference();
  };

  return {
    map,
    fitToData,
    updateData,
    setRoutesVisibility,
    setCountriesVisibility,
    clearRouteHighlight,
    highlightRouteFor,
    resetView,
    resize: () => map.resize(),
    refresh3DLayers: applyTerrainPreference,
    set3DLayersEnabled,
    setViewMode,
  };
}
