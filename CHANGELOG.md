# Changelog

## 0.8.0
- Библиотека файла: цвета Penpot → глобальные образцы Illustrator (группа «Penpot · файл»), градиенты → градиентные образцы, типографика → стили абзаца и символа. Объекты и тексты с цветом из библиотеки связаны с образцом; абзацу назначается стиль его преобладающей типографики, остальным кускам текста — стили символа. Из подключённых библиотек берётся только то, что использовано на досках. Опция «Цвета → образцы, типографика → стили». / File library: Penpot colors → global Illustrator swatches (a “Penpot · file” group), gradients → gradient swatches, typography → paragraph and character styles. Objects and text using a library color are linked to the swatch, text using a typography is linked to the style. From linked libraries only what the boards use is taken. Option “Colors → swatches, typography → styles”.
- Привязка к Penpot: в «Примечание» каждого объекта записывается `p2a:id=…;file=…;page=…` (у доски ещё ревизия файла). Привязка переживает копирование и группировку — основа будущей синхронизации. / Link to Penpot: each object’s Note holds `p2a:id=…;file=…;page=…` (boards also store the file revision). It survives copying and grouping — the basis for future sync.
- Предупреждение про svg-raw выводится один раз на сборку, со списком досок. / The svg-raw notice is shown once per build, listing the boards.
- Исправлено: много досок не помещались на холст Illustrator (ошибка `AOoC`). Панель теперь сама находит границы холста (первая монтажная область нового документа стоит не в его центре), раскладывает доски колонками — доски разной высоты ложатся плотно — и центрирует раскладку; если доска всё же не помещается, остальные продолжают собираться. / Fixed: many boards did not fit on the Illustrator canvas (`AOoC` error). The panel now finds the canvas bounds itself (the first artboard of a new document is not at its centre), lays boards out in columns so boards of different heights pack tightly, and centres the layout; if a board still does not fit, the rest keep building.
- В подвале панели показывается версия; имя автора и кнопка Boosty отодвинуты от уголка изменения размера, чашка крупнее. / The panel footer shows the version; the author name and the Boosty button moved away from the resize corner, the cup is larger.
- Текст в области больше не обрезается: если у текста в Penpot неверная высота, рамка в Illustrator увеличивается, в журнале — замечание. / Area text is no longer cut off: if a Penpot text has a wrong height, the Illustrator frame is enlarged and the log says so.

## 0.7.0
- Миниатюры досок в панели: превью от Penpot, а если его нет (или файл открыт из JSON) — упрощённая отрисовка самой панелью. Переключатель «список / плитки»; в списке при наведении — крупное превью. / Board thumbnails in the panel: Penpot's own previews, or a simplified rendering by the panel when there is none (or the file was opened from JSON). “List / tiles” switch; hovering a row in the list shows a large preview.
- Раскладка «как на холсте Penpot» в новом документе — до 15 000 pt (было 7500), доски центрируются на холсте Illustrator. / “As on the Penpot canvas” layout in a new document now fits up to 15,000 pt (was 7,500), centred on the Illustrator canvas.

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
