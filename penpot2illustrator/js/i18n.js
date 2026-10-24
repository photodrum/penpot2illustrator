(function (root) {
  'use strict';
  var D = {
    ru: {
      'sec.source': 'Файл Penpot', 'sec.boards': 'Доски', 'sec.fonts': 'Шрифты', 'sec.options': 'Параметры сборки',
      'ph.link': 'Ссылка на файл из адресной строки Penpot', 'btn.load': 'Загрузить', 'btn.openJson': 'Открыть JSON…',
      'btn.conn': 'Подключение', 'ph.token': 'Токен доступа', 'btn.showToken': 'Показать токен', 'btn.check': 'Проверить',
      'hint.token': 'Токен: Penpot → Ваш аккаунт → Токены доступа',
      'lbl.page': 'Страница', 'ph.filter': 'Найти доску', 'selectAll': 'Выбрать все',
      'fonts.auto': 'Недостающие шрифты скачивать из Google Fonts', 'fonts.none': 'На выбранных досках нет текста',
      'fonts.ph': 'PostScript-имя', 'fonts.found': 'Шрифт найден',
      'fonts.willDownload': 'Нет в системе — скачается из Google Fonts при сборке',
      'fonts.willReplace': 'Нет в системе — будет заменён шрифтом по умолчанию',
      'opt.new': 'Новый документ', 'opt.current': 'Текущий документ', 'opt.layout': 'Расположение',
      'opt.layout.penpot': 'Как на холсте Penpot', 'opt.layout.grid': 'Сеткой',
      'opt.hidden': 'Переносить скрытые слои (скрытыми)', 'opt.guides': 'Модульные сетки → направляющие', 'opt.embed': 'Встраивать картинки',
      'hint.start': 'Выберите файл Penpot в списке, вставьте ссылку или откройте JSON-файл.',
      'btn.build.none': 'Выберите доски', 'btn.build': 'Собрать {n}', 'btn.building': 'Сборка… {i} из {n}',
      'log.title': 'Журнал', 'footer.lang': 'Язык интерфейса', 'footer.donate': 'Угостить автора кофе — Boosty',
      'sum.boards': '{s} из {n}', 'sum.fontsOk': '✓ все найдены', 'sum.fontsMissing': '! не хватает: {n}',
      'conn.ok': 'Подключено', 'conn.err': 'Нет подключения', 'conn.unknown': 'Подключение не проверено',
      'src.browse': 'Проекты', 'src.link': 'Ссылка', 'lbl.team': 'Команда', 'ph.fileFilter': 'Найти файл', 'btn.refresh': 'Обновить список',
      'files.loading': 'Загружаю список проектов…', 'files.needToken': 'Чтобы видеть проекты, укажите токен доступа в «Подключении».',
      'files.none': 'Файлы не найдены', 'files.drafts': 'Черновики', 'files.error': 'Не удалось получить проекты: {e}',
      'when.now': 'только что', 'when.min': '{n} мин назад', 'when.hour': '{n} ч назад', 'when.day': '{n} дн назад',
      'view.title': 'Вид списка досок', 'view.list': 'Список', 'view.grid': 'Плитки'
    },
    en: {
      'sec.source': 'Penpot file', 'sec.boards': 'Boards', 'sec.fonts': 'Fonts', 'sec.options': 'Build options',
      'ph.link': 'File link from the Penpot address bar', 'btn.load': 'Load', 'btn.openJson': 'Open JSON…',
      'btn.conn': 'Connection', 'ph.token': 'Access token', 'btn.showToken': 'Show token', 'btn.check': 'Test',
      'hint.token': 'Token: Penpot → Your account → Access tokens',
      'lbl.page': 'Page', 'ph.filter': 'Find a board', 'selectAll': 'Select all',
      'fonts.auto': 'Download missing fonts from Google Fonts', 'fonts.none': 'No text on the selected boards',
      'fonts.ph': 'PostScript name', 'fonts.found': 'Font found',
      'fonts.willDownload': 'Not installed — will be downloaded from Google Fonts on build',
      'fonts.willReplace': 'Not installed — will be replaced with the default font',
      'opt.new': 'New document', 'opt.current': 'Current document', 'opt.layout': 'Layout',
      'opt.layout.penpot': 'As on the Penpot canvas', 'opt.layout.grid': 'Grid',
      'opt.hidden': 'Keep hidden layers (hidden)', 'opt.guides': 'Layout grids → guides', 'opt.embed': 'Embed images',
      'hint.start': 'Pick a Penpot file from the list, paste a link or open a JSON file.',
      'btn.build.none': 'Select boards', 'btn.build': 'Build {n}', 'btn.building': 'Building… {i} of {n}',
      'log.title': 'Log', 'footer.lang': 'Interface language', 'footer.donate': 'Buy the author a coffee — Boosty',
      'sum.boards': '{s} of {n}', 'sum.fontsOk': '✓ all found', 'sum.fontsMissing': '! missing: {n}',
      'conn.ok': 'Connected', 'conn.err': 'Not connected', 'conn.unknown': 'Connection not tested',
      'src.browse': 'Projects', 'src.link': 'Link', 'lbl.team': 'Team', 'ph.fileFilter': 'Find a file', 'btn.refresh': 'Refresh list',
      'files.loading': 'Loading projects…', 'files.needToken': 'Enter an access token under “Connection” to see your projects.',
      'files.none': 'No files found', 'files.drafts': 'Drafts', 'files.error': 'Could not get projects: {e}',
      'when.now': 'just now', 'when.min': '{n} min ago', 'when.hour': '{n} h ago', 'when.day': '{n} d ago',
      'view.title': 'Board list view', 'view.list': 'List', 'view.grid': 'Tiles'
    }
  };
  var lang = 'ru';

  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
  function t(key, v) { return fill((D[lang] && D[lang][key]) || D.ru[key] || key, v); }

  function tr(ru, en, v) { return fill(lang === 'en' ? en : ru, v); }

  function plural(n, ru, en) {
    if (lang === 'en') return n + ' ' + (n === 1 ? en[0] : en[1]);
    var m10 = n % 10, m100 = n % 100;
    var f = m10 === 1 && m100 !== 11 ? 0 : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2);
    return n + ' ' + ru[f];
  }
  function apply(rootEl) {
    var r = rootEl || document;
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n-ph]'), function (el) {
      var s = t(el.getAttribute('data-i18n-ph')); el.placeholder = s; el.setAttribute('aria-label', s);
    });
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n-title]'), function (el) {
      var s = t(el.getAttribute('data-i18n-title')); el.title = s; el.setAttribute('aria-label', s);
    });
    document.documentElement.lang = lang;
  }
  root.I18N = {
    t: t, tr: tr, plural: plural, apply: apply,
    get lang() { return lang; },
    setLang: function (l) { lang = D[l] ? l : 'ru'; apply(); }
  };
})(window);
