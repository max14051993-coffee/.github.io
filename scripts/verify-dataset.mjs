#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { validatePrebuiltDataset } from '../js/data-loader.js';

const target = process.argv[2] || 'data/dataset.json';

try {
  const text = await readFile(target, 'utf8');
  const payload = JSON.parse(text);
  const validation = validatePrebuiltDataset(payload);
  if (!validation.ok) {
    console.error(`[verify-dataset] Invalid prebuilt dataset at ${target}: ${validation.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`[verify-dataset] OK: ${target}`);
  }
} catch (error) {
  console.error(`[verify-dataset] Failed to read ${target}:`, error.message || error);
  process.exitCode = 1;
}
