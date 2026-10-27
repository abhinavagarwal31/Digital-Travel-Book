import { expect, test } from '@playwright/test';
import { createJapanBook, freshEmail, photos, register, upload } from './helpers.ts';

test('a page can be turned by hand: dragged over, or let go and it settles back', async ({
  page,
}) => {
  await register(page, freshEmail());
  await createJapanBook(page);
  await upload(page, photos('demo-trip', ['IMG_1001.JPG', 'IMG_1002.JPG', 'IMG_1006.JPG']));
  await page.getByRole('link', { name: 'Open book' }).click();

  // Open the cover (a board: it swings open with a tap), then drag a paper page.
  await page.getByRole('button', { name: 'Next page' }).click();
  const position = page.locator('.reader-controls p');
  await expect(position).toContainText('Pages 1–2');
  await page.waitForTimeout(1000);

  const box = (await page.locator('.flipbook').boundingBox())!;
  const corner = { x: box.x + box.width - 20, y: box.y + box.height - 30 };

  // A little way, then let go: it falls back.
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x - 60, corner.y - 10, { steps: 6 });
  await expect(page.locator('.curl')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.curl')).toHaveCount(0);
  await expect(position).toContainText('Pages 1–2');

  // Most of the way: it carries on over.
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, corner.y - 40, { steps: 12 });
  await page.mouse.up();
  await expect(position).toContainText('Pages 3–4');
  await expect(page.locator('.curl')).toHaveCount(0);
});
