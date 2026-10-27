import { expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PHOTOS } from './global-setup.ts';

export const PASSWORD = 'a-long-password-123';

let n = 0;
/** A fresh address per test, so tests never share an account. */
export const freshEmail = () => `traveller-${Date.now()}-${n++}@example.com`;

export function photos(trip: 'demo-trip' | 'bulk-30', only?: string[]): string[] {
  const dir = join(PHOTOS, trip);
  return readdirSync(dir)
    .filter((f) => /\.jpe?g$/i.test(f) && (!only || only.includes(f)))
    .map((f) => join(dir, f));
}

export async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Asha Rao');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'My travel books' })).toBeVisible();
}

export async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'My travel books' })).toBeVisible();
}

export async function createJapanBook(page: Page) {
  await page.goto('/books/new');
  await page.getByLabel('Title').fill('Whispers of Japan');
  await page.getByLabel('Start date').fill('2026-10-10');
  await page.getByLabel('End date').fill('2026-10-15');
  await page.getByLabel('Time zone').fill('Asia/Tokyo');
  await page.getByRole('button', { name: 'Create book' }).click();
  await expect(page.getByRole('heading', { name: 'Whispers of Japan', level: 1 })).toBeVisible();
}

export async function upload(page: Page, files: string[]) {
  await page.locator('input[type=file]').setInputFiles(files);
  await expect(page.getByText(`${files.length} added`, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}
