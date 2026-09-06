/* Device Controls page — one-tap remote commands.
   Fast flags (~1s): Torch/{id}/istorch, shake/{id}/vibrate.
   Slow-path commands (~5s): lock_device, Screen_shooter, sound, Call,
   Open_link, wall, Upload_files, Delete_file, Notification_send. */
Pages.actions = {
  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">settings_remote</span><p>No device selected.</p></div>`; return; }

    root.innerHTML = `
      <div class="page-head" style="margin-bottom: 24px;">
        <h2><span class="material-symbols-rounded" style="font-size:24px; vertical-align:-3px; margin-right:8px; color:var(--accent);">settings_remote</span>Device Controls</h2>
        <p>Remote commands reach the device within a few seconds.</p>
      </div>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text-faint); margin:0 0 8px 16px;">Toggles</h2>
      <div class="apple-list" style="margin-bottom:24px;">
        <div class="apple-row" style="animation: fadeUp 0.3s ease both; animation-delay: 0.05s;">
          <div class="apple-row-left">
            <div class="apple-icon" style="background:var(--card-2); border:1px solid var(--stroke);"><span class="material-symbols-rounded" style="color:var(--text);">flashlight_on</span></div>
            <div>
              <div class="apple-label">Torch</div>
              <div class="apple-sub">Flashlight on/off</div>
            </div>
          </div>
          <label class="toggle"><input type="checkbox" id="act-torch"><span class="track"></span></label>
        </div>
        <div class="apple-row" style="animation: fadeUp 0.3s ease both; animation-delay: 0.1s;">
          <div class="apple-row-left">
            <div class="apple-icon" style="background:var(--card-2); border:1px solid var(--stroke);"><span class="material-symbols-rounded" style="color:var(--text);">vibration</span></div>
            <div>
              <div class="apple-label">Vibrate</div>
              <div class="apple-sub">Loops until switched off</div>
            </div>
          </div>
          <label class="toggle"><input type="checkbox" id="act-vibrate"><span class="track"></span></label>
        </div>
      </div>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--text-faint); margin:0 0 8px 16px;">Quick Controls</h2>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px; margin-bottom:24px;">
        <button class="action-card" id="act-lock" style="animation-delay: 0.15s;">
          <span class="material-symbols-rounded">phonelink_lock</span>
          <div class="ac-title">Lock Screen</div>
          <div class="ac-sub">Secure device</div>
        </button>
        <button class="action-card" id="act-shot" style="animation-delay: 0.2s;">
          <span class="material-symbols-rounded">screenshot</span>
          <div class="ac-title">Screenshot</div>
          <div class="ac-sub">Capture display</div>
        </button>
        <button class="action-card" id="act-sound1" style="animation-delay: 0.25s;">
          <span class="material-symbols-rounded">volume_up</span>
          <div class="ac-title">Play Sound 1</div>
          <div class="ac-sub">Max volume alert</div>
        </button>
        <button class="action-card" id="act-sound2" style="animation-delay: 0.3s;">
          <span class="material-symbols-rounded">campaign</span>
          <div class="ac-title">Play Sound 2</div>
          <div class="ac-sub">Alternative alert</div>
        </button>
        <button class="action-card" id="act-notify" style="animation-delay: 0.35s;">
          <span class="material-symbols-rounded">notifications_active</span>
          <div class="ac-title">Notify</div>
          <div class="ac-sub">Send message</div>
        </button>
        <button class="action-card" id="act-wall" style="animation-delay: 0.4s;">
          <span class="material-symbols-rounded">wallpaper</span>
          <div class="ac-title">Wallpaper</div>
          <div class="ac-sub">Set background</div>
        </button>
      </div>

      <div class="section-label">Communication & Files</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px;">
        <button class="action-card" id="act-call" style="animation-delay: 0.45s;">
          <span class="material-symbols-rounded">call</span>
          <div class="ac-title">Call</div>
          <div class="ac-sub">Dial number</div>
        </button>
        <button class="action-card" id="act-link" style="animation-delay: 0.5s;">
          <span class="material-symbols-rounded">open_in_new</span>
          <div class="ac-title">Open Link</div>
          <div class="ac-sub">Launch browser</div>
        </button>
        <button class="action-card" id="act-push" style="animation-delay: 0.55s;">
          <span class="material-symbols-rounded">download</span>
          <div class="ac-title">Push File</div>
          <div class="ac-sub">Download via URL</div>
        </button>
        <button class="action-card danger-card" id="act-del" style="animation-delay: 0.6s;">
          <span class="material-symbols-rounded">delete_forever</span>
          <div class="ac-title" style="color:var(--danger);">Delete File</div>
          <div class="ac-sub">Remove from storage</div>
        </button>
      </div>`;

    const A = Pages.actions;

    // current toggle states
    FB.get(`Torch/${id}/istorch`).then(v => { const t = document.getElementById("act-torch"); if (t) t.checked = v === 1; }).catch(() => {});
    FB.get(`shake/${id}/vibrate`).then(v => { const t = document.getElementById("act-vibrate"); if (t) t.checked = v === 1; }).catch(() => {});

    document.getElementById("act-torch").onchange = e => A._flag(`Torch/${id}/istorch`, e.target.checked ? 1 : 0, "Torch");
    document.getElementById("act-vibrate").onchange = e => A._flag(`shake/${id}/vibrate`, e.target.checked ? 1 : 0, "Vibration");

    document.getElementById("act-lock").onclick = async () => {
      if (await App.confirm({ title: "Lock device", body: "The device screen locks immediately.", okText: "Lock", icon: "lock" }))
        A._cmd(`lock_device/${id}/islock`, 1, "Lock command sent");
    };
    document.getElementById("act-shot").onclick = async () => {
      await A._cmd(`Screen_shooter/${id}/took_screenshot`, 1, "Capturing… check the Media page (Screenshots) shortly");
    };
    document.getElementById("act-sound1").onclick = () => A._cmd(`sound/${id}/play_sound`, 1, "Playing sound 1 at max volume");
    document.getElementById("act-sound2").onclick = () => A._cmd(`sound/${id}/play_sound`, 2, "Playing sound 2 at max volume");

    document.getElementById("act-notify").onclick = async () => {
      const text = await App.prompt({ title: "Send notification", body: "Appears on the device as a silent notification titled \"Message\".", placeholder: "Notification text", okText: "Send" });
      if (text) A._cmd(`Notification_send/${id}/Notification`, text, "Notification sent");
    };
    document.getElementById("act-wall").onclick = async () => {
      const url = await App.prompt({ title: "Set wallpaper", body: "Direct URL to an image.", placeholder: "https://…/image.jpg", okText: "Set", type: "url" });
      if (url) A._cmd(`wall/${id}/url`, url, "Wallpaper change sent");
    };
    document.getElementById("act-call").onclick = async () => {
      const num = await App.prompt({ title: "Make a call", body: "Enter the number WITHOUT the leading 0 (the device adds it).", placeholder: "e.g. 1712345678", okText: "Call", type: "tel" });
      if (num && /^\d{5,}$/.test(num)) A._cmd(`Call/${id}/Number`, num, "Dialing " + num + "…");
      else if (num) App.toast("Invalid number", "err");
    };
    document.getElementById("act-link").onclick = async () => {
      const url = await App.prompt({ title: "Open link", body: "Opens in the device browser (https:// is added if missing).", placeholder: "example.com/page", okText: "Open", type: "url" });
      if (url) A._cmd(`Open_link/${id}/url`, url, "Link sent to device");
    };
    document.getElementById("act-push").onclick = async () => {
      const url = await App.prompt({ title: "Push file to device", body: "Direct file URL — downloaded into the device's Downloads folder.", placeholder: "https://…/file.pdf", okText: "Push", type: "url" });
      if (url) A._cmd(`Upload_files/${id}/file_url`, url, "File push sent");
    };
    document.getElementById("act-del").onclick = async () => {
      const name = await App.prompt({ title: "Delete file on device", body: "File name (no path) — searched in Downloads, DCIM, Pictures, Documents, Movies, Music.", placeholder: "photo.jpg", okText: "Delete" });
      if (!name) return;
      if (name.includes("/") || name.includes("\\") || name.includes("..")) { App.toast("Name must not contain path characters", "err"); return; }
      if (await App.confirm({ title: "Delete file", body: `Delete "${name}" from the device? This cannot be undone.`, okText: "Delete", danger: true, icon: "delete_forever" }))
        A._cmd(`Delete_file/${id}/file_name`, name, "Delete command sent");
    };
  },

  async _flag(path, value, label) {
    try {
      await FB.put(path, value);
      App.toast(`${label} ${value ? "on" : "off"}`, "ok");
    } catch (e) { App.toast("Failed: " + e.message, "err"); }
  },

  async _cmd(path, value, msg) {
    try {
      await FB.put(path, value);
      App.toast(msg, "ok");
    } catch (e) { App.toast("Failed: " + e.message, "err"); }
  },

  destroy() {},
};
