const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

async function main() {
  const itemsJson = process.env.ITEMS_JSON;
  const gasWebAppUrl = process.env.GAS_WEBAPP_URL;
  const callbackSecret = process.env.CALLBACK_SHARED_SECRET;
  const publicPhotoBaseUrl = process.env.PUBLIC_PHOTO_BASE_URL;

  if (!itemsJson) throw new Error('Missing ITEMS_JSON');
  if (!gasWebAppUrl) throw new Error('Missing GAS_WEBAPP_URL');
  if (!callbackSecret) throw new Error('Missing CALLBACK_SHARED_SECRET');
  if (!publicPhotoBaseUrl) throw new Error('Missing PUBLIC_PHOTO_BASE_URL');

  const items = JSON.parse(itemsJson);
  if (!Array.isArray(items) || !items.length) {
    throw new Error('ITEMS_JSON must be a non-empty array');
  }

  const absDir = path.join(process.cwd(), 'photos');
  fs.mkdirSync(absDir, { recursive: true });

  for (const item of items) {
    const rowNumber = String(item.row_number || '').trim();
    const photoUrl = String(item.photo_url || '').trim();

    if (!rowNumber || !photoUrl) {
      continue;
    }

    try {
      const sourceBuffer = await downloadImage(photoUrl);

      const hash = crypto
        .createHash('sha1')
        .update(`${rowNumber}|${photoUrl}`)
        .digest('hex')
        .slice(0, 16);

      const fileName = `row-${rowNumber}-${hash}.webp`;
      const absFile = path.join(absDir, fileName);
      const publicUrl = `${publicPhotoBaseUrl.replace(/\/+$/, '')}/${fileName}`;

      await sharp(sourceBuffer)
        .rotate()
        .webp({ quality: 82 })
        .toFile(absFile);

      console.log(`Row ${rowNumber}: saved ${absFile}`);
      console.log(`Row ${rowNumber}: public URL ${publicUrl}`);

      await sendCallback(gasWebAppUrl, {
        secret: callbackSecret,
        row_number: rowNumber,
        new_url: publicUrl,
        status: 'DONE'
      });
    } catch (err) {
      console.error(`Row ${rowNumber} failed: ${err.message}`);

      try {
        await sendCallback(gasWebAppUrl, {
          secret: callbackSecret,
          row_number: rowNumber,
          status: 'ERROR'
        });
      } catch (callbackErr) {
        console.error(`Row ${rowNumber} callback failed: ${callbackErr.message}`);
      }
    }
  }
}

async function downloadImage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 PhotoProcessor/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function sendCallback(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log('Callback response:', response.status, text);

  if (!response.ok) {
    throw new Error(`Callback failed: ${response.status} ${text}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
