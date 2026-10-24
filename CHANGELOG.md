# Changelog

## 0.6.3
- Размытие фона (background blur, Penpot 2.17+): под объектом строится обтравленная группа «Размытие фона» с размытой копией того, что лежит под ним. / Background blur (Penpot 2.17+): a clipped “Background blur” group with a blurred copy of the content behind the object.
- Большие тени и размытия больше не обрезаются: запас растровых эффектов документа поднимается под самое большое размытие. / Large shadows and blurs are no longer clipped: the document raster effect padding grows to fit the largest blur.
- Маски из составных контуров строятся надёжно (без ошибки NEST). / Masks from compound paths are built reliably (no NEST error).
- Папка панели переименована в `penpot2illustrator`; установщики удаляют старую `ru.splat.penpot2ai`. / Panel folder renamed to `penpot2illustrator`; installers remove the old `ru.splat.penpot2ai`.

## 0.6.2
- Публичная версия: код очищен, установщик для macOS (`install.command`), сервер по умолчанию — design.penpot.app.
- Public release: cleaned code, macOS installer (`install.command`), default server is design.penpot.app.

## 0.6
- Выбор проекта и файла Penpot прямо в панели. / Pick a Penpot project and file right in the panel.
- Кнопка поддержки автора (Boosty), иконка панели «Перо-P». / Support button (Boosty), “Quill-P” panel icon.

## 0.5
- Новый интерфейс в стиле Illustrator, 4 темы, русский и английский. / New Illustrator-style UI, 4 themes, RU/EN.

## 0.4
- Автоматическая установка недостающих шрифтов из Google Fonts. / Automatic installation of missing Google Fonts.
- Порядок слоёв в досках с авторасстановкой как в Penpot. / Z-order in auto-layout boards matches Penpot.
- Проверка устаревших данных раскладки текста. / Detection of stale text layout data.

## 0.3
- Тени, размытие, режимы наложения, трансформации, несколько и градиентные обводки, наконечники линий, сетки → направляющие.
- Shadows, blur, blend modes, transforms, multiple and gradient strokes, line-end markers, grids → guides.

## 0.1–0.2
- Первая версия: доски, фигуры, контуры, тексты абзацами, картинки, шрифты.
- First version: boards, shapes, paths, paragraph text, images, fonts.
