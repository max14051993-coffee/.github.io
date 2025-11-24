import { debounce, setupInfoDisclosure } from './utils.js';
import {
  buildCityPoints,
  buildRouteFeatures,
  getVisitedCountriesIso2,
  loadData,
} from './data-loader.js';
import { renderAchievements } from './ui-controls.js';
import { createMapController } from './map-init.js';
import { ensureVendorBundles } from './vendor-loader.js';
import { STATIC_DATA } from './static-dataset.js';

const MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
document.body.dataset.theme = theme;
const flagMode = (new URLSearchParams(location.search).get('flag') || 'img').toLowerCase();

const urlParams = new URLSearchParams(location.search);

const BUNDLED_CSV_URL = 'data/coffee-log.csv';
const DEFAULT_GOOGLE_SHEET_ID = '1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw';
const DEFAULT_GOOGLE_SHEET_GID = '0';

function getConfiguredCsvUrl() {
  const explicitUrl = urlParams.get('csv')
    || document.querySelector('meta[name="google-sheet-csv"]')?.content;
  if (explicitUrl) return explicitUrl;

  const sheetId = urlParams.get('sheetId')
    || document.querySelector('meta[name="google-sheet-id"]')?.content
    || DEFAULT_GOOGLE_SHEET_ID;
  const gid = urlParams.get('gid')
    || document.querySelector('meta[name="google-sheet-gid"]')?.content
    || DEFAULT_GOOGLE_SHEET_GID;
  const sheetName = urlParams.get('sheetName')
    || document.querySelector('meta[name="google-sheet-name"]')?.content;

  if (sheetId) {
    if (sheetName) {
      const query = new URLSearchParams({ tqx: 'out:csv', sheet: sheetName });
      return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query.toString()}`;
    }

    const query = new URLSearchParams({ format: 'csv', gid });
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?${query.toString()}`;
  }

  const bundledCsv = document.querySelector('meta[name="google-sheet-csv"]')?.content;
  return bundledCsv || BUNDLED_CSV_URL;
}

const COLLECTION_TITLE = 'My coffee experience';

document.title = COLLECTION_TITLE;

setupInfoDisclosure({
  toggle: document.querySelector('[data-map-info-toggle]'),
  panel: document.querySelector('[data-map-info-panel]'),
});

let mapController = null;
let allPointFeatures = [];
let cityCoords = {};

async function loadDataset() {
  const csvUrl = getConfiguredCsvUrl() || BUNDLED_CSV_URL;

  try {
    const dataset = await loadData({ csvUrl, mapboxToken: MAPBOX_TOKEN });
    return { dataset, source: 'csv', csvUrl };
  } catch (primaryError) {
    if (csvUrl !== BUNDLED_CSV_URL) {
      try {
        const dataset = await loadData({ csvUrl: BUNDLED_CSV_URL, mapboxToken: MAPBOX_TOKEN });
        console.warn(`Failed to load CSV from ${csvUrl}. Using bundled CSV instead.`, primaryError);
        return { dataset, source: 'csv', csvUrl: BUNDLED_CSV_URL, error: primaryError };
      } catch (fallbackError) {
        console.error('Failed to load both configured and bundled CSV. Falling back to static dataset.', fallbackError);
        return { dataset: STATIC_DATA, source: 'static', error: fallbackError };
      }
    }

    console.error('Failed to load bundled CSV. Falling back to static dataset.', primaryError);
    return { dataset: STATIC_DATA, source: 'static', error: primaryError };
  }
}

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
    const { dataset } = await loadDataset();
    const geojsonPoints = dataset.geojsonPoints;
    allPointFeatures = dataset.pointFeatures || geojsonPoints?.features || [];
    cityCoords = dataset.cityCoordsMap || dataset.cityCoords || {};

    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = COLLECTION_TITLE;
    document.title = COLLECTION_TITLE;

    applyFilters({ fit: true });

    if (dataset.metrics) {
      renderAchievements(dataset.metrics);
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
