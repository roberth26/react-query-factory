import { test, expect } from '@playwright/test';

// Pages whose table loads automatically (data is prefetched in the route loader).
const TABLE_PAGES = [
  { href: '/basic', heading: 'Basic' },
  { href: '/async-iterator', heading: 'Async iterator' },
  { href: '/crawl-then-render', heading: 'Crawl-then-render' },
  { href: '/render-while-crawling', heading: 'Render-while-crawling' },
  { href: '/on-demand', heading: 'On demand' },
  { href: '/composition', heading: 'Composition' },
  { href: '/injection', heading: 'Dependency injection' },
  { href: '/invalidate', heading: 'Invalidation' },
];

for (const { href, heading } of TABLE_PAGES) {
  test(`${heading}: renders a table and a working refresh button`, async ({
    page,
  }) => {
    await page.goto(`/#${href}`);

    // Page title confirms navigation landed on the right route.
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();

    // The table renders at least one data row (loader prefetched the data).
    // Cloudscape renders a hidden measurement table too, so scope to :visible.
    const rows = page.locator('tbody tr:visible');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);

    // The refresh button exists, is clickable, and leaves rows in place.
    const refresh = page.getByTestId('refresh-button').first();
    await expect(refresh).toBeVisible();
    await refresh.click();
    await expect(rows.first()).toBeVisible();
  });
}

test('Client-side search: finds an instance, lists scanned rows, and refreshes', async ({
  page,
}) => {
  await page.goto('/#/client-search');
  await expect(
    page.getByRole('heading', { name: 'Client-side search', exact: true }),
  ).toBeVisible();

  // No table until a search runs.
  await expect(page.locator('tbody tr:visible')).toHaveCount(0);

  await page.getByPlaceholder('1–95').fill('42');
  await page.getByRole('button', { name: 'Find' }).click();

  await expect(page.getByText(/Found i-0*42/)).toBeVisible();
  await expect(page.locator('tbody tr:visible').first()).toBeVisible();
  await expect(page.getByTestId('refresh-button').first()).toBeVisible();
});

test('Dependency injection: the injected client populates the table', async ({
  page,
}) => {
  await page.goto('/#/injection');
  await expect(
    page.getByRole('heading', { name: 'Dependency injection', exact: true }),
  ).toBeVisible();
  // Instance types fetched via the context-provided client.
  await expect(page.locator('tbody tr:visible').first()).toBeVisible();
});

test('README renders as the default route', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'README', exact: true }),
  ).toBeVisible();
});
