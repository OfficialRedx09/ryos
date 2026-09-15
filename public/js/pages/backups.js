/* Backups page — browse everything stored in the Cloudflare R2 bucket.
   The child app writes `{deviceId}/Image|Videos|Screen_shots|Storage/{file}`,
   so the bucket root lists one folder per device ("user model"), inside those
   you get the Image / Videos / Screen_shots / Storage groups, and inside those
   the files themselves — previewable and downloadable from here. */
Pages.backups = {
  _prefix: "",
  _folders: [],
  _files: [],
  _query: "",
  _view: "grid",

  _bucket() { return localStorage.getItem("ca_r2_bucket") || "files"; },

  render(root) {
    Pages.backups._prefix = "";
    Pages.backups._query = "";
    root.innerHTML = `
      <div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h2>Backups</h2><p>Everything stored in the R2 bucket — photos, videos, screenshots and pulled files.</p></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input class="input" id="bk-search" placeholder="Search all backups…" style="width:210px">
          <button class="btn btn-ghost btn-sm" id="bk-refresh"><span class="material-symbols-rounded">refresh</span>Refresh</button>
        </div>
      </div>
      <div class="breadcrumb" id="bk-crumb"></div>
      <div id="bk-meta" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 14px"></div>
      <div class="radio-pills" style="margin-bottom:14px" id="bk-views">
        <label><input type="radio" name="bkview" value="grid" checked><span class="pill">Grid</span></label>
        <label><input type="radio" name="bkview" value="list"><span class="pill">List</span></label>
      </div>
      <div id="bk-body"></div>`;

    document.getElementById("bk-refresh").onclick = () => Pages.backups._load();
    document.getElementById("bk-views").addEventListener("change", e => {
      Pages.backups._view = e.target.value;
      Pages.backups._renderBody();
    });

    // Debounced deep search across everything under the current folder.
    let timer = null;
    document.getElementById("bk-search").addEventListener("input", e => {
      const value = e.target.value.trim();
      clearTimeout(timer);
      timer = App.addTimer(setTimeout(() => {
        if (value === Pages.backups._query) return;
        Pages.backups._query = value;
        Pages.backups._load();
      }, 450));
    });

    Pages.backups._load();
  },

  async _load() {
    const body = document.getElementById("bk-body");
    if (!body) return;
    body.innerHTML = Pages.backups._view === "grid"
      ? `<div class="media-grid">${`<div class="skeleton" style="aspect-ratio:1"></div>`.repeat(8)}</div>`
      : `<div class="skeleton"></div><div class="skeleton" style="margin-top:8px"></div>`;

    try {
      if (Pages.backups._query) {
        // Deep search: every object under the current folder, filtered by name.
        const items = await R2.list(Pages.backups._prefix);
        if (!document.getElementById("bk-body")) return;
        const q = Pages.backups._query.toLowerCase();
        Pages.backups._folders = [];
        Pages.backups._files = items.filter(f => f.key.toLowerCase().includes(q));
        Pages.backups._status = `searched ${items.length} object${items.length === 1 ? "" : "s"}`;
      } else {
        const res = await R2.browse(Pages.backups._prefix);
        if (!document.getElementById("bk-body")) return;
        Pages.backups._folders = res.folders;
        Pages.backups._files = res.files;
        Pages.backups._status = res.truncated ? "first 1000 objects" : "";
        // Recursive folder total (computed server-side) arrives a moment later.
        R2.summary(Pages.backups._prefix).then(s => {
          Pages.backups._summary = s;
          if (document.getElementById("bk-body")) Pages.backups._renderMeta();
        }).catch(() => { });
      }
      Pages.backups._renderCrumb();
      Pages.backups._renderMeta();
      Pages.backups._renderBody();
    } catch (e) {
      if (document.getElementById("bk-body"))
        body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not read the bucket: ${U.esc(e.message)}</p></div>`;
    }
  },

  _go(prefix) {
    Pages.backups._prefix = prefix || "";
    Pages.backups._query = "";
    Pages.backups._summary = null;
    const search = document.getElementById("bk-search");
    if (search) search.value = "";
    Pages.backups._load();
  },

  _renderCrumb() {
    const crumb = document.getElementById("bk-crumb");
    if (!crumb) return;
    const prefix = Pages.backups._prefix;
    const parts = prefix.split("/").filter(Boolean);
    let acc = "";
    crumb.innerHTML = `<button data-prefix=""><span class="material-symbols-rounded" style="font-size:15px;vertical-align:-3px">cloud</span> ${U.esc(Pages.backups._bucket())}</button>` +
      parts.map(p => {
        acc += p + "/";
        return `<span class="sep">/</span><button data-prefix="${U.esc(acc)}">${U.esc(p)}</button>`;
      }).join("");
    crumb.querySelectorAll("button").forEach(b =>
      b.onclick = () => Pages.backups._go(b.dataset.prefix));
  },

  _renderMeta() {
    const meta = document.getElementById("bk-meta");
    if (!meta) return;
    const files = Pages.backups._files.length;
    const folders = Pages.backups._folders.length;
    const bits = [];
    if (folders) bits.push(`<b>${folders}</b> folder${folders === 1 ? "" : "s"}`);
    bits.push(`<b>${files}</b> file${files === 1 ? "" : "s"}`);
    const s = Pages.backups._summary;
    if (s && s.count) bits.push(`${U.fmtBytes(s.size)} total${s.truncated ? " (partial)" : ""}`);
    const where = (Pages.backups._prefix || "bucket root").replace(/\/$/, "");
    meta.innerHTML = `
      <span class="badge"><span class="material-symbols-rounded" style="font-size:14px;vertical-align:-2px">folder_managed</span> ${U.esc(where)}</span>
      <span style="font-size:12px;color:var(--text-dim)">${bits.join(" · ")}</span>
      ${Pages.backups._status ? `<span style="font-size:12px;color:var(--text-faint)">${U.esc(Pages.backups._status)}</span>` : ""}`;
  },

  _renderBody() {
    const body = document.getElementById("bk-body");
    if (!body) return;
    if (!Pages.backups._files.length && !Pages.backups._folders.length) {
      body.innerHTML = Pages.backups._query
        ? `<div class="empty"><span class="material-symbols-rounded">search_off</span><p>Nothing here matches “${U.esc(Pages.backups._query)}”.</p></div>`
        : `<div class="empty"><span class="material-symbols-rounded">folder_open</span><p>This folder is empty.</p></div>`;
      return;
    }
    if (Pages.backups._view === "grid") Pages.backups._renderGrid();
    else Pages.backups._renderList();
  },

  _iconTile(key) {
    return `<div style="display:flex;align-items:center;justify-content:center;height:100%"><span class="material-symbols-rounded" style="font-size:34px;color:var(--text-faint)">${R2.icon(key)}</span></div>`;
  },

  _renderGrid() {
    const body = document.getElementById("bk-body");
    if (!body) return;
    body.innerHTML = "";
    const grid = U.el(`<div class="media-grid"></div>`);

    Pages.backups._folders.forEach(f => {
      const cell = U.el(`
        <div class="media-item" title="${U.esc(f.name)}">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;padding:10px;text-align:center">
            <span class="material-symbols-rounded" style="font-size:32px;color:var(--accent)">folder</span>
            <span style="font-size:11px;color:var(--text-dim);word-break:break-all;line-height:1.25">${U.esc(f.name)}</span>
          </div>
        </div>`);
      cell.onclick = () => Pages.backups._go(f.prefix);
      grid.appendChild(cell);
    });

    Pages.backups._files.forEach(f => {
      const url = R2.publicUrl(f.key);
      const meta = [U.fmtBytes(f.size), U.fmtDate(f.lastModified)].filter(v => v && v !== "—").join(" • ");
      const kindIcon = R2.isVideo(f.key) ? "play_circle" : (R2.isAudio(f.key) ? "music_note" : "image");
      const cell = U.el(`
        <div class="media-item" title="${U.esc(f.name)}${meta ? " — " + U.esc(meta) : ""}">
          ${R2.isImage(f.key) ? `<img src="${url}" loading="lazy" alt="">` : Pages.backups._iconTile(f.key)}
          <span class="media-kind"><span class="material-symbols-rounded">${R2.isImage(f.key) ? kindIcon : R2.icon(f.key)}</span></span>
        </div>`);
      const img = cell.querySelector("img");
      if (img) img.onerror = () => {
        img.remove();
        cell.insertAdjacentHTML("afterbegin", Pages.backups._iconTile(f.key));
      };
      cell.onclick = () => Pages.backups._open(f, url);
      grid.appendChild(cell);
    });

    body.appendChild(grid);
  },

  _renderList() {
    const body = document.getElementById("bk-body");
    if (!body) return;
    body.innerHTML = "";
    const list = U.el(`<div style="display:flex;flex-direction:column;gap:8px"></div>`);

    Pages.backups._folders.forEach(f => {
      const row = U.el(`
        <div class="list-row">
          <span class="material-symbols-rounded">folder</span>
          <div class="list-row-main">
            <div class="list-row-title">${U.esc(f.name)}</div>
            <div class="list-row-sub">Folder</div>
          </div>
          <span class="material-symbols-rounded" style="color:var(--text-faint)">chevron_right</span>
        </div>`);
      row.onclick = () => Pages.backups._go(f.prefix);
      list.appendChild(row);
    });

    Pages.backups._files.forEach(f => list.appendChild(Pages.backups._fileRow(f)));
    body.appendChild(list);
  },

  // One file row: thumbnail/icon, name, size + date, view/download/delete.
  _fileRow(f) {
    const url = R2.publicUrl(f.key);
    const sub = [U.fmtBytes(f.size), U.fmtDate(f.lastModified)].filter(v => v && v !== "—").join(" • ") || "—";
    const thumb = R2.isImage(f.key)
      ? `<img src="${url}" loading="lazy" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--stroke)">`
      : `<span class="material-symbols-rounded">${R2.icon(f.key)}</span>`;

    const row = U.el(`
      <div class="list-row">
        ${thumb}
        <div class="list-row-main">
          <div class="list-row-title">${U.esc(f.name)}</div>
          <div class="list-row-sub">${U.esc(sub)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${R2.viewable(f.key) ? `<button class="btn btn-sm btn-ghost" data-a="view" title="Preview"><span class="material-symbols-rounded">visibility</span></button>` : ""}
          <button class="btn btn-sm btn-ghost" data-a="dl" title="Download"><span class="material-symbols-rounded">download</span></button>
          <button class="btn btn-sm btn-ghost" data-a="del" title="Delete from storage"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>`);

    const img = row.querySelector("img");
    if (img) img.onerror = () => {
      img.replaceWith(U.el(`<span class="material-symbols-rounded">${R2.icon(f.key)}</span>`));
    };
    const viewBtn = row.querySelector('[data-a="view"]');
    if (viewBtn) viewBtn.onclick = () => Pages.backups._open(f, url);
    row.querySelector('[data-a="dl"]').onclick = () => Pages.backups._download(f);
    row.querySelector('[data-a="del"]').onclick = () => Pages.backups._remove(f);
    return row;
  },

  _open(f, url) {
    if (R2.viewable(f.key)) U.lightbox({ url, name: f.name, key: f.key });
    else Pages.backups._download(f);
  },

  _download(f) {
    App.toast("Downloading " + f.name + "…", "info");
    R2.download(f.key, f.name);
  },

  async _remove(f) {
    const ok = await App.confirm({
      title: "Delete from backup?",
      body: `${f.name} will be permanently removed from R2 storage.`,
      okText: "Delete",
      danger: true,
      icon: "delete_forever",
    });
    if (!ok) return;
    try {
      await R2.remove(f.key);
      App.toast("Deleted " + f.name, "ok");
      Pages.backups._load();
    } catch (e) {
      App.toast("Delete failed: " + e.message, "err");
    }
  },

  destroy() { },
};