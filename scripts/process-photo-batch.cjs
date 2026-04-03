const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CALLBACK_URL = process.env.CALLBACK_URL;
const CALLBACK_SECRET = process.env.CALLBACK_SHARED_SECRET;
const ITEMS_JSON = process.env.ITEMS_JSON;
const REPO_OUTPUT_DIR = process.env.REPO_OUTPUT_DIR || 'photos';

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

function detectExtensionFromContentType(contentType) {
  const ct = String(contentType || '').toLowerCase();

  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg';
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/gif')) return 'gif';
  if (ct.includes('image/avif')) return 'avif';
  if (ct.includes('image/heic')) return 'heic';
  if (ct.includes('image/heif')) return 'heif';

  return 'jpg';
}

function looksLikeImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) return true;

  // GIF
  if (buffer.slice(0, 3).toString() === 'GIF') return true;

  // WEBP
  if (
    buffer.slice(0, 4).toString() === 'RIFF' &&
    buffer.slice(8, 12).toString() === 'WEBP'
  ) return true;

  // ISO BMFF family: avif/heic/heif
  if (buffer.slice(4, 8).toString() === 'ftyp') return true;

  return false;
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
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`Row ${rowNumber}: download status=${res.status}`);
  console.log(`Row ${rowNumber}: content-type=${contentType}`);
  console.log(`Row ${rowNumber}: final-url=${finalUrl}`);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while downloading`);
  }

  const isImageByHeader = contentType.startsWith('image/');
  const isImageByBytes = looksLikeImageBuffer(buffer);

  if (!isImageByHeader && !isImageByBytes) {
    const preview = buffer.slice(0, 160).toString('utf8').replace(/\s+/g, ' ');
    throw new Error(`Downloaded resource is not an image. content-type=${contentType}; preview=${preview}`);
  }

  return { buffer, contentType, finalUrl };
}

async function processOne(item) {
  const rowNumber = Number(item.row_number);
  const photoUrl = String(item.photo_url || '').trim();

  if (!rowNumber || !photoUrl) {
    throw new Error(`Invalid item: ${JSON.stringify(item)}`);
  }

  const { buffer, contentType } = await downloadImage(photoUrl, rowNumber);

  let outputBuffer;
  try {
    outputBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();
  } catch (e) {
    throw new Error(`Sharp failed: ${e.message}`);
  }

  ensureDir(REPO_OUTPUT_DIR);

  const fileName = sanitizeFileName(`coffee_row_${rowNumber}.jpg`);
  const outPath = path.join(REPO_OUTPUT_DIR, fileName);

  fs.writeFileSync(outPath, outputBuffer);

  return {
    row_number: rowNumber,
    file_path: outPath,
    file_name: fileName,
    source_content_type: contentType
  };
}

async function main() {
  for (const item of items) {
    const rowNumber = Number(item.row_number);

    try {
      const result = await processOne(item);

      const newUrl = `./${result.file_path.replace(/\\/g, '/')}`;
      console.log(`Row ${rowNumber}: saved to ${newUrl}`);

      await postCallback({
        row_number: rowNumber,
        new_url: newUrl,
        status: 'DONE'
      });
    } catch (e) {
      console.error(`Row ${rowNumber} failed: ${e.message}`);

      let status = 'ERROR';
      const msg = String(e.message || '').toLowerCase();

      if (msg.includes('not an image')) status = 'ERROR_NOT_IMAGE';
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
