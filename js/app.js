import { debounce, setupInfoDisclosure } from './utils.js';
import {
  buildCityPoints,
  buildRouteFeatures,
  getVisitedCountriesIso2,
  loadBaseDataset,
  loadSupplementalDataset,
} from './data-loader.js';
import { renderAchievements } from './ui-controls.js';
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
  const baseDataAbort = (typeof AbortController === 'function') ? new AbortController() : null;
  const baseDataPromise = loadBaseDataset({
    csvUrl: CSV_URL,
    signal: baseDataAbort?.signal,
  });

  try {
    const { mapboxgl } = await ensureVendorBundles();
    mapController = createMapController({ mapboxgl, accessToken: MAPBOX_TOKEN, theme, flagMode, viewMode: 'points' });
    mapController.setRoutesVisibility(true);
  } catch (dependencyError) {
    console.error('Map dependency error:', dependencyError);
    if (baseDataAbort) {
      baseDataAbort.abort();
      await baseDataPromise.catch(() => null);
    }
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = '<div class="map-error">Не удалось загрузить карту. Попробуйте обновить страницу.</div>';
    }
    return;
  }

  try {
    const baseData = await baseDataPromise;
    allPointFeatures = baseData.pointFeatures;
    cityCoords = {};

    const titleEl = document.getElementById('collectionTitle');
    if (titleEl) titleEl.textContent = COLLECTION_TITLE;
    document.title = COLLECTION_TITLE;

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
      mapController?.refresh3DLayers();
      mapController?.resize();
    }, 150));
  } catch (err) {
    showAchievementsStatus('Ошибка загрузки данных', 'error');
    console.error('CSV error:', err);
  }
}

init();
