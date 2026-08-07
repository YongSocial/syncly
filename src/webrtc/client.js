// WebRTC file transfer client. Talks to the signaling server only to
// exchange SDP/ICE handshake info — once the RTCDataChannel opens, file
// bytes flow directly between the two devices' browsers/WebViews.

const CHUNK_SIZE = 16 * 1024; // 16KB chunks, safe default for RTCDataChannel

// Public STUN server for NAT traversal. Works for most home/mobile networks.
// If both devices are behind restrictive/symmetric NATs (common on some
// carrier or corporate networks), you'll need a TURN server as a relay
// fallback — see README for notes on that.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export class WebRTCTransfer {
  constructor(signalingUrl, handlers = {}) {
    this.signalingUrl = signalingUrl;
    this.handlers = handlers; // { onRoomCreated, onPeerJoined, onProgress, onFileReceived, onStatus }
    this.ws = null;
    this.pc = null;
    this.dataChannel = null;
    this.roomCode = null;
    this.role = null; // 'sender' | 'receiver'
    this.incomingMeta = null;
    this.incomingChunks = [];
    this.incomingBytesReceived = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.signalingUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => this._handleSignalingMessage(JSON.parse(event.data));
    });
  }

  // Call on the sending device to get a room code to show as a QR code.
  async createRoom() {
    this.role = 'sender';
    this._send({ type: 'create-room' });
  }

  // Call on the receiving device after scanning the sender's QR code.
  async joinRoom(roomCode) {
    this.role = 'receiver';
    this.roomCode = roomCode;
    this._send({ type: 'join-room', roomCode });
  }

  async sendFile(file) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('No open data channel — pairing not complete yet');
    }

    // Send file metadata first so the receiver knows what's coming
    this.dataChannel.send(JSON.stringify({ type: 'meta', name: file.name, size: file.size, mime: file.type }));

    const buffer = await file.arrayBuffer();
    let offset = 0;
    while (offset < buffer.byteLength) {
      const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
      this.dataChannel.send(chunk);
      offset += CHUNK_SIZE;
      this.handlers.onProgress?.({ bytesSent: offset, totalBytes: buffer.byteLength });

      // Basic backpressure: pause if the channel's send buffer is filling up
      if (this.dataChannel.bufferedAmount > 1_000_000) {
        await new Promise((res) => setTimeout(res, 20));
      }
    }
    this.dataChannel.send(JSON.stringify({ type: 'done' }));
  }

  close() {
    this.dataChannel?.close();
    this.pc?.close();
    this.ws?.close();
  }

  // --- internals ---

  _send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  async _handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'room-created':
        this.roomCode = msg.roomCode;
        this.handlers.onRoomCreated?.(msg.roomCode);
        break;

      case 'joined':
        this.handlers.onStatus?.('Joined room, waiting for connection...');
        break;

      case 'peer-joined':
        // We're the sender and someone joined — start the WebRTC offer
        await this._createPeerConnection();
        this.dataChannel = this.pc.createDataChannel('file-transfer');
        this._wireDataChannel();
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this._send({ type: 'signal', data: { kind: 'offer', sdp: offer } });
        this.handlers.onPeerJoined?.();
        break;

      case 'signal':
        await this._handleSignal(msg.data);
        break;

      case 'peer-left':
        this.handlers.onStatus?.('Peer disconnected');
        break;

      case 'join-error':
        this.handlers.onStatus?.('Could not join: ' + msg.reason);
        break;

      default:
        break;
    }
  }

  async _createPeerConnection() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._send({ type: 'signal', data: { kind: 'ice', candidate: event.candidate } });
      }
    };

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._wireDataChannel();
    };
  }

  async _handleSignal(data) {
    if (data.kind === 'offer') {
      // We're the receiver getting the sender's offer
      await this._createPeerConnection();
      await this.pc.setRemoteDescription(data.sdp);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this._send({ type: 'signal', data: { kind: 'answer', sdp: answer } });
    } else if (data.kind === 'answer') {
      await this.pc.setRemoteDescription(data.sdp);
    } else if (data.kind === 'ice') {
      try {
        await this.pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.warn('Failed to add ICE candidate', err);
      }
    }
  }

  _wireDataChannel() {
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.handlers.onStatus?.('Connected — ready to send');
    };

    this.dataChannel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'meta') {
          this.incomingMeta = msg;
          this.incomingChunks = [];
          this.incomingBytesReceived = 0;
        } else if (msg.type === 'done') {
          const blob = new Blob(this.incomingChunks, { type: this.incomingMeta.mime });
          this.handlers.onFileReceived?.({ name: this.incomingMeta.name, blob });
        }
      } else {
        this.incomingChunks.push(event.data);
        this.incomingBytesReceived += event.data.byteLength;
        this.handlers.onProgress?.({
          bytesSent: this.incomingBytesReceived,
          totalBytes: this.incomingMeta?.size ?? 0,
        });
      }
    };
  }
}
