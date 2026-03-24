import { test, expect } from '@playwright/test';

test.describe('data-loader prebuilt dataset mode', () => {
  test('uses prebuilt JSON without CSV parsing/geocoding', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const calls: string[] = [];
      const originalFetch = window.fetch.bind(window);

      const prebuiltPayload = {
        generatedAt: '2026-03-24T00:00:00.000Z',
        source: { type: 'test' },
        geojsonPoints: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [37.6173, 55.7558] },
            properties: { countryIso2: 'ET', originCountry: 'Ethiopia', flagEmoji: '🇪🇹' },
          }],
        },
        pointFeatures: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [37.6173, 55.7558] },
          properties: { countryIso2: 'ET', originCountry: 'Ethiopia', flagEmoji: '🇪🇹' },
        }],
        cityCoordsMap: {},
        lineFeatures: [],
        cityPoints: { type: 'FeatureCollection', features: [] },
        metrics: { total: 1, countries: 1, processTypes: 0 },
      };

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(url);
        if (url.endsWith('/data/dataset.json')) {
          return new Response(JSON.stringify(prebuiltPayload), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return originalFetch(input, init);
      };

      const loader = await import('/js/data-loader.js');
      const dataset = await loader.loadData({
        prebuiltUrl: '/data/dataset.json',
        csvUrl: '/sheet.csv',
        mapboxToken: 'fake-token',
      });

      window.fetch = originalFetch;

      return {
        total: dataset.metrics.total,
        calls,
      };
    });

    expect(result.total).toBe(1);
    expect(result.calls.some((url) => url.includes('/sheet.csv'))).toBeFalsy();
    expect(result.calls.some((url) => url.includes('api.mapbox.com/geocoding'))).toBeFalsy();
  });

  test('falls back to CSV when prebuilt dataset is invalid', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const calls: string[] = [];
      const originalFetch = window.fetch.bind(window);
      const csv = [
        'Latitude (lat),Longitude (lng),Origin country,Country ISO2,Flag emoji',
        '55.7558,37.6173,Ethiopia,ET,🇪🇹',
      ].join('\n');

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(url);
        if (url.endsWith('/data/dataset.json')) {
          return new Response(JSON.stringify({ pointFeatures: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.endsWith('/sheet.csv')) {
          return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } });
        }
        return originalFetch(input, init);
      };

      const loader = await import('/js/data-loader.js');
      const dataset = await loader.loadData({
        prebuiltUrl: '/data/dataset.json',
        csvUrl: '/sheet.csv',
        mapboxToken: 'fake-token',
      });

      window.fetch = originalFetch;

      return {
        total: dataset.metrics.total,
        calls,
      };
    });

    expect(result.total).toBe(1);
    expect(result.calls.some((url) => url.includes('/data/dataset.json'))).toBeTruthy();
    expect(result.calls.some((url) => url.includes('/sheet.csv'))).toBeTruthy();
  });
});
