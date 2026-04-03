const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CALLBACK_URL = process.env.CALLBACK_URL;
const CALLBACK_SECRET = process.env.CALLBACK_SHARED_SECRET;
const ITEMS_JSON = process.env.ITEMS_JSON;
const REPO_OUTPUT_DIR = process.env.REPO_OUTPUT_DIR || 'photos';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
console.log('DEBUG SCRIPT VERSION = 2026-04-03-url-check');
console.log('DEBUG ENV PUBLIC_BASE_URL RAW =', JSON.stringify(process.env.PUBLIC_BASE_URL || ''));
if (!CALLBACK_URL) throw new Error('Missing env: CALLBACK_URL');
if (!CALLBACK_SECRET) throw new Error('Missing env: CALLBACK_SHARED_SECRET');
if (!ITEMS_JSON) throw new Error('Missing env: ITEMS_JSON');

const items = JSON.parse(ITEMS_JSON);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function looksLikeImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  if (buffer.slice(0, 3).toString() === 'GIF') return true;
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return true;
  if (buffer.slice(4, 8).toString() === 'ftyp') return true;

  return false;
}

function buildPublicUrl(relativePath) {
  const cleaned = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');

  if (!PUBLIC_BASE_URL) {
    throw new Error('PUBLIC_BASE_URL is empty');
  }

  return `${PUBLIC_BASE_URL}/${cleaned}`;
}

  const repo = process.env.GITHUB_REPOSITORY
    ? process.env.GITHUB_REPOSITORY.split('/')[1]
    : '';

  console.log('DEBUG repo =', JSON.stringify(repo));

  if (repo && repo.endsWith('.github.io')) {
    const finalUrl = `https://${repo}/${cleaned}`;
    console.log('DEBUG finalUrl from repo =', finalUrl);
    return finalUrl;
  }

  console.log('DEBUG fallback cleaned only =', cleaned);
  return cleaned;
}

async function postCallback(payload) {
  const res = await fetch(CALLBACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      secret: CALLBACK_SECRET
    })
  });

  const text = await res.text();
  console.log(`Callback response: ${res.status} ${text}`);
}

async function downloadImage(photoUrl, rowNumber) {
  const res = await fetch(photoUrl, {
    method: 'GET',
    redirect: 'follow'
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const finalUrl = res.url;
  const buffer = Buffer.from(await res.arrayBuffer());

  console.log(`Row ${rowNumber}: download status=${res.status}`);
  console.log(`Row ${rowNumber}: content-type=${contentType}`);
  console.log(`Row ${rowNumber}: final-url=${finalUrl}`);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while downloading`);
  }

  const isImageByHeader = contentType.startsWith('image/');
  const isImageByBytes = looksLikeImageBuffer(buffer);

  if (!isImageByHeader && !isImageByBytes) {
    const preview = buffer.slice(0, 300).toString('utf8').replace(/\s+/g, ' ');
    if (preview.includes('accounts.google.com') || preview.includes('ServiceLogin')) {
      throw new Error('Google login redirect');
    }
    throw new Error(`Downloaded resource is not an image. content-type=${contentType}; preview=${preview}`);
  }

  return { buffer };
}

async function processOne(item) {
  const rowNumber = Number(item.row_number);
  const photoUrl = String(item.photo_url || '').trim();

  if (!rowNumber || !photoUrl) {
    throw new Error(`Invalid item: ${JSON.stringify(item)}`);
  }

  const { buffer } = await downloadImage(photoUrl, rowNumber);

  let outputBuffer;
  try {
    outputBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
  } catch (e) {
    throw new Error(`Sharp failed: ${e.message}`);
  }

  ensureDir(REPO_OUTPUT_DIR);

  const fileName = sanitizeFileName(`coffee_row_${rowNumber}.webp`);
  const relativePath = path.join(REPO_OUTPUT_DIR, fileName);
  fs.writeFileSync(relativePath, outputBuffer);

  return {
    rowNumber,
    relativePath,
    publicUrl: buildPublicUrl(relativePath)
  };
}

async function main() {
  for (const item of items) {
    const rowNumber = Number(item.row_number);

    try {
      const result = await processOne(item);
      console.log(`Row ${rowNumber}: saved to ${result.relativePath}`);
      console.log(`Row ${rowNumber}: public url ${result.publicUrl}`);

      await postCallback({
        row_number: rowNumber,
        new_url: result.publicUrl,
        status: 'DONE'
      });
    } catch (e) {
      console.error(`Row ${rowNumber} failed: ${e.message}`);

      let status = 'ERROR';
      const msg = String(e.message || '').toLowerCase();

      if (msg.includes('google login redirect')) status = 'ERROR_PRIVATE_DRIVE_FILE';
      else if (msg.includes('not an image')) status = 'ERROR_NOT_IMAGE';
      else if (msg.includes('http 403') || msg.includes('http 401')) status = 'ERROR_ACCESS_DENIED';
      else if (msg.includes('sharp failed')) status = 'ERROR_UNSUPPORTED_IMAGE';

      await postCallback({
        row_number: rowNumber,
        status
      });
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
