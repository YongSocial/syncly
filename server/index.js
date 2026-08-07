const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// In-memory room registry: roomCode -> { sender: ws|null, receiver: ws|null }
// A "room" is just a pairing session, not a persistent chat room.
const rooms = new Map();

function makeRoomCode() {
  // Short, easy to type/scan — e.g. via the app's QR code screen
  return crypto.randomBytes(3).toString('hex');
}

app.get('/health', (req, res) => res.json({ ok: true }));

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed messages
    }

    switch (msg.type) {
      // Device A calls this to create a pairing session and get a code
      // to show as a QR / share with device B.
      case 'create-room': {
        const code = makeRoomCode();
        rooms.set(code, { sender: ws, receiver: null });
        ws.roomCode = code;
        ws.role = 'sender';
        ws.send(JSON.stringify({ type: 'room-created', roomCode: code }));
        break;
      }

      // Device B calls this after scanning the code from device A.
      case 'join-room': {
        const room = rooms.get(msg.roomCode);
        if (!room || room.receiver) {
          ws.send(JSON.stringify({ type: 'join-error', reason: 'Invalid or full room' }));
          return;
        }
        room.receiver = ws;
        ws.roomCode = msg.roomCode;
        ws.role = 'receiver';

        // Tell the sender a peer has joined so it can start the WebRTC offer
        room.sender.send(JSON.stringify({ type: 'peer-joined' }));
        ws.send(JSON.stringify({ type: 'joined', roomCode: msg.roomCode }));
        break;
      }

      // Relay SDP offer/answer and ICE candidates verbatim between the two
      // peers in a room. The server never inspects file contents — this is
      // purely handshake metadata to let the browsers find a direct path.
      case 'signal': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const target = ws.role === 'sender' ? room.receiver : room.sender;
        if (target && target.readyState === target.OPEN) {
          target.send(JSON.stringify({ type: 'signal', data: msg.data }));
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    const other = ws.role === 'sender' ? room.receiver : room.sender;
    if (other && other.readyState === other.OPEN) {
      other.send(JSON.stringify({ type: 'peer-left' }));
    }
    rooms.delete(ws.roomCode);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server listening on :${PORT}`);
});
