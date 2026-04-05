import { loadData } from './data-loader.js';
import { renderAchievements, TOTAL_ACHIEVEMENTS } from './ui-controls.js';

const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoibWF4MTQwNTE5OTMtY29mZmVlIiwiYSI6ImNtZTVic3c3dTBxZDMya3F6MzV0ejY1YjcifQ._YoZjruPVrVHtusEf8OkZw';
const DEFAULT_GOOGLE_SHEET_ID = '1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw';
const DEFAULT_GOOGLE_SHEET_GID = '0';
const DEFAULT_PREBUILT_DATASET_URL = '';
const DAY_MS = 24 * 60 * 60 * 1000;

const urlParams = new URLSearchParams(window.location.search);

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

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function calcRecentCups(features, days = 30) {
  if (!Array.isArray(features) || !features.length) return 0;
  const now = Date.now();
  const threshold = now - (days * DAY_MS);
  return features.reduce((count, feature) => {
    const raw = feature?.properties?.timestamp;
    const date = parseDate(raw);
    if (date && date.getTime() >= threshold) return count + 1;
    return count;
  }, 0);
}

function calcActiveStreak(features) {
  if (!Array.isArray(features) || !features.length) return 0;
  const uniqueDays = new Set();

  features.forEach((feature) => {
    const date = parseDate(feature?.properties?.timestamp);
    if (!date) return;
    uniqueDays.add(normalizeUtcDay(date));
  });

  if (!uniqueDays.size) return 0;

  const sortedDays = [...uniqueDays].sort((a, b) => b - a);
  let streak = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    if (sortedDays[i - 1] - sortedDays[i] === DAY_MS) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function calcNewCountries(features, days = 90) {
  if (!Array.isArray(features) || !features.length) return 0;

  const firstSeen = new Map();
  features.forEach((feature) => {
    const code = String(feature?.properties?.countryIso2 || '').trim().toUpperCase();
    const date = parseDate(feature?.properties?.timestamp);
    if (!code || !date) return;
    const ts = date.getTime();
    const prev = firstSeen.get(code);
    if (!Number.isFinite(prev) || ts < prev) {
      firstSeen.set(code, ts);
    }
  });

  if (!firstSeen.size) return 0;

  const threshold = Date.now() - (days * DAY_MS);
  let count = 0;
  for (const ts of firstSeen.values()) {
    if (ts >= threshold) count += 1;
  }
  return count;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function renderKpis(dataset) {
  const metrics = dataset?.metrics || {};
  const features = dataset?.pointFeatures || [];
  const total = Number(metrics.total || 0);
  const recent30 = calcRecentCups(features, 30);
  const streak = calcActiveStreak(features);
  const newCountries90 = calcNewCountries(features, 90);

  setText('[data-kpi-total]', total.toLocaleString('ru-RU'));
  setText('[data-kpi-total-meta]', `${recent30 >= 0 ? '+' : ''}${recent30} за 30 дней`);
  setText('[data-kpi-streak]', String(streak));
  setText('[data-kpi-countries]', String(newCountries90));
  setText('[data-kpi-updated]', formatDateTime(dataset?.generatedAt));

  renderAchievements(metrics);

  const earnedAchievements = document.querySelectorAll('#achievements .ach-badge.is-earned').length;
  const progress = TOTAL_ACHIEVEMENTS > 0
    ? Math.round((earnedAchievements / TOTAL_ACHIEVEMENTS) * 100)
    : 0;

  setText('[data-kpi-achievements]', `${earnedAchievements}/${TOTAL_ACHIEVEMENTS}`);
  setText('[data-kpi-achievements-meta]', `${progress}% прогресса`);
  setText('[data-achievements-opened]', `${earnedAchievements} открыто`);
}

async function initStatsPage() {
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
