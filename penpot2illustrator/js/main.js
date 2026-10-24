(function () {
  'use strict';
  var DONATE_URL = 'https://boosty.to/photodrum/donate';

  var cep = window.__adobe_cep__;
  var hasNode = typeof require === 'function';
  var fs = hasNode ? require('fs') : null;
  var pathM = hasNode ? require('path') : null;
  var os = hasNode ? require('os') : null;
  var Buffer = hasNode ? require('buffer').Buffer : null;
  var process = hasNode ? require('process') : { platform: '', env: {} };
  var URL = window.URL || (hasNode ? require('url').URL : null);
  var $ = function (id) { return document.getElementById(id); };
  var I18N = window.I18N, t = I18N.t, tr = I18N.tr;
  var LS = 'penpot2ai.settings';

  var S = { file: null, fileName: '', pageId: null, boards: [], fonts: [], resolved: {}, busy: false, counts: { ok: 0, warn: 0, err: 0 },
    thumbs: {}, serverThumbs: null, thumbGen: 0 };

  var settings = { server: 'https://design.penpot.app', token: '', link: '', overrides: {}, keepHidden: true, embed: true,
    target: 'new', layout: 'penpot', guides: true, autoFonts: true, lang: null, open: {}, connOk: null,
    srcMode: 'browse', teamId: null, fileId: null, boardView: 'list' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  function save() { try { localStorage.setItem(LS, JSON.stringify(settings)); } catch (e) {} }

  function log(msg, cls) {
    var el = document.createElement('div');
    el.className = 'ln ' + (cls || '');
    el.textContent = msg;
    $('log').appendChild(el);
    $('log').scrollTop = 1e9;
    if (cls === 'ok') S.counts.ok++; else if (cls === 'warn') S.counts.warn++; else if (cls === 'err') S.counts.err++;
    updateLogBar();
  }
  function clearLog() { $('log').innerHTML = ''; S.counts = { ok: 0, warn: 0, err: 0 }; updateLogBar(); }
  function updateLogBar() {
    var c = S.counts, any = c.ok + c.warn + c.err > 0 || $('log').childNodes.length > 0;
    $('logbar').hidden = !any;
    [['cOk', '✓ ', c.ok], ['cWarn', '! ', c.warn], ['cErr', '✕ ', c.err]].forEach(function (x) {
      $(x[0]).hidden = !x[2]; $(x[0]).textContent = x[1] + x[2];
    });
  }
  function setLogOpen(open) {
    $('log').hidden = !open;
    $('logToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function status(msg, cls) { var s = $('status'); s.textContent = msg; s.className = cls || ''; }
  function progress(i, n) {
    if (!n) { $('progress').hidden = true; return; }
    $('progress').hidden = false; $('progressBar').style.width = Math.round(i / n * 100) + '%';
  }

  function lit(o) {
    var j = JSON.stringify(o).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return JSON.stringify(j);
  }
  function host(code) {
    return new Promise(function (res) {
      if (!cep) { res('ERR:' + tr('Панель открыта не в Illustrator', 'The panel is not running inside Illustrator')); return; }
      cep.evalScript(code, function (r) { res(r); });
    });
  }
  function ensureHost() {
    return host('typeof PI !== "undefined" && typeof PI.board === "function"').then(function (r) {
      if (r === 'true') return;
      if (hasNode) {
        var dir = decodeURI(cep.getSystemPath('extension'));
        if (dir.indexOf('file://') === 0) dir = dir.slice(7);
        if (dir.charAt(0) === '/' && dir.charAt(2) === ':') dir = dir.slice(1);
        try { return host(fs.readFileSync(pathM.join(dir, 'jsx', 'host.jsx'), 'utf8')); } catch (e) {}
      }
      var p = decodeURI(cep.getSystemPath('extension')).replace(/^file:\/\//, '');
      p = p.replace(/^\/([A-Za-z]:)/, '$1').replace(/\\/g, '/') + '/jsx/host.jsx';
      return host('$.evalFile(File("' + p + '"))');
    }).then(function () { return host('PI.lang="' + I18N.lang + '"'); });
  }

  function request(url, opts, redirects) {
    redirects = redirects || 0;
    return new Promise(function (resolve, reject) {
      var lib = url.indexOf('https:') === 0 ? require('https') : require('http');
      var req = lib.get(url, { headers: opts.headers || {} }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
          var next = res.headers.location;
          if (!/^https?:/i.test(next)) next = new URL(next, url).toString();
          res.resume();
          var h = Object.assign({}, opts.headers);
          if (new URL(next).host !== new URL(url).host) delete h.Authorization;
          resolve(request(next, { headers: h }, redirects + 1));
          return;
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var buf = Buffer.concat(chunks);
          if (res.statusCode >= 400) reject(new Error('HTTP ' + res.statusCode + ' ' + buf.toString('utf8', 0, 300)));
          else resolve({ buf: buf, type: res.headers['content-type'] || '' });
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, function () { req.destroy(new Error(tr('таймаут', 'timeout'))); });
    });
  }
  function authHeaders(json) {
    var h = {};
    if (settings.token) h.Authorization = 'Token ' + settings.token.trim();
    if (json) h.Accept = 'application/json';
    return h;
  }
  function serverUrl() { return (settings.server || '').replace(/\/+$/, ''); }

  function setOpen(sec, open, remember) {
    if (open) sec.setAttribute('data-open', ''); else sec.removeAttribute('data-open');
    sec.querySelector('.sec-h').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (remember) { settings.open[sec.id] = open; save(); }
  }
  function initSections() {
    Array.prototype.forEach.call(document.querySelectorAll('.sec'), function (sec) {
      if (settings.open.hasOwnProperty(sec.id)) setOpen(sec, settings.open[sec.id], false);
      sec.querySelector('.sec-h').addEventListener('click', function () { setOpen(sec, !sec.hasAttribute('data-open'), true); });
    });
  }

  function setFile(json, name) {
    if (typeof json === 'string') {
      if (/^\s*\[\s*"\^ "/.test(json) || /"~:/.test(json.slice(0, 500)))
        throw new Error(tr('Получен формат transit, а нужен JSON (заголовок Accept: application/json)', 'Got transit format instead of JSON (Accept: application/json header)'));
      json = JSON.parse(json);
    }
    if (!json.data || !json.data.pagesIndex) throw new Error(tr('В JSON нет data.pagesIndex — это не ответ get-file', 'No data.pagesIndex in JSON — this is not a get-file response'));
    S.file = json; S.fileName = name || json.name || 'Penpot';
    S.thumbs = {}; S.serverThumbs = null;
    var pages = P2A.pages(json);
    var sel = $('page');
    sel.innerHTML = '';
    pages.forEach(function (p) {
      var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o);
    });
    var want = P2A.parseLink(settings.link).pageId;
    if (want && pages.some(function (p) { return p.id === want; })) sel.value = want;
    $('sumSource').textContent = S.fileName;
    ['secBoards', 'secFonts', 'secOptions'].forEach(function (id) { $(id).hidden = false; });
    $('emptyHint').hidden = true;
    loadBoards();
  }

  function loadFromApi() {
    var info = P2A.parseLink(settings.link);
    if (!info.fileId) { status(tr('В ссылке нет file-id', 'The link has no file-id'), 'err'); return; }
    if (info.server && !settings.server) settings.server = info.server;
    if (!settings.token) {
      status(tr('Укажите токен доступа в «Подключении»', 'Enter an access token under “Connection”'), 'err');
      toggleConn(true); $('token').focus(); return;
    }
    loadFileById(info.fileId);
  }
  function loadFileById(id, name) {
    status(name ? tr('Загружаю «{n}»…', 'Loading “{n}”…', { n: name }) : tr('Загружаю файл…', 'Loading file…'));
    return request(serverUrl() + '/api/rpc/command/get-file?id=' + id, { headers: authHeaders(true) })
      .then(function (r) { setFile(r.buf.toString('utf8'), name); setConn(true); settings.fileId = id; save(); status(tr('Файл загружен', 'File loaded'), 'ok'); })
      .catch(function (e) { status(tr('Ошибка загрузки: {e}', 'Load error: {e}', { e: e.message }), 'err'); });
  }

  function api(cmd, params) {
    var q = Object.keys(params || {}).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return request(serverUrl() + '/api/rpc/command/' + cmd + (q ? '?' + q : ''), { headers: authHeaders(true) })
      .then(function (r) { return JSON.parse(r.buf.toString('utf8')); });
  }
  function ago(iso) {
    var d = (Date.now() - new Date(iso).getTime()) / 60000;
    if (!isFinite(d)) return '';
    if (d < 1) return t('when.now');
    if (d < 60) return t('when.min', { n: Math.round(d) });
    if (d < 60 * 24) return t('when.hour', { n: Math.round(d / 60) });
    if (d < 60 * 24 * 30) return t('when.day', { n: Math.round(d / 1440) });
    return new Date(iso).toLocaleDateString(I18N.lang === 'en' ? 'en-GB' : 'ru-RU');
  }
  function filesMsg(text, cls) { $('files').innerHTML = '<div class="empty"></div>'; var e = $('files').firstChild; e.textContent = text; if (cls) e.className = 'empty ' + cls; }
  function loadProjects() {
    if (!hasNode) return;
    if (!settings.token) { filesMsg(t('files.needToken')); return; }
    filesMsg(t('files.loading'));
    var teams = [];
    return api('get-teams').then(function (ts) {
      teams = ts || [];
      var sel = $('team'); sel.innerHTML = '';
      teams.forEach(function (tm) {
        var o = document.createElement('option'); o.value = tm.id;
        o.textContent = tm.isDefault ? tr('Личные проекты', 'Personal projects') : tm.name; sel.appendChild(o);
      });
      $('teamRow').hidden = teams.length < 2;
      if (!settings.teamId || !teams.some(function (x) { return x.id === settings.teamId; }))
        settings.teamId = (teams.filter(function (x) { return x.isDefault; })[0] || teams[0] || {}).id || null;
      sel.value = settings.teamId || '';
      setConn(true);
      return loadTeamFiles();
    }).catch(function (e) { setConn(false); filesMsg(t('files.error', { e: e.message }), 'err'); });
  }
  function loadTeamFiles() {
    if (!settings.teamId) { filesMsg(t('files.none')); return Promise.resolve(); }
    filesMsg(t('files.loading'));
    return api('get-projects', { 'team-id': settings.teamId }).then(function (projects) {
      return Promise.all((projects || []).map(function (p) {
        return api('get-project-files', { 'project-id': p.id }).then(function (fl) { p.files = fl || []; return p; }, function () { p.files = []; return p; });
      }));
    }).then(function (projects) {
      projects.forEach(function (p) {
        p.files.sort(function (a, b) { return String(b.modifiedAt).localeCompare(String(a.modifiedAt)); });
        p.last = p.files.length ? String(p.files[0].modifiedAt) : '';
      });
      projects.sort(function (a, b) { return (a.isDefault - b.isDefault) || b.last.localeCompare(a.last); });
      S.projects = projects;
      renderFiles();
    }).catch(function (e) { filesMsg(t('files.error', { e: e.message }), 'err'); });
  }
  function renderFiles() {
    var box = $('files'), q = $('fileFilter').value.trim().toLowerCase(), shown = 0;
    box.innerHTML = '';
    (S.projects || []).forEach(function (p) {
      var fl = p.files.filter(function (f) { return !q || f.name.toLowerCase().indexOf(q) >= 0 || p.name.toLowerCase().indexOf(q) >= 0; });
      if (!fl.length) return;
      var h = document.createElement('div'); h.className = 'proj';
      h.innerHTML = '<span class="pn"></span><span class="cnt"></span>';
      h.querySelector('.pn').textContent = p.isDefault ? t('files.drafts') : p.name;
      h.querySelector('.cnt').textContent = fl.length;
      box.appendChild(h);
      fl.forEach(function (f) {
        var b = document.createElement('button'); b.className = 'file'; b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', f.id === settings.fileId ? 'true' : 'false');
        b.innerHTML = '<svg><use href="#i-file"/></svg><span class="nm"></span><span class="when"></span>';
        b.querySelector('.nm').textContent = f.name; b.title = (p.isDefault ? t('files.drafts') : p.name) + ' / ' + f.name;
        b.querySelector('.when').textContent = ago(f.modifiedAt);
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(box.querySelectorAll('.file'), function (x) { x.setAttribute('aria-selected', 'false'); });
          b.setAttribute('aria-selected', 'true');
          settings.link = ''; loadFileById(f.id, f.name);
        });
        box.appendChild(b); shown++;
      });
    });
    if (!shown) filesMsg(t('files.none'));
  }
  function setSrcMode(v) {
    settings.srcMode = v; save();
    Array.prototype.forEach.call(document.querySelectorAll('#srcMode button'), function (b) { b.setAttribute('aria-checked', b.getAttribute('data-v') === v ? 'true' : 'false'); });
    $('browse').hidden = v !== 'browse'; $('linkRow').hidden = v !== 'link';
    if (v === 'browse' && !S.projects) loadProjects();
  }

  function loadFromFile(f) {
    var rd = new FileReader();
    rd.onload = function () {
      try { setFile(rd.result, f.name.replace(/\.json$/i, '')); status(tr('Файл прочитан', 'File read'), 'ok'); }
      catch (e) { status(e.message, 'err'); }
    };
    rd.readAsText(f, 'utf-8');
  }

  function setConn(ok) {
    settings.connOk = ok; save();
    var d = $('connDot');
    d.className = 'dot' + (ok === true ? ' ok' : ok === false ? ' err' : '');
    $('connToggle').title = t(ok === true ? 'conn.ok' : ok === false ? 'conn.err' : 'conn.unknown');
  }
  function toggleConn(force) {
    var open = typeof force === 'boolean' ? force : $('conn').hidden;
    $('conn').hidden = !open;
    $('connToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function loadBoards() {
    S.pageId = $('page').value;
    S.boards = P2A.boards(S.file, S.pageId);
    var box = $('boards'); box.innerHTML = '';
    S.boards.forEach(function (b) {
      var l = document.createElement('label');
      l.className = 'board on';
      l.innerHTML = '<input type="checkbox" checked><span class="th"></span><span class="nm"></span><span class="sz"></span>';
      l.querySelector('input').value = b.id;
      l.querySelector('.nm').textContent = b.name;
      l.title = b.name + ' · ' + Math.round(b.w) + '×' + Math.round(b.h);
      l.querySelector('.sz').textContent = Math.round(b.w) + '×' + Math.round(b.h);
      l.querySelector('input').addEventListener('change', function () { l.classList.toggle('on', this.checked); boardsChanged(); });
      l.addEventListener('mouseenter', function () { popShow(l, b); });
      l.addEventListener('mouseleave', popHide);
      box.appendChild(l);
    });
    $('filterRow').hidden = S.boards.length <= 8;
    $('filter').value = '';
    boardsChanged();
    loadThumbs();
  }

  function thumbKey(id) { return S.pageId + '|' + id; }
  function setThumb(id, url) {
    S.thumbs[thumbKey(id)] = url;
    var inp = document.querySelector('#boards input[value="' + id + '"]');
    if (!inp) return;
    var th = inp.parentNode.querySelector('.th');
    th.innerHTML = '';
    if (!url) { th.className = 'th none'; return; }
    var img = document.createElement('img'); img.src = url; img.alt = '';
    th.className = 'th'; th.appendChild(img);
  }
  function serverThumbMap() {
    if (S.serverThumbs) return Promise.resolve(S.serverThumbs);
    var fid = S.file && S.file.id;
    if (!hasNode || !fid || !settings.token) return Promise.resolve({});
    return api('get-file-object-thumbnails', { 'file-id': fid }).then(function (m) {
      S.serverThumbs = m && typeof m === 'object' ? m : {};
      return S.serverThumbs;
    }, function () { S.serverThumbs = {}; return S.serverThumbs; });
  }
  function fetchServerThumb(uri) {
    var url = /^https?:/i.test(uri) ? uri : serverUrl() + (uri.charAt(0) === '/' ? '' : '/') + uri;
    return request(url, { headers: authHeaders(false) }).then(function (r) {
      var mime = (r.type || 'image/png').split(';')[0];
      if (!/^image\//.test(mime)) throw new Error('not an image');
      return 'data:' + mime + ';base64,' + r.buf.toString('base64');
    });
  }
  function loadThumbs() {
    var gen = ++S.thumbGen, pageId = S.pageId, file = S.file, list = S.boards.slice();
    list.forEach(function (b) { if (S.thumbs.hasOwnProperty(thumbKey(b.id))) setThumb(b.id, S.thumbs[thumbKey(b.id)]); });
    var todo = list.filter(function (b) { return !S.thumbs.hasOwnProperty(thumbKey(b.id)); });
    if (!todo.length) return;
    serverThumbMap().then(function (map) {
      var chain = Promise.resolve();
      todo.forEach(function (b) {
        chain = chain.then(function () {
          if (gen !== S.thumbGen) return;
          var key = file.id + '/' + pageId + '/' + b.id + '/frame';
          var uri = map[key];
          var local = function () {
            return new Promise(function (res) {
              setTimeout(function () {
                if (gen !== S.thumbGen) { res(); return; }
                var url = null;
                try { url = P2A.svgDataUrl(P2A.previewSvg(file, pageId, b.id)); } catch (e) {}
                setThumb(b.id, url); res();
              }, 0);
            });
          };
          if (!uri) return local();
          return fetchServerThumb(uri).then(function (url) { if (gen === S.thumbGen) setThumb(b.id, url); }, local);
        });
      });
    });
  }

  function setBoardView(v) {
    settings.boardView = v === 'grid' ? 'grid' : 'list'; save();
    $('boards').className = settings.boardView === 'grid' ? 'grid' : '';
    $('boards').parentNode.classList.toggle('tiles', settings.boardView === 'grid');
    Array.prototype.forEach.call(document.querySelectorAll('#boardView button'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-v') === settings.boardView ? 'true' : 'false');
    });
    popHide();
  }

  var popTimer = null;
  function popShow(row, b) {
    clearTimeout(popTimer);
    if (settings.boardView === 'grid') return;
    popTimer = setTimeout(function () {
      var url = S.thumbs[thumbKey(b.id)];
      if (!url) return;
      var pop = $('thumbPop');
      pop.querySelector('img').src = url;
      pop.querySelector('.cap').textContent = b.name + ' · ' + Math.round(b.w) + '×' + Math.round(b.h);
      pop.hidden = false;
      var r = row.getBoundingClientRect(), ph = pop.offsetHeight, pw = pop.offsetWidth;
      var top = r.bottom + 4;
      if (top + ph > window.innerHeight - 4) top = Math.max(4, r.top - ph - 4);
      pop.style.top = top + 'px';
      pop.style.left = Math.max(4, Math.min(window.innerWidth - pw - 4, r.left + 60)) + 'px';
    }, 350);
  }
  function popHide() { clearTimeout(popTimer); var p = $('thumbPop'); if (p) p.hidden = true; }
  function boardInputs() { return Array.prototype.slice.call(document.querySelectorAll('#boards input')); }
  function selectedBoards() { return boardInputs().filter(function (i) { return i.checked; }).map(function (i) { return i.value; }); }
  function boardsChanged() {
    var all = boardInputs(), sel = selectedBoards();
    $('all').checked = sel.length === all.length && all.length > 0;
    $('all').indeterminate = sel.length > 0 && sel.length < all.length;
    $('sumBoards').textContent = t('sum.boards', { s: sel.length, n: all.length });
    updateBuildButton();
    refreshFonts();
  }
  function boardWord(n, acc) {
    return I18N.plural(n, acc ? ['доску', 'доски', 'досок'] : ['доска', 'доски', 'досок'], ['artboard', 'artboards']);
  }
  function updateBuildButton() {
    if (S.busy) return;
    var n = S.file ? selectedBoards().length : 0;
    $('build').disabled = !n;
    $('build').textContent = n ? t('btn.build', { n: boardWord(n, true) }) : t('btn.build.none');
  }

  function refreshFonts() {
    var ids = selectedBoards();
    S.fonts = ids.length ? P2A.fontsUsed(S.file, S.pageId, ids) : [];
    var tb = $('fonts'); tb.innerHTML = '';
    if (!S.fonts.length) {
      tb.innerHTML = '<tr><td class="hint"></td></tr>'; tb.querySelector('td').textContent = t('fonts.none');
      $('sumFonts').textContent = ''; return;
    }
    ensureHost().then(function () {
      return host('PI.setOverrides(' + lit(settings.overrides) + ')');
    }).then(function () {
      return host('PI.resolveFonts(' + lit(S.fonts) + ')');
    }).then(function (r) {
      var map = {};
      if (r && r.indexOf('OK:') === 0) { try { map = JSON.parse(r.slice(3)); } catch (e) {} }
      S.resolved = map;
      renderFonts();
    });
  }
  function renderFonts() {
    var tb = $('fonts'), map = S.resolved, missing = 0;
    tb.innerHTML = '';
    S.fonts.forEach(function (f) {
      var tr_ = document.createElement('tr');
      var found = map[f.key];
      if (!found) missing++;
      tr_.innerHTML = '<td class="st"></td><td class="fn"></td><td><input type="text" spellcheck="false"></td>';
      var st = tr_.children[0];
      st.textContent = found ? '✓' : '!';
      st.className = 'st ' + (found ? 'ok' : 'warn');
      st.title = found ? t('fonts.found') : t(settings.autoFonts ? 'fonts.willDownload' : 'fonts.willReplace');
      tr_.children[1].textContent = f.family + ' ' + f.weight + (f.italic ? ' italic' : '');
      tr_.children[1].title = tr_.children[1].textContent;
      var inp = tr_.querySelector('input');
      inp.value = settings.overrides[f.key] || found || '';
      inp.title = inp.value;
      inp.placeholder = t('fonts.ph');
      inp.setAttribute('aria-label', f.family + ' ' + f.weight + ' — ' + t('fonts.ph'));
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        if (v && v !== found) settings.overrides[f.key] = v; else delete settings.overrides[f.key];
        save(); refreshFonts();
      });
      tb.appendChild(tr_);
    });
    var sum = $('sumFonts');
    sum.textContent = missing ? t('sum.fontsMissing', { n: missing }) : t('sum.fontsOk');
    sum.className = 'sum ' + (missing ? 'warn' : 'ok');

    if (missing && !settings.open.hasOwnProperty('secFonts')) setOpen($('secFonts'), true, false);
  }
  function resolveNow() {
    return host('PI.resetFonts()').then(function () { return host('PI.resolveFonts(' + lit(S.fonts) + ')'); }).then(function (r) {
      var map = {};
      if (r && r.indexOf('OK:') === 0) { try { map = JSON.parse(r.slice(3)); } catch (e) {} }
      S.resolved = map;
      return map;
    });
  }

  function fontsDir() {
    if (process.platform === 'win32') return pathM.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts');
    if (process.platform === 'darwin') return pathM.join(os.homedir(), 'Library', 'Fonts');
    return pathM.join(os.homedir(), '.local', 'share', 'fonts');
  }
  function regAdd(name, file) {
    return new Promise(function (res) {
      if (process.platform !== 'win32') { res(); return; }
      require('child_process').execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        '/v', name + ' (TrueType)', '/t', 'REG_SZ', '/d', file, '/f'], function () { res(); });
    });
  }
  function regDel(name) {
    if (process.platform === 'win32') require('child_process').execFile('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', name + ' (TrueType)', '/f'], function () {});
  }
  var WNAME = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  function faceFileName(fam, weight, italic) {
    var w = WNAME[weight] || String(weight);
    if (italic) w = (w === 'Regular' ? '' : w) + 'Italic';
    return fam.replace(/[^\w]+/g, '') + '-' + w + '.ttf';
  }
  function userFontFile(name) { return pathM.join(fontsDir(), name); }
  function sysFontFile(name) { return pathM.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', name); }
  function isFontFile(file) {
    try {
      var fd = fs.openSync(file, 'r'), b = Buffer.alloc(4);
      fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
      var sig = b.readUInt32BE(0);
      return sig === 0x00010000 || sig === 0x74727565 || sig === 0x4F54544F;
    } catch (e) { return false; }
  }

  function fontInstalled(name) {
    var files = [userFontFile(name)];
    if (process.platform === 'win32') files.push(sysFontFile(name));
    for (var i = 0; i < files.length; i++) {
      if (!fs.existsSync(files[i])) continue;
      if (isFontFile(files[i])) return true;
      try { fs.unlinkSync(files[i]); log(tr('Удалён повреждённый файл шрифта: {n}', 'Removed a corrupted font file: {n}', { n: name }), 'warn'); } catch (e) {}
      regDel(name.replace(/\.ttf$/, ''));
    }
    return false;
  }

  function osInstall(tmpFile, name) {
    return new Promise(function (res) {
      if (process.platform !== 'win32') {
        try { fs.mkdirSync(fontsDir(), { recursive: true }); fs.copyFileSync(tmpFile, userFontFile(name)); } catch (e) {}
        res(); return;
      }
      var ps = "$sh = New-Object -ComObject Shell.Application; $sh.Namespace(0x14).CopyHere('" + tmpFile.replace(/'/g, "''") + "', 0x414); Start-Sleep -Milliseconds 1500";
      require('child_process').execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true }, function () {
        if (fontInstalled(name)) { res(); return; }
        try {
          fs.mkdirSync(fontsDir(), { recursive: true });
          fs.copyFileSync(tmpFile, userFontFile(name));
          regAdd(name.replace(/\.ttf$/, ''), userFontFile(name)).then(res);
        } catch (e) { res(); }
      });
    });
  }

  function googleFace(family, weight, italic) {
    var url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') +
      ':ital,wght@' + (italic ? '1,' : '0,') + weight;
    var w = weight + (italic ? ' italic' : '');
    return request(url, { headers: {} }).then(function (r) {
      var css = r.buf.toString('utf8');
      var m = css.match(/url\(([^)]+)\)\s*format\(['"]?(truetype|opentype)['"]?\)/) || css.match(/url\(([^)]+\.(?:ttf|otf))\)/);
      if (!m) throw new Error(tr('нет файла для {w}', 'no file for {w}', { w: w }));
      return m[1].replace(/['"]/g, '');
    }, function (e) {
      if (/HTTP 400/.test(e.message)) throw new Error(tr('нет в Google Fonts (или нет начертания {w})', 'not on Google Fonts (or no {w} style)', { w: w }));
      throw e;
    });
  }
  function installFonts(list) {
    if (!hasNode) return Promise.resolve({ installed: 0, existed: 0, failed: ['Node.js'] });
    var installed = 0, existed = 0, failed = [];
    status(tr('Скачиваю недостающие шрифты из Google Fonts…', 'Downloading missing fonts from Google Fonts…'));
    list.forEach(function (f) {
      var old = f.family.replace(/[^\w ]+/g, '') + ' ' + f.weight + (f.italic ? ' Italic' : '');
      var of = userFontFile(old.replace(/ /g, '-') + '.ttf');
      if (fs.existsSync(of)) { try { fs.unlinkSync(of); } catch (e) {} regDel(old); }
    });
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () {
        var name = faceFileName(f.family, f.weight, f.italic);
        var label = f.family + ' ' + f.weight + (f.italic ? ' italic' : '');
        if (fontInstalled(name)) { existed++; return; }
        return googleFace(f.family, f.weight, f.italic).then(function (url) {
          return request(url, { headers: {} });
        }).then(function (r) {
          var sig = r.buf.length > 4 ? r.buf.readUInt32BE(0) : 0;
          if (sig !== 0x00010000 && sig !== 0x74727565 && sig !== 0x4F54544F) throw new Error(tr('скачан не шрифт TTF/OTF', 'downloaded file is not a TTF/OTF font'));
          var tmp = pathM.join(tmpDir(), name);
          fs.writeFileSync(tmp, r.buf);
          return osInstall(tmp, name).then(function () {
            if (fontInstalled(name)) { installed++; log(tr('Установлен шрифт: {n}', 'Font installed: {n}', { n: label }), 'ok'); }
            else { failed.push(f.family + ': -'); log('✕ ' + label + ': ' + tr('не удалось установить файл', 'could not install the file'), 'err'); }
          });
        }).catch(function (e) { failed.push(f.family + ': ' + e.message); log('✕ ' + label + ': ' + e.message, 'err'); });
      });
    });
    return chain.then(function () { return { installed: installed, existed: existed, failed: failed }; });
  }

  function prepareFonts() {
    var missing = S.fonts.filter(function (f) { return !S.resolved[f.key]; });
    if (!missing.length || !settings.autoFonts) return Promise.resolve(true);
    return installFonts(missing).then(function (res) {
      return resolveNow().then(function (map) {
        renderFonts();
        var still = missing.filter(function (f) { return !map[f.key]; });
        var failedFam = {};
        res.failed.forEach(function (m) { failedFam[m.split(':')[0]] = true; });
        var waitRestart = still.filter(function (f) { return !failedFam[f.family]; });
        var asked = res.installed > 0 ? {} : (settings.fontRestartAsked || {});
        var fresh = waitRestart.filter(function (f) { return !asked[f.key]; });
        if (waitRestart.length && !fresh.length) {
          log(tr('Illustrator не видит шрифты даже после перезапуска: {l}. Они будут заменены — установите их вручную «для всех пользователей».',
                 'Illustrator does not see these fonts even after a restart: {l}. They will be replaced — install them manually “for all users”.',
                 { l: waitRestart.map(function (f) { return f.family + ' ' + f.weight; }).join(', ') }), 'warn');
          settings.fontRestartAsked = {}; save();
          return true;
        }
        if (waitRestart.length) {
          waitRestart.forEach(function (f) { asked[f.key] = true; });
          settings.fontRestartAsked = asked; save();
          status(tr('Шрифты установлены ({n}). Перезапустите Illustrator и нажмите «Собрать» ещё раз.',
                    'Fonts installed ({n}). Restart Illustrator and press “Build” again.', { n: res.installed + res.existed }), 'warn');
          return false;
        }
        settings.fontRestartAsked = {}; save();
        if (res.failed.length) log(tr('Не получены из Google Fonts — будут заменены: {l}', 'Not available on Google Fonts — will be replaced: {l}', { l: res.failed.join('; ') }), 'warn');
        return true;
      });
    });
  }

  var mediaCache = {};
  function tmpDir() {
    var d = pathM.join(os.tmpdir(), 'penpot2ai');
    if (!fs.existsSync(d)) fs.mkdirSync(d);
    return d;
  }
  function toPng(buf, mime) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        if (/svg/.test(mime)) { c.width *= 2; c.height *= 2; }
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64'));
      };
      img.onerror = function () { reject(new Error(tr('не удалось декодировать {m}', 'could not decode {m}', { m: mime }))); };
      img.src = 'data:' + mime + ';base64,' + buf.toString('base64');
    });
  }
  function fetchMedia(m) {
    if (mediaCache[m.id]) return Promise.resolve(mediaCache[m.id]);
    var url = serverUrl() + '/assets/by-file-media-id/' + m.id;
    return request(url, { headers: authHeaders(false) }).then(function (r) {
      var mime = (m.mtype || r.type || '').split(';')[0];
      var direct = /image\/(png|jpe?g|gif|tiff?)/.test(mime);
      var p = direct ? Promise.resolve({ buf: r.buf, ext: mime.indexOf('png') >= 0 ? 'png' : (mime.indexOf('gif') >= 0 ? 'gif' : 'jpg') })
                     : toPng(r.buf, mime).then(function (b) { return { buf: b, ext: 'png' }; });
      return p.then(function (o) {
        var f = pathM.join(tmpDir(), m.id + '.' + o.ext);
        fs.writeFileSync(f, o.buf);
        mediaCache[m.id] = f.replace(/\\/g, '/');
        return mediaCache[m.id];
      });
    });
  }
  function attachMedia(node, map) {
    if (node.kind === 'image' && map[node.mediaId]) node.file = map[node.mediaId];
    if (node.kind === 'svg' && node.markup) {
      var f = pathM.join(tmpDir(), 'svg_' + (node.id || Math.random().toString(36).slice(2)) + '.svg');
      fs.writeFileSync(f, node.markup, 'utf8');
      node.file = f.replace(/\\/g, '/');
      delete node.markup;
    }
    (node.children || []).forEach(function (c) { attachMedia(c, map); });
  }

  function placements(ids, limit) {
    var sel = S.boards.filter(function (b) { return ids.indexOf(b.id) >= 0; });
    var minX = Math.min.apply(null, sel.map(function (b) { return b.x; }));
    var minY = Math.min.apply(null, sel.map(function (b) { return b.y; }));
    var maxX = Math.max.apply(null, sel.map(function (b) { return b.x + b.w; }));
    var maxY = Math.max.apply(null, sel.map(function (b) { return b.y + b.h; }));
    if (maxX - minX > limit || maxY - minY > limit) return null;
    var out = { pos: {}, w: maxX - minX, h: maxY - minY };
    sel.forEach(function (b) { out.pos[b.id] = { x: b.x - minX, y: b.y - minY }; });
    return out;
  }

  function setBusy(b) {
    S.busy = b;
    $('build').disabled = b;
    if (!b) { updateBuildButton(); progress(0, 0); }
  }
  function buildAll() {
    var ids = selectedBoards();
    if (!ids.length) { status(tr('Не выбрано ни одной доски', 'No boards selected'), 'err'); return; }
    setBusy(true);
    clearLog(); setLogOpen(false);
    var first = S.boards.filter(function (b) { return b.id === ids[0]; })[0];
    var t0 = Date.now(), done = 0, warnTotal = 0;
    var place = settings.layout === 'penpot' ? placements(ids, settings.target === 'new' ? 15000 : 7500) : null;
    if (settings.layout === 'penpot' && !place)
      log(settings.target === 'new'
        ? tr('Доски разнесены шире 15 000 pt — это больше холста Illustrator, раскладываю сеткой', 'Boards span more than 15,000 pt — larger than the Illustrator canvas, arranging in a grid')
        : tr('Доски разнесены шире 7500 pt — в текущем документе раскладываю сеткой (в новом документе поместится до 15 000 pt)', 'Boards span more than 7,500 pt — arranging in a grid in the current document (a new document fits up to 15,000 pt)'), 'warn');
    status(tr('Подготовка документа…', 'Preparing the document…'));
    $('build').textContent = t('btn.building', { i: 0, n: ids.length });
    progress(0.02, 1);
    ensureHost().then(function () {
      return prepareFonts();
    }).then(function (go) {
      if (!go) throw { silent: true };
    }).then(function () {
      return host('PI.embedImages=' + (settings.embed ? 'true' : 'false') + ';PI.begin(' + lit({
        newDoc: settings.target === 'new', w: first.w, h: first.h, layout: place ? 'penpot' : 'grid', rasterPpi: 300,
        extent: place ? { w: place.w, h: place.h } : null,
        layerName: 'Penpot · ' + S.fileName, overrides: settings.overrides
      }) + ')');
    }).then(function (r) {
      if (r.indexOf('OK:') !== 0) throw new Error(r.replace(/^ERR:/, ''));
      var chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          P2A.lang = I18N.lang;
          var conv = P2A.convert(S.file, S.pageId, id, { hidden: settings.keepHidden ? 'keep' : 'skip' });
          status(tr('Доска {i} из {n}: {b}', 'Board {i} of {n}: {b}', { i: done + 1, n: ids.length, b: conv.board.name }));
          $('build').textContent = t('btn.building', { i: done + 1, n: ids.length });
          var map = {};
          var dl = conv.media.map(function (m) {
            return fetchMedia(m).then(function (f) { map[m.id] = f; })
              .catch(function (e) { log(tr('Картинка {id}: {e}', 'Image {id}: {e}', { id: m.id, e: e.message }), 'warn'); });
          });
          return Promise.all(dl).then(function () {
            attachMedia(conv.tree, map);
            conv.warnings.forEach(function (w) { log(conv.board.name + ': ' + w, 'warn'); warnTotal++; });
            return host('PI.board(' + lit({ board: conv.board, tree: conv.tree, place: place ? place.pos[id] : null, guides: settings.guides }) + ')');
          }).then(function (res) {
            if (res.indexOf('OK:') === 0) log('✓ ' + res.slice(3), 'ok');
            else log('✕ ' + conv.board.name + ': ' + res.replace(/^ERR:/, ''), 'err');
            return host('PI.takeLog()');
          }).then(function (hl) {
            if (hl) hl.split('\n').forEach(function (l) { if (l) { log('  ' + l, 'warn'); warnTotal++; } });
            done++;
            progress(done, ids.length);
          });
        });
      });
      return chain;
    }).then(function () {
      var msg = tr('Готово: {b} за {s} с', 'Done: {b} in {s} s', { b: boardWord(done, false), s: ((Date.now() - t0) / 1000).toFixed(0) });
      if (warnTotal) msg += tr(', замечаний: {w}', ', notes: {w}', { w: warnTotal });
      status(msg, warnTotal ? 'warn' : 'ok');
      if (S.counts.warn || S.counts.err) setLogOpen(true);
    }).catch(function (e) {
      if (!e || !e.silent) { status(tr('Ошибка: {e}', 'Error: {e}', { e: e && e.message }), 'err'); setLogOpen(true); }
    }).then(function () { setBusy(false); });
  }

  function hex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function shade(c, k) { return c.map(function (v) { return k >= 0 ? v + (255 - v) * k : v * (1 + k); }); }
  function lum(c) { var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function mix(a, b, k) { return a.map(function (v, i) { return v + (b[i] - v) * k; }); }
  function applyTheme() {
    var bg = [50, 50, 50];
    try {
      var c = JSON.parse(cep.getHostEnvironment()).appSkinInfo.panelBackgroundColor.color;
      bg = [c.red, c.green, c.blue];
    } catch (e) {}
    var dark = lum(bg) < 0.25;
    var fg = dark ? [232, 232, 232] : [27, 27, 27];
    var k = 0.42, muted = mix(fg, bg, k);
    while (contrast(muted, bg) < 4.6 && k > 0.05) { k -= 0.04; muted = mix(fg, bg, k); }
    var v = {
      '--bg': hex(bg), '--fg': hex(fg), '--muted': hex(muted),
      '--field': hex(dark ? shade(bg, -0.28) : shade(bg, 0.7)),
      '--field-bd': hex(dark ? shade(bg, 0.14) : shade(bg, -0.2)),
      '--hover': hex(dark ? shade(bg, 0.06) : shade(bg, -0.06)),
      '--sep': hex(dark ? shade(bg, -0.24) : shade(bg, -0.11)),
      '--chip': hex(dark ? shade(bg, 0.1) : shade(bg, -0.08)),
      '--foot': hex(dark ? shade(bg, -0.1) : shade(bg, -0.035)),
      '--acc': dark ? '#378ef0' : '#1473e6', '--acc-h': dark ? '#5aa6ff' : '#0d66d0', '--focus': dark ? '#5aa6ff' : '#1473e6',
      '--ok': dark ? '#5fbf7a' : '#2d8a4e', '--warn': dark ? '#e8b54a' : '#a36a00', '--err': dark ? '#f26b6b' : '#c9252d'
    };
    for (var key in v) document.documentElement.style.setProperty(key, v[key]);
  }

  function setLang(l, persist) {
    I18N.setLang(l);
    Array.prototype.forEach.call(document.querySelectorAll('#lang button'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-v') === l ? 'true' : 'false');
    });
    if (persist) { settings.lang = l; save(); }
    P2A.lang = l;
    host('typeof PI!=="undefined"&&(PI.lang="' + l + '")');
    setConn(settings.connOk);
    updateBuildButton();
    if (S.file) { $('sumBoards').textContent = t('sum.boards', { s: selectedBoards().length, n: boardInputs().length }); renderFonts(); }
    updateOptionsSum();
    if (S.projects) renderFiles();
  }
  function detectLang() {
    if (settings.lang) return settings.lang;
    try { var loc = JSON.parse(cep.getHostEnvironment()).appUILocale || ''; return /^ru/i.test(loc) ? 'ru' : 'en'; }
    catch (e) { return /^ru/i.test(navigator.language || 'ru') ? 'ru' : 'en'; }
  }

  function setTarget(v) {
    settings.target = v; save();
    Array.prototype.forEach.call(document.querySelectorAll('#target button'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-v') === v ? 'true' : 'false');
    });
    updateOptionsSum();
  }
  function updateOptionsSum() { $('sumOptions').textContent = t(settings.target === 'new' ? 'opt.new' : 'opt.current'); }

  function segKeys(group, onPick) {
    group.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var bs = Array.prototype.slice.call(group.querySelectorAll('button'));
      var i = bs.indexOf(document.activeElement); if (i < 0) return;
      var n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      n.focus(); onPick(n.getAttribute('data-v')); e.preventDefault();
    });
  }

  function openUrl(url) {
    try { if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) { window.cep.util.openURLInDefaultBrowser(url); return; } } catch (e) {}
    if (hasNode) {
      var cp = require('child_process');
      if (process.platform === 'win32') cp.exec('start "" "' + url + '"'); else cp.exec((process.platform === 'darwin' ? 'open ' : 'xdg-open ') + '"' + url + '"');
    } else window.open(url, '_blank');
  }

  function init() {
    applyTheme();
    if (cep) { try { cep.addEventListener('com.adobe.csxs.events.ThemeColorChanged', applyTheme); } catch (e) {} }
    setLang(detectLang(), false);
    initSections();
    if (!hasNode) status(tr('Node.js недоступен в панели — проверьте manifest (--enable-nodejs)', 'Node.js is not available — check the manifest (--enable-nodejs)'), 'err');

    $('server').value = settings.server; $('token').value = settings.token; $('link').value = settings.link;
    $('keepHidden').checked = settings.keepHidden; $('embed').checked = settings.embed; $('guides').checked = settings.guides;
    $('autoFonts').checked = settings.autoFonts; $('layout').value = settings.layout;
    setTarget(settings.target); setConn(settings.connOk);
    if (!settings.token) toggleConn(true);

    Array.prototype.forEach.call(document.querySelectorAll('#srcMode button'), function (b) {
      b.addEventListener('click', function () { setSrcMode(b.getAttribute('data-v')); });
    });
    segKeys($('srcMode'), setSrcMode);
    $('team').addEventListener('change', function () { settings.teamId = this.value; save(); loadTeamFiles(); });
    $('fileFilter').addEventListener('input', renderFiles);
    $('refreshFiles').addEventListener('click', function () { S.projects = null; loadProjects(); });

    $('link').addEventListener('change', function () {
      settings.link = $('link').value.trim();
      var i = P2A.parseLink(settings.link);
      if (i.server) { settings.server = i.server; $('server').value = i.server; }
      save();
    });
    $('link').addEventListener('keydown', function (e) { if (e.key === 'Enter') { settings.link = $('link').value.trim(); save(); loadFromApi(); } });
    $('loadApi').addEventListener('click', function () { settings.link = $('link').value.trim(); save(); loadFromApi(); });
    $('jsonFile').addEventListener('change', function () { if (this.files[0]) loadFromFile(this.files[0]); this.value = ''; });

    $('connToggle').addEventListener('click', function () { toggleConn(); });
    $('server').addEventListener('change', function () { settings.server = $('server').value.trim(); setConn(null); });
    $('token').addEventListener('change', function () {
      settings.token = $('token').value.trim(); setConn(null);
      if (settings.token && settings.srcMode === 'browse') { S.projects = null; loadProjects(); }
    });
    $('showToken').addEventListener('click', function () { $('token').type = $('token').type === 'password' ? 'text' : 'password'; });
    $('check').addEventListener('click', function () {
      status(tr('Проверяю…', 'Testing…'));
      request(serverUrl() + '/api/rpc/command/get-profile', { headers: authHeaders(true) })
        .then(function (r) { var p = JSON.parse(r.buf.toString('utf8')); setConn(true); status(tr('Подключено: {w}', 'Connected: {w}', { w: p.fullname || p.email || 'ok' }), 'ok'); if (settings.srcMode === 'browse') loadProjects(); })
        .catch(function (e) { setConn(false); status(tr('Нет доступа: {e}', 'No access: {e}', { e: e.message }), 'err'); });
    });

    $('page').addEventListener('change', loadBoards);
    Array.prototype.forEach.call(document.querySelectorAll('#boardView button'), function (b) {
      b.addEventListener('click', function () { setBoardView(b.getAttribute('data-v')); });
    });
    segKeys($('boardView'), setBoardView);
    setBoardView(settings.boardView);
    $('scroll').addEventListener('scroll', popHide);
    $('boards').parentNode.addEventListener('scroll', popHide);
    $('all').addEventListener('change', function () {
      var on = this.checked;
      boardInputs().forEach(function (b) { if (!b.closest('.board').hidden) { b.checked = on; b.closest('.board').classList.toggle('on', on); } });
      boardsChanged();
    });
    $('filter').addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      Array.prototype.forEach.call(document.querySelectorAll('#boards .board'), function (l) {
        l.hidden = q && l.querySelector('.nm').textContent.toLowerCase().indexOf(q) < 0;
      });
    });

    $('autoFonts').addEventListener('change', function () { settings.autoFonts = this.checked; save(); renderFonts(); });
    Array.prototype.forEach.call(document.querySelectorAll('#target button'), function (b) {
      b.addEventListener('click', function () { setTarget(b.getAttribute('data-v')); });
    });
    segKeys($('target'), setTarget);
    $('layout').addEventListener('change', function () { settings.layout = this.value; save(); });
    $('keepHidden').addEventListener('change', function () { settings.keepHidden = this.checked; save(); });
    $('guides').addEventListener('change', function () { settings.guides = this.checked; save(); });
    $('embed').addEventListener('change', function () { settings.embed = this.checked; save(); });

    $('build').addEventListener('click', buildAll);
    $('logToggle').addEventListener('click', function () { setLogOpen($('log').hidden); });

    Array.prototype.forEach.call(document.querySelectorAll('#lang button'), function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-v'), true); });
    });
    segKeys($('lang'), function (v) { setLang(v, true); });
    $('coffee').addEventListener('click', function () { openUrl(DONATE_URL); });
    setSrcMode(settings.token ? (settings.srcMode || 'browse') : 'link');
    updateBuildButton();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
