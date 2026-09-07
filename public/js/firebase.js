/* ═══════════════════════════════════════════════════════════════
   Core Admin — Firebase RTDB REST client + shared utilities
   Talks to the SAME database the child app (MonitoringService.kt)
   polls: android-ahona. Plain REST, no SDK — same pattern as the
   existing dashboards.
   ═══════════════════════════════════════════════════════════════ */
// Page registry — populated by js/pages/*.js (loaded before app.js).

const Pages = {};

const FB = {
  // Returns headers that include the device auth code
  _headers(extra) {
    const code = localStorage.getItem('ca_device_code') || '';
    const conn = localStorage.getItem('ca_connection_key') || '';
    return { 'Content-Type': 'application/json', 'x-device-code': code, 'x-connection-key': conn, ...extra };
  },

  async get(path) {
    const r = await fetch(`/api/firebase/get`, {
      method: 'POST',
      headers: FB._headers(),
      body: JSON.stringify({ path })
    });
    if (!r.ok) throw new Error("Firebase GET failed (" + r.status + ")");
    return r.json();
  },

  async put(path, value) {
    const r = await fetch(`/api/firebase/put`, {
      method: "POST",
      headers: FB._headers(),
      body: JSON.stringify({ path, value }),
    });
    if (!r.ok) throw new Error("Firebase PUT failed (" + r.status + ")");
    return r.json();
  },

  async del(path) {
    const r = await fetch(`/api/firebase/del`, {
      method: "POST",
      headers: FB._headers(),
      body: JSON.stringify({ path }),
    });
    if (!r.ok) throw new Error("Firebase DELETE failed (" + r.status + ")");
  },

  // keepalive PUT — survives page unload (for live-flag resets)
  putBeacon(path, value) {
    try {
      fetch(`/api/firebase/put`, {
        method: "POST",
        headers: FB._headers(),
        body: JSON.stringify({ path, value }),
        keepalive: true,
      });
    } catch (_) {}
  },
};

/* ───────────────────────── shared utils ───────────────────────── */

const U = {
  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },

  fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
  },

  // Heartbeat format written by MonitoringService: "dd/MM/yy - hh:mm am"
  parseHeartbeat(s) {
    if (!s || typeof s !== "string") return null;
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2}):(\d{2})\s*(am|pm)/i);
    if (!m) return null;
    let h = parseInt(m[4], 10);
    const pm = m[6].toLowerCase() === "pm";
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return new Date(2000 + parseInt(m[3], 10), parseInt(m[2], 10) - 1,
      parseInt(m[1], 10), h, parseInt(m[5], 10));
  },

  isOnline(heartbeatStr) {
    const t = U.parseHeartbeat(heartbeatStr);
    if (!t) return false;
    const age = Date.now() - t.getTime();
    return age >= 0 && age <= 300000; // allow up to 5 minutes between heartbeats
  },

  timeAgo(date) {
    if (!date) return "never";
    const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  },

  // create element from html string
  el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  // trigger a browser download from a Blob
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  async sha256Hex(str) {
    if (window.crypto && crypto.subtle) {
      const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    // non-secure-context fallback (file:// on some browsers): FNV-1a — obfuscation only
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return "fnv" + h.toString(16);
  },
};
