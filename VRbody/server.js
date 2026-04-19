/**
 * VRBody PC Server — WebSocket ⟶ VRChat OSC Bridge
 * ====================================================
 * Receives pose data from your phone and forwards it
 * to VRChat via OSC on localhost:9000.
 *
 * See README.md for setup instructions.
 */

require('dotenv').config();

const WebSocket = require('ws');
const dgram     = require('dgram');
const os        = require('os');
const http      = require('http');
const fs        = require('fs');
const qrcode    = require('qrcode-terminal');

// ─── CONFIG ────────────────────────────────────────────
const WS_PORT      = process.env.PORT     || 8765;  // WebSocket + HTTP port
const VRC_OSC_PORT = process.env.OSC_PORT || 9000;  // VRChat OSC port (UDP)
const VRC_OSC_HOST = '127.0.0.1';
const PING_MS      = 2000;
// ────────────────────────────────────────────────────────

// VRChat FBT OSC tracker ID mapping
const TRACKER_PATHS = {
  hip:    { id: 1 },
  lfoot:  { id: 2 },
  rfoot:  { id: 3 },
  lknee:  { id: 4 },
  rknee:  { id: 5 },
  chest:  { id: 6 },
  lelbow: { id: 7 },
  relbow: { id: 8 },
};

// ─── OSC ───────────────────────────────────────────────
const udpClient = dgram.createSocket('udp4');

function oscString(str) {
  const padded = str + '\0';
  const len = Math.ceil(padded.length / 4) * 4;
  const buf = Buffer.alloc(len);
  buf.write(padded);
  return buf;
}
function oscFloat(v) { const b = Buffer.alloc(4); b.writeFloatBE(v, 0); return b; }
function oscInt(v)   { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }

function buildOscMessage(address, ...args) {
  const typeTags = ',' + args.map(a => typeof a === 'number' ? (Number.isInteger(a) ? 'i' : 'f') : 's').join('');
  return Buffer.concat([
    oscString(address),
    oscString(typeTags),
    ...args.map(a => typeof a === 'number' ? (Number.isInteger(a) ? oscInt(a) : oscFloat(a)) : oscString(String(a))),
  ]);
}

function sendOSC(address, ...args) {
  const msg = buildOscMessage(address, ...args);
  udpClient.send(msg, VRC_OSC_PORT, VRC_OSC_HOST, err => {
    if (err) console.error('[OSC]', err.message);
  });
}

function sendTracker(name, { pos, rot }) {
  const mapping = TRACKER_PATHS[name];
  if (!mapping) return;
  const id = mapping.id;
  sendOSC(`/tracking/trackers/${id}/position`,
    parseFloat(pos.x.toFixed(4)),
    parseFloat(pos.y.toFixed(4)),
    parseFloat(pos.z.toFixed(4))
  );
  if (rot) {
    const args = 'w' in rot
      ? [rot.x, rot.y, rot.z, rot.w].map(v => parseFloat(v.toFixed(5)))
      : [rot.x, rot.y, rot.z].map(v => parseFloat(v.toFixed(2)));
    sendOSC(`/tracking/trackers/${id}/rotation`, ...args);
  }
}

// ─── PACKET STATS ──────────────────────────────────────
let totalPackets = 0, packetsThisSec = 0, lastStatTime = Date.now();
setInterval(() => {
  const elapsed = (Date.now() - lastStatTime) / 1000;
  if (packetsThisSec > 0)
    process.stdout.write(`\r[VRBody] ${Math.round(packetsThisSec / elapsed)} pkt/s  total: ${totalPackets}  `);
  packetsThisSec = 0;
  lastStatTime = Date.now();
}, 1000);

// ─── PICK BEST LOCAL IP ────────────────────────────────
// Prefers Wi-Fi, avoids VirtualBox / WSL virtual adapters
const ifaces = os.networkInterfaces();
const allIps = [];
for (const [name, list] of Object.entries(ifaces)) {
  for (const iface of list) {
    if (iface.family === 'IPv4' && !iface.internal) allIps.push({ name, address: iface.address });
  }
}
allIps.sort((a, b) => score(b) - score(a));
function score({ name, address }) {
  const n = name.toLowerCase();
  if (n.includes('virtual') || n.includes('wsl') || address.startsWith('192.168.56.')) return -1;
  if (n.includes('wi-fi') || n.includes('wifi') || n.includes('wlan')) return 2;
  return 0;
}
const primaryIp = allIps[0]?.address || '127.0.0.1';

