import { debounce, setupInfoDisclosure } from './utils.js';
import {
  buildCityPoints,
  buildRouteFeatures,
  getVisitedCountriesIso2,
  loadData,
} from './data-loader.js';
import { renderAchievements, renderStats } from './ui-controls.js';
import { createMapController, resolvePowerMode } from './map-init.js';
import { ensureVendorBundles } from './vendor-loader.js';
import { buildRumAggregationQuery, initializeRum, isRumEnabled } from './rum.js';


const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
function resolveMapboxToken(params) {
  const explicitToken = params.get('mapboxToken')
    || document.querySelector('meta[name="mapbox-access-token"]')?.content;

  return explicitToken?.trim() || DEFAULT_MAPBOX_TOKEN;
}
const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
document.body.dataset.theme = theme;

function resolveDefaultFlagMode(params) {
  const explicitMode = params.get('flag');
  if (explicitMode) return explicitMode.toLowerCase();
  return 'img';
}

const urlParams = new URLSearchParams(location.search);
const flagMode = resolveDefaultFlagMode(urlParams);
document.body.dataset.flagMode = flagMode;
const powerMode = resolvePowerMode(urlParams);

const MAPBOX_TOKEN = resolveMapboxToken(urlParams);

function assertMapboxToken() {
  if (MAPBOX_TOKEN) return;
  const message = 'Mapbox access token is not configured. Add ?mapboxToken=... to the URL or set a <meta name="mapbox-access-token"> tag.';
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.innerHTML = '<div class="map-error">Не удалось загрузить карту: не задан Mapbox access token.</div>';
  }
  throw new Error(message);
}

const DEFAULT_GOOGLE_SHEET_ID = '1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw';
const DEFAULT_GOOGLE_SHEET_GID = '0';

const DEFAULT_PREBUILT_DATASET_URL = '';

function getConfiguredPrebuiltUrl() {
  const fromUrl = urlParams.get('dataset') || urlParams.get('prebuilt');
  if (fromUrl === '0' || fromUrl === 'false' || fromUrl === 'off') return null;

  const fromMeta = document.querySelector('meta[name="prebuilt-dataset-json"]')?.content;
  const resolved = (fromUrl || fromMeta || DEFAULT_PREBUILT_DATASET_URL || '').trim();
  return resolved || null;
}

