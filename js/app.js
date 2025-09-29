import { debounce, setupInfoDisclosure } from './utils.js';
import { buildCityPoints, buildRouteFeatures, getVisitedCountriesIso2, loadData } from './data-loader.js';
import { PROCESS_FILTER_VALUES, createUIController, renderAchievements } from './ui-controls.js';
import { createMapController } from './map-init.js';

const MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbms6-9Pie6VdyXzbjiMwWeIF-mxMvMiyFHaRI1DJE0nPNkSG99lewaeeU8YIuj7Y8vxzJGOD2md1v/pub?gid=1055803810&single=true&output=csv';

const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
document.body.dataset.theme = theme;
const flagMode = (new URLSearchParams(location.search).get('flag') || 'img').toLowerCase();

const COLLECTION_TITLE = 'My coffee experience';

document.title = COLLECTION_TITLE;

setupInfoDisclosure({
  toggle: document.querySelector('[data-map-info-toggle]'),
  panel: document.querySelector('[data-map-info-panel]'),
});

const mapController = createMapController({ accessToken: MAPBOX_TOKEN, theme, flagMode });
const overlayMedia = window.matchMedia('(max-width: 720px)');

const filterState = { process: 'all' };
let allPointFeatures = [];
let cityCoords = {};
let controls = null;

function syncOverlayMenus(force = false) {
  const compact = overlayMedia.matches;
  const mode = compact ? 'mobile' : 'desktop';
  const menus = [
    document.getElementById('filtersMenu'),
    document.getElementById('achievementsMenu'),
  ];
  menus.forEach((menu) => {
    if (!menu) return;
    const prevMode = menu.dataset.overlayMode;
    if (force || prevMode !== mode) {
      menu.dataset.overlayMode = mode;
      menu.open = mode === 'desktop';
    }
  });
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

  mapController.updateData({
    geojsonPoints: geojson,
    lineFeatures,
    cityPoints,
    visitedCountries: visited,
    cityCoords,
  }, { fit });

  controls?.updateCounts(features.length, visited.length);
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

async function init() {
  syncOverlayMenus(true);
  try {
    const data = await loadData({ csvUrl: CSV_URL, mapboxToken: MAPBOX_TOKEN });
    allPointFeatures = data.pointFeatures;
    cityCoords = data.cityCoordsMap;

    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = COLLECTION_TITLE;
    document.title = COLLECTION_TITLE;

    controls = createUIController({
      pointsCount: data.pointFeatures.length,
      countriesCount: data.visitedCountries.length,
      filterState,
      onRoutesToggle: (visible) => mapController.setRoutesVisibility(visible),
      onVisitedToggle: (visible) => mapController.setCountriesVisibility(visible),
      onProcessChange: handleProcessChange,
    });
    controls.placeControls();
    syncOverlayMenus();

    renderAchievements(data.metrics);

    mapController.updateData({
      geojsonPoints: data.geojsonPoints,
      lineFeatures: data.lineFeatures,
      cityPoints: data.cityPoints,
      visitedCountries: data.visitedCountries,
      cityCoords: data.cityCoordsMap,
    }, { fit: true });

    window.addEventListener('resize', debounce(() => {
      controls.placeControls();
      mapController.resize();
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
