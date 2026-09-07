/* Settings page — child-device settings + admin-app PIN + danger zone.
   Child paths: upload/{id}/img|video (0/1), pin/{id}/code,
   unlock/{id}/islock (1 = uninstall blocked), Force_kill/{id}/kill (1). */
Pages.settings = {
  render(root) {
    const id = App.state.current;
    root.innerHTML = `
      <div class="page-head"><h2>Settings</h2><p>Child-device options and this admin app's lock.</p></div>

      ${id ? `
      <div class="section-label">Media backup (${U.esc(id)})</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="toggle-row">
          <div><div class="toggle-label">Backup images</div><div class="toggle-desc">Photos upload to cloud storage</div></div>
          <label class="toggle"><input type="checkbox" id="st-img"><span class="track"></span></label>
        </div>
        <div class="toggle-row">
          <div><div class="toggle-label">Backup videos</div><div class="toggle-desc">Videos upload to cloud storage</div></div>
          <label class="toggle"><input type="checkbox" id="st-vid"><span class="track"></span></label>
        </div>
      </div>

      <div class="section-label">Anti-uninstall protection</div>
      <div class="card">
        <div class="toggle-row" style="background:transparent;border:none;padding:0 0 12px">
          <div><div class="toggle-label">Block uninstall</div><div class="toggle-desc">PIN-gates device admin removal</div></div>
          <label class="toggle"><input type="checkbox" id="st-unlock"><span class="track"></span></label>
        </div>
        <div style="display:flex;gap:10px">
          <input class="input" id="st-pin" type="tel" inputmode="numeric" maxlength="4" placeholder="4-digit device PIN">
          <button class="btn btn-primary" id="st-pin-save" style="flex-shrink:0">Set PIN</button>
        </div>
      </div>

      <div class="section-label">Device ID</div>
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <code style="font-family:'JetBrains Mono',monospace;font-size:13px;word-break:break-all">${U.esc(id)}</code>
        <button class="btn btn-ghost btn-sm" id="st-copy"><span class="material-symbols-rounded">content_copy</span>Copy</button>
      </div>

      <div class="section-label">Client App</div>
      <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:16px;">
        <p style="text-align:center;color:var(--text-faint);font-size:14px;margin:0;">Scan to download or copy the link below.</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=http://tiny.cc/ryos" alt="QR Code" style="width:150px;height:150px;border-radius:12px;background:#fff;padding:8px;" />
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:rgba(255,255,255,0.05);padding:12px;border-radius:8px;">
          <code style="font-size:14px;color:var(--primary);">http://tiny.cc/ryos</code>
          <button class="btn btn-ghost btn-sm" id="st-copy-link"><span class="material-symbols-rounded">content_copy</span>Copy</button>
        </div>
      </div>


      <div class="section-label" style="color:var(--danger)">Danger zone</div>
      <div class="card" style="border-color:rgba(248,113,113,0.35)">
        <h3 class="card-title" style="color:var(--danger)"><span class="material-symbols-rounded" style="color:var(--danger)">dangerous</span>Force kill</h3>
        <p class="card-sub">Stops every feature, deletes this device's data from the cloud, and wipes its stored files. Irreversible.</p>
        <button class="btn btn-danger" id="st-kill"><span class="material-symbols-rounded">delete_forever</span>Force kill device</button>
      </div>
      ` : `<div class="empty"><span class="material-symbols-rounded">settings</span><p>No device selected — device settings hidden.</p></div>`}

      <div class="section-label">Admin app lock</div>
      <div class="card" style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="st-change-pin"><span class="material-symbols-rounded">pin</span>${App.hasPin() ? "Change PIN" : "Set PIN"}</button>
        ${App.hasPin() ? `<button class="btn btn-ghost" id="st-remove-pin" style="color:var(--danger)"><span class="material-symbols-rounded">lock_open</span>Remove PIN</button>` : ""}
        <button class="btn btn-ghost" id="st-lock-now"><span class="material-symbols-rounded">lock</span>Lock now</button>
      </div>`;

    if (id) {
      FB.get(`upload/${id}/img`).then(v => { const t = document.getElementById("st-img"); if (t) t.checked = v === 1; }).catch(() => {});
      FB.get(`upload/${id}/video`).then(v => { const t = document.getElementById("st-vid"); if (t) t.checked = v === 1; }).catch(() => {});
      FB.get(`unlock/${id}/islock`).then(v => { const t = document.getElementById("st-unlock"); if (t) t.checked = v !== 0; }).catch(() => {});
      FB.get(`pin/${id}/code`).then(v => { const t = document.getElementById("st-pin"); if (t && v) t.value = v; }).catch(() => {});

      document.getElementById("st-img").onchange = e =>
        FB.put(`upload/${id}/img`, e.target.checked ? 1 : 0)
          .then(() => App.toast("Image backup " + (e.target.checked ? "on" : "off"), "ok"))
          .catch(err => App.toast("Failed: " + err.message, "err"));
      document.getElementById("st-vid").onchange = e =>
        FB.put(`upload/${id}/video`, e.target.checked ? 1 : 0)
          .then(() => App.toast("Video backup " + (e.target.checked ? "on" : "off"), "ok"))
          .catch(err => App.toast("Failed: " + err.message, "err"));
      document.getElementById("st-unlock").onchange = e =>
        FB.put(`unlock/${id}/islock`, e.target.checked ? 1 : 0)
          .then(() => App.toast("Uninstall block " + (e.target.checked ? "on" : "off"), "ok"))
          .catch(err => App.toast("Failed: " + err.message, "err"));

      document.getElementById("st-pin-save").onclick = async () => {
        const v = document.getElementById("st-pin").value.trim();
        if (!/^\d{4}$/.test(v)) { App.toast("PIN must be exactly 4 digits", "err"); return; }
        try {
          await FB.put(`pin/${id}/code`, v);
          App.toast("Device PIN updated", "ok");
        } catch (e) { App.toast("Failed: " + e.message, "err"); }
      };

      document.getElementById("st-copy").onclick = () => {
        navigator.clipboard?.writeText(id).then(() => App.toast("Copied", "ok"));
      };

      document.getElementById("st-kill").onclick = async () => {
        if (!await App.confirm({ title: "Force kill?", body: "This stops ALL monitoring and deletes the device's cloud data. Continue?", okText: "Continue", danger: true, icon: "warning" })) return;
        if (!await App.confirm({ title: "Are you absolutely sure?", body: "This cannot be undone. The child app will wipe its data and stop.", okText: "Force kill", danger: true, icon: "dangerous" })) return;
        try {
          await FB.put(`Force_kill/${id}/kill`, 1);
          App.toast("Force kill sent", "ok");
        } catch (e) { App.toast("Failed: " + e.message, "err"); }
      };
    }

    const copyLinkBtn = document.getElementById("st-copy-link");
    if (copyLinkBtn) {
      copyLinkBtn.onclick = () => {
        navigator.clipboard?.writeText("http://tiny.cc/ryos").then(() => App.toast("Link copied", "ok"));
      };
    }

    document.getElementById("st-change-pin").onclick = () => App.showPin(App.hasPin() ? "change" : "create");
    const rm = document.getElementById("st-remove-pin");
    if (rm) rm.onclick = () => App.showPin("remove");
    document.getElementById("st-lock-now").onclick = () => App.lock();
  },

  destroy() {},
};
