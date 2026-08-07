# Docs — Online File Transfer (WebRTC)

## Architecture
- **Signaling server** (`server/`) — Express + `ws`. Only job: introduce two devices via a room code and relay the WebRTC handshake (SDP offer/answer, ICE candidates). It never sees file contents.
- **Client** (`src/webrtc/client.js`) — runs in the app's WebView. Connects to the signaling server, negotiates a direct `RTCPeerConnection`, and streams the file over an `RTCDataChannel` once connected. After the handshake, file bytes go device-to-device, not through the server.
- **UI** (`www/index.html`) — your existing screen, now wired to `WebRTCTransfer` instead of the earlier native nearby-discovery plugin.

This replaces the earlier native (Nearby Connections / MultipeerConnectivity) approach from `android-plugin/` and `ios-plugin/` — those are left in the repo but unused unless you want a hybrid online+offline app later.

## 1. Run the signaling server
```bash
cd server
npm install
npm start
```
Deploy it somewhere reachable over the internet (Render, Railway, Fly.io, a VPS, etc.) — `localhost` only works for testing both devices against your dev machine on the same network.

Once deployed, update `SIGNALING_URL` in `www/index.html` to your real `wss://` URL.

## 2. Run the app shell
```bash
npm install
npx cap add android
npx cap add ios
npx cap sync
npx cap open android
```

No native plugin wiring needed for the transfer itself — WebRTC and WebSocket are both available directly in a Capacitor WebView. (The `android-plugin/`/`ios-plugin/` folders from the offline approach are not needed for this path.)

## 3. Wire the file picker
`sendPickedFile(file)` in `www/index.html` expects a real `File`/`Blob`. Wire it to an `<input type="file">` or Capacitor's Filesystem/Camera plugins for picking a document.

## 4. Add a QR renderer
`onRoomCreated` currently just writes the room code as plain text into `#qrPayload`. Swap in a small QR library (e.g. `qrcode` from npm) so the sending device shows an actual scannable code, and add a scanner (e.g. `@capacitor-community/barcode-scanner`) on the receiving side to call `transfer.joinRoom(scannedCode)`.

## 5. Handle restrictive networks (TURN)
The client currently only configures a public STUN server, which works for most home/mobile connections. Some carrier-grade NAT or corporate Wi-Fi setups will fail to establish a direct peer connection. If you see connections fail in the field, add a TURN server (e.g. via Twilio's TURN service, or self-hosted `coturn`) to the `ICE_SERVERS` list in `src/webrtc/client.js` as a relay fallback.

## 6. Production hardening for the signaling server
- Add auth so arbitrary users can't join rooms they weren't invited to (room codes alone are fine for casual person-to-person use, but consider expiring rooms and rate-limiting `create-room`)
- Move the in-memory `rooms` Map to Redis if you need more than one server instance
- Add TLS (`wss://`) — required anyway since most mobile networks block plain `ws://` and browsers block mixed content

## Known gaps to fill in
- File save location on native — `onFileReceived` currently triggers a browser download; on Android/iOS you'd instead write the blob to disk via Capacitor's Filesystem plugin
- Large file handling — current chunking sends the whole file from memory (`file.arrayBuffer()`); for very large files, switch to streaming with `file.stream()` to avoid loading everything into memory at once
- Reconnect/retry logic if the WebSocket or peer connection drops mid-transfer
