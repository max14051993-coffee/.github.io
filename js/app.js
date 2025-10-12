import { debounce, setupInfoDisclosure } from './utils.js';
import {
  buildCityPoints,
  buildRouteFeatures,
  getVisitedCountriesIso2,
  loadBaseDataset,
  loadSupplementalDataset,
} from './data-loader.js';
import { PROCESS_FILTER_VALUES, createUIController, renderAchievements } from './ui-controls.js';
import { createMapController } from './map-init.js';
import { ensureVendorBundles } from './vendor-loader.js';

const MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbms6-9Pie6VdyXzbjiMwWeIF-mxMvMiyFHaRI1DJE0nPNkSG99lewaeeU8YIuj7Y8vxzJGOD2md1v/pub?gid=1055803810&single=true&output=csv';

const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
document.body.dataset.theme = theme;
const flagMode = (new URLSearchParams(location.search).get('flag') || 'img').toLowerCase();

const COLLECTION_TITLE = 'My coffee experience';

document.title = COLLECTION_TITLE;

function showAchievementsStatus(message, variant = 'info') {
  const list = document.getElementById('achievements');
  const container = list?.closest('[data-achievements-container]');
  if (!list || !container) return;
  const classes = ['achievements-message'];
  if (variant === 'loading') classes.push('achievements-message--loading');
  if (variant === 'error') classes.push('achievements-message--error');
  const content = variant === 'loading'
    ? `<span class="achievements-spinner" aria-hidden="true"></span><span>${message}</span>`
    : message;
  container.hidden = false;
  list.innerHTML = `<div class="${classes.join(' ')}" role="status">${content}</div>`;
}

setupInfoDisclosure({
  toggle: document.querySelector('[data-map-info-toggle]'),
  panel: document.querySelector('[data-map-info-panel]'),
});

let mapController = null;
const overlayMedia = window.matchMedia('(max-width: 720px)');

const filterState = { process: 'all' };
let allPointFeatures = [];
let cityCoords = {};
let controls = null;
let viewMode = 'cities';

function syncOverlayMenus(force = false) {
  const menu = document.getElementById('filtersMenu');
  if (!menu) return;
  const compact = overlayMedia.matches;
  const mode = compact ? 'mobile' : 'desktop';
  const prevMode = menu.dataset.overlayMode;
  if (force || prevMode !== mode) {
    menu.dataset.overlayMode = mode;
    menu.open = mode === 'desktop';
  }
}

const handleOverlayChange = () => syncOverlayMenus(true);
if (typeof overlayMedia.addEventListener === 'function') {
  overlayMedia.addEventListener('change', handleOverlayChange);
} else if (typeof overlayMedia.addListener === 'function') {
  overlayMedia.addListener(handleOverlayChange);
}

function getFilteredFeatures() {
  return allPointFeatures.filter((feature) => {
    if (filterState.process !== 'all') {
      const norm = (feature.properties?.process_norm || '').trim() || 'other';
      if (filterState.process === 'other') {
        if (norm && norm !== 'other') return false;
      } else if (norm !== filterState.process) {
        return false;
      }
    }
    return true;
  });
}

function applyFilters({ fit = false } = {}) {
  const features = getFilteredFeatures();
  const geojson = { type: 'FeatureCollection', features };
  const lineFeatures = buildRouteFeatures(features, cityCoords);
  const cityPoints = buildCityPoints(features, cityCoords);
  const visited = [...getVisitedCountriesIso2(features)];

  controls?.updateCounts(features.length, visited.length);

  if (!mapController) return features;

  mapController.updateData({
    geojsonPoints: geojson,
    lineFeatures,
    cityPoints,
    visitedCountries: visited,
    cityCoords,
  }, { fit });
  mapController.setViewMode(viewMode);

  return features;
}

function handleProcessChange(rawValue) {
  const normalized = PROCESS_FILTER_VALUES.has(rawValue) ? rawValue : 'all';
  let next = normalized;
  if (filterState.process === normalized && normalized !== 'all') {
    next = 'all';
  }
  if (filterState.process === next) {
    controls?.updateProcessButtons(next);
    return;
  }
  filterState.process = next;
  controls?.updateProcessButtons(next);
  applyFilters();
}

function handleViewModeChange(rawValue) {
  const normalized = rawValue === 'points' ? 'points' : 'cities';
  if (viewMode === normalized) {
    controls?.updateViewMode?.(normalized);
    return;
  }
  viewMode = normalized;
  controls?.updateViewMode?.(normalized);
  mapController?.setViewMode(normalized);
}

async function init() {
  syncOverlayMenus(true);
  try {
    await ensureVendorBundles();
    mapController = createMapController({ accessToken: MAPBOX_TOKEN, theme, flagMode, viewMode });
  } catch (dependencyError) {
    console.error('Map dependency error:', dependencyError);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = '<div class="map-error">Не удалось загрузить карту. Попробуйте обновить страницу.</div>';
    }
    return;
  }

  try {
    const baseData = await loadBaseDataset({ csvUrl: CSV_URL });
    allPointFeatures = baseData.pointFeatures;
    cityCoords = {};

    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = COLLECTION_TITLE;
    document.title = COLLECTION_TITLE;

    controls = createUIController({
      pointsCount: baseData.pointFeatures.length,
      countriesCount: baseData.visitedCountries.length,
      filterState,
      onRoutesToggle: (visible) => mapController?.setRoutesVisibility(visible),
      onVisitedToggle: (visible) => mapController?.setCountriesVisibility(visible),
      onProcessChange: handleProcessChange,
      onViewModeChange: handleViewModeChange,
      viewMode,
    });
    controls.placeControls();
    syncOverlayMenus();
    controls.updateViewMode?.(viewMode);

    showAchievementsStatus('Загружаем достижения…', 'loading');

    applyFilters({ fit: true });

    loadSupplementalDataset({ pointFeatures: baseData.pointFeatures, mapboxToken: MAPBOX_TOKEN })
      .then((supplemental) => {
        cityCoords = supplemental.cityCoordsMap;
        renderAchievements(supplemental.metrics);
        applyFilters();
      })
      .catch((supplementalError) => {
        console.error('Supplemental data error:', supplementalError);
        showAchievementsStatus('Не удалось загрузить достижения', 'error');
      });

    window.addEventListener('resize', debounce(() => {
      controls?.placeControls();
      mapController?.refresh3DLayers();
      mapController?.resize();
      syncOverlayMenus();
    }, 150));
  } catch (err) {
    const filtersPanel = document.getElementById('filtersPanel');
    if (filtersPanel) {
      filtersPanel.innerHTML = '<div class="overlay-error">Ошибка загрузки CSV</div>';
    }
    console.error('CSV error:', err);
  }
}

init();
