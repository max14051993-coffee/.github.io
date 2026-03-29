const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

async function main() {
  const rowNumber = process.env.ROW_NUMBER;
  const photoUrl = process.env.PHOTO_URL;
  const gasWebAppUrl = process.env.GAS_WEBAPP_URL;
  const callbackSecret = process.env.CALLBACK_SHARED_SECRET;
  const repoName = process.env.GITHUB_REPOSITORY_NAME;
  const ownerName = process.env.GITHUB_OWNER_NAME;

  if (!rowNumber) throw new Error('Missing ROW_NUMBER');
  if (!photoUrl) throw new Error('Missing PHOTO_URL');
  if (!gasWebAppUrl) throw new Error('Missing GAS_WEBAPP_URL');
  if (!callbackSecret) throw new Error('Missing CALLBACK_SHARED_SECRET');
  if (!repoName) throw new Error('Missing GITHUB_REPOSITORY_NAME');
  if (!ownerName) throw new Error('Missing GITHUB_OWNER_NAME');

  const sourceBuffer = await downloadImage(photoUrl);

  const hash = crypto
    .createHash('sha1')
    .update(`${rowNumber}|${photoUrl}`)
    .digest('hex')
    .slice(0, 16);

  const fileName = `row-${rowNumber}-${hash}.webp`;
  const relDir = path.join('public', 'photos');
  const absDir = path.join(process.cwd(), relDir);
  const absFile = path.join(absDir, fileName);

  fs.mkdirSync(absDir, { recursive: true });

  await sharp(sourceBuffer)
    .rotate()
    .webp({ quality: 82 })
    .toFile(absFile);

  const publicUrl = `https://${ownerName}.github.io/${repoName}/photos/${fileName}`;

  await sendCallback(gasWebAppUrl, {
    secret: callbackSecret,
    row_number: String(rowNumber),
    new_url: publicUrl,
    status: 'DONE'
  });

  console.log('Saved file:', absFile);
  console.log('Public URL:', publicUrl);
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
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log('Callback response:', response.status, text);

  if (!response.ok) {
    throw new Error(`Callback failed: ${response.status} ${text}`);
  }
}

main().catch(async (err) => {
  console.error(err);

  try {
    const gasWebAppUrl = process.env.GAS_WEBAPP_URL;
    const callbackSecret = process.env.CALLBACK_SHARED_SECRET;
    const rowNumber = process.env.ROW_NUMBER;

    if (gasWebAppUrl && callbackSecret && rowNumber) {
      await sendCallback(gasWebAppUrl, {
        secret: callbackSecret,
        row_number: String(rowNumber),
        status: 'ERROR'
      });
    }
  } catch (callbackErr) {
    console.error('Failed to send error callback:', callbackErr);
  }

  process.exit(1);
});
