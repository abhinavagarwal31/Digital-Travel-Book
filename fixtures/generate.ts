// Writes the demo trip into fixtures/out/demo-trip (git-ignored). Run: npm run fixtures
import { join } from 'node:path';
import { writeDemoTrip } from './demoTrip.ts';

const out = join(new URL('.', import.meta.url).pathname, 'out', 'demo-trip');
const files = writeDemoTrip(out);
console.log(`Wrote ${files.length} photos and manifest.json to ${out}`);
