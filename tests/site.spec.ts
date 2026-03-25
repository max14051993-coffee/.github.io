import { test, expect, devices } from '@playwright/test';

test.describe('Coffeemap homepage', () => {
  test('displays map interface and controls', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/my coffee experience/i);
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.getByRole('heading', { name: /my coffee experience/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /показать пояснения/i })).toBeVisible();
  });

  test('meets baseline loading performance', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    const metrics = await page.evaluate(() => {
      const navigationEntries = performance.getEntriesByType('navigation');
      if (navigationEntries.length > 0) {
        const nav = navigationEntries[0] as Record<string, number>;
        return {
          domContentLoaded: nav.domContentLoadedEventEnd,
          loadEventEnd: nav.loadEventEnd || nav.responseEnd,
        };
      }

      const timing = performance.timing;
      return {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadEventEnd: timing.loadEventEnd - timing.navigationStart,
      };
    });

    expect(metrics.domContentLoaded).toBeLessThan(5_000);
    expect(metrics.loadEventEnd).toBeLessThan(8_000);
  });
});

test.describe('Coffeemap homepage mobile baseline', () => {
  const { defaultBrowserType, ...iphone13 } = devices['iPhone 13'];
  void defaultBrowserType;
  test.use({
    ...iphone13,
  });

  test('renders quickly on mobile viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
      return {
        fcp,
        domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
        loadEventEnd: nav?.loadEventEnd ?? nav?.responseEnd ?? null,
      };
    });

    expect(metrics.fcp ?? Number.POSITIVE_INFINITY).toBeLessThan(2_000);
    expect(metrics.domContentLoaded ?? Number.POSITIVE_INFINITY).toBeLessThan(4_000);
    expect(metrics.loadEventEnd ?? Number.POSITIVE_INFINITY).toBeLessThan(6_000);
  });
});
