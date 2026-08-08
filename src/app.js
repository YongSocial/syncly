import { WebRTCTransfer } from './webrtc/client.js';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

// Point this at your deployed signaling server.
const SIGNALING_URL = 'wss://your-signaling-server.example.com';

const transfer = new WebRTCTransfer(SIGNALING_URL, {
  onRoomCreated: (code) => {
    renderQrCode(code);
    setStatus('Share this code', 'Waiting for the other device to join...');
  },
  onPeerJoined: () => setStatus('Connecting...', ''),
  onStatus: (text) => {
    setStatus(text, '');
    if (text === 'Connected — ready to send' && selectedFile) {
      sendSelectedFile();
    }
  },
  onProgress: ({ bytesSent, totalBytes }) => {
    const pct = totalBytes ? Math.round((bytesSent / totalBytes) * 100) : 0;
    setTransferStatus(`Transferring... ${pct}%`);
  },
  onFileReceived: ({ name, blob }) => {
    setTransferStatus('File received: ' + name);
    // Offer it as a download in-browser; on native you'd instead
    // write `blob` to disk via Capacitor's Filesystem plugin.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  },
});

let connected = false;
let selectedFile = null;

async function openSend() {
  document.getElementById('sendScreen').classList.add('open');
  setStatus('Connecting to server...', '');
  if (!connected) {
    await transfer.connect();
    connected = true;
  }
  await transfer.createRoom();
}

async function closeSend() {
  document.getElementById('sendScreen').classList.remove('open');
  transfer.close();
  connected = false;
  selectedFile = null;
  document.getElementById('qrCodeCanvas').innerHTML = '';
  document.getElementById('qrPayload').textContent = '';
  setTransferStatus('');
}

function setStatus(title, sub) {
  const block = document.getElementById('statusBlock');
  block.querySelector('.status-title').textContent = title;
  block.querySelector('.status-sub').textContent = sub;
}

function setTransferStatus(text) {
  document.getElementById('transferStatus').textContent = text;
}

function renderQrCode(code) {
  const container = document.getElementById('qrCodeCanvas');
  container.innerHTML = '';
  // QRCode is loaded globally via the CDN <script> tag in index.html
  // eslint-disable-next-line no-undef
  new QRCode(container, {
    text: code,
    width: 160,
    height: 160,
  });
  document.getElementById('qrPayload').textContent = code;
}

// Fired by the hidden <input type="file"> when the user picks a file.
async function handleFilePicked(event) {
  const file = event.target.files[0];
  if (!file) return;
  selectedFile = file;
  setTransferStatus(`Selected: ${file.name} — waiting for connection...`);

  if (transfer.dataChannel && transfer.dataChannel.readyState === 'open') {
    await sendSelectedFile();
  }
  // If not yet connected, onStatus's 'Connected — ready to send' fires
  // once the data channel opens; sendSelectedFile() runs from there too.
}

async function sendSelectedFile() {
  if (!selectedFile) return;
  try {
    setTransferStatus(`Sending ${selectedFile.name}...`);
    await transfer.sendFile(selectedFile);
    setTransferStatus(`Sent: ${selectedFile.name}`);
  } catch (err) {
    setTransferStatus('Send failed: ' + err.message);
  }
}

async function showMyQrCode() {
  // QR is rendered automatically once the room is created in openSend().
  // Kept as a handler in case you want to re-show/re-render on demand later.
}

// --- Receiving side: scan a QR code to join the sender's room ---
async function startScan() {
  try {
    // Request camera permission first; on first run this prompts the user.
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      setTransferStatus('Camera permission is required to scan a code.');
      return;
    }

    document.getElementById('sendScreen').classList.add('open');
    setStatus('Scanning...', 'Point the camera at the sender\'s QR code');

    // BarcodeScanner.scan() opens its own native scanning screen (Google's
    // ML Kit code scanner UI) and returns here once a code is found or the
    // user cancels — no manual camera-preview wiring needed.
    const result = await BarcodeScanner.scan();

    if (!result.barcodes.length) {
      setStatus('No code found', 'Try again');
      return;
    }

    const scannedCode = result.barcodes[0].rawValue;
    setStatus('Joining...', '');

    if (!connected) {
      await transfer.connect();
      connected = true;
    }
    await transfer.joinRoom(scannedCode);
  } catch (err) {
    setTransferStatus('Scan failed: ' + err.message);
  }
}

// expose for inline onclick handlers in the markup
window.openSend = openSend;
window.closeSend = closeSend;
window.showMyQrCode = showMyQrCode;
window.handleFilePicked = handleFilePicked;
window.startScan = startScan;
