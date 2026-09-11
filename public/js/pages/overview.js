/* Overview page — device info, battery, status, apps, errors. */
Pages.overview = {
  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = Pages.overview._noDevice(); return; }

    root.innerHTML = `
      ${Pages.overview._hero(id)}
      ${Pages.overview._stats()}

      ${Pages.overview._section("badge", "Device Info", "ov-info-count")}
      <div class="ov-list" id="ov-info"><div class="skeleton" style="height:96px;"></div></div>

      ${Pages.overview._section("leaderboard", "Most Used Apps", "ov-most-count")}
      <div class="ov-list" id="ov-most"><div class="skeleton" style="height:96px;"></div></div>

      ${Pages.overview._section("apps", "Installed Apps", "ov-apps-count")}
      <div class="ov-list" id="ov-apps" style="max-height:420px; overflow-y:auto;"><div class="skeleton" style="height:96px;"></div></div>

      ${Pages.overview._section("report", "Error Log", "ov-errors-count")}
      <div class="ov-list" id="ov-errors" style="max-height:300px; overflow-y:auto;"><div class="skeleton" style="height:96px;"></div></div>
    `;

    Pages.overview._load(id);
    App.addTimer(setInterval(() => Pages.overview._load(id, true), 30000));
  },

  /* filled Material Symbol — modern icon look */
  _icon(name, filled = false) {
    const s = filled
      ? `"FILL" 1, "wght" 500, "GRAD" 0, "opsz" 24`
      : `"FILL" 0, "wght" 500, "GRAD" 0, "opsz" 24`;
    return `<span class="material-symbols-rounded" style="font-variation-settings:${s}">${name}</span>`;
  },

  /* tinted glass icon chip */
  _chip(name, tint, filled = true) {
    return `<span class="ov-chip" style="--ov-tint:${tint}">${Pages.overview._icon(name, filled)}</span>`;
  },

  _section(icon, title, countId) {
    return `
      <div class="ov-section">
        <div class="ov-section-head">
          <div class="ov-section-title">
            ${Pages.overview._chip(icon, "var(--accent)")}
            <span>${title}</span>
          </div>
          <span class="ov-count" id="${countId}">…</span>
        </div>
      </div>`;
  },

  _hero(id) {
    return `
      <section class="ov-hero">
        <div class="ov-hero-glow" aria-hidden="true"></div>
        <div class="ov-hero-main">
          <div class="ov-hero-icon">${Pages.overview._icon("smartphone", true)}</div>
          <div class="ov-hero-meta">
            <div class="ov-hero-kicker">Device Overview</div>
            <div class="ov-hero-id" title="${U.esc(id)}">${U.esc(id)}</div>
            <div class="ov-hero-sub" id="ov-hero-sub">Connecting…</div>
          </div>
        </div>
        <div class="ov-hero-status" id="ov-hero-status">
          <span class="ov-dot is-offline" id="ov-hero-dot"></span>
          <span class="ov-hero-status-text" id="ov-hero-status-text">Checking</span>
        </div>
      </section>`;
  },

  _stats() {
    return `
      <div class="ov-stats">
        <div class="ov-stat">
          <div class="ov-stat-head">
            <div class="ov-stat-icon battery-live-icon" id="ov-battery-icon" style="--battery-color:#34c759;" aria-label="Battery status">
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <rect class="battery-body" x="4" y="7" width="27" height="22" rx="4"></rect>
                <rect class="battery-terminal" x="31" y="13" width="3" height="10" rx="1.5"></rect>
                <rect class="battery-fill" id="ov-battery-progress" x="6.5" y="9.5" width="0" height="17" rx="2"></rect>
              </svg>
              <span class="battery-icon-value" id="ov-battery-icon-value">…</span>
            </div>
            <div class="ov-stat-value" id="ov-batt">…</div>
          </div>
          <div class="ov-stat-label">Battery</div>
          <div class="ov-meter"><span class="ov-meter-fill" id="ov-battery-bar" style="width:0%"></span></div>
        </div>

        <div class="ov-stat" id="ov-status-widget">
          <div class="ov-stat-head">
            <div class="ov-stat-icon ov-status-icon" id="ov-status-icon">${Pages.overview._icon("wifi", true)}</div>
            <div class="ov-stat-value" id="ov-status">…</div>
          </div>
          <div class="ov-stat-label" id="ov-seen">Seen …</div>
          <div class="ov-meter"><span class="ov-meter-fill" id="ov-status-bar" style="width:0%"></span></div>
        </div>
      </div>`;
  },

  _noDevice() {
    return `
      <div class="empty">
        <span class="material-symbols-rounded" style="font-size:48px;">phonelink_off</span>
        <p style="font-size:15px; margin-top:16px;">No device selected.<br>Add one on the Devices page.</p>
      </div>`;
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

    /* battery */
    const battValue = Number.parseInt((batt ?? "").toString().replace("%", ""), 10);
    const hasBattery = Number.isFinite(battValue);
    const batteryPercent = hasBattery ? Math.max(0, Math.min(100, battValue)) : null;
    const batteryColor = batteryPercent === null ? "var(--text-faint)"
      : batteryPercent <= 20 ? "#f87171" : batteryPercent <= 50 ? "#fbbf24" : "#34c759";

    const battEl = document.getElementById("ov-batt");
    if (battEl) battEl.textContent = batteryPercent === null ? "—" : `${batteryPercent}%`;

    const batteryIcon = document.getElementById("ov-battery-icon");
    const batteryProgress = document.getElementById("ov-battery-progress");
    const batteryIconValue = document.getElementById("ov-battery-icon-value");
    const batteryBar = document.getElementById("ov-battery-bar");
    if (batteryIcon) {
      batteryIcon.classList.toggle("is-empty", batteryPercent === null);
      batteryIcon.style.setProperty("--battery-color", batteryColor);
      batteryIcon.setAttribute("aria-label", batteryPercent === null ? "Battery unavailable" : `Battery ${batteryPercent}%`);
    }
    if (batteryIconValue) batteryIconValue.textContent = batteryPercent === null ? "—" : `${batteryPercent}%`;
    if (batteryProgress) batteryProgress.setAttribute("width", batteryPercent === null ? "0" : `${21 * batteryPercent / 100}`);
    if (batteryBar) {
      batteryBar.style.width = (batteryPercent === null ? 0 : batteryPercent) + "%";
      batteryBar.style.background = batteryColor;
      batteryBar.style.boxShadow = batteryPercent === null ? "none" : `0 0 12px ${batteryColor}`;
    }

    /* status */
    const statusEl = document.getElementById("ov-status");
    const seenEl = document.getElementById("ov-seen");
    const statusWidget = document.getElementById("ov-status-widget");
    const statusIcon = document.getElementById("ov-status-icon");
    const statusBar = document.getElementById("ov-status-bar");
    const heroStatus = document.getElementById("ov-hero-status");
    const heroDot = document.getElementById("ov-hero-dot");
    const heroStatusText = document.getElementById("ov-hero-status-text");

    if (statusEl) statusEl.textContent = online ? "Online" : "Offline";
    if (seenEl) seenEl.textContent = "Seen " + U.timeAgo(seen);
    if (statusWidget) statusWidget.classList.toggle("is-online", online);
    if (statusIcon) {
      statusIcon.innerHTML = Pages.overview._icon(online ? "wifi" : "wifi_off", true);
      statusIcon.classList.toggle("is-online", online);
    }
    if (statusBar) {
      statusBar.style.width = online ? "100%" : "0%";
      statusBar.style.background = online ? "var(--ok)" : "var(--text-faint)";
      statusBar.style.boxShadow = online ? "0 0 12px rgba(255,255,255,0.45)" : "none";
    }
    if (heroStatus) heroStatus.classList.toggle("is-online", online);
    if (heroDot) heroDot.className = "ov-dot " + (online ? "is-online" : "is-offline");
    if (heroStatusText) heroStatusText.textContent = online ? "Online" : "Offline";

    const heroSub = document.getElementById("ov-hero-sub");
    if (heroSub && info) {
      const parts = [info.Brand, info.Model].filter(Boolean);
      heroSub.textContent = parts.length ? parts.join(" · ") : "Device connected";
    }

    /* device info */
    const mkRow = (icon, tint, label, val, i) => `
      <div class="ov-row" style="animation-delay:${(i * 0.04).toFixed(2)}s;">
        ${Pages.overview._chip(icon, tint)}
        <div class="ov-row-main">
          <div class="ov-row-label">${U.esc(label)}</div>
          <div class="ov-row-value">${U.esc(val)}</div>
        </div>
      </div>`;

    const infoEl = document.getElementById("ov-info");
    const infoCount = document.getElementById("ov-info-count");
    if (infoEl) {
      if (info) {
        infoEl.innerHTML =
          mkRow("smartphone", "#0a84ff", "Model", info.Model || "—", 0) +
          mkRow("branding_watermark", "#bf5af2", "Brand", info.Brand || "—", 1) +
          mkRow("android", "#30d158", "Android", info.Android || "—", 2) +
          mkRow("memory", "#ff9f0a", "RAM", info.Ram || "—", 3) +
          mkRow("hard_drive", "#ff453a", "Storage", info.storage || "—", 4) +
          mkRow("tag", "#8e8e93", "IMEI", info.Imei || "—", 5) +
          mkRow("sim_card", "#64d2ff", "SIM 1", info.sim1_number || "—", 6) +
          mkRow("sim_card", "#64d2ff", "SIM 2", info.sim2_number || "—", 7);
        if (infoCount) infoCount.textContent = "8";
      } else {
        infoEl.innerHTML = `<div class="ov-empty">No device info reported yet.</div>`;
        if (infoCount) infoCount.textContent = "0";
      }
    }

    /* most used apps */
    const mostEl = document.getElementById("ov-most");
    const mostCount = document.getElementById("ov-most-count");
    if (most && Object.keys(most).length) {
      const colors = ["#ffd60a", "#c0c0c0", "#cd7f32"];
      const rows = ["1st", "2nd", "3rd"].filter(k => most[k]);
      mostEl.innerHTML = rows.map((k, i) => {
          const label = Object.keys(most[k])[0];
          return `
            <div class="ov-row" style="animation-delay:${(i * 0.06).toFixed(2)}s;">
              <span class="ov-medal" style="--ov-medal:${colors[i]}">${i + 1}</span>
              <div class="ov-row-main">
                <div class="ov-row-label">${U.esc(label)}</div>
                <div class="ov-row-value ov-row-sub">${U.esc(most[k][label])}</div>
              </div>
            </div>`;
        }).join("");
      if (mostCount) mostCount.textContent = String(rows.length);
    } else {
      mostEl.innerHTML = `<div class="ov-empty">No usage data yet.</div>`;
      if (mostCount) mostCount.textContent = "0";
    }

    /* installed apps */
    const appsEl = document.getElementById("ov-apps");
    const appsCount = document.getElementById("ov-apps-count");
    if (apps && Object.keys(apps).length) {
      appsEl.innerHTML = Object.entries(apps).map(([label, pkg], i) =>
        `<div class="ov-row" style="animation-delay:${Math.min(i * 0.035, 0.42).toFixed(2)}s;">
          ${Pages.overview._chip("apps", "#0a84ff")}
          <div class="ov-row-main">
            <div class="ov-row-label">${U.esc(label)}</div>
            <div class="ov-row-value ov-row-sub">${U.esc(pkg)}</div>
          </div>
        </div>`).join("");
      if (appsCount) appsCount.textContent = String(Object.keys(apps).length);
    } else {
      appsEl.innerHTML = `<div class="ov-empty">No app list reported yet.</div>`;
      if (appsCount) appsCount.textContent = "0";
    }

    /* error log */
    const errEl = document.getElementById("ov-errors");
    const errCount = document.getElementById("ov-errors-count");
    if (errs && Object.keys(errs).length) {
      errEl.innerHTML = Object.values(errs).map((m, i) =>
        `<div class="ov-row" style="animation-delay:${(i * 0.05).toFixed(2)}s;">
          ${Pages.overview._chip("error", "#ff453a")}
          <div class="ov-row-main"><div class="ov-row-label">${U.esc(m)}</div></div>
        </div>`).join("");
      if (errCount) errCount.textContent = String(Object.keys(errs).length);
    } else {
      errEl.innerHTML = `<div class="ov-empty ov-empty-ok">${Pages.overview._icon("check_circle", true)} No errors reported.</div>`;
      if (errCount) errCount.textContent = "0";
    }
  },

  destroy() {},
};

