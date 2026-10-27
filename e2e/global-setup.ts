import { join } from 'node:path';
import { writeBulkTrip, writeDemoTrip } from '../fixtures/demoTrip.ts';

export const PHOTOS = join(import.meta.dirname, '..', 'fixtures', 'out', 'e2e');

/** Fresh fixture photos for every run. */
export default function globalSetup() {
  writeDemoTrip(join(PHOTOS, 'demo-trip'));
  writeBulkTrip(join(PHOTOS, 'bulk-30'), 30);
}
