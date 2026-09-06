/* ═══════════════════════════════════════════════════════════════
   Core Admin — Cloudflare R2 (S3-compatible) helper
   - Public downloads via the bucket's public dev URL.
   - SigV4-presigned ListObjectsV2 for folder listing (screenshots),
     same in-browser signing approach as storage_dashboard.html.
   Credentials mirror Connection.java in the Android app.
   ═══════════════════════════════════════════════════════════════ */

const R2 = {
  _h() {
    return { 'x-device-code': localStorage.getItem('ca_device_code') || '' };
  },

  async getPubUrl() {
    if (R2._pubUrl) return R2._pubUrl;
    try {
      const r = await fetch('/api/r2/puburl', { headers: R2._h() });
      if (r.ok) {
        const data = await r.json();
        R2._pubUrl = data.url;
      }
    } catch(e) {}
    return R2._pubUrl || "";
  },

  async publicUrl(key) {
    const pub = await R2.getPubUrl();
    return `${pub}/${encodeURI(key).replace(/\\+/g, '%2B')}`;
  },

  async download(key, filename) {
    const url = await R2.publicUrl(key);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const blob = await r.blob();
      U.downloadBlob(blob, filename || key.split("/").pop());
    } catch (e) {
      window.open(url, "_blank");
    }
  },

  async list(prefix) {
    const r = await fetch(`/api/r2/list?prefix=${encodeURIComponent(prefix)}`, {
      headers: R2._h()
    });
    if (!r.ok) throw new Error("R2 list failed (" + r.status + ")");
    const data = await r.json();
    if (!data.Contents) return [];
    
    const items = data.Contents.map(c => ({
      key: c.Key || "",
      size: c.Size || 0,
      lastModified: c.LastModified || "",
    })).filter(i => i.key && !i.key.endsWith("/"));
    
    items.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
    return items;
  },
};

