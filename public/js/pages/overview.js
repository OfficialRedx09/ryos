/* Overview page — device info, battery, status, apps, errors. */
Pages.overview = {
  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = Pages.overview._noDevice(); return; }
    root.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px;">
        <div class="cc-widget">
          <div class="cc-icon" style="background:#34c759;"><span class="material-symbols-rounded">battery_charging_full</span></div>
          <div>
            <div style="font-size:28px; font-weight:700; font-family:'JetBrains Mono', monospace;" id="ov-batt">…</div>
            <div class="cc-title" style="color:var(--text-dim); padding-top:4px;">Battery</div>
          </div>
        </div>
        <div class="cc-widget" id="ov-status-widget">
          <div class="cc-icon" id="ov-status-icon"><span class="material-symbols-rounded">wifi</span></div>
          <div>
            <div style="font-size:22px; font-weight:700;" id="ov-status">…</div>
            <div class="cc-title" id="ov-seen" style="color:var(--text-dim); padding-top:4px; font-weight:500;">Last seen</div>
          </div>
        </div>
      </div>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text-faint); margin:0 0 8px 16px;">Device Info</h2>
      <div class="apple-list" id="ov-info">
        <div class="skeleton" style="height:100px;"></div>
      </div>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text-faint); margin:0 0 8px 16px;">Most Used Apps</h2>
      <div class="apple-list" id="ov-most">
        <div class="skeleton" style="height:100px;"></div>
      </div>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text-faint); margin:0 0 8px 16px;">Installed Apps</h2>
      <div class="apple-list" id="ov-apps" style="max-height:400px; overflow-y:auto;">
        <div class="skeleton" style="height:100px;"></div>
      </div>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text-faint); margin:0 0 8px 16px;">Error Log</h2>
      <div class="apple-list" id="ov-errors" style="max-height:300px; overflow-y:auto;">
        <div class="skeleton" style="height:100px;"></div>
      </div>`;
    Pages.overview._load(id);
    App.addTimer(setInterval(() => Pages.overview._load(id, true), 30000));
  },

  _noDevice() {
    return `<div class="empty"><span class="material-symbols-rounded" style="font-size:48px;">phonelink_off</span>
      <p style="font-size:15px; margin-top:16px;">No device selected.<br>Add one on the Devices page.</p></div>`;
  },

  async _load(id, quiet) {
    if (!document.getElementById("ov-info")) return;
    let hb = null, batt = null, info = null, most = null, apps = null, errs = null;
    try { hb = await FB.get(`run/${id}/isactive`); } catch (_) {}
    try { batt = await FB.get(`Battary/${id}/percentage`); } catch (_) {}
    try { info = await FB.get(`Device_info/${id}`); } catch (_) {}
    try { most = await FB.get(`Most_used/${id}`); } catch (_) {}
    try { apps = await FB.get(`Apps/${id}`); } catch (_) {}
    try { errs = await FB.get(`Error_logs/${id}`); } catch (_) {}
    if (!document.getElementById("ov-info")) return;

    const online = U.isOnline(hb);
    const seen = U.parseHeartbeat(hb);
    document.getElementById("ov-batt").textContent = batt || "—";
    document.getElementById("ov-status").textContent = online ? "Online" : "Offline";
    document.getElementById("ov-seen").textContent = "Seen " + U.timeAgo(seen);
    
    const statusWidget = document.getElementById("ov-status-widget");
    const statusIcon = document.getElementById("ov-status-icon");
    if (online) {
      statusIcon.style.background = "#007aff";
      statusIcon.innerHTML = `<span class="material-symbols-rounded">wifi</span>`;
    } else {
      statusIcon.style.background = "rgba(255,255,255,0.15)";
      statusIcon.innerHTML = `<span class="material-symbols-rounded">wifi_off</span>`;
    }

    const mkRow = (icon, color, label, val) => `
      <div class="apple-row">
        <div class="apple-row-left">
          <div class="apple-icon" style="background:${color};"><span class="material-symbols-rounded">${icon}</span></div>
          <div class="apple-label">${U.esc(label)}</div>
        </div>
        <div class="apple-value">${U.esc(val)}</div>
      </div>`;

    document.getElementById("ov-info").innerHTML = info ? 
      mkRow("smartphone", "#007aff", "Model", info.Model || "—") +
      mkRow("branding_watermark", "#5856d6", "Brand", info.Brand || "—") +
      mkRow("android", "#34c759", "Android", info.Android || "—") +
      mkRow("memory", "#ff9500", "RAM", info.Ram || "—") +
      mkRow("hard_drive", "#ff2d55", "Storage", info.storage || "—") +
      mkRow("tag", "#8e8e93", "IMEI", info.Imei || "—") +
      mkRow("sim_card", "#af52de", "SIM 1", info.sim1_number || "—") +
      mkRow("sim_card", "#af52de", "SIM 2", info.sim2_number || "—")
      : `<div class="apple-row"><div class="apple-label" style="color:var(--text-faint);">No device info reported yet.</div></div>`;

    const mostEl = document.getElementById("ov-most");
    if (most && Object.keys(most).length) {
      const colors = ["#ffcc00", "#c0c0c0", "#cd7f32"];
      mostEl.innerHTML = ["1st", "2nd", "3rd"].filter(k => most[k]).map((k, i) => {
          const label = Object.keys(most[k])[0];
          return `
            <div class="apple-row">
              <div class="apple-row-left">
                <div class="apple-icon" style="background:${colors[i]}; font-size:18px; font-weight:bold;">${i+1}</div>
                <div>
                  <div class="apple-label">${U.esc(label)}</div>
                  <div class="apple-sub">${U.esc(most[k][label])}</div>
                </div>
              </div>
            </div>`;
        }).join("");
    } else {
      mostEl.innerHTML = `<div class="apple-row"><div class="apple-label" style="color:var(--text-faint);">No usage data yet.</div></div>`;
    }

    const appsEl = document.getElementById("ov-apps");
    if (apps && Object.keys(apps).length) {
      appsEl.innerHTML = Object.entries(apps).map(([label, pkg]) =>
        `<div class="apple-row">
          <div class="apple-row-left">
            <div class="apple-icon" style="background:var(--glass-2);"><span class="material-symbols-rounded">apps</span></div>
            <div>
              <div class="apple-label">${U.esc(label)}</div>
              <div class="apple-sub">${U.esc(pkg)}</div>
            </div>
          </div>
        </div>`).join("");
    } else {
      appsEl.innerHTML = `<div class="apple-row"><div class="apple-label" style="color:var(--text-faint);">No app list reported yet.</div></div>`;
    }

    const errEl = document.getElementById("ov-errors");
    if (errs && Object.keys(errs).length) {
      errEl.innerHTML = Object.values(errs).map(m =>
        `<div class="apple-row">
          <div class="apple-row-left">
            <div class="apple-icon" style="background:#ff3b30;"><span class="material-symbols-rounded">error</span></div>
            <div class="apple-label" style="white-space:normal;">${U.esc(m)}</div>
          </div>
        </div>`).join("");
    } else {
      errEl.innerHTML = `<div class="apple-row"><div class="apple-label" style="color:var(--ok);">No errors reported. ✓</div></div>`;
    }
  },

  destroy() {},
};