function getConfiguredSheetConfig() {
  const explicitUrl = urlParams.get('csv')
    || document.querySelector('meta[name="google-sheet-csv"]')?.content;
  if (explicitUrl) return { csvUrl: explicitUrl, sheetId: null, gid: null, sheetName: null };

  const sheetId = urlParams.get('sheetId')
    || document.querySelector('meta[name="google-sheet-id"]')?.content
    || DEFAULT_GOOGLE_SHEET_ID;
  const gid = urlParams.get('gid')
    || document.querySelector('meta[name="google-sheet-gid"]')?.content
    || DEFAULT_GOOGLE_SHEET_GID;
  const sheetName = urlParams.get('sheetName')
    || document.querySelector('meta[name="google-sheet-name"]')?.content
    || null;

  if (!sheetId) return { csvUrl: null, sheetId: null, gid: null, sheetName: null };

  const query = new URLSearchParams({ tqx: 'out:csv', tq: 'select *' });
  if (gid) query.set('gid', gid);
  if (sheetName) query.set('sheet', sheetName);
  return {
    csvUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query.toString()}`,
    sheetId,
    gid,
    sheetName,
  };
}

const COLLECTION_TITLE = 'My coffee experience';

const achievementsUi = {
  root: document.querySelector('[data-achievements-root]'),
  panel: document.querySelector('[data-achievements-panel]'),
  toggle: document.querySelector('[data-achievements-toggle]'),
};

const achievementToggleLabels = {
  collapsed: achievementsUi.toggle?.dataset.labelCollapsed || 'Показать достижения',
  expanded: achievementsUi.toggle?.dataset.labelExpanded || 'Скрыть достижения',
};

function setAchievementsExpanded(expanded) {
  if (!achievementsUi.toggle || !achievementsUi.panel) return;
  achievementsUi.toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  achievementsUi.panel.hidden = !expanded;
  achievementsUi.toggle.textContent = expanded
    ? achievementToggleLabels.expanded
    : achievementToggleLabels.collapsed;
}

function initAchievementsToggle() {
  if (!achievementsUi.toggle || !achievementsUi.panel) return;
  setAchievementsExpanded(false);
  achievementsUi.toggle.addEventListener('click', () => {
    const expanded = achievementsUi.toggle.getAttribute('aria-expanded') === 'true';
    setAchievementsExpanded(!expanded);
  });
}

function revealAchievementsRoot() {
  if (achievementsUi.root) {
    achievementsUi.root.hidden = false;
  }
}

document.title = COLLECTION_TITLE;
initAchievementsToggle();

function showAchievementsStatus(message, variant = 'info') {
  const list = document.getElementById('achievements');
  const container = list?.closest('[data-achievements-panel]');
  if (!list || !container) return;
  const classes = ['achievements-message'];
  if (variant === 'loading') classes.push('achievements-message--loading');
  if (variant === 'error') classes.push('achievements-message--error');
  const content = variant === 'loading'
    ? `<span class="achievements-spinner" aria-hidden="true"></span><span>${message}</span>`
    : message;
  revealAchievementsRoot();
  list.innerHTML = `<div class="${classes.join(' ')}" role="status">${content}</div>`;
}

function setMapLoadingState(loading, message = 'Загружаем карту и данные…') {
  const loader = document.querySelector('[data-map-loading]');
  if (!loader) return;
  const text = loader.querySelector('[data-map-loading-text]');
  if (text) text.textContent = message;
  loader.hidden = !loading;
}

setupInfoDisclosure({
  toggle: document.querySelector('[data-map-info-toggle]'),
  panel: document.querySelector('[data-map-info-panel]'),
});

let mapController = null;
let allPointFeatures = [];
let cityCoords = {};
let precomputedDerived = null;
let derivedCache = { key: '', value: null };
const resetViewButton = document.querySelector('[data-reset-view]');

function setupResetViewButton() {
  if (!resetViewButton) return;
  resetViewButton.addEventListener('click', () => {
    mapController?.resetView();
  });
}



function buildFeatureKey(features) {
  const length = Array.isArray(features) ? features.length : 0;
  if (!length) return '0';
  const first = features[0];
  const last = features[length - 1];
  const firstTs = String(first?.properties?.timestamp || '');
  const lastTs = String(last?.properties?.timestamp || '');
  return `${length}|${firstTs}|${lastTs}`;
}

function isPrebuiltDataset(dataset) {
  return Boolean(dataset && dataset.generatedAt && Array.isArray(dataset.lineFeatures) && dataset.cityPoints);
}

function setPrecomputedDerived(dataset, features) {
  if (!isPrebuiltDataset(dataset)) {
    precomputedDerived = null;
    return;
  }

  precomputedDerived = {
    featuresRef: features,
    lineFeatures: Array.isArray(dataset.lineFeatures) ? dataset.lineFeatures : [],
    cityPoints: dataset.cityPoints && typeof dataset.cityPoints === 'object'
      ? dataset.cityPoints
      : { type: 'FeatureCollection', features: [] },
    visitedCountries: Array.isArray(dataset.visitedCountries)
      ? dataset.visitedCountries
      : [...getVisitedCountriesIso2(features)],
  };
}

function deriveMapData(features) {
  if (precomputedDerived && precomputedDerived.featuresRef === features) {
    return {
      lineFeatures: precomputedDerived.lineFeatures,
      cityPoints: precomputedDerived.cityPoints,
      visited: precomputedDerived.visitedCountries,
    };
  }

  const key = buildFeatureKey(features);
  if (derivedCache.key === key && derivedCache.value) {
    return derivedCache.value;
  }

  const value = {
    lineFeatures: buildRouteFeatures(features, cityCoords),
    cityPoints: buildCityPoints(features, cityCoords),
    visited: [...getVisitedCountriesIso2(features)],
  };
  derivedCache = { key, value };
  return value;
}

async function loadDataset() {
  const sheetConfig = getConfiguredSheetConfig();
  const { csvUrl, sheetId, gid, sheetName } = sheetConfig;
  const prebuiltUrl = getConfiguredPrebuiltUrl();
  if (!csvUrl && !prebuiltUrl) throw new Error('Не задан URL опубликованной таблицы Google Sheets и prebuilt dataset.json.');

  try {
    const dataset = await loadData({
      csvUrl,
      mapboxToken: MAPBOX_TOKEN,
      prebuiltUrl,
      onUpdate: ({ dataset: updatedDataset }) => {
        allPointFeatures = updatedDataset.pointFeatures || [];
        cityCoords = updatedDataset.cityCoordsMap || {};
        setPrecomputedDerived(updatedDataset, allPointFeatures);
        derivedCache = { key: '', value: null };
        applyFilters({ fit: false });
        renderStats(updatedDataset.metrics);
      },
    });
    return { dataset, source: prebuiltUrl ? 'prebuilt-or-csv' : 'csv', csvUrl, prebuiltUrl };
  } catch (primaryError) {
    if (sheetId) {
      const fallbackQuery = new URLSearchParams({ format: 'csv' });
      if (gid) fallbackQuery.set('gid', gid);
      const fallbackUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?${fallbackQuery.toString()}`;
      if (fallbackUrl !== csvUrl) {
        console.warn('Primary CSV load failed, trying export CSV endpoint', primaryError);
        const dataset = await loadData({ csvUrl: fallbackUrl, mapboxToken: MAPBOX_TOKEN, prebuiltUrl: null });
        return { dataset, source: 'csv', csvUrl: fallbackUrl, prebuiltUrl: null };
      }
    }

    throw primaryError;
  }
}

