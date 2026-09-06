/* Live Control page — screen mirror + remote touch, camera, voice.
   Firebase flags (polled by MonitoringService.kt, ~1s):
     Screen_rec/{id}/ismirror        0/1
     Camera_rec/{id}/Iscamera        0/1   Camera_rec/{id}/cam_no  1=front 2=back
     Voice_rec/{id}/Istransmit       0/1
   Streams arrive in LiveKit rooms monitor-{id} / voice-room-{id}.
   The Firebase flags are the source of truth: on page load (including
   after a refresh) the current flag state is restored and the admin
   re-joins any rooms that are still streaming. Flags are only cleared
   when the user explicitly taps Stop. */
Pages.live = {
  _id: null,
  _screenOn: false,
  _camOn: false,
  _voiceOn: false,
  _tab: "screen",
  _fsListenerAdded: false,

  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">cast_connected</span><p>No device selected.</p></div>`; return; }
    Pages.live._id = id;
    Pages.live._tab = "screen";

    root.innerHTML = `
      <div class="tabbar">
        <button class="active" data-tab="screen"><span class="material-symbols-rounded">cast</span>Screen</button>
        <button data-tab="camera"><span class="material-symbols-rounded">photo_camera</span>Camera</button>
        <button data-tab="voice"><span class="material-symbols-rounded">mic</span>Voice</button>
      </div>
      <div id="live-body"></div>`;

    root.querySelectorAll(".tabbar button").forEach(b => {
      b.onclick = () => {
        root.querySelectorAll(".tabbar button").forEach(x => x.classList.toggle("active", x === b));
        Pages.live._tab = b.dataset.tab;
        Pages.live._renderTab();
      };
    });
    Pages.live._renderTab();
    Pages.live._restoreState();
    if (!Pages.live._fsListenerAdded) {
      document.addEventListener("fullscreenchange", () => Pages.live._updateFsIcons());
      Pages.live._fsListenerAdded = true;
    }
  },

  /* Re-sync with the device after a refresh / navigation: read the
     Firebase flags and re-join whatever is still streaming. */
  async _restoreState() {
    const id = Pages.live._id;
    if (!id) return;
    try {
      const [mirror, cam, camNo, voice] = await Promise.all([
        FB.get(`Screen_rec/${id}/ismirror`).catch(() => 0),
        FB.get(`Camera_rec/${id}/Iscamera`).catch(() => 0),
        FB.get(`Camera_rec/${id}/cam_no`).catch(() => 1),
        FB.get(`Voice_rec/${id}/Istransmit`).catch(() => 0),
      ]);
      if (Pages.live._id !== id) return; // device switched meanwhile
      Pages.live._camSide = camNo === 2 ? 2 : 1;
      Pages.live._screenOn = mirror === 1;
      Pages.live._camOn = cam === 1;
      Pages.live._voiceOn = voice === 1;
      if (Pages.live._screenOn || Pages.live._camOn) {
        await Pages.live._ensureMonitor().catch(() => {});
      }
      if (Pages.live._voiceOn) {
        await LK.connectVoice(id, track => {
          const a = document.getElementById("lv-audio");
          if (a) { track.attach(a); a.play().catch(() => {}); }
        }).catch(() => {});
      }
      if (Pages.live._screenOn || Pages.live._camOn || Pages.live._voiceOn) {
        Pages.live._renderTab();
        // _renderTab rebuilt the <video>/<audio> elements — re-attach tracks
        if (LK.monitorRoom) LK._attachExisting(LK.monitorRoom, t => t.kind === "video", t => Pages.live._onTrack(t));
        if (LK.voiceRoom) LK._attachExisting(LK.voiceRoom, t => t.kind === "audio", t => {
          const a = document.getElementById("lv-audio");
          if (a) { t.attach(a); a.play().catch(() => {}); }
        });
        App.toast("Reconnected to live session", "ok");
      }
    } catch (_) {}
  },

  _renderTab() {
    const body = document.getElementById("live-body");
    if (!body) return;
    body.style.animation = "none";
    void body.offsetWidth;
    body.style.animation = "";
    const tab = Pages.live._tab;
    const L = Pages.live;

    if (tab === "screen") {
      body.innerHTML = `
        <div class="card live-card" style="padding:0; overflow:visible; border:none; background:transparent;">
          <h3 class="card-title" style="padding:16px 16px 0; margin-bottom:8px; border:none;"><span class="material-symbols-rounded">cast</span>Screen Mirror</h3>
          <p class="card-sub hint" style="margin:0 16px 16px;"><span class="material-symbols-rounded" style="font-size:16px; vertical-align:-3px; margin-right:4px;">touch_app</span>Tap / long-press / swipe directly on the stream to remote control the device.</p>

          <div class="custom-player" id="lv-screen-player" style="margin-bottom: 50px;">
            <video id="lv-video" autoplay playsinline muted disablepictureinpicture></video>
            <div class="touch-layer" id="lv-touch"></div>

            <div class="live-placeholder ${L._screenOn ? '' : 'idle-screen'}" id="lv-placeholder">
              ${L._screenOn ? `
                <span class="material-symbols-rounded" style="font-size:48px; opacity:0.8;">smartphone</span>
                <p style="margin-top:12px;">Reconnecting to stream…</p>
              ` : `
                <div class="idle-overlay">
                  <div class="idle-ring"></div>
                  <span class="material-symbols-rounded idle-logo">smartphone</span>
                  <p class="idle-text">Tap <span class="material-symbols-rounded idle-play">play_arrow</span> to start mirroring</p>
                </div>
              `}
            </div>

            <div class="player-controls top-controls" style="justify-content: space-between;">
              <span class="badge ${L._screenOn ? "badge-live" : "badge-off"}" id="lv-screen-state">
                ${L._screenOn ? "LIVE" : "IDLE"}
              </span>
              <div style="display:flex; gap:10px;">
                <button class="player-btn small-btn fs-toggle" data-player="lv-screen-player" title="Fullscreen">
                  <span class="material-symbols-rounded">fullscreen</span>
                </button>
                <button class="player-btn small-btn ${L._screenOn ? 'active-red' : ''}" id="lv-screen-btn">
                  <span class="material-symbols-rounded">${L._screenOn ? "stop" : "play_arrow"}</span>
                </button>
              </div>
            </div>

            <div class="live-dock">
              <button class="live-dock-btn" data-nav="back" aria-label="Back">
                <span class="material-symbols-rounded">arrow_back_ios_new</span>
              </button>
              <button class="live-dock-btn" data-nav="home" aria-label="Home">
                <span class="material-symbols-rounded">circle</span>
              </button>
              <button class="live-dock-btn" data-nav="recents" aria-label="Recents">
                <span class="material-symbols-rounded">square</span>
              </button>
            </div>
          </div>
        </div>`;
      const touchLayer = document.getElementById("lv-touch");
      LK.attachTouchLayer(touchLayer);
      touchLayer.classList.toggle("disabled", !L._screenOn);
      body.querySelectorAll(".live-dock-btn").forEach(b =>
        b.onclick = e => { e.stopPropagation(); LK.sendGesture({ t: b.dataset.nav }); });
      document.getElementById("lv-screen-btn").onclick = () =>
        L._screenOn ? L._stopScreen() : L._startScreen();
      body.querySelectorAll(".fs-toggle").forEach(b =>
        b.onclick = () => L._fullscreen(b.dataset.player, "lv-video"));
      L._bindVideo("lv-video", "lv-screen-player", "lv-placeholder");
    }

    if (tab === "camera") {
      body.innerHTML = `
        <div class="card" style="padding:0; overflow:hidden; border:none; background:transparent;">
          <h3 class="card-title" style="padding:16px 16px 0; margin-bottom:8px; border:none;"><span class="material-symbols-rounded">photo_camera</span>Live Camera</h3>
          <p class="card-sub hint" style="margin:0 16px 16px;"><span class="material-symbols-rounded" style="font-size:16px; vertical-align:-3px; margin-right:4px;">videocam</span>Watch the device camera live. Controls are overlaid on the player.</p>

          <div class="custom-player custom-player-cam" id="lv-cam-player">
            <video id="lv-cam-video" autoplay playsinline muted disablepictureinpicture></video>

            <div class="live-placeholder ${L._camOn ? '' : 'idle-screen'}" id="lv-cam-placeholder">
              ${L._camOn ? `
                <span class="material-symbols-rounded" style="font-size:48px; opacity:0.8;">photo_camera</span>
                <p style="margin-top:12px;">Reconnecting to stream…</p>
              ` : `
                <div class="idle-overlay">
                  <div class="idle-ring"></div>
                  <span class="material-symbols-rounded idle-logo">photo_camera</span>
                  <p class="idle-text">Tap <span class="material-symbols-rounded idle-play">play_arrow</span> to start camera</p>
                </div>
              `}
            </div>

            <div class="player-controls top-controls" style="justify-content:space-between;">
              <span class="badge ${L._camOn ? "badge-live" : "badge-off"}" id="lv-cam-state">
                ${L._camOn ? "LIVE" : "IDLE"}
              </span>
              <div class="radio-pills" id="lv-cam-side" style="margin-left:auto; transform:scale(0.85); transform-origin:right center;">
                <label><input type="radio" name="camside" value="1" ${L._camSide !== 2 ? "checked" : ""}><span class="pill" style="min-height:32px; padding:4px 12px; font-size:12px;">Front</span></label>
                <label><input type="radio" name="camside" value="2" ${L._camSide === 2 ? "checked" : ""}><span class="pill" style="min-height:32px; padding:4px 12px; font-size:12px;">Back</span></label>
              </div>
              <div style="display:flex; gap:10px;">
                <button class="player-btn small-btn fs-toggle" data-player="lv-cam-player" title="Fullscreen">
                  <span class="material-symbols-rounded">fullscreen</span>
                </button>
                <button class="player-btn small-btn ${L._camOn ? 'active-red' : ''}" id="lv-cam-btn">
                  <span class="material-symbols-rounded">${L._camOn ? "stop" : "play_arrow"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.getElementById("lv-cam-btn").onclick = () =>
        L._camOn ? L._stopCam() : L._startCam();
      body.querySelectorAll(".fs-toggle").forEach(b =>
        b.onclick = () => L._fullscreen(b.dataset.player));
      document.getElementById("lv-cam-side").addEventListener("change", async e => {
        L._camSide = parseInt(e.target.value, 10);
        try {
          await FB.put(`Camera_rec/${Pages.live._id}/cam_no`, L._camSide);
          App.toast(e.target.value === "1" ? "Front camera selected" : "Back camera selected", "info");
        } catch (err) { App.toast("Switch failed: " + err.message, "err"); }
      });
      L._bindVideo("lv-cam-video", "lv-cam-player", "lv-cam-placeholder");
    }

    if (tab === "voice") {
      body.innerHTML = `
        <div class="card audio-card" style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:32px 16px;">
          <div style="width:64px; height:64px; border-radius:50%; background:var(--glass-2); border:1px solid var(--stroke); display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
            <span class="material-symbols-rounded" style="font-size:32px; color:var(--text);">mic</span>
          </div>
          <h3 class="card-title" style="border:none; margin:0 0 8px; padding:0; justify-content:center;">Live microphone</h3>
          <p class="card-sub hint" style="margin:8px 0 24px;"><span class="material-symbols-rounded" style="font-size:16px; vertical-align:-3px; margin-right:4px;">mic</span>Listen to the device microphone in real time.</p>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:24px;width:100%;">
            <button class="btn ${L._voiceOn ? "btn-danger" : "btn-primary"} btn-block" id="lv-voice-btn" style="max-width:240px; min-height:48px; border-radius:99px;">
              <span class="material-symbols-rounded">${L._voiceOn ? "stop" : "mic"}</span>
              ${L._voiceOn ? "Stop listening" : "Start listening"}
            </button>
          </div>
          <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
            <span class="badge ${L._voiceOn ? "badge-on" : "badge-off"}" id="lv-voice-state">
              ${L._voiceOn ? "LIVE" : "IDLE"}</span>
          </div>
          <audio id="lv-audio" controls autoplay style="width:100%; max-width:320px; margin-top:24px; border-radius:99px; opacity:${L._voiceOn ? 1 : 0.4}; pointer-events:${L._voiceOn ? 'auto' : 'none'}; transition:opacity 0.3s;"></audio>
        </div>`;
      document.getElementById("lv-voice-btn").onclick = () =>
        L._voiceOn ? L._stopVoice() : L._startVoice();
    }
  },

  /* Hide the placeholder only once frames actually render, and fit the
     player to the real stream aspect ratio (portrait or landscape). */
  _bindVideo(videoId, playerId, placeholderId) {
    const v = document.getElementById(videoId);
    if (!v) return;
    const fit = () => {
      const p = document.getElementById(playerId);
      if (p && v.videoWidth && v.videoHeight) {
        p.style.aspectRatio = v.videoWidth + " / " + v.videoHeight;
      }
    };
    v.addEventListener("loadedmetadata", fit);
    v.addEventListener("resize", fit);
    v.addEventListener("playing", () => {
      document.getElementById(placeholderId)?.classList.add("hidden");
    });
  },

  _fullscreen(playerId, videoId) {
    const p = document.getElementById(playerId);
    const v = videoId ? document.getElementById(videoId) : null;
    if (!p) return;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (p.requestFullscreen) p.requestFullscreen().catch(() => {});
    else if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS Safari
  },

  /* Toggle fullscreen icon on all fs-toggle buttons when the browser
     enters/exits fullscreen. */
  _updateFsIcons() {
    const active = !!document.fullscreenElement;
    document.querySelectorAll(".fs-toggle .material-symbols-rounded").forEach(icon => {
      icon.textContent = active ? "fullscreen_exit" : "fullscreen";
    });
  },

  /* ── shared monitor-room track router ── */
  _onTrack(track) {
    const Src = LivekitClient.Track.Source;
    if (track.kind !== "video") return;
    if (track.source === Src.ScreenShare) {
      const v = document.getElementById("lv-video");
      if (v) track.attach(v);
    } else if (track.source === Src.Camera) {
      const v = document.getElementById("lv-cam-video");
      if (v) track.attach(v);
    }
  },

  async _ensureMonitor() {
    return LK.connectMonitor(Pages.live._id, t => Pages.live._onTrack(t), state => {
      if (state === "disconnected") App.toast("Stream disconnected", "err");
      if (state === "reconnecting") App.toast("Reconnecting stream…", "info");
    });
  },

  /* ── screen ── */
  async _startScreen() {
    const btn = document.getElementById("lv-screen-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded spin">progress_activity</span>`;
    try {
      await FB.put(`Screen_rec/${Pages.live._id}/ismirror`, 1);
      await Pages.live._ensureMonitor();
      Pages.live._screenOn = true;
      const touchLayer = document.getElementById("lv-touch");
      if (touchLayer) touchLayer.classList.remove("disabled");
      const st = document.getElementById("lv-screen-state");
      if (st) { st.className = "badge badge-live"; st.textContent = "LIVE"; }
      btn.classList.add("active-red");
      btn.innerHTML = `<span class="material-symbols-rounded">stop</span>`;
      const ph = document.querySelector("#lv-placeholder p");
      if (ph) ph.textContent = "Waiting for stream…";
      App.toast("Mirror requested — waiting for stream…", "ok");
    } catch (e) {
      App.toast("Start failed: " + e.message, "err");
      btn.classList.remove("active-red");
      btn.innerHTML = `<span class="material-symbols-rounded">play_arrow</span>`;
    }
    btn.disabled = false;
  },

  async _stopScreen() {
    Pages.live._screenOn = false;
    try { await FB.put(`Screen_rec/${Pages.live._id}/ismirror`, 0); } catch (_) {}
    if (!Pages.live._camOn) await LK.disconnectMonitor();
    Pages.live._renderTab();
  },

  /* ── camera ── */
  async _startCam() {
    const btn = document.getElementById("lv-cam-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded spin">progress_activity</span>`;
    try {
      const side = document.querySelector('input[name="camside"]:checked')?.value || String(Pages.live._camSide || 1);
      Pages.live._camSide = parseInt(side, 10);
      await FB.put(`Camera_rec/${Pages.live._id}/cam_no`, Pages.live._camSide);
      await FB.put(`Camera_rec/${Pages.live._id}/Iscamera`, 1);
      await Pages.live._ensureMonitor();
      Pages.live._camOn = true;
      const st = document.getElementById("lv-cam-state");
      if (st) { st.className = "badge badge-live"; st.textContent = "LIVE"; }
      btn.classList.add("active-red");
      btn.innerHTML = `<span class="material-symbols-rounded">stop</span>`;
      const ph = document.querySelector("#lv-cam-placeholder p");
      if (ph) ph.textContent = "Waiting for stream…";
      App.toast("Camera requested — waiting for stream…", "ok");
    } catch (e) {
      App.toast("Start failed: " + e.message, "err");
      btn.classList.remove("active-red");
      btn.innerHTML = `<span class="material-symbols-rounded">play_arrow</span>`;
    }
    btn.disabled = false;
  },

  async _stopCam() {
    Pages.live._camOn = false;
    try { await FB.put(`Camera_rec/${Pages.live._id}/Iscamera`, 0); } catch (_) {}
    if (!Pages.live._screenOn) await LK.disconnectMonitor();
    Pages.live._renderTab();
  },

  /* ── voice ── */
  async _startVoice() {
    const btn = document.getElementById("lv-voice-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded spin">progress_activity</span>Connecting…`;
    try {
      await FB.put(`Voice_rec/${Pages.live._id}/Istransmit`, 1);
      await LK.connectVoice(Pages.live._id, track => {
        const a = document.getElementById("lv-audio");
        if (a) { track.attach(a); a.play().catch(() => {}); }
      });
      Pages.live._voiceOn = true;
      const st = document.getElementById("lv-voice-state");
      if (st) { st.className = "badge badge-on"; st.textContent = "LIVE"; }
      btn.className = "btn btn-danger btn-block";
      btn.innerHTML = `<span class="material-symbols-rounded">stop</span>Stop listening`;
      App.toast("Mic requested — audio starts shortly…", "ok");
    } catch (e) {
      App.toast("Start failed: " + e.message, "err");
      btn.className = "btn btn-primary btn-block";
      btn.innerHTML = `<span class="material-symbols-rounded">mic</span>Start listening`;
    }
    btn.disabled = false;
  },

  async _stopVoice() {
    Pages.live._voiceOn = false;
    try { await FB.put(`Voice_rec/${Pages.live._id}/Istransmit`, 0); } catch (_) {}
    await LK.disconnectVoice();
    Pages.live._renderTab();
  },

  destroy() {
    // Keep the Firebase flags untouched — the child keeps streaming and the
    // session reconnects when this page is opened again (or after refresh).
    // Only drop the local room connections to save bandwidth while away.
    LK.disconnectAll();
  },
};
