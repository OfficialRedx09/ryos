/* ═══════════════════════════════════════════════════════════════
   Core Admin — LiveKit manager
   Screen + camera share live in room `monitor-{deviceId}`,
   the mic lives in `voice-room-{deviceId}` (MonitoringService.kt /
   LiveKitManager.kt on the child side). Tokens are self-minted
   HS256 JWTs — same approach as Remote_control/index.html.
   Credentials mirror Connection.java.
   ═══════════════════════════════════════════════════════════════ */

const LK = {
  monitorRoom: null,   // LivekitClient.Room for monitor-{id}
  voiceRoom: null,     // LivekitClient.Room for voice-room-{id}
  _monitorDevice: null,

  async mintToken(roomName, identity) {
    const r = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, participantName: identity })
    });
    if (!r.ok) throw new Error("Failed to get LiveKit token");
    const data = await r.json();
    return { token: data.token, url: data.url };
  },

  /* Connect (or reuse) the monitor room. onTrack(track, publication)
     is called for every subscribed remote track — route by
     track.source (Track.Source.ScreenShare / Camera). */
  async connectMonitor(deviceId, onTrack, onState) {
    if (LK.monitorRoom && LK._monitorDevice === deviceId &&
        LK.monitorRoom.state === "connected") {
      if (onTrack) LK._onMonitorTrack = onTrack;
      if (onState) LK._onMonitorState = onState;
      return LK.monitorRoom;
    }
    await LK.disconnectMonitor();
    LK._monitorDevice = deviceId;
    LK._onMonitorTrack = onTrack;
    LK._onMonitorState = onState;

    const room = new LivekitClient.Room({ adaptiveStream: true, dynacast: false });
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub) => {
      if (LK._onMonitorTrack) LK._onMonitorTrack(track, pub);
    });
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
      try { track.detach(); } catch (_) {}
    });
    room.on(LivekitClient.RoomEvent.Disconnected, () => {
      if (LK._onMonitorState) LK._onMonitorState("disconnected");
    });
    room.on(LivekitClient.RoomEvent.Reconnecting, () => {
      if (LK._onMonitorState) LK._onMonitorState("reconnecting");
    });
    room.on(LivekitClient.RoomEvent.Reconnected, () => {
      if (LK._onMonitorState) LK._onMonitorState("connected");
    });

    try {
      const { token, url } = await LK.mintToken("monitor-" + deviceId, "admin-" + Math.floor(Math.random() * 10000));
      await room.connect(url, token);
      if (LK._onMonitorState) LK._onMonitorState("connected");
    } catch (e) { console.error(e); }
    LK.monitorRoom = room;
    // Attach tracks that were already live before we (re)joined — this is
    // what makes a page refresh re-attach to an in-progress stream.
    LK._attachExisting(room, t => t.kind === "video", t => LK._onMonitorTrack && LK._onMonitorTrack(t));
    return room;
  },

  /* Call cb(track) for every already-subscribed remote track in the room. */
  _attachExisting(room, filter, cb) {
    try {
      room.remoteParticipants.forEach(p => {
        p.trackPublications.forEach(pub => {
          const t = pub.track;
          if (t && pub.isSubscribed && filter(t)) cb(t, pub);
        });
      });
    } catch (_) {}
  },

  /* Connect the voice room; onAudio(track) should attach to an <audio>. */
  async connectVoice(deviceId, onAudio, onState) {
    await LK.disconnectVoice();
    const room = new LivekitClient.Room();
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === "audio" && onAudio) onAudio(track);
    });
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
      try { track.detach(); } catch (_) {}
    });
    room.on(LivekitClient.RoomEvent.Disconnected, () => { if (onState) onState("disconnected"); });
    try {
      const { token, url } = await LK.mintToken("voice-room-" + deviceId, "admin-voice-" + Math.floor(Math.random() * 10000));
      await room.connect(url, token);
      if (onState) onState("connected");
    } catch (e) { console.error(e); }
    LK.voiceRoom = room;
    LK._attachExisting(room, t => t.kind === "audio", t => onAudio && onAudio(t));
    return room;
  },

  // Remote-control gesture → JSON on the data channel, topic "remote-control"
  // (handled by AutoClickAccessibilityService.performRemoteGesture on the child).
  sendGesture(obj) {
    if (!LK.monitorRoom || LK.monitorRoom.state !== "connected") return;
    try {
      LK.monitorRoom.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(obj)),
        { reliable: true, topic: "remote-control" }
      );
    } catch (_) {}
  },

  /* Wire tap / long-press / swipe recognition onto a transparent layer
     that overlays the screen-share video. Coordinates are normalized
     0..1 relative to the layer. */
  attachTouchLayer(layer) {
    let startX = 0, startY = 0, startT = 0, longFired = false, longTimer = null, pid = null;

    const norm = (e) => {
      const r = layer.getBoundingClientRect();
      const video = document.getElementById("lv-video");
      if (video && video.videoWidth && video.videoHeight) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const containerRatio = r.width / r.height;
        const videoRatio = vw / vh;
        let renderedWidth = r.width;
        let renderedHeight = r.height;
        let xOffset = 0;
        let yOffset = 0;
        
        if (containerRatio > videoRatio) {
          renderedWidth = r.height * videoRatio;
          xOffset = (r.width - renderedWidth) / 2;
        } else {
          renderedHeight = r.width / videoRatio;
          yOffset = (r.height - renderedHeight) / 2;
        }
        
        const relativeX = e.clientX - r.left - xOffset;
        const relativeY = e.clientY - r.top - yOffset;
        
        return {
          x: Math.min(1, Math.max(0, relativeX / renderedWidth)),
          y: Math.min(1, Math.max(0, relativeY / renderedHeight))
        };
      }
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    };

    layer.addEventListener("pointerdown", (e) => {
      if (pid !== null) return;
      pid = e.pointerId;
      layer.setPointerCapture(pid);
      const p = norm(e);
      startX = p.x; startY = p.y; startT = Date.now(); longFired = false;
      longTimer = setTimeout(() => {
        longFired = true;
        LK.sendGesture({ t: "long", x: startX, y: startY });
      }, 500);
    });

    layer.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pid) return;
      clearTimeout(longTimer);
      const p = norm(e);
      const dx = p.x - startX, dy = p.y - startY;
      const dist = Math.hypot(dx, dy);
      const dur = Date.now() - startT;
      if (!longFired) {
        if (dist < 0.03) {
          LK.sendGesture({ t: "tap", x: startX, y: startY });
        } else {
          LK.sendGesture({
            t: "swipe", x1: startX, y1: startY, x2: p.x, y2: p.y,
            d: Math.min(2000, Math.max(50, dur)),
          });
        }
      }
      pid = null;
    });

    layer.addEventListener("pointercancel", () => { clearTimeout(longTimer); pid = null; });
    layer.addEventListener("contextmenu", (e) => e.preventDefault());
  },

  async disconnectMonitor() {
    if (LK.monitorRoom) {
      try { await LK.monitorRoom.disconnect(); } catch (_) {}
      LK.monitorRoom = null;
      LK._monitorDevice = null;
    }
  },

  async disconnectVoice() {
    if (LK.voiceRoom) {
      try { await LK.voiceRoom.disconnect(); } catch (_) {}
      LK.voiceRoom = null;
    }
  },

  async disconnectAll() {
    await Promise.all([LK.disconnectMonitor(), LK.disconnectVoice()]);
  },
};
