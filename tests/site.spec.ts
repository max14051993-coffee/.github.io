import { test, expect } from '@playwright/test';

test.describe('Coffeemap homepage', () => {
  test('displays map interface and controls', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/my coffee experience/i);
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.getByRole('button', { name: /показать пояснения/i })).toBeVisible();
    await expect(page.locator('#filtersMenu')).toBeVisible();
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