// ─── HTTP + WEBSOCKET SERVER ───────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.readFile('./index.html', (err, data) => {
      if (err) { res.writeHead(500); res.end('index.html not found'); return; }
      res.end(data);
    });
  } else {
    res.writeHead(404); res.end('Not Found');
  }
});

const wss = new WebSocket.Server({ server });
let activeClients = 0;

console.log('\n╔══════════════════════════════════════════╗');
console.log('║         VRBody PC Bridge Server          ║');
console.log('╚══════════════════════════════════════════╝\n');
console.log('📡 Local IPs found:');
allIps.forEach(({ name, address }) => console.log(`   ➤  ${address}  (${name})`));
console.log(`\n🎮 VRChat OSC → ${VRC_OSC_HOST}:${VRC_OSC_PORT}`);
console.log('   Enable OSC in VRChat: Settings → OSC → Enable\n');

server.listen(WS_PORT, '0.0.0.0', () => {
  const localUrl = `http://${primaryIp}:${WS_PORT}/`;

  // Try ngrok for HTTPS (required for iPhone camera)
  const token = process.env.NGROK_AUTHTOKEN;
  let ngrok;
  try { ngrok = require('@ngrok/ngrok'); } catch (_) {}

  if (ngrok && token) {
    console.log('🔐 Starting ngrok HTTPS tunnel...\n');
    ngrok.forward({ addr: WS_PORT, authtoken: token })
      .then(listener => {
        const httpsUrl = listener.url();
        console.log('✅ HTTPS tunnel ready — scan on iPhone for camera access:\n');
        qrcode.generate(httpsUrl, { small: true });
        console.log(`\n   ${httpsUrl}\n`);
        console.log(`💻 Local (PC / Android): ${localUrl}\n`);
        console.log('Waiting for connection...\n');
      })
      .catch(err => {
        console.error('❌ ngrok failed:', err.message);
        console.log('   Add NGROK_AUTHTOKEN to .env for iPhone camera support.\n');
        printLocalQR(localUrl);
      });
  } else {
    if (ngrok && !token) console.log('ℹ️  No NGROK_AUTHTOKEN in .env — skipping HTTPS tunnel.\n');
    printLocalQR(localUrl);
  }
});

function printLocalQR(url) {
  console.log('📱 Scan to open on phone:\n');
  qrcode.generate(url, { small: true });
  console.log(`\n   ${url}\n`);
  console.log('⚠️  Note: iPhone camera requires HTTPS. Add NGROK_AUTHTOKEN to .env\n');
  console.log('Waiting for connection...\n');
}

// ─── WEBSOCKET EVENTS ──────────────────────────────────
wss.on('connection', (ws, req) => {
  activeClients++;
  console.log(`\n✅ Client connected: ${req.socket.remoteAddress} (${activeClients} total)`);

  const pingTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) { clearInterval(pingTimer); return; }
    ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
  }, PING_MS);

  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === 'pong') {
      ws.send(JSON.stringify({ type: 'latency', ms: Date.now() - data.ts }));
      return;
    }

    if (data.type === 'pose' && data.trackers) {
      totalPackets++;
      packetsThisSec++;
      for (const [name, td] of Object.entries(data.trackers)) {
        if (td?.pos) sendTracker(name, td);
      }
      if (data.trackers.hip) {
        const h = data.trackers.hip.pos;
        sendOSC('/avatar/parameters/HipX', parseFloat(h.x.toFixed(3)));
        sendOSC('/avatar/parameters/HipY', parseFloat(h.y.toFixed(3)));
        sendOSC('/avatar/parameters/HipZ', parseFloat(h.z.toFixed(3)));
      }
    }
  });

  ws.on('close', () => { activeClients--; clearInterval(pingTimer); console.log(`\n🔌 Client disconnected (${activeClients} remaining)`); });
  ws.on('error', err => console.error('\n[WS]', err.message));
});

// ─── ERROR & SHUTDOWN ──────────────────────────────────
server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`\n❌ Port ${WS_PORT} already in use. Change PORT in .env or server.js`);
  else console.error('\n[Server]', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  wss.close();
  server.close(() => { udpClient.close(); process.exit(0); });
});