function getFilteredFeatures() {
  return allPointFeatures;
}

function applyFilters({ fit = false } = {}) {
  const features = getFilteredFeatures();
  const geojson = { type: 'FeatureCollection', features };
  const { lineFeatures, cityPoints, visited } = deriveMapData(features);

  if (!mapController) return features;

  mapController.updateData({
    geojsonPoints: geojson,
    lineFeatures,
    cityPoints,
    visitedCountries: visited,
    cityCoords,
    pointFeatures: features,
  }, { fit });
  return features;
}

function scheduleNonCriticalTask(task) {
  if (typeof task !== 'function') return;
  if (typeof window === 'undefined') {
    task();
    return;
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: 400 });
    return;
  }

  window.setTimeout(task, 0);
}

async function init() {
  const appVersion = document.querySelector('meta[name="app-version"]')?.content || 'dev';
  const appCommit = document.querySelector('meta[name="app-commit"]')?.content || 'local';
  const rum = initializeRum({
    enabled: isRumEnabled(urlParams),
    endpoint: document.querySelector('meta[name="rum-endpoint"]')?.content || '/rum/vitals',
    appVersion,
    appCommit,
  });
  if (rum.enabled) {
    console.info('RUM enabled', buildRumAggregationQuery());
  }

  assertMapboxToken();
  setMapLoadingState(true);
  showAchievementsStatus('Загружаем достижения…', 'loading');
  try {
    const { mapboxgl } = await ensureVendorBundles();
    mapController = createMapController({
      mapboxgl,
      accessToken: MAPBOX_TOKEN,
      theme,
      flagMode,
      viewMode: 'points',
      powerMode,
    });
    mapController.setRoutesVisibility(true);
    setupResetViewButton();
  } catch (dependencyError) {
    console.error('Map dependency error:', dependencyError);
    setMapLoadingState(false);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = '<div class="map-error">Не удалось загрузить карту. Попробуйте обновить страницу.</div>';
    }
    return;
  }

  try {
    const { dataset } = await loadDataset();
    const geojsonPoints = dataset.geojsonPoints;
    allPointFeatures = dataset.pointFeatures || geojsonPoints?.features || [];
    cityCoords = dataset.cityCoordsMap || dataset.cityCoords || {};
    setPrecomputedDerived(dataset, allPointFeatures);

    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = COLLECTION_TITLE;

    applyFilters({ fit: true });
    setMapLoadingState(false);

    if (dataset.metrics) {
      scheduleNonCriticalTask(() => {
        renderAchievements(dataset.metrics);
        renderStats(dataset.metrics);
      });
    } else {
      showAchievementsStatus('Достижения пока недоступны.');
    }

    const resizeDebounceMs = (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches)
      ? 250
      : 150;
    const handleViewportChange = debounce(() => {
      mapController?.refresh3DLayers();
      mapController?.resize();
    }, resizeDebounceMs);

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
  } catch (err) {
    console.error('CSV error:', err);
    setMapLoadingState(false);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = '<div class="map-error">Не удалось загрузить таблицу Google Sheets. Проверьте доступ по ссылке.</div>';
    }
  }
}

init();
