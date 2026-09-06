/* Devices page — saved child devices with live status. */
Pages.devices = {
  render(root) {
    root.innerHTML = `
      <div class="page-head">
        <h2>Your devices</h2>
        <p>Devices are auto-detected from your Firebase database. Tap a card to control it.</p>
      </div>
      <div class="grid-cards cols-2" id="dev-grid"></div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" id="dev-config">
          <span class="material-symbols-rounded">settings</span>API Config
        </button>
      </div>`;

    document.getElementById("dev-config").onclick = () => {
      if (App.showConfig) App.showConfig();
    };

    Pages.devices._load();
    App.addTimer(setInterval(() => Pages.devices._load(true), 20000));
  },

  async _load(quiet) {
    const grid = document.getElementById("dev-grid");
    if (!grid) return;

    // Auto-discover devices from Firebase
    let discovered = [];
    try {
      const shallow = await FB.get("run?shallow=true");
      if (shallow) discovered = Object.keys(shallow);
    } catch (e) {
      console.error("Device discovery failed:", e);
    }

    // Sync with local state
    App.state.devices = discovered;
    App.save();

    const devices = App.state.devices;
    if (!devices.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <span class="material-symbols-rounded">phonelink_off</span>
        <p>No devices found in database.<br>Make sure the child app is running and connected.</p></div>`;
      return;
    }
    if (!quiet) grid.innerHTML = devices.map(() => `<div class="skeleton" style="height:130px"></div>`).join("");

    const cards = await Promise.all(devices.map(async id => {
      let hb = null, batt = null, info = null;
      try { hb = await FB.get(`run/${id}/isactive`); } catch (_) { }
      try { batt = await FB.get(`Battary/${id}/percentage`); } catch (_) { }
      try { info = await FB.get(`Device_info/${id}`); } catch (_) { }
      const online = U.isOnline(hb);
      const last = U.timeAgo(U.parseHeartbeat(hb));
      return { id, online, last, batt, model: info && info.Model ? info.Model : "—" };
    }));

    if (!document.getElementById("dev-grid")) return;
    grid.innerHTML = "";
    cards.forEach(c => {
      const battVal = parseInt((c.batt || "0").toString().replace("%", ""), 10) || 0;
      const battColor = battVal > 20 ? "#22c55e" : "#ef4444";
      const battHtml = `
        <div style="position:absolute; top:16px; right:16px; display:flex; align-items:center;" title="Battery: ${battVal}%">
          <svg viewBox="0 0 24 12" width="28" height="14">
            <rect x="1" y="1" width="20" height="10" rx="2" ry="2" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
            <path d="M22 4 L22 8" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-linecap="round" />
            <rect x="2.5" y="2.5" width="${17 * (battVal / 100)}" height="7" rx="1" ry="1" fill="${battColor}" />
          </svg>
          <span style="font-size:12px; font-weight:600; color:var(--text); margin-left:6px;">${battVal}%</span>
        </div>`;

      const card = U.el(`
        <div class="card device-card ${c.online ? "online" : ""}">
          <div class="device-glow"></div>
          ${battHtml}
          <div class="device-name">
            <span class="dot ${c.online ? "dot-on" : "dot-off"}"></span>${U.esc(c.id)}
          </div>
          <div class="device-meta">
            <span class="device-meta-item"><span class="material-symbols-rounded">smartphone</span>${U.esc(c.model)}</span>
            <span class="device-meta-item"><span class="material-symbols-rounded">battery_std</span>${U.esc(c.batt || "—")}</span>
            <span class="device-meta-item"><span class="material-symbols-rounded">schedule</span>${U.esc(c.last)}</span>
          </div>
          <div style="margin-top:14px">
            <span class="badge ${c.online ? "badge-on" : "badge-off"}">${c.online ? "ONLINE" : "OFFLINE"}</span>
          </div>
        </div>`);
      card.onclick = (e) => {
        App.setCurrent(c.id);
        App.toast(`Controlling ${c.id}`, "info");
        App.go("overview");
      };
      grid.appendChild(card);
    });
  },

  destroy() { },
};
