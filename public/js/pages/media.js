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
      items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      body.innerHTML = `
        <div class="radio-pills" style="margin-bottom:14px" id="md-filter">
          <label><input type="radio" name="mdf" value="all" checked><span class="pill">All</span></label>
          <label><input type="radio" name="mdf" value="image"><span class="pill">Images</span></label>
          <label><input type="radio" name="mdf" value="video"><span class="pill">Videos</span></label>
        </div>
        <div class="media-grid" id="md-grid"></div>`;
      const renderGrid = (kind) => {
        const grid = document.getElementById("md-grid");
        if (!grid) return;
        const filtered = items.filter(m => kind === "all" || String(m.type || "").toLowerCase().includes(kind));
        grid.innerHTML = "";
        filtered.forEach(m => {
          const isVideo = String(m.type || "").toLowerCase().includes("video");
          const folder = isVideo ? "Videos" : "Image";
          const thumb = m.thumbnail
            ? `<img src="data:image/jpeg;base64,${m.thumbnail}" loading="lazy" alt="">`
            : `<div style="display:flex;align-items:center;justify-content:center;height:100%"><span class="material-symbols-rounded" style="font-size:34px;color:var(--text-faint)">${isVideo ? "movie" : "image"}</span></div>`;
          const cell = U.el(`
            <div class="media-item" title="${U.esc(m.name)}">
              ${thumb}
              <span class="media-kind"><span class="material-symbols-rounded">${isVideo ? "play_circle" : "image"}</span></span>
            </div>`);
          const url = isVideo ? R2.publicUrl(`${id}/${folder}/${m.name}`) : R2.publicUrl(`${id}/${folder}/${m.name}`);
          cell.onclick = () => Pages.media._view(url, m.name, isVideo, `${id}/${folder}/${m.name}`);
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
          const cell = U.el(`
            <div class="media-item" title="${U.esc(name)}">
              <img src="${url}" loading="lazy" alt="">
              <span class="media-kind"><span class="material-symbols-rounded">screenshot</span></span>
            </div>`);
          cell.onclick = () => Pages.media._view(url, name, false, it.key);
          grid.appendChild(cell);
        });
      } catch (e) {
        if (document.getElementById("media-body"))
          body.innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Screenshot listing failed: ${U.esc(e.message)}</p></div>`;
      }
    }
  },

  _view(url, name, isVideo, key) {
    const ext = name.split(".").pop().toLowerCase();
    const isVid = isVideo || ["mp4", "webm", "ogg", "mov"].includes(ext);
    
    const content = isVid 
      ? `<video src="${url}" controls autoplay playsinline style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5);"></video>`
      : `<img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5);" alt="${U.esc(name)}">`;
      
    const overlay = U.el(`
      <div style="position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.95); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:20px; animation:fadeIn 0.2s ease;">
        
        <div style="position:absolute; top:0; left:0; right:0; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; background:linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); z-index:10000;">
          <button id="mv-close" class="btn btn-ghost btn-icon" style="border:none; color:#fff; background:rgba(255,255,255,0.1); border-radius:50%;"><span class="material-symbols-rounded">close</span></button>
          <div style="color:#fff; font-size:14px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:60%; text-shadow:0 2px 4px rgba(0,0,0,0.5);">${U.esc(name)}</div>
          <button id="mv-dl" class="btn btn-primary btn-icon" style="border-radius:50%;"><span class="material-symbols-rounded">download</span></button>
        </div>
        
        ${content}
      </div>
    `);
    
    document.body.appendChild(overlay);
    
    overlay.querySelector("#mv-close").onclick = () => overlay.remove();
    overlay.querySelector("#mv-dl").onclick = async () => {
      App.toast("Downloading " + name + "...", "info");
      await R2.download(key, name);
    };
  },

  destroy() {},
};
