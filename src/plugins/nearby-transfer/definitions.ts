export interface NearbyDevice {
  id: string;
  name: string;
  // rough signal strength, useful for sorting "nearest first"
  rssi?: number;
}

export interface SendFileOptions {
  deviceId: string;
  filePath: string;   // local path or blob URI
  fileName: string;
}

export interface NearbyTransferPlugin {
  /** Start advertising this device + scanning for others. Fires 'deviceFound' events. */
  startDiscovery(): Promise<void>;

  /** Stop advertising/scanning. */
  stopDiscovery(): Promise<void>;

  /** Send a file to a previously discovered device. Fires 'transferProgress' events. */
  sendFile(options: SendFileOptions): Promise<{ transferId: string }>;

  /** Accept an incoming transfer request (after 'incomingRequest' event fires). */
  acceptTransfer(options: { transferId: string }): Promise<void>;

  /** Reject an incoming transfer request. */
  rejectTransfer(options: { transferId: string }): Promise<void>;

  /** Get this device's pairing payload to render as a QR code. */
  getPairingCode(): Promise<{ payload: string }>;

  /** Pair with a device using a scanned QR payload (fallback to discovery flow). */
  pairWithCode(options: { payload: string }): Promise<{ device: NearbyDevice }>;

  // Event listeners (Capacitor's addListener pattern)
  addListener(
    eventName: 'deviceFound',
    listenerFunc: (device: NearbyDevice) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'deviceLost',
    listenerFunc: (device: { id: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'incomingRequest',
    listenerFunc: (request: { transferId: string; fromDevice: NearbyDevice; fileName: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'transferProgress',
    listenerFunc: (progress: { transferId: string; bytesSent: number; totalBytes: number }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: 'transferComplete',
    listenerFunc: (result: { transferId: string; success: boolean; error?: string }) => void
  ): Promise<{ remove: () => void }>;
}
