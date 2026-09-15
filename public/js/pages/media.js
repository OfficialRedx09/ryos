/* Media page — backed-up photos/videos (media_metadata/{id}) and
   on-demand screenshots (R2 listing of {id}/Screen_shots/).
   Downloads come from the R2 public URL ({id}/Image|Videos/{name}). */
Pages.media = {
  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">photo_library</span><p>No device selected.</p></div>`; return; }
    root.innerHTML = `
      <div class="tabbar">
        <button class="active" data-tab="gallery"><span class="material-symbols-rounded">photo_library</span>Gallery</button>
        <button data-tab="shots"><span class="material-symbols-rounded">screenshot</span>Screenshots</button>
      </div>
      <div id="media-body"></div>`;
    root.querySelectorAll(".tabbar button").forEach(b => {
      b.onclick = () => {
        root.querySelectorAll(".tabbar button").forEach(x => x.classList.toggle("active", x === b));
        Pages.media._load(id, b.dataset.tab);
      };
    });
    Pages.media._load(id, "gallery");
  },

  async _load(id, tab) {
    const body = document.getElementById("media-body");
    if (!body) return;
    body.innerHTML = `<div class="media-grid">${`<div class="skeleton" style="aspect-ratio:1"></div>`.repeat(6)}</div>`;

    if (tab === "gallery") {
      let data = null;
      try { data = await FB.get(`media_metadata/${id}`); } catch (_) {}
      if (!document.getElementById("media-body")) return;
      const items = Object.values(data || {}).filter(m => m && m.name);
      if (!items.length) {
        body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">hide_image</span><p>No media backed up yet.<br>Enable image/video backup on the Settings page.</p></div>`;
        return;
      }
      items.sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
      body.innerHTML = `
        <div class="radio-pills" style="margin-bottom:14px" id="md-filter">
          <label><input type="radio" name="mdf" value="all" checked><span class="pill">All</span></label>
          <label><input type="radio" name="mdf" value="image"><span class="pill">Images</span></label>
          <label><input type="radio" name="mdf" value="video"><span class="pill">Videos</span></label>
        </div>
        <div class="media-grid" id="md-grid"></div>`;
      // media_metadata entries carry no `type` field, so classify by extension
      // (fall back to `type` when a future build starts writing it).
      const isVideoItem = m => String(m.type || "").toLowerCase().includes("video") || R2.isVideo(m.name);
      const keyOf = m => `${id}/${isVideoItem(m) ? "Videos" : "Image"}/${m.name}`;
      const fallbackIcon = isVideo =>
        `<div style="display:flex;align-items:center;justify-content:center;height:100%"><span class="material-symbols-rounded" style="font-size:34px;color:var(--text-faint)">${isVideo ? "movie" : "image"}</span></div>`;

      const renderGrid = (kind) => {
        const grid = document.getElementById("md-grid");
        if (!grid) return;
        const filtered = items.filter(m => kind === "all" || isVideoItem(m) === (kind === "video"));
        grid.innerHTML = "";
        filtered.forEach(m => {
          const isVideo = isVideoItem(m);
          const key = keyOf(m);
          const url = R2.publicUrl(key);
          const meta = [U.fmtBytes(m.size), U.fmtDate(m.date)].filter(Boolean).join(" • ");
          // Use the stored base64 thumbnail when present, otherwise load the
          // real object through the R2 proxy (falls back to an icon on error).
          const thumb = m.thumbnail
            ? `<img src="data:image/jpeg;base64,${m.thumbnail}" loading="lazy" alt="">`
            : (isVideo ? fallbackIcon(true) : `<img src="${url}" loading="lazy" alt="">`);
          const cell = U.el(`
            <div class="media-item" title="${U.esc(m.name)}${meta ? " — " + U.esc(meta) : ""}">
              ${thumb}
              <span class="media-kind"><span class="material-symbols-rounded">${isVideo ? "play_circle" : "image"}</span></span>
            </div>`);
          if (!m.thumbnail && !isVideo) {
            const img = cell.querySelector("img");
            if (img) img.onerror = () => { img.remove(); cell.insertAdjacentHTML("afterbegin", fallbackIcon(false)); };
          }
          cell.onclick = () => Pages.media._view(url, m.name, isVideo, key);
          grid.appendChild(cell);
        });
        if (!filtered.length)
          grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><p>No ${kind}s yet.</p></div>`;
      };
      document.getElementById("md-filter").addEventListener("change", e => renderGrid(e.target.value));
      renderGrid("all");
    } else {
      // screenshots — list R2 prefix {id}/Screen_shots/
      try {
        const items = await R2.list(`${id}/Screen_shots/`);
        if (!document.getElementById("media-body")) return;
        if (!items.length) {
          body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">screenshot</span><p>No screenshots yet.<br>Take one from the Actions page.</p></div>`;
          return;
        }
        body.innerHTML = `<div class="media-grid"></div>`;
        const grid = body.querySelector(".media-grid");
        items.forEach(it => {
          const name = it.key.split("/").pop();
          const url = R2.publicUrl(it.key);
          const meta = [U.fmtBytes(it.size), U.fmtDate(it.lastModified)].filter(v => v && v !== "—").join(" • ");
          const cell = U.el(`
            <div class="media-item" title="${U.esc(name)}${meta ? " — " + U.esc(meta) : ""}">
              <img src="${url}" loading="lazy" alt="">
              <span class="media-kind"><span class="material-symbols-rounded">screenshot</span></span>
            </div>`);
          const img = cell.querySelector("img");
          img.onerror = () => {
            img.remove();
            cell.insertAdjacentHTML("afterbegin",
              `<div style="display:flex;align-items:center;justify-content:center;height:100%"><span class="material-symbols-rounded" style="font-size:34px;color:var(--text-faint)">broken_image</span></div>`);
          };
          cell.onclick = () => Pages.media._view(url, name, false, it.key);
          grid.appendChild(cell);
        });
      } catch (e) {
        if (document.getElementById("media-body"))
          body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Screenshot listing failed: ${U.esc(e.message)}</p></div>`;
      }
    }
  },

  // Opens the shared full-screen viewer (image / video / audio).
  _view(url, name, isVideo, key) {
    return U.lightbox({ url, name, key, kind: isVideo ? "video" : "" });
  },

  destroy() {},
};
