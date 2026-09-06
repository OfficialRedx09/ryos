const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');
const { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration management
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default config
let config = {
  FIREBASE_DB_URL: 'https://backup-notifcation-default-rtdb.firebaseio.com',
  LIVEKIT_WS_URL: '',
  LIVEKIT_API_KEY: '',
  LIVEKIT_API_SECRET: '',
  R2_HOST: '',
  R2_PUB: '',
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

// Authentication / Role Check
const ADMIN_DB = 'https://notification-secret-default-rtdb.firebaseio.com/User.json';

app.post('/api/auth', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  
  try {
    const response = await fetch(ADMIN_DB);
    const users = await response.json();
    
    if (users && users[code]) {
      // 'admin' or 'client'
      res.json({ role: users[code] });
    } else {
      res.json({ role: 'unauthorized' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Auth check failed' });
  }
});

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
app.get('/api/config', checkAdmin, (req, res) => {
  res.json(config);
});

app.post('/api/config', checkAdmin, (req, res) => {
  config = { ...config, ...req.body };
  saveConfig();
  res.json({ success: true });
});

// Firebase Proxy
app.post('/api/firebase/get', async (req, res) => {
  const { path } = req.body;
  const p = path.includes("?") ? path.replace("?", ".json?") : path + ".json";
  try {
    const r = await fetch(`${config.FIREBASE_DB_URL}/${p}`);
    if (!r.ok) return res.status(r.status).json({ error: 'Firebase GET failed' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/firebase/put', async (req, res) => {
  const { path, value } = req.body;
  const p = path.includes("?") ? path.replace("?", ".json?") : path + ".json";
  try {
    const r = await fetch(`${config.FIREBASE_DB_URL}/${p}`, {
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

app.post('/api/firebase/del', async (req, res) => {
  const { path } = req.body;
  const p = path.includes("?") ? path.replace("?", ".json?") : path + ".json";
  try {
    const r = await fetch(`${config.FIREBASE_DB_URL}/${p}`, { method: 'DELETE' });
    if (!r.ok) return res.status(r.status).json({ error: 'Firebase DELETE failed' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LiveKit Token Route
app.post('/api/livekit/token', (req, res) => {
  const { roomName, participantName } = req.body;
  if (!config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET || !config.LIVEKIT_WS_URL) {
    return res.status(400).json({ error: 'LiveKit not configured on server' });
  }

  const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: participantName || `admin-${Math.floor(Math.random()*10000)}`,
  });
  
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

  const token = at.toJwt();
  res.json({ url: config.LIVEKIT_WS_URL, token });
});

// S3 / R2 Setup
function getS3Client() {
  if (!config.R2_HOST || !config.R2_ACCESS_KEY || !config.R2_SECRET_KEY) return null;
  let endpoint = config.R2_HOST;
  if (!endpoint.startsWith('http')) endpoint = 'https://' + endpoint;
  
  return new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY,
      secretAccessKey: config.R2_SECRET_KEY,
    }
  });
}

// R2 Proxy Routes
app.get('/api/r2/list', async (req, res) => {
  const prefix = req.query.prefix || '';
  const s3 = getS3Client();
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    const cmd = new ListObjectsV2Command({ Bucket: config.R2_BUCKET, Prefix: prefix });
    const data = await s3.send(cmd);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/r2/presign-put', async (req, res) => {
  const { key, contentType } = req.body;
  const s3 = getS3Client();
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    const cmd = new PutObjectCommand({ Bucket: config.R2_BUCKET, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/r2/presign-get', async (req, res) => {
  const { key } = req.body;
  const s3 = getS3Client();
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    // We can't import GetObjectCommand dynamically here without adding it to the require list.
    // So let's just rely on the public URL or we need to add GetObjectCommand.
    // I will add GetObjectCommand to the require list.
  } catch(e) {}
});

app.post('/api/r2/delete', async (req, res) => {
  const { key } = req.body;
  const s3 = getS3Client();
  if (!s3) return res.status(400).json({ error: 'R2 not configured' });
  
  try {
    const cmd = new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key });
    await s3.send(cmd);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/r2/puburl', (req, res) => {
  res.json({ url: config.R2_PUB });
});

// Fallback for HTML5 history
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
