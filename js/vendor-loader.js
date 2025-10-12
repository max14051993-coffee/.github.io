const MAPBOX_GL_JS_URL = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
const MAPBOX_GL_CSS_URL = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
const PAPAPARSE_URL = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';

const pendingResources = new Map();

function resolveOnLoad(el, hrefOrSrc) {
  return new Promise((resolve, reject) => {
    el.addEventListener('load', () => resolve(el), { once: true });
    el.addEventListener('error', () => {
      el.remove();
      reject(new Error(`Failed to load resource: ${hrefOrSrc}`));
    }, { once: true });
  });
}

function trackPromise(key, loader) {
  if (pendingResources.has(key)) {
    return pendingResources.get(key);
  }
  const promise = loader();
  pendingResources.set(key, promise);
  const cleanup = () => pendingResources.delete(key);
  promise.then(cleanup).catch(cleanup);
  return promise;
}

function whenExistingLoads(el, key) {
  return trackPromise(key, () => resolveOnLoad(el, key));
}

function ensureStylesheet(href, attributes = {}) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) {
    if (existing.dataset.vendorReady === 'true') return Promise.resolve(existing);
    try {
      if (existing.sheet) {
        existing.dataset.vendorReady = 'true';
        return Promise.resolve(existing);
      }
    } catch (err) {
      if (err && err.name === 'SecurityError') {
        existing.dataset.vendorReady = 'true';
        return Promise.resolve(existing);
      }
    }
    return whenExistingLoads(existing, href).then((link) => {
      link.dataset.vendorReady = 'true';
      return link;
    });
  }
  return trackPromise(href, () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null && value !== '') {
        link.setAttribute(name, value);
      }
    }
    const promise = resolveOnLoad(link, href).then((el) => {
      el.dataset.vendorReady = 'true';
      return el;
    });
    document.head.append(link);
    return promise;
  });
}

function ensureScript(src, attributes = {}) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (existing.dataset.vendorReady === 'true') return Promise.resolve(existing);
    const state = existing.readyState;
    if (!state || state === 'complete' || state === 'loaded') {
      existing.dataset.vendorReady = 'true';
      return Promise.resolve(existing);
    }
    return whenExistingLoads(existing, src).then((script) => {
      script.dataset.vendorReady = 'true';
      return script;
    });
  }
  return trackPromise(src, () => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null && value !== '') {
        script.setAttribute(name, value);
      }
    }
    const promise = resolveOnLoad(script, src).then((el) => {
      el.dataset.vendorReady = 'true';
      return el;
    });
    document.head.append(script);
    return promise;
  });
}

async function ensureMapboxResources() {
  const tasks = [];
  tasks.push(ensureStylesheet(MAPBOX_GL_CSS_URL, { crossorigin: 'anonymous' }));
  const needsScript = typeof window !== 'undefined' && !window.mapboxgl;
  if (needsScript) {
    tasks.push(ensureScript(MAPBOX_GL_JS_URL, { crossorigin: 'anonymous' }));
  }
  await Promise.all(tasks);
  if (typeof window === 'undefined' || !window.mapboxgl) {
    throw new Error('Mapbox GL JS did not initialize correctly');
  }
  return window.mapboxgl;
}

async function ensurePapaParse() {
  if (typeof window !== 'undefined' && window.Papa) return window.Papa;
  await ensureScript(PAPAPARSE_URL, { crossorigin: 'anonymous' });
  return typeof window !== 'undefined' ? window.Papa : undefined;
}

export async function ensureVendorBundles() {
  if (typeof document === 'undefined') return {};
  const [mapboxgl, Papa] = await Promise.all([
    ensureMapboxResources(),
    ensurePapaParse(),
  ]);
  return { mapboxgl, Papa };
}
