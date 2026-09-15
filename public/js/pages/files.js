/* Files page — browse the device storage tree and pull any file.
   Tree: storage_tree/{id} = [{name,path,parent,isDir,size}] (refreshed by
   the child every 2h). Pull: download_file/{id}/request = path → poll
   download_file/{id}/status until {state:"ready",key} → download from R2.

   Sizes: older child builds ship tree nodes WITHOUT a size field, which used
   to show up as a bogus "0 B". We now read whatever size field the device
   sends (size / sizeBytes / bytes / length / …) and remember the real size
   discovered from R2 after a pull, so unknown sizes display as "—" instead of
   a wrong number. */
Pages.files = {
  _tree: [],
  _cwd: "",
  _sizesKey: "ca_file_sizes",

  _sizeMap() {
    try { return JSON.parse(localStorage.getItem(Pages.files._sizesKey) || "{}") || {}; }
    catch (_) { return {}; }
  },

  _rememberSize(id, path, size) {
    if (!id || !path || !(Number(size) > 0)) return;
    const map = Pages.files._sizeMap();
    map[`${id}|${path}`] = Number(size);
    try { localStorage.setItem(Pages.files._sizesKey, JSON.stringify(map)); } catch (_) { }
  },

  // Real size in bytes, or null when neither the device nor the cache knows it.
  _sizeOf(n) {
    const raw = [n.size, n.sizeBytes, n.size_bytes, n.bytes, n.length, n.fileSize, n.filesize, n.len]
      .find(v => v !== undefined && v !== null && v !== "");
    if (raw !== undefined) {
      const v = Number(raw);
      if (isFinite(v) && v >= 0) return v;
    }
    const cached = Pages.files._sizeMap()[`${Pages.files._id}|${n.path}`];
    return (typeof cached === "number" && cached > 0) ? cached : null;
  },

  // True when the device reported no size at all for this tree.
  _sizesMissing() {
    return Pages.files._tree.some(n => !n.isDir) &&
      !Pages.files._tree.some(n => !n.isDir && Pages.files._sizeOf(n) !== null);
  },

  render(root) {
    const id = App.dev();
    if (!id) { root.innerHTML = `<div class="empty"><span class="material-symbols-rounded">folder_off</span><p>No device selected.</p></div>`; return; }
    Pages.files._cwd = "";
    root.innerHTML = `
      <div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><h2>Device files</h2><p>Browse storage and pull any file to this browser.</p></div>
        <button class="btn btn-ghost btn-sm" id="fl-reload"><span class="material-symbols-rounded">refresh</span>Reload tree</button>
      </div>
      <div class="breadcrumb" id="fl-crumb"></div>
      <div id="fl-list" style="display:flex;flex-direction:column;gap:8px"><div class="skeleton"></div><div class="skeleton"></div></div>`;
    document.getElementById("fl-reload").onclick = () => Pages.files._load(id);
    Pages.files._load(id);
  },

  async _load(id) {
    const list = document.getElementById("fl-list");
    if (!list) return;
    list.innerHTML = `<div class="skeleton"></div><div class="skeleton" style="margin-top:8px"></div>`;
    try {
      const tree = await FB.get(`storage_tree/${id}`);
      Pages.files._tree = Array.isArray(tree) ? tree : Object.values(tree || {});
      Pages.files._id = id;
      Pages.files._render();
    } catch (e) {
      if (document.getElementById("fl-list"))
        list.innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Failed: ${U.esc(e.message)}</p></div>`;
    }
  },

  _children(dir) {
    return Pages.files._tree
      .filter(n => (n.parent || "") === dir)
      .sort((a, b) => (b.isDir - a.isDir) || String(a.name).localeCompare(String(b.name)));
  },

  _render() {
    const list = document.getElementById("fl-list");
    const crumb = document.getElementById("fl-crumb");
    if (!list || !crumb) return;
    const cwd = Pages.files._cwd;

    // breadcrumb
    const parts = cwd ? cwd.split("/").filter(Boolean) : [];
    let acc = "";
    crumb.innerHTML = `<button data-dir="">root</button>` + parts.map(p => {
      acc += (acc ? "/" : "") + p;
      return `<span class="sep">/</span><button data-dir="${U.esc(acc)}">${U.esc(p)}</button>`;
    }).join("");
    crumb.querySelectorAll("button").forEach(b =>
      b.onclick = () => { Pages.files._cwd = b.dataset.dir; Pages.files._render(); });

    const nodes = Pages.files._children(cwd);
    if (!nodes.length) {
      list.innerHTML = `<div class="empty"><span class="material-symbols-rounded">folder_open</span><p>Empty folder (or the tree hasn't synced yet).</p></div>`;
      return;
    }
    list.innerHTML = "";
    if (Pages.files._sizesMissing()) {
      list.insertAdjacentHTML("beforeend",
        `<div class="card" style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px">
           <span class="material-symbols-rounded" style="color:var(--text-faint)">info</span>
           <div style="font-size:13px;color:var(--text-dim)">
             This device hasn't reported file sizes yet, so sizes show as “—” here.
             Sizes appear automatically as you pull files, and instantly once the
             child app is updated (it then sends a size per file).
           </div>
         </div>`);
    }
    nodes.forEach(n => {
      const size = n.isDir ? null : Pages.files._sizeOf(n);
      const sizeText = size === null ? "—" : U.fmtBytes(size);
      const sizeTitle = size === null ? "Size not reported by the device (pull the file to learn it)" : U.fmtBytes(size);
      const row = U.el(`
        <div class="list-row">
          <span class="material-symbols-rounded">${n.isDir ? "folder" : R2.icon(n.name)}</span>
          <div class="list-row-main">
            <div class="list-row-title">${U.esc(n.name)}</div>
            ${n.isDir ? "" : `<div class="list-row-sub" title="${U.esc(sizeTitle)}">${sizeText}</div>`}
          </div>
          ${n.isDir ? `<span class="material-symbols-rounded" style="color:var(--text-faint)">chevron_right</span>`
          : `<button class="btn btn-sm btn-ghost"><span class="material-symbols-rounded">download</span>Pull</button>`}
        </div>`);
      if (n.isDir) {
        row.onclick = () => { Pages.files._cwd = n.path; Pages.files._render(); };
      } else {
        row.querySelector("button").onclick = () => Pages.files._pull(n);
      }
      list.appendChild(row);
    });
  },

  async _pull(node) {
    const id = Pages.files._id;
    App.toast(`Requesting ${node.name} from device…`, "info", 5000);
    try {
      await FB.put(`download_file/${id}/status`, { state: "pending" });
      await FB.put(`download_file/${id}/request`, node.path);

      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        const st = await FB.get(`download_file/${id}/status`);
        if (st && st.state === "ready" && st.key) {
          App.toast("Upload ready — downloading…", "ok");
          await Pages.files._learnSize(id, node, st);
          await R2.download(st.key, st.name || node.name);
          return;
        }
        if (st && st.state === "error") throw new Error(st.message || "device reported an error");
      }
      App.toast("Timed out waiting for the device", "err");
    } catch (e) {
      App.toast("Pull failed: " + e.message, "err");
    }
  },

  // Remembers the real size (device-reported if present, otherwise from R2)
  // so the row shows a real number on this and every later visit.
  async _learnSize(id, node, st) {
    let size = Number(st.size || st.sizeBytes || 0) || 0;
    if (!size && st.key) {
      try { size = Number((await R2.stat(st.key)).size) || 0; } catch (_) { }
    }
    if (size > 0) {
      Pages.files._rememberSize(id, node.path, size);
      if (Pages.files._cwd !== undefined) Pages.files._render();
    }
  },

  destroy() {},
};
