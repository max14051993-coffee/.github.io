import { loadData } from './data-loader.js';
import { renderAchievements } from './ui-controls.js';

const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
const DEFAULT_GOOGLE_SHEET_ID = '1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw';
const DEFAULT_GOOGLE_SHEET_GID = '0';
const DEFAULT_PREBUILT_DATASET_URL = '';
const showAllAchievementsButton = document.querySelector('[data-show-all-achievements]');
let currentMetrics = null;

const urlParams = new URLSearchParams(window.location.search);
document.body.dataset.achievementsView = 'compact';
document.body.dataset.achievementsSelection = 'recent-open';

function renderStatsAchievements(showAll = false) {
  if (!currentMetrics) return;
  renderAchievements(currentMetrics, {
    viewMode: 'detailed',
    selectionMode: showAll ? 'all' : 'recent-open',
  });
  if (showAllAchievementsButton) {
    showAllAchievementsButton.hidden = showAll;
  }
}

function resolveMapboxToken(params) {
  const explicitToken = params.get('mapboxToken')
    || document.querySelector('meta[name="mapbox-access-token"]')?.content;
  return explicitToken?.trim() || DEFAULT_MAPBOX_TOKEN;
}

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

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function renderKpis(dataset) {
  const metrics = dataset?.metrics || {};
  currentMetrics = metrics;
  const total = Number(metrics.total || 0);
  const countriesTotal = Number.isFinite(metrics?.countries)
    ? Number(metrics.countries)
    : (Array.isArray(metrics?.countryCodes) ? metrics.countryCodes.length : 0);
  const roasterCountriesTotal = Array.isArray(metrics?.roasterCountries)
    ? metrics.roasterCountries.length
    : Number(metrics?.roasterCountries || 0);

  setText('[data-kpi-total]', total.toLocaleString('ru-RU'));
  setText('[data-kpi-countries-total]', String(countriesTotal));
  setText('[data-kpi-roaster-countries]', String(roasterCountriesTotal));

  renderStatsAchievements(false);
}

async function initStatsPage() {
  if (showAllAchievementsButton) {
    showAllAchievementsButton.addEventListener('click', () => {
      renderStatsAchievements(true);
    });
  }

  const statusEl = document.querySelector('[data-stats-status]');
  if (statusEl) statusEl.textContent = 'Загружаем актуальную статистику…';

  const sheetConfig = getConfiguredSheetConfig();
  const prebuiltUrl = getConfiguredPrebuiltUrl();
  const mapboxToken = resolveMapboxToken(urlParams);

  try {
    const dataset = await loadData({
      csvUrl: sheetConfig.csvUrl,
      prebuiltUrl,
      mapboxToken,
    });

    renderKpis(dataset);

    if (statusEl) {
      statusEl.textContent = '';
      statusEl.hidden = true;
    }
  } catch (error) {
    console.error('Не удалось загрузить статистику:', error);
    if (statusEl) {
      statusEl.textContent = 'Не удалось загрузить актуальные данные. Проверьте доступ к таблице.';
      statusEl.hidden = false;
    }
  }
}

initStatsPage();
