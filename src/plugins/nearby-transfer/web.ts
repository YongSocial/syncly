import { WebPlugin } from '@capacitor/core';
import type { NearbyTransferPlugin, SendFileOptions, NearbyDevice } from './definitions';

/**
 * Browser fallback. Real device discovery (Wi-Fi Direct / Nearby Connections /
 * MultipeerConnectivity) is not available in a WebView-less browser, so this
 * just no-ops with warnings. Lets you build/test the UI without a native build.
 */
export class NearbyTransferWeb extends WebPlugin implements NearbyTransferPlugin {
  async startDiscovery(): Promise<void> {
    console.warn('[NearbyTransfer] startDiscovery: no native implementation on web.');
  }

  async stopDiscovery(): Promise<void> {
    console.warn('[NearbyTransfer] stopDiscovery: no native implementation on web.');
  }

  async sendFile(options: SendFileOptions): Promise<{ transferId: string }> {
    console.warn('[NearbyTransfer] sendFile: no native implementation on web.', options);
    return { transferId: 'web-stub' };
  }

  async acceptTransfer(): Promise<void> {
    console.warn('[NearbyTransfer] acceptTransfer: no native implementation on web.');
  }

  async rejectTransfer(): Promise<void> {
    console.warn('[NearbyTransfer] rejectTransfer: no native implementation on web.');
  }

  async getPairingCode(): Promise<{ payload: string }> {
    // Still useful on web: generate a payload devices could scan,
    // e.g. carrying this device's LAN IP for a WebRTC/local-HTTP fallback.
    const stubPayload = JSON.stringify({ id: 'web-' + Math.random().toString(36).slice(2), name: 'Browser Device' });
    return { payload: stubPayload };
  }

  async pairWithCode(): Promise<{ device: NearbyDevice }> {
    console.warn('[NearbyTransfer] pairWithCode: no native implementation on web.');
    return { device: { id: 'unknown', name: 'Unknown device' } };
  }
}
