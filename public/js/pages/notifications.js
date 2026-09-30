/* Notifications page — live feed mirrored from the child device.
   Source: Notifications/{deviceId}/{millis}_{title} = {title,text,time}.

   Updates are silent: a background poll only ADDS the new notifications and
   patches changed ones in place (U.syncList), so the list never re-renders,
   never dims/blinks and keeps expanded rows + scroll position. */
Pages.notifications = {
  _knownKeys: new Set(),
  _byKey: {},

  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">notifications_off</span><p>No device selected.</p></div>`; return; }
    Pages.notifications._knownKeys = new Set();
    Pages.notifications._byKey = {};
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
    const byKey = {};
    entries.forEach(e => { byKey[e.key] = e; });
    Pages.notifications._byKey = byKey;
    Pages.notifications._all = entries;
    Pages.notifications._render();
  },

  _filter(q) { Pages.notifications._render(q.toLowerCase()); },

  /* Patch the list in place — existing rows are reused so nothing re-animates. */
  _render(q = "") {
    const list = document.getElementById("nt-list");
    if (!list) return;
    const all = (Pages.notifications._all || [])
      .filter(e => !q || e.title.toLowerCase().includes(q) || e.text.toLowerCase().includes(q))
      .slice(0, 150);
    U.syncList(list, all.map(e => e.key),
      key => Pages.notifications._row(key),
      (key, node) => Pages.notifications._fill(node, Pages.notifications._byKey[key]),
      {
        empty: `<div class="empty"><span class="material-symbols-rounded">notifications_none</span><p>No notifications ${q ? "match your search" : "mirrored yet"}.</p></div>`,
        emptySig: q ? "search" : "none",
      });
  },

  _row() {
    const row = U.el(`
      <div class="list-row expandable">
        <span class="material-symbols-rounded">notifications</span>
        <div class="list-row-main">
          <div class="list-row-title" data-nt="title"></div>
          <div class="list-row-body"><div data-nt="text"></div></div>
        </div>
        <span style="font-size:11px;color:var(--text-faint);white-space:nowrap;flex-shrink:0" data-nt="time"></span>
      </div>`);
    row.onclick = () => row.classList.toggle("expanded");
    return row;
  },

  /* Write the values only when they actually differ — the row is never rebuilt. */
  _fill(node, e) {
    if (!node || !e) return;
    const sig = `${e.millis}|${e.title}|${e.text}|${e.time}`;
    if (node.dataset.sig === sig) return;
    node.dataset.sig = sig;
    node.querySelector('[data-nt="title"]').textContent = e.title || "(no title)";
    node.querySelector('[data-nt="text"]').textContent = e.text;
    node.querySelector('[data-nt="time"]').textContent = e.time;
  },

  destroy() {},
};
