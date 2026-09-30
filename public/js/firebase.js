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

  /* ─────────────── silent list reconciliation ───────────────
     Keeps a list container in sync with the data WITHOUT re-rendering it.
     Rows that are still there are reused, so expanded rows, scroll position,
     text selection and the CSS entry animations (fadeUp / ovIn / kl-msg-in …)
     are never replayed — new rows appear, changed rows are patched in place,
     gone rows disappear. When the data didn't change the DOM isn't touched at
     all (no blink on background polls).

       container        element that holds the rows
       keys             desired row order (string | number)
       ensure(key)      create + return the row element for a key (once)
       refresh(key,el)  patch a row's contents in place (every pass)
       opts.empty       HTML for ONE root element shown when there are no rows
       opts.emptySig    changes → the empty element is rebuilt (message changed)

     Nodes with the class `sync-keep` (or `sync-empty`) are ignored by the
     reconciler so a page can keep static decorations next to the rows. */
  syncList(container, keys, ensure, refresh, opts = {}) {
    if (!container) return false;
    let changed = false;

    const wanted = [];
    const seen = new Set();
    (keys || []).forEach(k => {
      const key = String(k);
      if (!key || seen.has(key)) return;
      seen.add(key);
      wanted.push(key);
    });

    // adopt the rows that are already mounted
    const mounted = new Map();
    Array.from(container.children).forEach(node => {
      if (node.classList.contains("sync-empty") || node.classList.contains("sync-keep")) return;
      const key = node.getAttribute("data-key");
      if (key === null || mounted.has(key)) { node.remove(); changed = true; return; }
      mounted.set(key, node);
    });

    const rows = wanted.map(key => {
      let node = mounted.get(key);
      if (!node) {
        node = ensure ? ensure(key) : null;
        if (!node) return null;
        if (node.getAttribute("data-key") === null) node.setAttribute("data-key", key);
        changed = true;
      }
      if (refresh) refresh(key, node);
      return node;
    });

    // drop rows that are no longer wanted
    mounted.forEach((node, key) => { if (!seen.has(key)) { node.remove(); changed = true; } });

    // place the rows in order — mounted rows are never detached, so nothing
    // re-animates and the scroll position stays where the user left it
    let cursor = container.firstChild;
    while (cursor && cursor.classList &&
      (cursor.classList.contains("sync-keep") || cursor.classList.contains("sync-empty"))) {
      cursor = cursor.nextSibling; // step over the static decorations
    }
    rows.forEach(node => {
      if (!node) return;
      if (node === cursor) { cursor = cursor.nextSibling; return; }
      container.insertBefore(node, cursor);
      changed = true;
    });

    // empty state
    let mark = container.querySelector(":scope > .sync-empty");
    if (!wanted.length && opts.empty) {
      const sig = opts.emptySig === undefined ? null : String(opts.emptySig);
      if (mark && sig !== null && mark.getAttribute("data-sig") !== sig) { mark.remove(); mark = null; changed = true; }
      if (!mark) {
        const node = U.el(opts.empty);
        if (node) {
          node.classList.add("sync-empty");
          if (sig !== null) node.setAttribute("data-sig", sig);
          container.insertBefore(node, container.firstChild);
          changed = true;
        }
      }
    } else if (mark) {
      mark.remove();
      changed = true;
    }
    return changed;
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

/* ───────────────────────── activity log ───────────────────────── */
// Local activity log for the Settings → Logs panel. Stores recent user actions
// (command clicks) with a 12-hour timestamp so the admin can see what was
// triggered and when.
const Log = {
  KEY: "ca_activity_log",
  MAX: 500,

  list() {
    try { return JSON.parse(localStorage.getItem(Log.KEY) || "[]"); }
    catch (_) { return []; }
  },

  add(msg) {
    try {
      const logs = Log.list();
      logs.unshift({ ts: Date.now(), msg: String(msg == null ? "" : msg) });
      if (logs.length > Log.MAX) logs.length = Log.MAX;
      localStorage.setItem(Log.KEY, JSON.stringify(logs));
    } catch (_) { }
  },

  clear() {
    try { localStorage.removeItem(Log.KEY); } catch (_) { }
  },

  // "01:20 AM" (12-hour)
  time(ts) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  },

  // "28 Sep 2026" — date only
  date(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      day: "2-digit", month: "short", year: "numeric",
    });
  },
};
