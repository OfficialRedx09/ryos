const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.use(cors());
app.use(express.json());
const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

// Configuration management
const CONFIG_FILE = path.join(__dirname, 'config.json');

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

async function getClientConfig(req) {
  const pin = req.headers['x-connection-key'];
  if (!pin) return config;

  const cached = apiCache.get(pin);
  if (cached && Date.now() - cached.time < 300000) {
    return cached.data;
  }

  try {
    const r = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/Apis/${pin}.json`);
    const data = await r.json();
    if (data && data.FIREBASE_DB_URL) {
      // Merge over local config so any missing fields fall back gracefully
      const merged = { ...config, ...data };
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
  const code = req.headers['x-device-code'];
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
  const code = req.headers['x-device-code'];
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
function getS3Client(cfg) {
  if (!cfg.R2_HOST || !cfg.R2_ACCESS_KEY || !cfg.R2_SECRET_KEY) return null;
  let endpoint = cfg.R2_HOST;
  if (!endpoint.startsWith('http')) endpoint = 'https://' + endpoint;
  
  return new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
      accessKeyId: cfg.R2_ACCESS_KEY,
      secretAccessKey: cfg.R2_SECRET_KEY,
    }
  });
}

// R2 Proxy Routes
app.get('/api/r2/list', checkAuth, async (req, res) => {
  const cfg = await getClientConfig(req);
  const prefix = req.query.prefix || '';
  const s3 = getS3Client(cfg);
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    const cmd = new ListObjectsV2Command({ Bucket: cfg.R2_BUCKET, Prefix: prefix });
    const data = await s3.send(cmd);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// Fallback for HTML5 history
app.use((req, res) => {
  const filePath = path.join(PUBLIC_DIR, 'index.html');
  res.sendFile(filePath, err => {
    if (err) {
      console.error("Error serving index.html:", err.message);
      if (err.code === 'ENOENT') {
        res.status(404).send("<h2>404 Not Found</h2><p>The <code>index.html</code> file is missing.</p>");
      } else {
        res.status(err.status).end();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
