import { expect, test } from '@playwright/test';
import { createJapanBook, freshEmail, photos, register, upload } from './helpers.ts';

test('on a phone the book turns one page at a time', async ({ page }) => {
  await register(page, freshEmail());
  await createJapanBook(page);
  await upload(page, photos('demo-trip', ['IMG_1001.JPG', 'IMG_1002.JPG', 'IMG_1006.JPG']));
  await page.getByRole('link', { name: 'Open book' }).click();

  await expect(page.getByText('Cover', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  // No sideways scrolling at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});
