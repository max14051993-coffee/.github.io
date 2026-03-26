const RUM_DEFAULT_ENDPOINT = '/rum/vitals';
const RUM_FLUSH_MS = 5000;
const RUM_SESSION_KEY = 'coffee_rum_session_id';
const SENT_METRICS_KEY = 'coffee_rum_sent_metrics_v1';

function safeNow() {
  if (typeof performance === 'undefined' || typeof performance.now !== 'function') return Date.now();
  return performance.now();
}

function getOrCreateSessionId() {
  if (typeof window === 'undefined') return `srv-${Date.now()}`;
  try {
    const existing = window.sessionStorage.getItem(RUM_SESSION_KEY);
    if (existing) return existing;
    const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(RUM_SESSION_KEY, created);
    return created;
  } catch (error) {
    return `fallback-${Date.now()}`;
  }
}

function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown';
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches) return 'mobile';
  return 'desktop';
}

function getNetworkType() {
  const connection = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
  return String(connection?.effectiveType || 'unknown').toLowerCase() || 'unknown';
}

function getRegionHint() {
  const locale = String(navigator?.language || '').trim();
  const country = locale.includes('-') ? locale.split('-')[1].toUpperCase() : 'unknown';
  let timezone = 'unknown';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch (error) {
    timezone = 'unknown';
  }
  return { country, timezone };
}

function buildContext({ appVersion = 'unknown', appCommit = 'unknown' } = {}) {
  const region = getRegionHint();
  return {
    deviceType: getDeviceType(),
    effectiveType: getNetworkType(),
    country: region.country,
    timezone: region.timezone,
    appVersion,
    appCommit,
    urlPath: typeof location === 'undefined' ? '' : location.pathname,
  };
}

function loadSentMetrics() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(SENT_METRICS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr);
  } catch (error) {
    return new Set();
  }
}

function persistSentMetrics(set) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SENT_METRICS_KEY, JSON.stringify([...set]));
  } catch (error) {
    // ignore
  }
}

function sendBatch(endpoint, batch) {
  if (!Array.isArray(batch) || !batch.length) return;
  const body = JSON.stringify({ events: batch });
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(endpoint, blob)) return;
  }
  fetch(endpoint, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'application/json' },
  }).catch(() => {});
}

export function isRumEnabled(params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')) {
  const fromUrl = String(params.get('rum') || '').toLowerCase();
  if (fromUrl === '1' || fromUrl === 'true' || fromUrl === 'on') return true;
  if (fromUrl === '0' || fromUrl === 'false' || fromUrl === 'off') return false;
  const meta = document.querySelector('meta[name="rum-enabled"]')?.content;
  return String(meta || '').toLowerCase() === 'true';
}

export function initializeRum({
  enabled = false,
  endpoint = RUM_DEFAULT_ENDPOINT,
  appVersion = 'unknown',
  appCommit = 'unknown',
} = {}) {
  if (!enabled || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return { enabled: false };
  }

  const context = buildContext({ appVersion, appCommit });
  const sessionId = getOrCreateSessionId();
  const sentMetrics = loadSentMetrics();
  const queue = [];
  let flushTimer = 0;

  const enqueue = (metricName, value, extra = {}) => {
    const dedupeKey = `${sessionId}:${metricName}`;
    if (sentMetrics.has(dedupeKey)) return;
    sentMetrics.add(dedupeKey);
    persistSentMetrics(sentMetrics);

    queue.push({
      metric: metricName,
      value,
      ts: Date.now(),
      sessionId,
      ...context,
      ...extra,
    });

    if (!flushTimer) {
      flushTimer = window.setTimeout(() => {
        flushTimer = 0;
        const batch = queue.splice(0, queue.length);
        sendBatch(endpoint, batch);
      }, RUM_FLUSH_MS);
    }
  };

  // FCP
  const paints = performance.getEntriesByType('paint');
  const fcp = paints.find((entry) => entry.name === 'first-contentful-paint');
  if (fcp) enqueue('FCP', Math.round(fcp.startTime));

  // LCP and CLS
  let lcpValue = 0;
  let clsValue = 0;
  let inpValue = 0;

  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last) lcpValue = last.startTime;
  });

  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) clsValue += entry.value;
    }
  });

  const inpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const duration = Number(entry.duration || 0);
      if (duration > inpValue) inpValue = duration;
    }
  });

  try { lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true }); } catch (_) {}
  try { clsObserver.observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
  try { inpObserver.observe({ type: 'event', durationThreshold: 40, buffered: true }); } catch (_) {}

  const finalize = () => {
    if (lcpValue > 0) enqueue('LCP', Math.round(lcpValue));
    if (inpValue > 0) enqueue('INP', Math.round(inpValue));
    enqueue('CLS', Number(clsValue.toFixed(4)));
    const batch = queue.splice(0, queue.length);
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = 0;
    }
    sendBatch(endpoint, batch);
  };

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finalize();
  }, { once: true });
  window.addEventListener('pagehide', finalize, { once: true });

  enqueue('rum_init', safeNow(), { kind: 'lifecycle' });

  return { enabled: true, finalize };
}

export function buildRumAggregationQuery() {
  return {
    groupBy: ['metric', 'deviceType', 'effectiveType'],
    aggregates: ['count', 'p50', 'p75', 'p95'],
  };
}
