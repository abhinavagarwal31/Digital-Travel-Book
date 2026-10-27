// Writes the hand-testing dataset (see fixtures/testTrip.ts) to a folder.
// Run: npm run fixtures:test-photos [-- <folder>]   (default: ../test-photos, outside the repo)
import { resolve } from 'node:path';
import { writeTestPhotos } from './testTrip.ts';

const root = resolve(process.argv[2] ?? new URL('../../test-photos', import.meta.url).pathname);
const started = Date.now();
const { trip, canConvert } = writeTestPhotos(root);
console.log(
  `Wrote ${trip} trip photos, re-uploads, refused files and a 201-photo limit set to ${root}`,
);
if (!canConvert)
  console.log('No macOS sips: HEIC, PNG and GIF files were written as JPEG instead.');
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s. Start with HOW-TO-TEST.md.`);
