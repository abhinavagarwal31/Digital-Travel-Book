import { expect, test } from '@playwright/test';
import { createJapanBook, freshEmail, logIn, photos, register, upload } from './helpers.ts';

test('a trip from sign-up to a finished book, kept across log out and in', async ({ page }) => {
  const email = freshEmail();
  await register(page, email);
  await createJapanBook(page);

  // 14 photos: 13 with dates and places, one screenshot with no metadata at all.
  await upload(page, photos('demo-trip'));
  const sortLink = page.getByRole('link', { name: 'Sort photos, 1 need a decision' });
  await expect(sortLink).toBeVisible();
  await sortLink.click();

  // The tray says why the screenshot needs a decision; place it by clicking only.
  const tray = page.getByRole('complementary');
  const ticket = tray.getByRole('button', { name: /^Screenshot_ticket\.jpg, No date$/ });
  await expect(ticket).toBeVisible();
  await ticket.click();
  await page.getByRole('button', { name: 'Move selected photos to Day 3 · Mon 12 Oct' }).click();
  await expect(page.getByText('Moved 1 photo to Day 3 · Mon 12 Oct')).toBeVisible();

  // Undo puts it back; doing it again finishes sorting.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tray.getByRole('button', { name: /^Screenshot_ticket\.jpg/ })).toBeVisible();
  await tray.getByRole('button', { name: /^Screenshot_ticket\.jpg/ }).click();
  await page.getByRole('button', { name: 'Move selected photos to Day 3 · Mon 12 Oct' }).click();
  await expect(page.getByRole('heading', { name: 'Everything is sorted' })).toBeVisible();

  // A reload re-organises the book; the user's move stays.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Everything is sorted' })).toBeVisible();

  // Words: a chapter name, a diary entry and a caption, all saved as typed.
  await page.goto(page.url().replace(/\/sort$/, '/write'));
  const chapter = page.getByLabel('Title of chapter 1');
  await chapter.fill('Neon and shrines');
  await chapter.blur();
  const diary = page.getByLabel('Diary for Day 1 · Sat 10 Oct');
  await diary.fill('Landed at Haneda just after ten.');
  await diary.blur();
  const caption = page.getByLabel('Caption for IMG_1001.JPG');
  await caption.fill('First light over Tokyo');
  await caption.blur();
  await expect(page.getByText('Saved')).toHaveCount(3);

  // A style, then out and back in: everything is still there.
  await page
    .getByRole('link', { name: /Whispers of Japan/ })
    .first()
    .click();
  await page.getByRole('radio', { name: /Scrapbook/ }).check();
  await expect(page.getByRole('radio', { name: /Scrapbook/ })).toBeChecked();
  await page.getByRole('button', { name: 'Log out' }).click();
  await logIn(page, email);
  await page.getByRole('link', { name: 'Whispers of Japan' }).click();
  await expect(page.getByRole('radio', { name: /Scrapbook/ })).toBeChecked();

  // The book itself: a trip map, the named chapter, the diary and the caption.
  await page.getByRole('link', { name: 'Open book' }).click();
  const toc = page.getByRole('combobox', { name: 'Go to' });
  await expect(toc.locator('option')).toContainText(['Map of the trip', '1. Neon and shrines']);
  await toc.selectOption({ label: ' Day 1 · Sat 10 Oct' });
  await expect(page.getByText('First light over Tokyo')).toBeVisible();
  await expect(page.getByText('Landed at Haneda just after ten.')).toBeVisible();
});

test('sorting by keyboard alone', async ({ page }) => {
  await register(page, freshEmail());
  await createJapanBook(page);
  await upload(page, photos('demo-trip', ['Screenshot_ticket.jpg', 'IMG_1001.JPG']));
  await page.getByRole('link', { name: /Sort photos/ }).click();

  const ticket = page.getByRole('button', { name: /^Screenshot_ticket\.jpg/ });
  await ticket.focus();
  await page.keyboard.press('Enter');
  // Picked up over the tray it came from; one step down is the first day.
  await expect(page.getByText('Over To sort (no day).')).toBeAttached();
  // The drag starts listening for keys on the next tick; no person types faster.
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('Over Day 1 · Sat 10 Oct.')).toBeAttached();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Moved 1 photo to Day 1 · Sat 10 Oct')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything is sorted' })).toBeVisible();
});

test('a 30-photo trip uploads, sorts itself and reads as a book', async ({ page }) => {
  await register(page, freshEmail());
  await createJapanBook(page);
  await upload(page, photos('bulk-30'));
  // Every photo has a date and place: nothing to decide.
  await expect(page.getByRole('link', { name: 'Sort photos' })).toBeVisible();
  await expect(page.getByText('30 in this book')).toBeVisible();

  await page.getByRole('link', { name: 'Open book' }).click();
  await expect(page.getByRole('combobox', { name: 'Go to' }).locator('option')).toContainText([
    'Map of the trip',
    ' Day 6 · Thu 15 Oct',
  ]);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Pages 1–2 of \d+/)).toBeVisible();
});
