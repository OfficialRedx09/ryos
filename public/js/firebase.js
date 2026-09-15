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

  // Formats a byte count. Pass unknownText for "we don't know" (null/undefined)
  // so callers never have to print a misleading "0 B".
  fmtBytes(n, unknownText = "—") {
    if (n === null || n === undefined || n === "" || n === "null") return unknownText;
    const v = Number(n);
    if (!isFinite(v) || v < 0) return unknownText;
    if (v < 1024) return v + " B";
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
    if (v < 1024 * 1024 * 1024) return (v / 1048576).toFixed(1) + " MB";
    return (v / 1073741824).toFixed(2) + " GB";
  },

  // "15 Sep 2026, 16:22" — for R2 LastModified / epoch values.
  fmtDate(value, withTime = true) {
    if (!value) return "—";
    let d;
    if (value instanceof Date) d = value;
    else if (typeof value === "number" || /^\d+$/.test(String(value))) {
      const num = Number(value);
      // epoch seconds vs milliseconds
      d = new Date(num < 1e12 ? num * 1000 : num);
    } else d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    if (!withTime) return date;
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time}`;
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

  // Full-screen media viewer for R2 objects (image / video / audio).
  // `url` must be a fetchable URL — build it with R2.publicUrl(key).
  lightbox({ url, name, key, kind }) {
    const label = name || String(key || "").split("/").pop() || "file";
    const isVid = kind === "video" || R2.isVideo(label);
    const isAud = kind === "audio" || R2.isAudio(label);

    let media;
    if (isVid) {
      media = `<video src="${url}" controls autoplay playsinline style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></video>`;
    } else if (isAud) {
      media = `<audio src="${url}" controls autoplay style="width:min(520px,90vw);"></audio>`;
    } else {
      media = `<img src="${url}" alt="${U.esc(label)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">`;
    }

    const overlay = U.el(`
      <div style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.95);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.2s ease;">
        <div style="position:absolute;top:0;left:0;right:0;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);z-index:10000;">
          <button id="mv-close" class="btn btn-ghost btn-icon" title="Close" style="border:none;color:#fff;background:rgba(255,255,255,0.1);border-radius:50%;"><span class="material-symbols-rounded">close</span></button>
          <div style="color:#fff;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;text-shadow:0 2px 4px rgba(0,0,0,0.5);">${U.esc(label)}</div>
          <button id="mv-dl" class="btn btn-primary btn-icon" title="Download" style="border-radius:50%;"><span class="material-symbols-rounded">download</span></button>
        </div>
        ${media}
      </div>`);

    const onKey = e => { if (e.key === "Escape") close(); };
    const close = () => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    };

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    overlay.querySelector("#mv-close").onclick = close;
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    overlay.querySelector("#mv-dl").onclick = async () => {
      App.toast("Downloading " + label + "…", "info");
      await R2.download(key || label, label);
    };
    return overlay;
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
