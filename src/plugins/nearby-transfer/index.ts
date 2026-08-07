import { registerPlugin } from '@capacitor/core';
import type { NearbyTransferPlugin } from './definitions';

// registerPlugin looks for a native implementation (Android/iOS) first,
// and falls back to web.ts below when running in a plain browser.
const NearbyTransfer = registerPlugin<NearbyTransferPlugin>('NearbyTransfer', {
  web: () => import('./web').then(m => new m.NearbyTransferWeb()),
});

export * from './definitions';
export { NearbyTransfer };
