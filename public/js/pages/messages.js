/* Messages page — SMS (message/{id}: address → latest body)
   and Contacts (Contacts/{id}/{safeName}: {name, number}). */
Pages.messages = {
  _tab: "sms",

  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">forum</span><p>No device selected.</p></div>`; return; }
    Pages.messages._tab = "sms";
    root.innerHTML = `
      <div class="tabbar">
        <button class="active" data-tab="sms"><span class="material-symbols-rounded">sms</span>SMS</button>
        <button data-tab="contacts"><span class="material-symbols-rounded">contacts</span>Contacts</button>
      </div>
      <div id="msg-body" style="display:flex;flex-direction:column;gap:8px"></div>`;

    root.querySelectorAll(".tabbar button").forEach(b => {
      b.onclick = () => {
        root.querySelectorAll(".tabbar button").forEach(x => x.classList.toggle("active", x === b));
        Pages.messages._tab = b.dataset.tab;
        Pages.messages._load(id, b.dataset.tab);
      };
    });
    Pages.messages._load(id, "sms");

    // Silent background refresh — rows are patched in place (U.syncList), so
    // new SMS/contacts simply appear without the list blinking.
    App.addTimer(setInterval(() => {
      if (!document.getElementById("msg-body")) return;
      Pages.messages._load(id, Pages.messages._tab, true);
    }, 15000));
  },

  async _load(id, tab, quiet) {
    const body = document.getElementById("msg-body");
    if (!body) return;
    if (!quiet) body.innerHTML = `<div class="skeleton"></div><div class="skeleton" style="margin-top:8px"></div>`;

    if (tab === "sms") {
      let data = null;
      try { data = await FB.get(`message/${id}`); } catch (_) {}
      if (!document.getElementById("msg-body")) return;
      const rows = Object.entries(data || {})
        .map(([addr, text]) => ({ key: addr, addr, text: String(text == null ? "" : text) }));
      const byKey = {};
      rows.forEach(r => { byKey[r.key] = r; });
      U.syncList(body, rows.map(r => r.key),
        key => Pages.messages._smsRow(byKey[key]),
        (key, node) => Pages.messages._fillSms(node, byKey[key]),
        { empty: `<div class="empty"><span class="material-symbols-rounded">sms</span><p>No SMS synced yet.</p></div>` });
    } else {
      let data = null;
      try { data = await FB.get(`Contacts/${id}`); } catch (_) {}
      if (!document.getElementById("msg-body")) return;
      const rows = Object.values(data || {}).map(c => ({
        key: `${(c && c.name) || "Unknown"}|${(c && c.number) || ""}`,
        name: (c && c.name) || "Unknown",
        number: (c && c.number) || "",
      }));
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const byKey = {};
      rows.forEach(r => { byKey[r.key] = r; });
      U.syncList(body, rows.map(r => r.key),
        key => Pages.messages._contactRow(byKey[key]),
        (key, node) => Pages.messages._fillContact(node, byKey[key]),
        { empty: `<div class="empty"><span class="material-symbols-rounded">contacts</span><p>No contacts synced yet.</p></div>` });
    }
  },

  /* ── row shells ── */
  _smsRow(r) {
    const row = U.el(`
      <div class="list-row expandable">
        <span class="material-symbols-rounded">account_circle</span>
        <div class="list-row-main">
          <div class="list-row-title" data-msg="title"></div>
          <div class="list-row-body"><div data-msg="body"></div></div>
        </div>
      </div>`);
    row.querySelector('[data-msg="title"]').textContent = r.addr;
    row.querySelector('[data-msg="body"]').textContent = r.text;
    row.dataset.sig = r.text;
    row.onclick = () => row.classList.toggle("expanded");
    return row;
  },

  _contactRow(r) {
    const row = U.el(`
      <div class="list-row">
        <span class="material-symbols-rounded">person</span>
        <div class="list-row-main">
          <div class="list-row-title" data-msg="title"></div>
          <div class="list-row-sub" data-msg="sub"></div>
        </div>
      </div>`);
    row.querySelector('[data-msg="title"]').textContent = r.name;
    row.querySelector('[data-msg="sub"]').textContent = r.number;
    row.dataset.sig = `${r.name}|${r.number}`;
    return row;
  },

  /* ── patch rows in place (never recreated → no blink) ── */
  _fillSms(node, r) {
    if (!node || !r || node.dataset.sig === r.text) return;
    node.dataset.sig = r.text;
    node.querySelector('[data-msg="body"]').textContent = r.text;
  },

  _fillContact(node, r) {
    if (!node || !r) return;
    const sig = `${r.name}|${r.number}`;
    if (node.dataset.sig === sig) return;
    node.dataset.sig = sig;
    node.querySelector('[data-msg="title"]').textContent = r.name;
    node.querySelector('[data-msg="sub"]').textContent = r.number;
  },

  destroy() {},
};
