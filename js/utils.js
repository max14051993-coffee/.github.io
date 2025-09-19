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
export const escapeAttr = (s) => String(s || '').replace(/"/g, '&quot;');

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
  return `<img class="popup-cover" loading="lazy" src="${escapeAttr(first)}" alt="photo" onerror="driveImgFallback(this, ${JSON.stringify(rest)})">`;
}

export function driveImgFallback(img, list) {
  if (!list || !list.length) {
    img.remove();
    return;
  }
  img.src = list.shift();
}

if (typeof window !== 'undefined') {
  window.driveImgFallback = driveImgFallback;
}

export const debounce = (fn, ms = 150) => {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
};
