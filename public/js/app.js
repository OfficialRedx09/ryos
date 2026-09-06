/* ═══════════════════════════════════════════════════════════════
   Core Admin — app core: router, device state, PIN lock, toasts,
   modals, loading screen.
   Pages register themselves on the global `Pages` object as
   { title, icon, render(root), destroy() }.
   ═══════════════════════════════════════════════════════════════ */

const App = {
  state: {
    devices: [],        // saved device IDs (localStorage "ca_devices")
    current: null,      // selected device ID (localStorage "ca_current")
    page: null,
    timers: [],         // intervals/timeouts owned by the active page
  },

  audioCtx: null,
  audioEnabled: false,

  /* ─────────── sound effects ─────────── */
  initAudio() {
    if (App.audioEnabled) return;
    try {
      App.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      App.audioEnabled = true;
    } catch (_) { }
  },

  playClick() {
    if (!App.audioEnabled || !App.audioCtx) return;
    try {
      const ctx = App.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch (_) { }
  },

  /* ─────────── persistence ─────────── */
  save() {
    localStorage.setItem("ca_devices", JSON.stringify(App.state.devices));
    localStorage.setItem("ca_current", App.state.current || "");
  },
  load() {
    try { App.state.devices = JSON.parse(localStorage.getItem("ca_devices") || "[]"); } catch (_) { App.state.devices = []; }
    const cur = localStorage.getItem("ca_current");
    App.state.current = cur && App.state.devices.includes(cur) ? cur : (App.state.devices[0] || null);
  },

  isConfigured() {
    return localStorage.getItem("ca_fb_db") && localStorage.getItem("ca_lk_url") && localStorage.getItem("ca_lk_key") && localStorage.getItem("ca_lk_secret");
  },

  addDevice(id) {
    id = (id || "").trim();
    if (!id) return false;
    if (!App.state.devices.includes(id)) App.state.devices.push(id);
    App.state.current = id;
    App.save();
    return true;
  },
  removeDevice(id) {
    App.state.devices = App.state.devices.filter(d => d !== id);
    if (App.state.current === id) App.state.current = App.state.devices[0] || null;
    App.save();
  },
  setCurrent(id) {
    App.state.current = id;
    App.save();
    App.refresh(); // re-render current page for the new device
  },

  /* ─────────── router ─────────── */
  NAV: [
    { id: "devices", title: "Devices", icon: "smartphone", tab: true },
    { id: "live", title: "Live Control", icon: "live_tv", tab: true },
    { id: "actions", title: "Actions", icon: "settings_remote", tab: true },
    { id: "notifications", title: "Notifications", icon: "notifications", tab: true },
    { id: "overview", title: "Overview", icon: "dashboard", tab: false },
    { id: "messages", title: "Messages", icon: "forum", tab: false },
    { id: "files", title: "Files", icon: "folder", tab: false },
    { id: "media", title: "Media", icon: "photo_library", tab: false },
    { id: "settings", title: "Settings", icon: "settings", tab: false },
  ],

  go(pageId) {
    const def = App.NAV.find(n => n.id === pageId) || App.NAV[0];
    const page = Pages[def.id];
    if (!page) return;

    // tear down previous page
    App.state.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
    App.state.timers = [];
    if (App.state.page && Pages[App.state.page] && Pages[App.state.page].destroy) {
      try { Pages[App.state.page].destroy(); } catch (_) { }
    }
    App.state.page = def.id;

    document.getElementById("page-title").textContent = def.title;
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.page === def.id));
    document.querySelectorAll(".bnav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.page === def.id));
    App.closeMore();

    const view = document.getElementById("view");
    const overlay = document.getElementById("page-transition");
    if (overlay) overlay.classList.add("active");

    setTimeout(() => {
      view.style.animation = "none";
      void view.offsetWidth; // restart page transition
      view.style.animation = "";
      view.innerHTML = "";
      page.render(view);
      if (overlay) overlay.classList.remove("active");
    }, 150);
  },

  refresh() { if (App.state.page) App.go(App.state.page); },

  addTimer(t) { App.state.timers.push(t); return t; },

  /* ─────────── nav rendering ─────────── */
  renderNav() {
    const side = document.getElementById("side-nav");
    side.innerHTML = "";
    App.NAV.forEach(n => {
      const b = U.el(`<button class="nav-item" data-page="${n.id}">
        <span class="material-symbols-rounded">${n.icon}</span>${n.title}</button>`);
      b.onclick = () => App.go(n.id);
      side.appendChild(b);
    });

    const bottom = document.getElementById("bottomnav");
    bottom.innerHTML = "";
    App.NAV.filter(n => n.tab).forEach(n => {
      const b = U.el(`<button class="bnav-item" data-page="${n.id}">
        <span class="material-symbols-rounded">${n.icon}</span><span class="bnav-label">${n.title.split(" ")[0]}</span></button>`);
      b.onclick = () => App.go(n.id);
      bottom.appendChild(b);
    });
    const more = U.el(`<button class="bnav-item" data-page="__more">
      <span class="material-symbols-rounded">more_horiz</span><span class="bnav-label">More</span></button>`);
    more.onclick = App.openMore;
    bottom.appendChild(more);

    const items = document.getElementById("moresheet-items");
    items.innerHTML = "";
    App.NAV.filter(n => !n.tab).forEach(n => {
      const b = U.el(`<button class="sheet-item" data-page="${n.id}">
        <span class="material-symbols-rounded">${n.icon}</span>${n.title}</button>`);
      b.onclick = () => App.go(n.id);
      items.appendChild(b);
    });
    const lock = U.el(`<button class="sheet-item">
      <span class="material-symbols-rounded">lock</span>Lock app</button>`);
    lock.onclick = () => { App.closeMore(); App.lock(); };
    items.appendChild(lock);
  },

  openMore() { document.getElementById("moresheet").classList.remove("hidden"); },
  closeMore() { document.getElementById("moresheet").classList.add("hidden"); },

  async updateDeviceStatus() {
    const id = App.state.current;
    if (!id) return;
    try {
      const hb = await FB.get(`run/${id}/isactive`);
      const online = U.isOnline(hb);
      document.getElementById("device-dot").className = "dot " + (online ? "dot-on" : "dot-off");
      document.getElementById("device-status-text").textContent = online ? "online" : "offline";
    } catch (_) { }

    try {
      const batteriesDiv = document.getElementById("topbar-batteries");
      if (batteriesDiv) {
        const devices = App.state.devices || [];
        let html = "";
        for (const d of devices) {
          try {
            const batt = await FB.get(`Battary/${d}/percentage`);
            const battVal = parseInt((batt || "0").toString().replace("%", ""), 10) || 0;
            const battColor = battVal > 20 ? "#22c55e" : "#ef4444";

            html += `
              <div title="${d} Battery: ${battVal}%" style="display:flex; align-items:center; margin-left:12px;">
                <div class="topbar-batt-desktop" style="display:flex; align-items:center;">
                  <svg viewBox="0 0 24 12" width="24" height="12">
                    <rect x="1" y="1" width="20" height="10" rx="2" ry="2" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
                    <path d="M22 4 L22 8" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round" />
                    <rect x="2.5" y="2.5" width="${17 * (battVal / 100)}" height="7" rx="1" ry="1" fill="${battColor}" />
                  </svg>
                  <span style="font-size:11px; font-weight:600; color:var(--text); margin-left:6px;">${battVal}%</span>
                </div>
                <div class="topbar-batt-mobile" style="position:relative; width:24px; height:24px; display:flex; align-items:center; justify-content:center; margin-left:4px;">
                  <svg viewBox="0 0 36 36" style="position:absolute; inset:0; width:100%; height:100%; transform: rotate(-90deg);">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3"></path>
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${battColor}" stroke-width="3" stroke-dasharray="${battVal}, 100"></path>
                  </svg>
                </div>
              </div>`;
          } catch (e) { }
        }
        batteriesDiv.innerHTML = html;
      }
    } catch (_) { }
  },

  // current device or toast + null
  dev() {
    if (!App.state.current) {
      App.toast("Add a device first (Devices page)", "err");
      return null;
    }
    return App.state.current;
  },

  /* ─────────── toasts ─────────── */
  toast(msg, type = "info", ms = 3200) {
    const icons = { ok: "check_circle", err: "error", info: "info" };
    const t = U.el(`<div class="toast toast-${type}">
      <span class="material-symbols-rounded">${icons[type] || "info"}</span>
      <div style="flex:1;">${U.esc(msg)}</div>
      <button class="toast-close" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:0;display:flex;"><span class="material-symbols-rounded" style="font-size:16px;">close</span></button>
    </div>`);

    t.querySelector('.toast-close').onclick = () => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 260);
    };

    document.getElementById("toasts").appendChild(t);
    setTimeout(() => { if (t.parentNode) { t.classList.add("out"); setTimeout(() => t.remove(), 260); } }, ms);
  },

  /* ─────────── modals ─────────── */
  _modal(html) {
    const root = document.getElementById("modal-root");
    const overlay = U.el(`<div class="modal-overlay"><div class="modal">${html}</div></div>`);
    root.appendChild(overlay);
    return overlay;
  },

  confirm({ title, body, okText = "Confirm", danger = false, icon = "help" }) {
    return new Promise(resolve => {
      const overlay = App._modal(`
        <h3 class="${danger ? "danger" : ""}"><span class="material-symbols-rounded">${icon}</span>${U.esc(title)}</h3>
        <p>${U.esc(body)}</p>
        <div class="modal-btns">
          <button class="btn btn-ghost" data-x="0">Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-x="1">${U.esc(okText)}</button>
        </div>`);
      const done = v => { overlay.remove(); resolve(v); };
      overlay.querySelector('[data-x="0"]').onclick = () => done(false);
      overlay.querySelector('[data-x="1"]').onclick = () => done(true);
      overlay.addEventListener("click", e => { if (e.target === overlay) done(false); });
    });
  },

  prompt({ title, body = "", placeholder = "", value = "", okText = "Save", type = "text" }) {
    return new Promise(resolve => {
      const overlay = App._modal(`
        <h3><span class="material-symbols-rounded">edit</span>${U.esc(title)}</h3>
        ${body ? `<p>${U.esc(body)}</p>` : ""}
        <input class="input" type="${type}" placeholder="${U.esc(placeholder)}" value="${U.esc(value)}">
        <div class="modal-btns">
          <button class="btn btn-ghost" data-x="0">Cancel</button>
          <button class="btn btn-primary" data-x="1">${U.esc(okText)}</button>
        </div>`);
      const input = overlay.querySelector("input");
      const done = v => { overlay.remove(); resolve(v); };
      overlay.querySelector('[data-x="0"]').onclick = () => done(null);
      overlay.querySelector('[data-x="1"]').onclick = () => done(input.value.trim() || null);
      input.onkeydown = e => { if (e.key === "Enter") done(input.value.trim() || null); };
      overlay.addEventListener("click", e => { if (e.target === overlay) done(null); });
      setTimeout(() => input.focus(), 60);
    });
  },

  /* ─────────── API config ─────────── */
  async showConfig() {
    if (App.role !== 'admin') {
      App.toast("Only admins can access configuration", "err");
      return;
    }

    const code = localStorage.getItem("ca_device_code");

    let state;
    try {
      const r = await fetch('/api/config', {
        headers: { 'x-device-code': code }
      });
      if (!r.ok) throw new Error("Failed to load config");
      state = await r.json();
    } catch(e) {
      App.toast("Could not load config: " + e.message, "err");
      return;
    }

    const overlay = App._modal(`
      <div style="text-align:left;">
        <h3 style="margin-bottom:16px;"><span class="material-symbols-rounded">settings</span> Server Configuration</h3>
        <div class="tabbar config-tabs">
          <button class="active" data-tab="firebase">Firebase</button>
          <button data-tab="livekit">LiveKit</button>
          <button data-tab="r2">R2</button>
        </div>
        <div id="config-body" style="margin-bottom: 10px;"></div>
        <div class="modal-btns" style="display:flex; flex-direction:column;">
        <div style="display:flex; flex-direction:row; justify-content:center; align-items:center; gap:6px;">  
        <button class="btn btn-ghost" data-x="cancel">Close</button>
        <button class="btn btn-primary" data-x="save">Save to Server</button></div>
        </div>
      </div>`);

    let currentTab = "firebase";
    const body = overlay.querySelector("#config-body");

    const renderBody = () => {
      if (currentTab === "firebase") {
        body.innerHTML = `
          <label style="font-size:12px;color:var(--text-dim);">Firebase DB URL</label>
          <input class="input" id="cfg-fb-db" value="${U.esc(state.FIREBASE_DB_URL || '')}">
        `;
      } else if (currentTab === "livekit") {
        body.innerHTML = `
          <label style="font-size:12px;color:var(--text-dim);">LiveKit URL</label>
          <input class="input" id="cfg-lk-url" value="${U.esc(state.LIVEKIT_WS_URL || '')}" style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-dim);">LiveKit KEY</label>
          <input class="input" id="cfg-lk-key" value="${U.esc(state.LIVEKIT_API_KEY || '')}" style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-dim);">LiveKit SECRET</label>
          <input class="input" id="cfg-lk-secret" value="${U.esc(state.LIVEKIT_API_SECRET || '')}">
        `;
      } else if (currentTab === "r2") {
        body.innerHTML = `
          <label style="font-size:12px;color:var(--text-dim);">R2 PUB URL</label>
          <input class="input" id="cfg-r2-pub" value="${U.esc(state.R2_PUB || '')}" style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-dim);">R2 HOST</label>
          <input class="input" id="cfg-r2-host" value="${U.esc(state.R2_HOST || '')}" style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-dim);">R2 BUCKET</label>
          <input class="input" id="cfg-r2-bucket" value="${U.esc(state.R2_BUCKET || '')}" style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-dim);">R2 ACCESS KEY</label>
          <input class="input" id="cfg-r2-access" value="${U.esc(state.R2_ACCESS_KEY || '')}" style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--text-dim);">R2 SECRET KEY</label>
          <input class="input" id="cfg-r2-secret" type="password" value="${U.esc(state.R2_SECRET_KEY || '')}">
        `;
      }
    };

    const saveCurrentTab = () => {
      if (currentTab === "firebase") {
        state.FIREBASE_DB_URL = overlay.querySelector("#cfg-fb-db").value.trim();
      } else if (currentTab === "livekit") {
        state.LIVEKIT_WS_URL = overlay.querySelector("#cfg-lk-url").value.trim();
        state.LIVEKIT_API_KEY = overlay.querySelector("#cfg-lk-key").value.trim();
        state.LIVEKIT_API_SECRET = overlay.querySelector("#cfg-lk-secret").value.trim();
      } else if (currentTab === "r2") {
        state.R2_PUB = overlay.querySelector("#cfg-r2-pub").value.trim();
        state.R2_HOST = overlay.querySelector("#cfg-r2-host").value.trim();
        state.R2_BUCKET = overlay.querySelector("#cfg-r2-bucket").value.trim();
        state.R2_ACCESS_KEY = overlay.querySelector("#cfg-r2-access").value.trim();
        state.R2_SECRET_KEY = overlay.querySelector("#cfg-r2-secret").value.trim();
      }
    };

    overlay.querySelectorAll(".config-tabs button").forEach(b => {
      b.onclick = () => {
        saveCurrentTab();
        overlay.querySelectorAll(".config-tabs button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        currentTab = b.dataset.tab;
        renderBody();
      };
    });

    overlay.querySelector('[data-x="cancel"]').onclick = () => overlay.remove();

    overlay.querySelector('[data-x="save"]').onclick = async () => {
      saveCurrentTab();
      const btn = overlay.querySelector('[data-x="save"]');
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-rounded spin">progress_activity</span>';
      btn.disabled = true;

      try {
        const r = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-device-code': code },
          body: JSON.stringify(state)
        });
        if (!r.ok) throw new Error("Failed to save config");
        App.toast("Saved to server", "ok");
        overlay.remove();
      } catch(e) {
        App.toast(e.message, "err");
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    };

    renderBody();
  },

  /* ─────────── PIN lock ─────────── */
  PIN_KEY: "ca_pin_hash",
  pin: {
    mode: "enter",   // enter | create | confirm | change-verify
    buffer: "",
    first: "",
    fails: 0,
    cooldownUntil: 0,
    onSuccess: null,
  },

  hasPin() { return !!localStorage.getItem(App.PIN_KEY); },

  lock() { App.showPin("enter"); },

  showPin(mode) {
    App.pin.mode = mode;
    App.pin.buffer = "";
    App.pin.first = "";
    document.getElementById("app").classList.add("hidden");
    document.getElementById("pinlock").classList.remove("hidden");
    App._pinUi();
  },

  _pinUi() {
    const titles = {
      enter: ["Locked", "Enter your 4-digit PIN to unlock Ryos"],
      create: ["Create PIN", "Choose a 4-digit PIN for this admin app"],
      confirm: ["Confirm PIN", "Enter the same PIN again"],
      change: ["Current PIN", "Enter your current PIN first"],
      remove: ["Remove PIN", "Enter your current PIN to remove the lock"],
    };
    const [t, s] = titles[App.pin.mode] || titles.enter;
    document.getElementById("pin-title").textContent = t;
    document.getElementById("pin-sub").textContent = s;
    document.getElementById("pin-error").textContent = "";
    App._pinDots();
  },

  _pinDots() {
    document.querySelectorAll("#pin-dots span").forEach((d, i) =>
      d.classList.toggle("filled", i < App.pin.buffer.length));
  },

  async _pinKey(k) {
    const p = App.pin;
    if (Date.now() < p.cooldownUntil) return;
    if (k === "clear") { p.buffer = ""; App._pinDots(); return; }
    if (k === "back") { p.buffer = p.buffer.slice(0, -1); App._pinDots(); return; }
    if (!/^\d$/.test(k) || p.buffer.length >= 4) return;
    p.buffer += k;
    App._pinDots();
    if (p.buffer.length < 4) return;
    const entered = p.buffer;
    p.buffer = "";
    setTimeout(App._pinDots, 160);

    const err = document.getElementById("pin-error");
    const card = document.querySelector(".pin-card");
    const fail = (msg) => {
      p.fails++;
      err.textContent = msg;
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      if (p.fails >= 5) {
        p.fails = 0;
        p.cooldownUntil = Date.now() + 30000;
        let left = 30;
        err.textContent = `Too many attempts — wait ${left} s`;
        const iv = setInterval(() => {
          left--;
          if (left <= 0) { clearInterval(iv); err.textContent = ""; }
          else err.textContent = `Too many attempts — wait ${left} s`;
        }, 1000);
      }
    };

    if (p.mode === "create") {
      p.first = entered;
      p.mode = "confirm";
      App._pinUi();
      return;
    }
    if (p.mode === "confirm") {
      if (entered === p.first) {
        localStorage.setItem(App.PIN_KEY, await U.sha256Hex(entered));
        App.toast("PIN created", "ok");
        App._unlock();
      } else {
        p.mode = "create";
        App._pinUi();
        err.textContent = "PINs didn't match — start over";
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      }
      return;
    }
    // enter / change / remove — verify against stored hash
    const hash = await U.sha256Hex(entered);
    if (hash !== localStorage.getItem(App.PIN_KEY)) {
      fail("Wrong PIN");
      return;
    }
    p.fails = 0;
    if (p.mode === "change") { p.mode = "create"; App._pinUi(); return; }
    if (p.mode === "remove") {
      localStorage.removeItem(App.PIN_KEY);
      App.toast("PIN removed", "ok");
      App._unlock();
      return;
    }
    App._unlock();
  },

  _unlock() {
    document.getElementById("pinlock").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    App.initAudio();
    if (!App.state.page) App.go("devices");
  },

  _ripple(e, el) {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 520);
  },

  /* ─────────── boot ─────────── */
  async init() {
    App.load();
    App.renderNav();

    document.getElementById("config-btn-top").onclick = () => App.showConfig();
    document.getElementById("lock-btn-top").onclick = () => App.lock();
    document.getElementById("lock-btn-side").onclick = () => App.lock();
    document.getElementById("moresheet").addEventListener("click", e => {
      if (e.target.id === "moresheet") App.closeMore();
    });
    document.querySelector(".pin-pad").addEventListener("click", e => {
      const b = e.target.closest(".pin-key");
      if (b) { App._pinKey(b.dataset.key); App.playClick(); }
    });

    // global click sound + touch ripple (init audio on first interaction)
    document.body.addEventListener("click", e => {
      if (!App.audioEnabled && (e.target.closest("button, a, .nav-item, .bnav-item, .action-card, .sheet-item, .pin-key, .toggle, .pill, .player-btn, .live-dock-btn"))) {
        App.initAudio();
      }
      if (e.target.closest("button, a, .nav-item, .bnav-item, .action-card, .sheet-item, .pill, .player-btn, .live-dock-btn")) {
        App.playClick();
      }
    }, true);
    document.body.addEventListener("pointerdown", e => {
      const el = e.target.closest("button, a, .nav-item, .bnav-item, .action-card, .sheet-item, .pill, .player-btn, .live-dock-btn, .pin-key");
      if (el) App._ripple(e, el);
    });

    // status polling
    setInterval(App.updateDeviceStatus, 15000);
    App.updateDeviceStatus();

    const hideLoader = async () => {
      // Prevent multiple triggers
      if (App._loaderHidden) return;
      App._loaderHidden = true;

      const loader = document.getElementById("loader");
      loader.classList.add("loader-out");
      setTimeout(() => loader.classList.add("hidden"), 600);

      // --- Node.js Backend Auth Flow ---
      let code = localStorage.getItem("ca_device_code");
      if (!code) {
        code = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        localStorage.setItem("ca_device_code", code);
      }
      
      try {
        const r = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await r.json();
        App.role = data.role; // 'admin', 'client', or 'unauthorized'
      } catch (e) {
        App.role = 'unauthorized';
      }

      if (App.role === 'admin' || App.role === 'client') {
        if (App.role === 'client') {
          // Hide settings button for client
          const settingsBtns = document.querySelectorAll('[data-page="settings"]');
          settingsBtns.forEach(btn => {
            btn.style.opacity = '0.3';
            btn.style.pointerEvents = 'none';
          });
        }
        
        App.showPin(App.hasPin() ? "enter" : "create");
      } else {
        App.toast("Unauthorized. Code: " + code, "err");
        document.getElementById("view").innerHTML = `
          <div style="padding: 40px; text-align: center; color: white; font-family: sans-serif;">
            <h2>Device Not Registered</h2>
            <p>Your Device Code is: <b style="color:#60a5fa; font-size:1.2em;">${code}</b></p>
            <p>Please ask an admin to register this code in the database.</p>
          </div>
        `;
      }
    };

    // Wait for critical rendering paths (fonts, images) to load smoothly
    if (document.readyState === "complete") {
      document.fonts.ready.then(hideLoader);
    } else {
      window.addEventListener("load", () => {
        document.fonts.ready.then(hideLoader);
      });
      // Fallback timeout just in case network hangs
      setTimeout(hideLoader, 3000);
    }
  },

  _initWizard() {
    const wizard = document.getElementById("setup-wizard");
    wizard.classList.remove("hidden");

    const steps = [
      document.getElementById("wizard-step-0"),
      document.getElementById("wizard-step-1"),
      document.getElementById("wizard-step-2"),
      document.getElementById("wizard-step-3"),
      document.getElementById("wizard-step-done")
    ];

    let currentStep = 0;
    const showStep = (idx) => {
      steps.forEach((s, i) => { if (s) s.classList.toggle("hidden", i !== idx); });
      currentStep = idx;
    };

    let payload = {
      FIREBASE_DB_URL: "",
      LIVEKIT_WS_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
      R2_HOST: "", R2_PUB: "", R2_ACCESS_KEY: "", R2_SECRET_KEY: "", R2_BUCKET: "files",
      Unlock_code: "9099"
    };

    // Step 0: PIN Login
    const pinBtn = document.getElementById("wiz-btn-pin");
    if (pinBtn) pinBtn.onclick = async () => {
      const pin = document.getElementById("wiz-pin-input").value.trim();
      if (pin.length !== 6) return App.toast("Please enter a 6-digit PIN", "err");

      pinBtn.disabled = true;
      pinBtn.innerHTML = "Verifying...";

      try {
        const r = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/Apis/${pin}.json`);
        if (!r.ok) throw new Error("Verification failed");
        const data = await r.json();

        if (!data || !data.FIREBASE_DB_URL) throw new Error("Invalid PIN");

        localStorage.setItem("ca_fb_db", data.FIREBASE_DB_URL);
        localStorage.setItem("ca_lk_url", data.LIVEKIT_WS_URL);
        localStorage.setItem("ca_lk_key", data.LIVEKIT_API_KEY);
        localStorage.setItem("ca_lk_secret", data.LIVEKIT_API_SECRET);
        localStorage.setItem("ca_r2_host", data.R2_HOST);
        localStorage.setItem("ca_r2_pub", data.R2_PUB || "");
        localStorage.setItem("ca_r2_access", data.R2_ACCESS_KEY);
        localStorage.setItem("ca_r2_secret", data.R2_SECRET_KEY);
        localStorage.setItem("ca_r2_bucket", data.R2_BUCKET || "files");

        App.toast("APIs loaded successfully!", "ok");
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        App.toast(e.message, "err");
        pinBtn.disabled = false;
        pinBtn.innerHTML = "Login";
      }
    };

    const manualBtn = document.getElementById("wiz-btn-manual");
    if (manualBtn) manualBtn.onclick = () => showStep(1);

    // Step 1: Firebase
    document.getElementById("wiz-btn-1").onclick = async () => {
      const btn = document.getElementById("wiz-btn-1");
      let url = document.getElementById("wiz-fb-url").value.trim();
      if (!url) return App.toast("Please enter Firebase DB URL", "err");
      if (!url.startsWith("http")) url = "https://" + url;
      btn.disabled = true; btn.innerHTML = "Checking...";
      try {
        const r = await fetch(`${url}/.json?shallow=true`);
        if (!r.ok) throw new Error("Status " + r.status);
        payload.FIREBASE_DB_URL = url;
        showStep(2);
      } catch (e) {
        App.toast("Firebase check failed: " + e.message, "err");
      }
      btn.disabled = false; btn.innerHTML = "Next";
    };
    const backBtn1 = document.getElementById("wiz-back-1");
    if (backBtn1) backBtn1.onclick = () => showStep(0);

    // Step 2: LiveKit
    document.getElementById("wiz-btn-2").onclick = async () => {
      const btn = document.getElementById("wiz-btn-2");
      let url = document.getElementById("wiz-lk-url").value.trim();
      let key = document.getElementById("wiz-lk-key").value.trim();
      let sec = document.getElementById("wiz-lk-secret").value.trim();
      if (!url || !key || !sec) return App.toast("Please fill all LiveKit fields", "err");
      if (!url.startsWith("ws")) url = "wss://" + url;
      btn.disabled = true; btn.innerHTML = "Checking...";
      try {
        const checkUrl = url.replace("wss://", "https://").replace("ws://", "http://");
        const r = await fetch(checkUrl);
        payload.LIVEKIT_WS_URL = url;
        payload.LIVEKIT_API_KEY = key;
        payload.LIVEKIT_API_SECRET = sec;
        showStep(3);
      } catch (e) {
        App.toast("LiveKit check failed: " + e.message, "err");
      }
      btn.disabled = false; btn.innerHTML = "Next";
    };
    document.getElementById("wiz-back-2").onclick = () => showStep(1);

    // Step 3: R2
    document.getElementById("wiz-btn-3").onclick = async () => {
      const btn = document.getElementById("wiz-btn-3");
      let host = document.getElementById("wiz-r2-host").value.trim();
      let pub = document.getElementById("wiz-r2-pub").value.trim();
      let access = document.getElementById("wiz-r2-access").value.trim();
      let secret = document.getElementById("wiz-r2-secret").value.trim();
      if (!host || !access || !secret) return App.toast("Please fill required R2 fields", "err");
      btn.disabled = true; btn.innerHTML = "Finishing...";
      try {
        // Generate random 6 digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        payload.R2_HOST = host;
        payload.R2_PUB = pub;
        payload.R2_ACCESS_KEY = access;
        payload.R2_SECRET_KEY = secret;

        // Push to Firebase Secret node
        const r = await fetch(`https://notification-secret-default-rtdb.firebaseio.com/Apis/${code}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error("Failed to save configuration to Apis");

        // Save local dashboard config
        localStorage.setItem("ca_fb_db", payload.FIREBASE_DB_URL);
        localStorage.setItem("ca_lk_url", payload.LIVEKIT_WS_URL);
        localStorage.setItem("ca_lk_key", payload.LIVEKIT_API_KEY);
        localStorage.setItem("ca_lk_secret", payload.LIVEKIT_API_SECRET);
        localStorage.setItem("ca_r2_host", payload.R2_HOST);
        localStorage.setItem("ca_r2_pub", payload.R2_PUB);
        localStorage.setItem("ca_r2_access", payload.R2_ACCESS_KEY);
        localStorage.setItem("ca_r2_secret", payload.R2_SECRET_KEY);
        localStorage.setItem("ca_r2_bucket", "files");

        // Reload FB/LK globals
        FB.DB = payload.FIREBASE_DB_URL;
        LK.URL = payload.LIVEKIT_WS_URL;
        LK.KEY = payload.LIVEKIT_API_KEY;
        LK.SECRET = payload.LIVEKIT_API_SECRET;
        R2.HOST = payload.R2_HOST;
        R2.PUB = payload.R2_PUB;
        R2.ACCESS_KEY = payload.R2_ACCESS_KEY;
        R2.SECRET_KEY = payload.R2_SECRET_KEY;
        R2.BUCKET = "files";

        document.getElementById("wiz-code").textContent = code;
        showStep(4);
      } catch (e) {
        App.toast("Setup failed: " + e.message, "err");
        btn.disabled = false; btn.innerHTML = "Finish & Generate Code";
      }
    };
    document.getElementById("wiz-back-3").onclick = () => showStep(2);

    document.getElementById("wiz-btn-done").onclick = () => {
      wizard.classList.add("hidden");
      App.showPin("create");
    };
  },
};

document.addEventListener("DOMContentLoaded", App.init);
