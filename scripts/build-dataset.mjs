#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

import {
  loadBaseDataset,
  loadSupplementalDataset,
} from '../js/data-loader.js';

const DEFAULT_SHEET_ID = '1D87usuWeFvUv9ejZ5igywlncq604b5hoRLFkZ9cjigw';
const DEFAULT_GID = '0';

function parseArgs(argv) {
  const options = {
    sheetId: DEFAULT_SHEET_ID,
    gid: DEFAULT_GID,
    sheetName: '',
    csvUrl: '',
    mapboxToken: process.env.MAPBOX_TOKEN || '',
    out: 'data/dataset.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.trim();
    const next = argv[i + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : '');
    if (inlineValue == null && value && next && !next.startsWith('--')) i += 1;
    if (key in options) options[key] = value;
  }

  return options;
}

function printHelp() {
  console.log(`Build prebuilt coffeemap dataset JSON.\n\n` +
`Usage:\n` +
`  node scripts/build-dataset.mjs [options]\n\n` +
`Options:\n` +
`  --csvUrl <url>         Use explicit CSV URL\n` +
`  --sheetId <id>         Google Sheet ID (default: ${DEFAULT_SHEET_ID})\n` +
`  --gid <gid>            Google Sheet gid (default: ${DEFAULT_GID})\n` +
`  --sheetName <name>     Google Sheet tab name (uses gviz CSV endpoint)\n` +
`  --mapboxToken <token>  Mapbox token for geocoding (fallback: MAPBOX_TOKEN env)\n` +
`  --out <path>           Output JSON file (default: data/dataset.json)\n` +
`  --help                 Show this help\n`);
}

function buildCsvUrl({ csvUrl, sheetId, gid, sheetName }) {
  if (csvUrl) return csvUrl;
  if (!sheetId) throw new Error('sheetId is required when csvUrl is not provided.');

  if (sheetName) {
    const query = new URLSearchParams({ tqx: 'out:csv', sheet: sheetName, tq: 'select *' });
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query.toString()}`;
  }

  const query = new URLSearchParams({ format: 'csv', gid: gid || DEFAULT_GID });
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?${query.toString()}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const csvUrl = buildCsvUrl(args);
  const source = args.csvUrl
    ? { type: 'csv', csvUrl }
    : { type: 'google-sheet', csvUrl, sheetId: args.sheetId, gid: args.gid, sheetName: args.sheetName || null };

  console.log('[build-dataset] Loading base dataset from:', csvUrl);
  const base = await loadBaseDataset({ csvUrl });

  console.log('[build-dataset] Building supplemental structures...');
  const supplemental = await loadSupplementalDataset({
    pointFeatures: base.pointFeatures,
    mapboxToken: args.mapboxToken,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    source,
    geojsonPoints: base.geojsonPoints,
    pointFeatures: base.pointFeatures,
    cityCoordsMap: supplemental.cityCoordsMap,
    lineFeatures: supplemental.lineFeatures,
    cityPoints: supplemental.cityPoints,
    metrics: supplemental.metrics,
  };

  await writeFile(args.out, `${JSON.stringify(output)}\n`, 'utf8');
  console.log(`[build-dataset] Wrote ${args.out}`);
  console.log(`[build-dataset] points=${output.pointFeatures.length}, lines=${output.lineFeatures.length}, cities=${output.cityPoints?.features?.length || 0}`);
}

main().catch((error) => {
  console.error('[build-dataset] Failed:', error);
  process.exitCode = 1;
});
