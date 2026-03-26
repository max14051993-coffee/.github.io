import { test, expect } from '@playwright/test';

const DATASET_CACHE_KEY = 'coffee_dataset_cache_v1';

test.describe('runtime feature flags and adaptive behaviour', () => {
  test('RUM feature flag toggles from URL and meta', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const rum = await import('/js/rum.js');
      const off = rum.isRumEnabled(new URLSearchParams('rum=0'));
      const on = rum.isRumEnabled(new URLSearchParams('rum=1'));
      const meta = document.querySelector('meta[name="rum-enabled"]');
      if (meta) meta.setAttribute('content', 'true');
      const metaOn = rum.isRumEnabled(new URLSearchParams(''));
      return { off, on, metaOn };
    });

    expect(result.off).toBeFalsy();
    expect(result.on).toBeTruthy();
    expect(result.metaOn).toBeTruthy();
  });

  test('dataset cache revalidation handles fresh, stale 304, updated 200', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async ({ cacheKey }) => {
      const loader = await import('/js/data-loader.js');
      const requestKey = 'prebuilt:/data/dataset.json|csv:/sheet.csv';
      const createDataset = (generatedAt: string) => ({
        generatedAt,
        geojsonPoints: { type: 'FeatureCollection', features: [] },
        pointFeatures: [],
        visitedCountries: [],
        cityCoordsMap: {},
        lineFeatures: [],
        cityPoints: { type: 'FeatureCollection', features: [] },
        metrics: { total: 0, countries: 0, processTypes: 0 },
        ownerName: '',
        ownerLabel: '',
      });
      const cachedPayload = createDataset('2026-03-20T00:00:00.000Z');

      const originalFetch = window.fetch.bind(window);
      const calls: string[] = [];
      let mode: 'fresh' | 'stale304' | 'updated' = 'fresh';
      let updatedCount = 0;

      window.fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(`${mode}:${url}`);
        if (url.endsWith('/data/dataset.json')) {
          if (mode === 'stale304') {
            return new Response('', { status: 304, headers: { etag: 'v1' } });
          }
          return new Response(JSON.stringify(createDataset('2026-03-25T00:00:00.000Z')), {
            status: 200,
            headers: { 'content-type': 'application/json', etag: 'v2' },
          });
        }
        return originalFetch(input);
      };

      window.localStorage.setItem(cacheKey, JSON.stringify({
        payload: cachedPayload,
        requestKey,
        cachedAt: Date.now(),
        revalidatedAt: Date.now(),
        generatedAt: cachedPayload.generatedAt,
        etag: 'v1',
      }));

      mode = 'fresh';
      await loader.loadData({ prebuiltUrl: '/data/dataset.json', csvUrl: '/sheet.csv', mapboxToken: 'x' });

      window.localStorage.setItem(cacheKey, JSON.stringify({
        payload: cachedPayload,
        requestKey,
        cachedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        revalidatedAt: Date.now() - 2 * 60 * 1000,
        generatedAt: cachedPayload.generatedAt,
        etag: 'v1',
      }));

      mode = 'stale304';
      await loader.loadData({ prebuiltUrl: '/data/dataset.json', csvUrl: '/sheet.csv', mapboxToken: 'x' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      window.localStorage.setItem(cacheKey, JSON.stringify({
        payload: cachedPayload,
        requestKey,
        cachedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        revalidatedAt: Date.now() - 2 * 60 * 1000,
        generatedAt: cachedPayload.generatedAt,
        etag: 'v1',
      }));

      mode = 'updated';
      await loader.loadData({
        prebuiltUrl: '/data/dataset.json',
        csvUrl: '/sheet.csv',
        mapboxToken: 'x',
        onUpdate: () => { updatedCount += 1; },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      window.fetch = originalFetch;
      return { calls, updatedCount };
    }, { cacheKey: DATASET_CACHE_KEY });

    expect(result.calls.some((entry) => entry.startsWith('fresh:') && entry.includes('/data/dataset.json'))).toBeFalsy();
    expect(result.calls.some((entry) => entry.startsWith('stale304:') && entry.includes('/data/dataset.json'))).toBeTruthy();
    expect(result.calls.some((entry) => entry.startsWith('updated:') && entry.includes('/data/dataset.json'))).toBeTruthy();
    expect(result.updatedCount).toBe(1);
  });

  test('low-power decision matrix supports low/auto/high', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const originalHardware = navigator.hardwareConcurrency;
      const originalMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const originalConnection = (navigator as Navigator & { connection?: unknown }).connection;
      const originalMatchMedia = window.matchMedia;

      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 });
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '2g', saveData: true } });
      window.matchMedia = ((query: string) => ({ matches: query.includes('max-width') || query.includes('reduce') })) as typeof window.matchMedia;

      const mapInit = await import('/js/map-init.js');
      const autoProfile = mapInit.getRuntimePerformanceProfile({ powerMode: 'auto' });
      const highProfile = mapInit.getRuntimePerformanceProfile({ powerMode: 'high' });
      const lowProfile = mapInit.getRuntimePerformanceProfile({ powerMode: 'low' });

      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: originalHardware });
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: originalMemory });
      Object.defineProperty(navigator, 'connection', { configurable: true, value: originalConnection });
      window.matchMedia = originalMatchMedia;

      return {
        autoLowPower: autoProfile.isLowPower,
        highLowPower: highProfile.isLowPower,
        lowLowPower: lowProfile.isLowPower,
      };
    });

    expect(result.autoLowPower).toBeTruthy();
    expect(result.lowLowPower).toBeTruthy();
    expect(result.highLowPower).toBeFalsy();
  });
});
