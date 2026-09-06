/* Notifications page — live feed mirrored from the child device.
   Source: Notifications/{deviceId}/{millis}_{title} = {title,text,time}. */
Pages.notifications = {
  _knownKeys: new Set(),

  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">notifications_off</span><p>No device selected.</p></div>`; return; }
    Pages.notifications._knownKeys = new Set();
    root.innerHTML = `
      <div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h2>Notifications</h2><p>Live mirror from ${U.esc(id)} — refreshes every 5s.</p></div>
        <button class="btn btn-ghost btn-sm" id="nt-refresh"><span class="material-symbols-rounded">refresh</span>Refresh</button>
      </div>
      <input class="input" id="nt-search" placeholder="Search title or text…" style="margin-bottom:14px">
      <div id="nt-list" style="display:flex;flex-direction:column;gap:8px"><div class="skeleton"></div><div class="skeleton"></div></div>`;

    document.getElementById("nt-refresh").onclick = () => Pages.notifications._load(id);
    document.getElementById("nt-search").oninput = e => Pages.notifications._filter(e.target.value);
    Pages.notifications._load(id);
    App.addTimer(setInterval(() => Pages.notifications._load(id, true), 5000));
  },

  async _load(id, quiet) {
    const list = document.getElementById("nt-list");
    if (!list) return;
    let data = null;
    try { data = await FB.get(`Notifications/${id}`); } catch (e) {
      if (!quiet) list.innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Failed to load: ${U.esc(e.message)}</p></div>`;
      return;
    }
    if (!document.getElementById("nt-list")) return;

    const entries = Object.entries(data || {})
      .map(([key, v]) => ({ key, millis: parseInt(key, 10) || 0, title: v.title || "", text: v.text || "", time: v.time || "" }))
      .sort((a, b) => b.millis - a.millis);

    // toast for genuinely new notifications on background polls
    if (quiet && Pages.notifications._knownKeys.size) {
      const fresh = entries.filter(e => !Pages.notifications._knownKeys.has(e.key));
      if (fresh.length && fresh[0].millis > Date.now() - 15000) {
        App.toast(`${fresh[0].title || "New notification"}: ${fresh[0].text}`.slice(0, 90), "info");
      }
    }
    Pages.notifications._knownKeys = new Set(entries.map(e => e.key));
    Pages.notifications._all = entries;
    Pages.notifications._render();
  },

  _filter(q) { Pages.notifications._render(q.toLowerCase()); },

  _render(q = "") {
    const list = document.getElementById("nt-list");
    if (!list) return;
    const all = (Pages.notifications._all || [])
      .filter(e => !q || e.title.toLowerCase().includes(q) || e.text.toLowerCase().includes(q))
      .slice(0, 150);
    if (!all.length) {
      list.innerHTML = `<div class="empty"><span class="material-symbols-rounded">notifications_none</span><p>No notifications ${q ? "match your search" : "mirrored yet"}.</p></div>`;
      return;
    }
    list.innerHTML = all.map(e => `
      <div class="list-row expandable" data-key="${U.esc(e.key)}">
        <span class="material-symbols-rounded">notifications</span>
        <div class="list-row-main">
          <div class="list-row-title">${U.esc(e.title || "(no title)")}</div>
          <div class="list-row-body"><div>${U.esc(e.text)}</div></div>
        </div>
        <span style="font-size:11px;color:var(--text-faint);white-space:nowrap;flex-shrink:0">${U.esc(e.time)}</span>
      </div>`).join("");
    list.querySelectorAll(".expandable").forEach(row => {
      row.onclick = () => row.classList.toggle("expanded");
    });
  },

  destroy() {},
};
