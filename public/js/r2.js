/* ═══════════════════════════════════════════════════════════════
   Core Admin — Cloudflare R2 helper
   Every object goes through the server proxy (/api/r2/*), which streams
   straight from the bucket with the right Content-Type. The bucket has no
   public URL and proxying keeps requests same-origin, so <img>, <video>
   and fetch() all work without any R2 CORS rules.

   Auth: /api/r2/list|summary|stat and the POST routes use the
   x-device-code header; /api/r2/file (used inside src="" attributes)
   also accepts the code + connection key as query params.

   Keys look like `{deviceId}/Image|Videos|Screen_shots|Storage/{name}`.
   ═══════════════════════════════════════════════════════════════ */

const R2 = {
  _code() { return localStorage.getItem('ca_device_code') || ''; },
  _pin() { return localStorage.getItem('ca_connection_key') || ''; },

  _h() { return { 'x-device-code': R2._code() }; },

  // Query string that authenticates a plain GET (media tags can't send headers).
  _q() {
    const code = R2._code(), ck = R2._pin();
    return (code ? `code=${encodeURIComponent(code)}` : '') +
      (ck ? `&ck=${encodeURIComponent(ck)}` : '');
  },

  // Synchronous on purpose: callers drop the result straight into src="".
  publicUrl(key) {
    return `/api/r2/file?key=${encodeURIComponent(key)}&${R2._q()}`;
  },

  async _json(path, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const r = await fetch(`${path}${qs ? '?' + qs : ''}`, { headers: R2._h() });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (_) { }
      throw new Error(msg);
    }
    return r.json();
  },

  /* ─────────── listing ─────────── */

  // All files under a prefix (no delimiter) — used by the Media screenshots tab.
  async list(prefix) {
    const data = await R2._json('/api/r2/list', { prefix: prefix || '' });
    const items = (data.Contents || []).map(c => ({
      key: c.Key || '',
      size: c.Size === undefined ? null : Number(c.Size),
      lastModified: c.LastModified || '',
    })).filter(i => i.key && !i.key.endsWith('/'));
    items.sort((a, b) => (String(a.lastModified) < String(b.lastModified) ? 1 : -1));
    return items;
  },

  // Every file under a prefix, paging through ALL ContinuationTokens so buckets
  // with more than 1000 objects are fully covered. Used by "Download all".
  async listAll(prefix) {
    const all = [];
    let token = undefined;
    do {
      const params = { prefix: prefix || '' };
      if (token) params.token = token;
      const data = await R2._json('/api/r2/list', params);
      (data.Contents || []).forEach(c => {
        const key = c.Key || '';
        if (key && !key.endsWith('/')) {
          all.push({
            key,
            name: key.split('/').pop(),
            size: c.Size === undefined ? null : Number(c.Size),
            lastModified: c.LastModified || '',
          });
        }
      });
      token = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (token);
    all.sort((a, b) => (String(a.lastModified) < String(b.lastModified) ? 1 : -1));
    return all;
  },

  // One folder level: sub-folders + files (Backups page).
  async browse(prefix) {
    prefix = prefix || '';
    const data = await R2._json('/api/r2/list', { prefix, delimiter: '/' });
    const folders = (data.CommonPrefixes || [])
      .map(p => {
        const full = p.Prefix || '';
        return { prefix: full, name: full.slice(prefix.length).replace(/\/$/, '') };
      })
      .filter(f => f.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    const files = (data.Contents || [])
      .map(c => ({
        key: c.Key || '',
        name: String(c.Key || '').split('/').pop(),
        size: c.Size === undefined ? null : Number(c.Size),
        lastModified: c.LastModified || '',
      }))
      .filter(f => f.key && f.name && !f.key.endsWith('/'))
      .sort((a, b) => (String(a.lastModified) < String(b.lastModified) ? 1 : -1));
    return { folders, files, truncated: !!data.IsTruncated };
  },

  // Recursive total for a prefix: { count, size, truncated }.
  async summary(prefix) {
    return R2._json('/api/r2/summary', { prefix: prefix || '' });
  },

  // Object metadata without downloading it: { size, contentType, lastModified }.
  async stat(key) {
    return R2._json('/api/r2/stat', { key });
  },

  async remove(key) {
    const r = await fetch('/api/r2/delete', {
      method: 'POST',
      headers: { ...R2._h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (_) { }
      throw new Error(msg);
    }
    return true;
  },

  /* ─────────── download ─────────── */

  // Same-origin download: the proxy returns the real bytes with the right
  // Content-Type, so the saved file is a usable image/video — not an HTML
  // error page saved under a .jpg name.
  async download(key, filename) {
    const name = filename || String(key).split('/').pop();
    const url = `${R2.publicUrl(key)}&dl=1&name=${encodeURIComponent(name)}`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      if (!blob.size) throw new Error('Empty file');
      U.downloadBlob(blob, name);
      return true;
    } catch (e) {
      App.toast("Direct download failed — opening in a new tab", "info");
      window.open(url, "_blank");
      return false;
    }
  },

  /* ─────────── file-type helpers ─────────── */

  ext(key) {
    const m = /\.([A-Za-z0-9]+)$/.exec(String(key || '').split(/[?#]/)[0]);
    return m ? m[1].toLowerCase() : '';
  },

  isImage(key) {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'svg', 'ico', 'dng']
      .includes(R2.ext(key));
  },

  isVideo(key) {
    return ['mp4', 'm4v', 'webm', 'mkv', 'mov', '3gp', 'avi', 'ts'].includes(R2.ext(key));
  },

  isAudio(key) {
    return ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'amr', 'flac'].includes(R2.ext(key));
  },

  isPdf(key) { return R2.ext(key) === 'pdf'; },

  // Material-symbols icon name for a key.
  icon(key) {
    if (R2.isImage(key)) return 'image';
    if (R2.isVideo(key)) return 'movie';
    if (R2.isAudio(key)) return 'music_note';
    if (R2.isPdf(key)) return 'picture_as_pdf';
    const ext = R2.ext(key);
    if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'folder_zip';
    if (['apk', 'exe', 'msi'].includes(ext)) return 'android';
    if (['txt', 'json', 'xml', 'csv', 'log'].includes(ext)) return 'description';
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'article';
    if (['xls', 'xlsx', 'ods'].includes(ext)) return 'table';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slideshow';
    return 'draft';
  },

  // true when the browser can show the file inline in the viewer.
  viewable(key) {
    return R2.isImage(key) || R2.isVideo(key) || R2.isAudio(key);
  },
};

