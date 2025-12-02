import { debounce, setupInfoDisclosure } from './utils.js';
import {
  buildCityPoints,
  buildRouteFeatures,
  getVisitedCountriesIso2,
  loadData,
} from './data-loader.js';
import { renderAchievements, renderStats } from './ui-controls.js';
import { createMapController } from './map-init.js';
import { ensureVendorBundles } from './vendor-loader.js';

const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';

function resolveMapboxToken(params) {
  const explicitToken = params.get('mapboxToken')
    || document.querySelector('meta[name="mapbox-access-token"]')?.content;

  return explicitToken?.trim() || DEFAULT_MAPBOX_TOKEN;
}
const theme = (new URLSearchParams(location.search).get('style') || 'light').toLowerCase();
document.body.dataset.theme = theme;
const flagMode = (new URLSearchParams(location.search).get('flag') || 'img').toLowerCase();

const urlParams = new URLSearchParams(location.search);

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

  if (sheetName) {
    const query = new URLSearchParams({ tqx: 'out:csv', sheet: sheetName, tq: 'select *' });
    return {
      csvUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query.toString()}`,
      sheetId,
      gid,
      sheetName,
    };
  }

  const query = new URLSearchParams({ format: 'csv', gid });
  return {
    csvUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?${query.toString()}`,
    sheetId,
    gid,
    sheetName,
  };
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
const resetViewButton = document.querySelector('[data-reset-view]');

function setupResetViewButton() {
  if (!resetViewButton) return;
  resetViewButton.addEventListener('click', () => {
    mapController?.resetView();
  });
}

async function loadDataset() {
  const sheetConfig = getConfiguredSheetConfig();
  const { csvUrl, sheetId, gid, sheetName } = sheetConfig;
  if (!csvUrl) throw new Error('Не задан URL опубликованной таблицы Google Sheets.');

  try {
    const dataset = await loadData({ csvUrl, mapboxToken: MAPBOX_TOKEN });
    return { dataset, source: 'csv', csvUrl };
  } catch (primaryError) {
    const fallbackQuery = new URLSearchParams({ tqx: 'out:csv', tq: 'select *' });
    if (gid) fallbackQuery.set('gid', gid);
    if (sheetName) fallbackQuery.set('sheet', sheetName);

    if (sheetId) {
      const fallbackUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${fallbackQuery.toString()}`;
      if (fallbackUrl !== csvUrl) {
        console.warn('Primary CSV load failed, trying gviz CSV endpoint', primaryError);
        const dataset = await loadData({ csvUrl: fallbackUrl, mapboxToken: MAPBOX_TOKEN });
        return { dataset, source: 'csv', csvUrl: fallbackUrl };
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
  assertMapboxToken();
  try {
    const { mapboxgl } = await ensureVendorBundles();
    mapController = createMapController({ mapboxgl, accessToken: MAPBOX_TOKEN, theme, flagMode, viewMode: 'points' });
    mapController.setRoutesVisibility(true);
    setupResetViewButton();
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

    applyFilters({ fit: true });

    if (dataset.metrics) {
      renderAchievements(dataset.metrics);
      renderStats(dataset.metrics);
    }

    window.addEventListener('resize', debounce(() => {
      mapController?.refresh3DLayers();
      mapController?.resize();
    }, 150));
  } catch (err) {
    console.error('CSV error:', err);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = '<div class="map-error">Не удалось загрузить таблицу Google Sheets. Проверьте доступ по ссылке.</div>';
    }
  }
}

init();
