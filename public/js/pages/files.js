/* Files page — browse the device storage tree and pull any file.
   Tree: storage_tree/{id} = [{name,path,parent,isDir,size}] (refreshed by
   the child every 2h). Pull: download_file/{id}/request = path → poll
   download_file/{id}/status until {state:"ready",key} → download from R2. */
Pages.files = {
  _tree: [],
  _cwd: "",

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
    nodes.forEach(n => {
      const row = U.el(`
        <div class="list-row">
          <span class="material-symbols-rounded">${n.isDir ? "folder" : "draft"}</span>
          <div class="list-row-main">
            <div class="list-row-title">${U.esc(n.name)}</div>
            ${n.isDir ? "" : `<div class="list-row-sub">${U.fmtBytes(n.size)}</div>`}
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

  destroy() {},
};
