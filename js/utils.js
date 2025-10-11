export const normKey = (k) => String(k || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const normalizeName = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export const toNumber = (v) => (typeof v === 'number') ? v : (typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN);

const ESCAPE_HTML_LOOKUP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (m) => ESCAPE_HTML_LOOKUP[m]);
export const escapeAttr = (s) => String(s || '').replace(/[&<>"']/g, (m) => ESCAPE_HTML_LOOKUP[m]);

export function extractDriveId(url) {
  const match = String(url || '').match(/(?:\/d\/|id=)([-\w]{25,})/);
  return match ? match[1] : null;
}

export function driveImgHtml(url) {
  if (!url) return '';
  if (/thumbnail\?id=/.test(url)) {
    return `<img class="popup-cover" loading="lazy" src="${escapeAttr(url)}" alt="photo">`;
  }
  const id = extractDriveId(url);
  const chain = id ? [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
    `https://lh3.googleusercontent.com/d/${id}=w1600`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://drive.google.com/uc?export=download&id=${id}`,
  ] : [url];
  const [first, ...rest] = chain;
  const fallbackAttr = ` data-fallback="${escapeAttr(JSON.stringify(rest))}"`;
  return `<img class="popup-cover" loading="lazy" src="${escapeAttr(first)}" alt="photo"${fallbackAttr}>`;
}

function readFallbackList(img, list) {
  if (Array.isArray(list)) return list;
  if (!img) return [];
  let raw;
  if (img.dataset && Object.prototype.hasOwnProperty.call(img.dataset, 'fallback')) {
    raw = img.dataset.fallback;
  } else if (typeof img.getAttribute === 'function') {
    const attr = img.getAttribute('data-fallback');
    raw = attr === null ? undefined : attr;
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeFallbackList(img, list) {
  if (!img) return;
  if (list && list.length) {
    if (img.dataset) {
      img.dataset.fallback = JSON.stringify(list);
    } else {
      img.setAttribute('data-fallback', JSON.stringify(list));
    }
  } else {
    img.removeAttribute('data-fallback');
  }
}

export function driveImgFallback(img, list) {
  if (!img) return;
  if (typeof window !== 'undefined' && typeof window.HTMLImageElement !== 'undefined' && !(img instanceof window.HTMLImageElement)) {
    return;
  }
  const queue = readFallbackList(img, list);
  if (!queue || !queue.length) {
    img.removeAttribute('data-fallback');
    img.remove();
    return;
  }
  const next = queue.shift();
  storeFallbackList(img, queue);
  img.src = next;
}

if (typeof window !== 'undefined') {
  window.driveImgFallback = driveImgFallback;
  window.addEventListener('error', (event) => {
    const target = event?.target;
    if (!target || !(target instanceof window.HTMLImageElement)) return;
    const hasDatasetFallback = target.dataset && Object.prototype.hasOwnProperty.call(target.dataset, 'fallback');
    const hasAttrFallback = typeof target.getAttribute === 'function' && target.getAttribute('data-fallback') !== null;
    if (!hasDatasetFallback && !hasAttrFallback) return;
    driveImgFallback(target);
  }, true);
}

export const debounce = (fn, ms = 150) => {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
};

export function setupInfoDisclosure({ toggle, panel, closeOnOutside = true } = {}) {
  if (!toggle || !panel) return () => {};

  const close = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  };

  const handleToggleClick = (event) => {
    event.stopPropagation();
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      close();
    } else {
      open();
    }
  };

  const handleDocumentClick = (event) => {
    if (panel.hidden) return;
    const target = event.target;
    if (toggle.contains(target) || panel.contains(target)) return;
    close();
  };

  const handleKeydown = (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    close();
    if (typeof toggle.focus === 'function') {
      toggle.focus();
    }
  };

  toggle.addEventListener('click', handleToggleClick);
  document.addEventListener('keydown', handleKeydown);
  if (closeOnOutside) {
    document.addEventListener('click', handleDocumentClick);
  }

  return () => {
    toggle.removeEventListener('click', handleToggleClick);
    document.removeEventListener('keydown', handleKeydown);
    if (closeOnOutside) {
      document.removeEventListener('click', handleDocumentClick);
    }
  };
}

export function runWhenIdle(callback, { timeout = 0 } = {}) {
  if (typeof callback !== 'function') return () => {};
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, timeout ? { timeout } : undefined);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(handle);
      }
    };
  }

  const timer = window.setTimeout(callback, Math.max(timeout, 0));
  return () => window.clearTimeout(timer);
}
