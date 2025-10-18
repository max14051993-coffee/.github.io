import { debounce, setupInfoDisclosure } from './utils.js';
import {
  buildCityPoints,
  buildRouteFeatures,
  getVisitedCountriesIso2,
} from './data-loader.js';
import { renderAchievements } from './ui-controls.js';
import { createMapController } from './map-init.js';
import { ensureVendorBundles } from './vendor-loader.js';
import { STATIC_DATA } from './static-dataset.js';

const MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
document.body.dataset.theme = theme;
const flagMode = (new URLSearchParams(location.search).get('flag') || 'img').toLowerCase();

const COLLECTION_TITLE = 'My coffee experience';

document.title = COLLECTION_TITLE;

setupInfoDisclosure({
  toggle: document.querySelector('[data-map-info-toggle]'),
  panel: document.querySelector('[data-map-info-panel]'),
});

let mapController = null;
let allPointFeatures = [];
let cityCoords = {};

function getFilteredFeatures() {
  return allPointFeatures;
}

function applyFilters({ fit = false } = {}) {
  const features = getFilteredFeatures();
  const geojson = { type: 'FeatureCollection', features };
  const lineFeatures = buildRouteFeatures(features, cityCoords);
  const cityPoints = buildCityPoints(features, cityCoords);
  const visited = [...getVisitedCountriesIso2(features)];

  if (!mapController) return features;

  mapController.updateData({
    geojsonPoints: geojson,
    lineFeatures,
    cityPoints,
    visitedCountries: visited,
    cityCoords,
  }, { fit });
  return features;
}

async function init() {
  try {
    const { mapboxgl } = await ensureVendorBundles();
    mapController = createMapController({ mapboxgl, accessToken: MAPBOX_TOKEN, theme, flagMode, viewMode: 'points' });
    mapController.setRoutesVisibility(true);
  } catch (dependencyError) {
    console.error('Map dependency error:', dependencyError);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = '<div class="map-error">Не удалось загрузить карту. Попробуйте обновить страницу.</div>';
    }
    return;
  }

  try {
    const baseData = STATIC_DATA;
    allPointFeatures = baseData.pointFeatures || [];
    cityCoords = baseData.cityCoordsMap || {};

    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = COLLECTION_TITLE;
    document.title = COLLECTION_TITLE;

    applyFilters({ fit: true });

    if (baseData.metrics) {
      renderAchievements(baseData.metrics);
    }

    if (Object.keys(cityCoords).length === 0) {
      console.warn('Static dataset does not include city coordinates. Route lines will be hidden.');
    }

    window.addEventListener('resize', debounce(() => {
      mapController?.refresh3DLayers();
      mapController?.resize();
    }, 150));
  } catch (err) {
    console.error('CSV error:', err);
  }
}

init();
