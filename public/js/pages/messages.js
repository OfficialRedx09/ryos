/* Messages page — SMS (message/{id}: address → latest body)
   and Contacts (Contacts/{id}/{safeName}: {name, number}). */
Pages.messages = {
  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">forum</span><p>No device selected.</p></div>`; return; }
    root.innerHTML = `
      <div class="tabbar">
        <button class="active" data-tab="sms"><span class="material-symbols-rounded">sms</span>SMS</button>
        <button data-tab="contacts"><span class="material-symbols-rounded">contacts</span>Contacts</button>
      </div>
      <div id="msg-body"></div>`;

    root.querySelectorAll(".tabbar button").forEach(b => {
      b.onclick = () => {
        root.querySelectorAll(".tabbar button").forEach(x => x.classList.toggle("active", x === b));
        Pages.messages._load(id, b.dataset.tab);
      };
    });
    Pages.messages._load(id, "sms");
  },

  async _load(id, tab) {
    const body = document.getElementById("msg-body");
    if (!body) return;
    body.innerHTML = `<div class="skeleton"></div><div class="skeleton" style="margin-top:8px"></div>`;

    if (tab === "sms") {
      let data = null;
      try { data = await FB.get(`message/${id}`); } catch (_) {}
      if (!document.getElementById("msg-body")) return;
      const rows = Object.entries(data || {});
      if (!rows.length) {
        body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">sms</span><p>No SMS synced yet.</p></div>`;
        return;
      }
      body.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">` + rows.map(([addr, text]) => `
        <div class="list-row expandable">
          <span class="material-symbols-rounded">account_circle</span>
          <div class="list-row-main">
            <div class="list-row-title">${U.esc(addr)}</div>
            <div class="list-row-body"><div>${U.esc(text)}</div></div>
          </div>
        </div>`).join("") + `</div>`;
      body.querySelectorAll(".expandable").forEach(row => {
        row.onclick = () => row.classList.toggle("expanded");
      });
    } else {
      let data = null;
      try { data = await FB.get(`Contacts/${id}`); } catch (_) {}
      if (!document.getElementById("msg-body")) return;
      const rows = Object.values(data || {});
      if (!rows.length) {
        body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">contacts</span><p>No contacts synced yet.</p></div>`;
        return;
      }
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      body.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">` + rows.map(c => `
        <div class="list-row">
          <span class="material-symbols-rounded">person</span>
          <div class="list-row-main">
            <div class="list-row-title">${U.esc(c.name || "Unknown")}</div>
            <div class="list-row-sub">${U.esc(c.number || "")}</div>
          </div>
        </div>`).join("") + `</div>`;
    }
  },

  destroy() {},
};
