var PI = PI || {};

(function () {
    var K = 0.5522847498;

    PI.log = [];
    PI.fontCache = {};
    PI.metricCache = {};
    PI.overrides = {};
    PI.state = null;

    function parse(s) { return eval('(' + s + ')'); }
    PI.lang = PI.lang || 'ru';
    function T(ru, en) { return PI.lang === 'en' ? en : ru; }
    function L(msg) { PI.log.push(msg); }
    PI.takeLog = function () { var s = PI.log.join('\n'); PI.log = []; return s; };

    function wrap(fn) {
        return function (arg) {
            try { return fn(arg); }
            catch (e) { return 'ERR:' + e.message + (e.line ? T(' (строка ', ' (line ') + e.line + ')' : ''); }
        };
    }

    PI.begin = wrap(function (s) {
        var o = parse(s);
        PI.overrides = o.overrides || {};
        PI.fontCache = {}; PI.metricCache = {}; PI.log = [];
        var doc;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        if (o.newDoc || app.documents.length === 0) {
            doc = app.documents.add(DocumentColorSpace.RGB, o.w || 1200, o.h || 1200);
            var r0 = doc.artboards[0].artboardRect;
            PI.state = { doc: doc, reuseFirst: true, x0: r0[0], x: r0[0], y: r0[1], rowH: 0, col: 0, perRow: o.perRow || 5, gap: o.gap || 100 };
        } else {
            doc = app.activeDocument;
            var maxR = -1e9, top = 0;
            for (var i = 0; i < doc.artboards.length; i++) {
                var r = doc.artboards[i].artboardRect;
                if (r[2] > maxR) maxR = r[2];
                if (i === 0) top = r[1];
            }
            var sx = maxR + 200;
            PI.state = { doc: doc, reuseFirst: false, x0: sx, x: sx, y: top, rowH: 0, col: 0, perRow: o.perRow || 5, gap: o.gap || 100 };
        }
        PI.ppi = o.rasterPpi || 300;
        try { doc.rasterEffectSettings.resolution = PI.ppi; } catch (e) {}
        try { PI.ppi = doc.rasterEffectSettings.resolution || PI.ppi; } catch (e) {}
        PI.state.layout = o.layout || 'grid';
        PI.state.baseX = PI.state.x0; PI.state.baseY = PI.state.y;
        PI.effectsWarned = false; PI.blurCapWarned = false;
        var lay;
        try { lay = doc.layers.getByName(o.layerName); } catch (e) { lay = null; }
        if (!lay) { lay = doc.layers.add(); lay.name = o.layerName || 'Penpot'; }
        lay.locked = false; lay.visible = true;
        PI.state.layer = lay;
        return 'OK:' + doc.name;
    });

    PI.board = wrap(function (s) {
        var o = parse(s);
        var st = PI.state;
        if (!st) return 'ERR:' + T('Сначала вызовите PI.begin', 'Call PI.begin first');
        var doc = st.doc, b = o.board;
        var ox, oy;
        if (st.layout === 'penpot' && o.place) {
            ox = st.baseX + o.place.x; oy = st.baseY - o.place.y;
        } else {
            if (st.col >= st.perRow) { st.col = 0; st.x = st.x0; st.y -= st.rowH + st.gap; st.rowH = 0; }
            ox = st.x; oy = st.y;
        }
        var rect = [ox, oy, ox + b.w, oy - b.h];
        var ab;
        if (st.reuseFirst) { ab = doc.artboards[0]; ab.artboardRect = rect; st.reuseFirst = false; }
        else ab = doc.artboards.add(rect);
        try { ab.name = b.name; } catch (e) {}
        st.x += b.w + st.gap; st.col++; if (b.h > st.rowH) st.rowH = b.h;

        ensurePadding(doc, o.tree);
        var ctx = { ox: ox, oy: oy, doc: doc, name: b.name };
        var t0 = new Date().getTime();
        var item = build(st.layer, o.tree, ctx);
        if (item) try { item.name = b.name; } catch (e) {}
        if (b.guides && o.guides !== false) makeGuides(doc, b, ox, oy);
        return 'OK:' + b.name + ' — ' + ((new Date().getTime() - t0) / 1000).toFixed(1) + T(' c', ' s');
    });

    function maxEffect(n) {
        var m = 0, i;
        if (n.blur) m = Math.max(m, n.blur);
        if (n.bgBlur) m = Math.max(m, n.bgBlur);
        if (n.shadows) for (i = 0; i < n.shadows.length; i++) m = Math.max(m, n.shadows[i].blur + 2 * Math.abs(n.shadows[i].spread || 0) / 1.6);
        if (n.children) for (i = 0; i < n.children.length; i++) m = Math.max(m, maxEffect(n.children[i]));
        return m;
    }
    function ensurePadding(doc, tree) {
        var need = Math.ceil(maxEffect(tree) * 1.6) + 4;
        try {
            var res = doc.rasterEffectSettings;
            if (res.padding < need) res.padding = need;
        } catch (e) { L(T('Не удалось увеличить запас растровых эффектов: ', 'Could not enlarge raster effect padding: ') + e.message); }
    }

    function X(c, x) { return c.ox + x; }
    function Y(c, y) { return c.oy - y; }

    function build(parent, n, c) {
        var it = null;
        try {
            switch (n.kind) {
                case 'group': it = buildGroup(parent, n, c); break;
                case 'rect': case 'ellipse': case 'path': it = buildShape(parent, n, c); break;
                case 'image': it = buildImage(parent, n, c); break;
                case 'text': it = buildText(parent, n, c); break;
                case 'svg': it = buildSvg(parent, n, c); break;
                default: L('«' + n.name + '»: ' + T('неизвестный тип ', 'unknown type ') + n.kind);
            }
        } catch (e) {
            L('«' + n.name + '»: ' + T('ошибка — ', 'error — ') + e.message + (e.line ? T(' (строка ', ' (line ') + e.line + ')' : ''));
            return null;
        }
        if (!it) return null;
        try { it.name = n.name; } catch (e) {}
        if (n.rot || n.flip || n.matrix) placeTransform(it, n, c);
        if (n.bgBlur) {
            try { backdropBlur(parent, it, n, c); }
            catch (e) { L('«' + n.name + '»: ' + T('размытие фона не построено — ', 'background blur not built — ') + e.message); }
        }
        if ((n.kind === 'image' || n.kind === 'svg') && n.opacity != null && n.opacity < 1) {
            try { it.opacity = n.opacity * 100; } catch (e) {}
        }
        var top = it;
        if (n.shadows && n.shadows.length) {
            var wrapG = parent.groupItems.add();
            wrapG.name = n.name;
            it.move(wrapG, ElementPlacement.PLACEATEND);
            for (var i = 0; i < n.shadows.length; i++) {
                var sh = n.shadows[i];
                try {
                    if (sh.style === 'inner') innerShadow(wrapG, it, sh, n, c);
                    else dropShadow(wrapG, it, sh, n, c);
                } catch (e) { L('«' + n.name + '»: ' + T('тень не построена — ', 'shadow not built — ') + e.message); }
            }
            top = wrapG;
        }
        if (n.blur) effect(top, blurXML(n.blur / 2), n.name);
        if (n.blend) setBlend(top, n.blend);
        if (n.hidden) { try { top.hidden = true; } catch (e) {} }
        return top;
    }

    function applyMatrix(it, M, cx, cy, c) {
        var a = M.a, b = -M.b, cc = -M.c, d = M.d;
        var px = X(c, cx), py = Y(c, cy);
        var m = app.getIdentityMatrix();
        m.mValueA = a; m.mValueB = b; m.mValueC = cc; m.mValueD = d;
        m.mValueTX = px - (a * px + cc * py);
        m.mValueTY = py - (b * px + d * py);
        it.transform(m, true, true, true, true, 100, Transformation.DOCUMENTORIGIN);
    }

    function blurXML(sigmaPt) {
        var ppi = PI.ppi || 300;
        var r = Math.max(0.1, sigmaPt * ppi / 72 * 1.15);
        if (r > 250) {
            if (!PI.blurCapWarned) { L(T('Размытие сильнее предела Illustrator (250 px при ', 'Blur exceeds the Illustrator limit (250 px at ') + ppi + T(' ppi) — будет слабее, чем в Penpot', ' ppi) — it will look weaker than in Penpot')); PI.blurCapWarned = true; }
            r = 250;
        }
        return '<LiveEffect name="Adobe PSL Gaussian Blur"><Dict data="R blur ' + r + ' "/></LiveEffect>';
    }

    function boundsCenter(it) { var b = it.geometricBounds; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
    function placeTransform(it, n, c) {
        var px = X(c, n.cx), py = Y(c, n.cy), cb;
        if (n.matrix) { applyMatrix(it, n.matrix, n.cx, n.cy, c); return; }
        if (n.flip) {
            cb = boundsCenter(it);
            it.resize(-100, 100, true, true, true, true, 100, Transformation.CENTER);
            it.translate(2 * (px - cb[0]), 0);
        }
        if (n.rot) {
            cb = boundsCenter(it);
            it.rotate(-n.rot, true, true, true, true, Transformation.CENTER);
            var phi = -n.rot * Math.PI / 180;
            var vx = cb[0] - px, vy = cb[1] - py;
            var rx = vx * Math.cos(phi) - vy * Math.sin(phi), ry = vx * Math.sin(phi) + vy * Math.cos(phi);
            it.translate(rx - vx, ry - vy);
        }
    }
    function offsetXML(o) { return '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst ' + o + ' I jntp 2 "/></LiveEffect>'; }
    function effect(it, xml, name) {
        try { it.applyEffect(xml); return true; }
        catch (e) {
            if (!PI.effectsWarned) { L(T('Эффекты (тени/размытие) недоступны в этой версии Illustrator: ', 'Effects (shadows/blur) are not available in this Illustrator version: ') + e.message); PI.effectsWarned = true; }
            return false;
        }
    }

    var BLEND = { 'multiply': 'MULTIPLY', 'screen': 'SCREEN', 'overlay': 'OVERLAY', 'darken': 'DARKEN', 'lighten': 'LIGHTEN',
        'color-dodge': 'COLORDODGE', 'color-burn': 'COLORBURN', 'hard-light': 'HARDLIGHT', 'soft-light': 'SOFTLIGHT',
        'difference': 'DIFFERENCE', 'exclusion': 'EXCLUSION', 'hue': 'HUE', 'saturation': 'SATURATIONBLEND',
        'color': 'COLORBLEND', 'luminosity': 'LUMINOSITY' };
    function setBlend(it, mode) {
        var k = BLEND[mode];
        if (!k) { L(T('Режим наложения «', 'Blend mode “') + mode + T('» не поддерживается', '” is not supported')); return; }
        try { it.blendingMode = BlendModes[k]; } catch (e) {}
    }

    function recolor(it, col) {
        var t = it.typename;
        if (t === 'GroupItem') {
            for (var i = it.pageItems.length - 1; i >= 0; i--) recolor(it.pageItems[i], col);
        } else if (t === 'CompoundPathItem') {
            for (var j = 0; j < it.pathItems.length; j++) recolor(it.pathItems[j], col);
        } else if (t === 'PathItem') {
            if (it.clipping || it.guides) return;
            if (it.filled) it.fillColor = rgb(col);
            if (it.stroked) it.strokeColor = rgb(col);
        } else if (t === 'TextFrame') {
            var ca = it.textRange.characterAttributes;
            ca.fillColor = rgb(col);
            try { if (ca.strokeWeight > 0) ca.strokeColor = rgb(col); } catch (e) {}
        } else if (t === 'RasterItem' || t === 'PlacedItem') {
            var b = it.geometricBounds;
            var rc = it.parent.pathItems.rectangle(b[1], b[0], b[2] - b[0], b[1] - b[3]);
            rc.stroked = false; rc.fillColor = rgb(col);
            rc.move(it, ElementPlacement.PLACEBEFORE);
            it.remove();
        }
        try { if (t !== 'GroupItem') it.opacity = 100; } catch (e) {}
    }

    function dropShadow(wrapG, it, sh, n, c) {
        var d = it.duplicate(wrapG, ElementPlacement.PLACEATEND);
        recolor(d, sh.color);
        try { d.opacity = sh.opacity * 100; } catch (e) {}
        d.translate(sh.dx, -sh.dy);
        if (sh.spread) effect(d, offsetXML(sh.spread), n.name);
        if (sh.blur > 0) effect(d, blurXML(sh.blur / 2), n.name);
        d.name = 'Тень';
    }

    function shapeSource(it) {
        var t = it.typename;
        if (t === 'PathItem' || t === 'CompoundPathItem') return it;
        if (t === 'GroupItem' && it.pageItems.length) {
            for (var i = it.pageItems.length - 1; i >= 0; i--) {
                var s = shapeSource(it.pageItems[i]);
                if (s) return s;
            }
        }
        return null;
    }

    function innerShadow(wrapG, it, sh, n, c) {
        var src = shapeSource(it);
        if (!src) { L('«' + n.name + '»: ' + T('внутренняя тень для этого типа объекта не поддерживается', 'inner shadow is not supported for this object type')); return; }
        var g = wrapG.groupItems.add();
        g.name = 'Внутренняя тень';
        var b = src.geometricBounds;
        var m = Math.abs(sh.dx) + Math.abs(sh.dy) + sh.blur * 2 + Math.abs(sh.spread) + 20;
        var cp = g.compoundPathItems.add();
        var big = cp.pathItems.rectangle(b[1] + m, b[0] - m, (b[2] - b[0]) + 2 * m, (b[1] - b[3]) + 2 * m);
        var holes = [];
        if (src.typename === 'CompoundPathItem') { for (var i = 0; i < src.pathItems.length; i++) holes.push(src.pathItems[i].duplicate(cp, ElementPlacement.PLACEATEND)); }
        else holes.push(src.duplicate(cp, ElementPlacement.PLACEATEND));
        for (var j = 0; j < holes.length; j++) holes[j].translate(sh.dx, -sh.dy);
        for (var k = 0; k < cp.pathItems.length; k++) {
            var p = cp.pathItems[k];
            p.filled = true; p.fillColor = rgb(sh.color); p.stroked = false; p.evenodd = true;
        }
        if (sh.spread) effect(cp, offsetXML(sh.spread), n.name);
        if (sh.blur > 0) effect(cp, blurXML(sh.blur / 2), n.name);
        var clip = src.duplicate(g, ElementPlacement.PLACEATBEGINNING);
        clipGroup(g, clip, c.doc);
        try { g.opacity = sh.opacity * 100; } catch (e) {}
    }

    var BD_MARK = '__p2a_backdrop__', BD_NOTE = 'p2a:backdrop';
    function boxHit(b, r) { return !(b[2] < r[0] || b[0] > r[2] || b[1] < r[3] || b[3] > r[1]); }
    function isClipPath(p) {
        try {
            if (p.typename === 'PathItem') return p.clipping;
            if (p.typename === 'CompoundPathItem') return p.pathItems.length > 0 && p.pathItems[0].clipping;
        } catch (e) {}
        return false;
    }
    function itemBounds(it) {
        if (it.typename === 'GroupItem' && it.clipped) {
            for (var i = 0; i < it.pageItems.length; i++) {
                var p = it.pageItems[i];
                if (isClipPath(p)) return p.geometricBounds;
                if (p.typename === 'GroupItem' && p.clipped) return itemBounds(p);
            }
        }
        return it.visibleBounds;
    }
    function isBackdrop(it) {
        try { if (it.name === BD_MARK || it.note === BD_NOTE) return true; } catch (e) {}
        return false;
    }
    function copyBelow(src, dst, region, depth, st) {
        var items = [], i;
        for (i = 0; i < src.pageItems.length; i++) items.push(src.pageItems[i]);
        for (i = items.length - 1; i >= 0; i--) {
            var it = items[i], skip = false;
            try { skip = it.hidden || it.guides || isBackdrop(it); } catch (e) {}
            if (skip) continue;
            if (it.typename === 'GroupItem' && !it.clipped && depth < 30) {
                var plain = true;
                try { plain = it.opacity >= 99.9 && it.blendingMode === BlendModes.NORMAL; } catch (e) {}
                if (plain) { copyBelow(it, dst, region, depth + 1, st); continue; }
                var g = dst.groupItems.add();
                try { g.opacity = it.opacity; g.blendingMode = it.blendingMode; } catch (e) {}
                copyBelow(it, g, region, depth + 1, st);
                if (g.pageItems.length === 0) g.remove();
                continue;
            }
            var vb;
            try { vb = itemBounds(it); } catch (e) { continue; }
            if (!boxHit(vb, region)) continue;
            try { it.duplicate(dst, ElementPlacement.PLACEATBEGINNING); st.copied++; }
            catch (e) { st.failed.push('«' + it.name + '» (' + it.typename + '): ' + e.message); }
        }
    }
    function clipGroup(g, clip, doc) {
        if (clip.typename === 'PathItem') { g.clipped = true; return; }
        doc.selection = null;
        for (var i = 0; i < g.pageItems.length; i++) g.pageItems[i].selected = true;
        app.executeMenuCommand('makeMask');
        doc.selection = null;
    }
    function backdropBlur(parent, it, n, c) {
        var root = c.root || parent;
        var sigma = n.bgBlur / 2;
        var pad = sigma * 3 + 2;
        var b = it.visibleBounds;
        var region = [b[0] - pad, b[1] + pad, b[2] + pad, b[3] - pad];
        var wasHidden = it.hidden, g = null, ok = false, step = T('подготовка', 'setup');
        var st = { copied: 0, failed: [] };
        try {
            it.hidden = true;
            g = parent.groupItems.add();
            g.name = BD_MARK;
            try { g.note = BD_NOTE; } catch (e) {}
            var inner = g.groupItems.add();
            inner.name = BD_MARK;
            step = T('копирование фона', 'copying content');
            copyBelow(root, inner, region, 0, st);
            if (st.failed.length) L('«' + n.name + '»: ' + T('в размытие фона не попали: ', 'left out of background blur: ') + st.failed.join('; '));
            it.hidden = wasHidden;
            step = T('порядок слоёв', 'stacking');
            it.move(parent, ElementPlacement.PLACEATBEGINNING);
            if (inner.pageItems.length === 0) { g.remove(); g = null; return null; }
            inner.name = T('Фон под объектом', 'Content behind');
            step = T('размытие', 'blur');
            effect(inner, blurXML(sigma), n.name);
            step = T('маска', 'mask');
            var src = shapeSource(it), clip;
            if (src) clip = src.duplicate(g, ElementPlacement.PLACEATBEGINNING);
            else clip = g.pathItems.rectangle(b[1], b[0], b[2] - b[0], b[1] - b[3]);
            clipGroup(g, clip, c.doc);
            g.name = T('Размытие фона', 'Background blur');
            if (n.hidden) { try { g.hidden = true; } catch (e) {} }
            ok = true;
            return g;
        } catch (e) {
            throw new Error(e.message + T(' [шаг: ', ' [step: ') + step + ']');
        } finally {
            try { it.hidden = wasHidden; } catch (e) {}
            if (!ok && g) { try { g.remove(); } catch (e) {} }
        }
    }

    function makeGuides(doc, b, ox, oy) {
        var lay;
        try { lay = doc.layers.getByName('Сетки Penpot'); } catch (e) { lay = doc.layers.add(); lay.name = 'Сетки Penpot'; }
        lay.locked = false;
        var g = lay.groupItems.add(); g.name = 'Сетка — ' + b.name;
        var i, p;
        for (i = 0; i < b.guides.v.length; i++) {
            p = g.pathItems.add(); p.setEntirePath([[ox + b.guides.v[i], oy], [ox + b.guides.v[i], oy - b.h]]); p.guides = true;
        }
        for (i = 0; i < b.guides.h.length; i++) {
            p = g.pathItems.add(); p.setEntirePath([[ox, oy - b.guides.h[i]], [ox + b.w, oy - b.guides.h[i]]]); p.guides = true;
        }
    }

    function buildSvg(parent, n, c) {
        if (!n.file) { L('«' + n.name + '»: ' + T('нет файла SVG', 'no SVG file')); return null; }
        var f = new File(n.file), g;
        if (!f.exists) { L('«' + n.name + '»: ' + T('файл SVG не найден', 'SVG file not found')); return null; }
        try { g = parent.groupItems.createFromFile(f); }
        catch (e1) {
            var pi = parent.placedItems.add();
            pi.file = f;
            try { pi.embed(); } catch (e2) {}
            g = parent.pageItems[0];
        }
        try {
            if (n.w > 0 && n.h > 0) { g.width = n.w; g.height = n.h; }
            g.position = [X(c, n.x), Y(c, n.y)];
        } catch (e) {}
        return g;
    }

    function buildGroup(parent, n, c) {
        var g = parent.groupItems.add();
        if (!c.root) c.root = g;
        var kids = n.children || [];
        for (var i = 0; i < kids.length; i++) build(g, kids[i], c);
        if (n.mask && g.pageItems.length > 1) {
            var m = g.pageItems[g.pageItems.length - 1];
            m.move(g, ElementPlacement.PLACEATBEGINNING);
            if (m.typename === 'PathItem' || m.typename === 'CompoundPathItem') clipGroup(g, m, c.doc);
            else L('«' + n.name + '»: ' + T('маска сложной формы не перенесена', 'complex mask was not transferred'));
        }
        if (n.clip) {
            var cp = rrectPath(g, n.clip.x, n.clip.y, n.clip.w, n.clip.h, n.clip.radii, c);
            cp.filled = false; cp.stroked = false;
            if (n.clip.rot || n.clip.flip || n.clip.matrix) placeTransform(cp, n.clip, c);
            g.clipped = true;
        }
        if (g.pageItems.length === 0) { g.remove(); return null; }
        if (n.opacity != null && n.opacity < 1) g.opacity = n.opacity * 100;
        return g;
    }

    function nodesToPath(container, nodes, closed, c) {
        var p = container.pathItems.add();
        var anchors = [];
        for (var i = 0; i < nodes.length; i++) anchors.push([X(c, nodes[i].a[0]), Y(c, nodes[i].a[1])]);
        p.setEntirePath(anchors);
        for (var j = 0; j < nodes.length; j++) {
            var pp = p.pathPoints[j], nd = nodes[j];
            pp.leftDirection = [X(c, nd.l[0]), Y(c, nd.l[1])];
            pp.rightDirection = [X(c, nd.r[0]), Y(c, nd.r[1])];
            pp.pointType = PointType.CORNER;
        }
        p.closed = !!closed;
        return p;
    }

    function rrectNodes(x, y, w, h, R) {
        R = R || [0, 0, 0, 0];
        var m = Math.min(w, h) / 2;
        var a = Math.min(R[0] || 0, m), b = Math.min(R[1] || 0, m), cc = Math.min(R[2] || 0, m), d = Math.min(R[3] || 0, m);
        var N = [];
        function pt(ax, ay, lx, ly, rx, ry) { N.push({ a: [ax, ay], l: [lx, ly], r: [rx, ry] }); }
        if (a > 0) pt(x + a, y, x + a - K * a, y, x + a, y); else pt(x, y, x, y, x, y);
        if (b > 0) { pt(x + w - b, y, x + w - b, y, x + w - b + K * b, y); pt(x + w, y + b, x + w, y + b - K * b, x + w, y + b); }
        else pt(x + w, y, x + w, y, x + w, y);
        if (cc > 0) { pt(x + w, y + h - cc, x + w, y + h - cc, x + w, y + h - cc + K * cc); pt(x + w - cc, y + h, x + w - cc + K * cc, y + h, x + w - cc, y + h); }
        else pt(x + w, y + h, x + w, y + h, x + w, y + h);
        if (d > 0) { pt(x + d, y + h, x + d, y + h, x + d - K * d, y + h); pt(x, y + h - d, x, y + h - d + K * d, x, y + h - d); }
        else pt(x, y + h, x, y + h, x, y + h);
        if (a > 0) pt(x, y + a, x, y + a, x, y + a - K * a);
        return N;
    }

    function rrectPath(container, x, y, w, h, R, c) {
        var plain = !R || (!R[0] && !R[1] && !R[2] && !R[3]);
        if (plain) return container.pathItems.rectangle(Y(c, y), X(c, x), w, h);
        return nodesToPath(container, rrectNodes(x, y, w, h, R), true, c);
    }

    function geomItem(container, n, c, inset) {
        var x = n.x + inset, y = n.y + inset, w = n.w - 2 * inset, h = n.h - 2 * inset;
        if (w <= 0 || h <= 0) { w = Math.max(w, 0.1); h = Math.max(h, 0.1); }
        if (n.kind === 'rect') {
            var R = null;
            if (n.radii) { R = []; for (var i = 0; i < 4; i++) R.push(Math.max(0, n.radii[i] - inset)); }
            return rrectPath(container, x, y, w, h, R, c);
        }
        if (n.kind === 'ellipse') return container.pathItems.ellipse(Y(c, y), X(c, x), w, h);
        if (n.subs.length === 1) return nodesToPath(container, n.subs[0].nodes, n.subs[0].closed, c);
        var cp = container.compoundPathItems.add();
        for (var s = 0; s < n.subs.length; s++) nodesToPath(cp, n.subs[s].nodes, n.subs[s].closed, c);
        return cp;
    }

    function buildShape(parent, n, c) {
        var st = n.stroke;
        var split = st && st.align !== 'center' && (n.kind === 'rect' || n.kind === 'ellipse');
        var closedPath = n.kind === 'path' && n.subs && n.subs.length && n.subs[0].closed;
        if (st && st.align !== 'center' && n.kind === 'path' && closedPath) {
            var gp = parent.groupItems.add();
            if (n.fill) { var fp = geomItem(gp, n, c, 0); paint(fp, n.fill, null, n, c); }
            var sp = geomItem(gp, n, c, 0);
            paint(sp, null, st, n, c);
            effect(sp, offsetXML(st.align === 'inner' ? -st.width / 2 : st.width / 2), n.name);
            return gp;
        }
        if (!split) {
            var it = geomItem(parent, n, c, 0);
            paint(it, n.fill, st, n, c);
            return it;
        }

        var g = parent.groupItems.add();
        if (n.fill) { var f = geomItem(g, n, c, 0); paint(f, n.fill, null, n, c); }
        var off = st.align === 'inner' ? st.width / 2 : -st.width / 2;
        var s = geomItem(g, n, c, off);
        paint(s, null, st, n, c);
        return g;
    }

    function rgb(hex) {
        var c = new RGBColor();
        hex = String(hex || '#000000').replace('#', '');
        c.red = parseInt(hex.substr(0, 2), 16); c.green = parseInt(hex.substr(2, 2), 16); c.blue = parseInt(hex.substr(4, 2), 16);
        return c;
    }

    function eachPath(it, fn) {
        if (it.typename === 'CompoundPathItem') { for (var i = 0; i < it.pathItems.length; i++) fn(it.pathItems[i]); }
        else fn(it);
    }

    function gradientColor(f, n, c) {
        var doc = c.doc;
        var g = doc.gradients.add();
        g.type = f.type === 'radial' ? GradientType.RADIAL : GradientType.LINEAR;
        while (g.gradientStops.length < f.stops.length) g.gradientStops.add();
        for (var i = 0; i < f.stops.length; i++) {
            var gs = g.gradientStops[i], sp = f.stops[i];
            gs.rampPoint = Math.max(0, Math.min(100, sp.offset * 100));
            gs.midPoint = 50;
            gs.color = rgb(sp.color);
            try { gs.opacity = sp.opacity * 100; } catch (e) {}
        }
        var gc = new GradientColor();
        gc.gradient = g;
        return gc;
    }

    function paint(it, fill, st, n, c) {
        var op = n.opacity == null ? 1 : n.opacity;
        eachPath(it, function (p) {
            if (fill) {
                p.filled = true;
                if (fill.type === 'solid') p.fillColor = rgb(fill.color);
                else p.fillColor = gradientColor(fill, n, c);
            } else p.filled = false;
            if (st) {
                p.stroked = true;
                p.strokeColor = (st.paint && st.paint.type !== 'solid') ? gradientColor(st.paint, n, c) : rgb(st.color);
                p.strokeWidth = st.width;
                p.strokeCap = st.cap === 'round' ? StrokeCap.ROUNDENDCAP : (st.cap === 'square' ? StrokeCap.PROJECTINGENDCAP : StrokeCap.BUTTENDCAP);
                p.strokeJoin = st.join === 'round' ? StrokeJoin.ROUNDENDJOIN : (st.join === 'bevel' ? StrokeJoin.BEVELENDJOIN : StrokeJoin.MITERENDJOIN);
                if (st.style === 'dashed') p.strokeDashes = [st.width * 3, st.width * 2];
                else if (st.style === 'dotted') { p.strokeDashes = [0, st.width * 2]; p.strokeCap = StrokeCap.ROUNDENDCAP; }
                else if (st.style === 'mixed') p.strokeDashes = [st.width * 3, st.width * 2, 0, st.width * 2];
            } else p.stroked = false;
            if (it.typename === 'CompoundPathItem') p.evenodd = true;
        });

        if (fill && fill.type === 'linear') {
            var gw = n.w || 1, gh = n.h || 1;
            if (n.subs && it.geometricBounds) { var gb = it.geometricBounds; gw = gb[2] - gb[0]; gh = gb[1] - gb[3]; }
            var ang = Math.atan2(-(fill.ey - fill.sy) * gh, (fill.ex - fill.sx) * gw) * 180 / Math.PI;
            if (Math.abs(ang) > 0.01) { try { it.rotate(ang, false, false, true, false, Transformation.CENTER); } catch (e) {} }
        }
        var a = fill ? (fill.opacity == null ? 1 : fill.opacity) : (st ? st.opacity : 1);
        if (op * a < 0.999) it.opacity = op * a * 100;
    }

    function buildImage(parent, n, c) {
        var g = parent.groupItems.add();
        var ok = false;
        if (n.file) {
            var f = new File(n.file);
            if (f.exists) {
                var pi = g.placedItems.add();
                pi.file = f;
                var iw = n.iw || n.w, ih = n.ih || n.h;
                var w = n.w, h = n.h;
                if (n.keepAspect !== false && iw && ih) {
                    var s = Math.max(n.w / iw, n.h / ih);
                    w = iw * s; h = ih * s;
                }
                pi.width = w; pi.height = h;
                pi.position = [X(c, n.x + (n.w - w) / 2), Y(c, n.y + (n.h - h) / 2)];
                if (PI.embedImages !== false) { try { pi.embed(); } catch (e) { L('«' + n.name + '»: ' + T('не удалось встроить картинку', 'could not embed the image')); } }
                ok = true;
            }
        }
        if (!ok) {
            var ph = g.pathItems.rectangle(Y(c, n.y), X(c, n.x), n.w, n.h);
            ph.fillColor = rgb('#cccccc'); ph.stroked = false;
            L('«' + n.name + '»: ' + T('картинка не загружена — поставлена заглушка', 'image not loaded — placeholder inserted'));
        }
        var cl = n.clip || { kind: 'rect', radii: [0, 0, 0, 0] };
        var cp;
        if (cl.kind === 'ellipse') cp = g.pathItems.ellipse(Y(c, n.y), X(c, n.x), n.w, n.h);
        else if (cl.kind === 'path' && cl.subs) cp = geomItem(g, { kind: 'path', subs: cl.subs }, c, 0);
        else cp = rrectPath(g, n.x, n.y, n.w, n.h, cl.radii, c);
        clipGroup(g, cp, c.doc);
        if (n.opacity != null && n.opacity < 1) g.opacity = n.opacity * 100;
        return g;
    }

    function norm(s) { return String(s || '').toLowerCase().replace(/condensed/g, 'cond').replace(/[\s\-_]+/g, ''); }
    function weightOf(s) {
        s = String(s || '').toLowerCase().replace(/[\s\-_]+/g, '');
        if (/(extra|ultra)black|heavy/.test(s)) return 900;
        if (/black/.test(s)) return 900;
        if (/(extra|ultra)bold/.test(s)) return 800;
        if (/(semi|demi)bold|demi/.test(s)) return 600;
        if (/bold/.test(s)) return 700;
        if (/medium/.test(s)) return 500;
        if (/(extra|ultra)light/.test(s)) return 200;
        if (/thin|hairline/.test(s)) return 100;
        if (/light/.test(s)) return 300;
        return 400;
    }
    PI.allFonts = null;
    function fontList() {
        if (PI.allFonts) return PI.allFonts;
        var out = [], tf = app.textFonts;
        for (var i = 0; i < tf.length; i++) {
            var f = tf[i];
            out.push({ f: f, name: f.name, family: f.family, style: f.style, nf: norm(f.family), nn: norm(f.name), ns: norm(f.family + f.style) });
        }
        PI.allFonts = out;
        return out;
    }
    PI.findFont = function (spec) {
        var key = spec.family + '|' + spec.weight + '|' + (spec.italic ? 'i' : 'n');
        if (PI.fontCache.hasOwnProperty(key)) return PI.fontCache[key];
        var res = null;
        var ov = PI.overrides[key] || PI.overrides[spec.family + '|' + spec.weight];
        if (ov) { try { res = app.textFonts.getByName(ov); } catch (e) { res = null; } }
        if (!res) {
            var target = norm(spec.family), wantCond = /cond/.test(target);
            var list = fontList(), best = null, bestScore = -1e9;
            for (var i = 0; i < list.length; i++) {
                var e = list[i];
                var fam = e.nf === target || e.ns.indexOf(target) === 0 || e.nn.indexOf(target) === 0;
                if (!fam) continue;
                var desc = (e.style + ' ' + e.name).toLowerCase();
                var isCond = /cond/.test(norm(desc + e.family));
                var isIt = /italic|oblique/.test(desc);
                var score = 0;
                score -= Math.abs(weightOf(e.style + ' ' + e.name.replace(/^[^-]*-?/, '')) - spec.weight) / 10;
                if (isIt !== !!spec.italic) score -= 30;
                if (isCond !== wantCond) score -= 50;
                if (e.nf === target) score += 5;
                if (score > bestScore) { bestScore = score; best = e.f; }
            }
            res = best;
        }
        PI.fontCache[key] = res;
        if (!res) L(T('Шрифт не найден: ', 'Font not found: ') + spec.family + ' ' + spec.weight + (spec.italic ? ' italic' : ''));
        return res;
    };

    PI.resolveFonts = wrap(function (s) {
        var arr = parse(s), out = [];
        for (var i = 0; i < arr.length; i++) {
            var f = PI.findFont(arr[i]);
            out.push('"' + arr[i].key.replace(/"/g, '') + '":' + (f ? '"' + f.name + '"' : 'null'));
        }
        return 'OK:{' + out.join(',') + '}';
    });

    PI.resetFonts = wrap(function () { PI.allFonts = null; PI.fontCache = {}; PI.metricCache = {}; return 'OK'; });

    PI.setOverrides = wrap(function (s) { PI.overrides = parse(s) || {}; PI.fontCache = {}; return 'OK'; });

    function metrics(container, font, size) {
        var key = (font ? font.name : '-') + '|' + size;
        if (PI.metricCache[key]) return PI.metricCache[key];
        var t = container.textFrames.pointText([0, 0]);
        t.contents = 'HÁgjy';
        var ca = t.textRange.characterAttributes;
        if (font) ca.textFont = font;
        ca.size = size;
        var b = t.geometricBounds;
        var anchorY = t.anchor[1];
        var m = { asc: b[1] - anchorY, desc: anchorY - b[3] };
        t.remove();
        PI.metricCache[key] = m;
        return m;
    }

    function applyRun(ca, r, font) {
        if (font) { try { ca.textFont = font; } catch (e) {} }
        try { ca.size = r.size; } catch (e) {}
        try { ca.fillColor = rgb(r.color); } catch (e) {}
        if (r.gradient && r.gradient.type !== 'solid' && PI.curText) {
            try { ca.fillColor = gradientColor(r.gradient, PI.curText.n, PI.curText.c); } catch (e) {}
        }
        if (PI.curText && PI.curText.n.textStroke) {
            var ts = PI.curText.n.textStroke;
            try { ca.strokeColor = rgb(ts.color); ca.strokeWeight = ts.width; } catch (e) {}
        }
        try { ca.tracking = r.tracking || 0; } catch (e) {}
        try { ca.horizontalScale = 100; ca.verticalScale = 100; ca.baselineShift = 0; } catch (e) {}
        try {
            ca.baselinePosition = r.script === 'super' ? FontBaselineOption.SUPERSCRIPT :
                (r.script === 'sub' ? FontBaselineOption.SUBSCRIPT : FontBaselineOption.NORMALBASELINE);
        } catch (e) {}
        try { ca.underline = r.decoration === 'underline'; ca.strikeThrough = r.decoration === 'line-through'; } catch (e) {}
        try { ca.kerningMethod = AutoKernType.METRICSROMANONLY; } catch (e) {}
    }
    function runKey(r) { return [r.family, r.weight, r.italic, r.size, r.color, r.tracking, r.decoration, r.script || '',
        r.gradient ? 'g' + r.gradient.type + r.gradient.stops.length + (r.gradient.stops[0] || {}).color : ''].join('|'); }
    function just(a) {
        if (a === 'center') return Justification.CENTER;
        if (a === 'right') return Justification.RIGHT;
        if (a === 'justify') return Justification.FULLJUSTIFYLASTLINELEFT;
        return Justification.LEFT;
    }

    function buildText(parent, n, c) {
        var paras = n.paras || [];
        var p0 = null, i, j;
        for (i = 0; i < paras.length; i++) if (paras[i].runs.length) { p0 = paras[i]; break; }
        if (!p0) return null;
        var r0 = p0.runs[0];
        var font0 = PI.findFont(r0);
        PI.curText = { n: n, c: c };

        var str = '', lens = [];
        for (i = 0; i < paras.length; i++) {
            var t = '';
            for (j = 0; j < paras[i].runs.length; j++) t += paras[i].runs[j].text;
            lens.push(t.length);
            str += (i ? '\r' : '') + t;
        }

        var m = metrics(parent, font0, r0.size);
        var desc = m.desc, asc = m.asc;
        if (n.pdFirstH && asc + desc > 0) { var k = n.pdFirstH / (asc + desc); desc *= k; asc *= k; }
        var baseline = n.pdFirstY != null ? n.pdFirstY - desc : n.y + (p0.lead - (asc + desc)) / 2 + asc;
        var align = p0.align;

        var tf;
        if (n.mode === 'point') {
            var ax = n.x;
            if (align === 'center') ax = n.x + n.w / 2; else if (align === 'right') ax = n.x + n.w;
            tf = parent.textFrames.pointText([X(c, ax), Y(c, baseline)]);
        } else {
            var pad = Math.max(2, n.w * 0.01);
            var lx = n.x, w = n.w + pad;
            if (align === 'center') lx -= pad / 2; else if (align === 'right') lx -= pad;
            var rect = parent.pathItems.rectangle(Y(c, n.y), X(c, lx), w, n.h + p0.lead * 2);
            tf = parent.textFrames.areaText(rect);
            try { tf.firstBaseline = FirstBaselineType.FIXED; tf.firstBaselineMin = baseline - n.y; } catch (e) {}
            try { tf.spacing = 0; } catch (e) {}
        }
        tf.contents = str;

        var counts = {}, dom = r0, best = 0;
        for (i = 0; i < paras.length; i++) for (j = 0; j < paras[i].runs.length; j++) {
            var rr = paras[i].runs[j], kk = runKey(rr);
            counts[kk] = (counts[kk] || 0) + rr.text.length;
            if (counts[kk] > best) { best = counts[kk]; dom = rr; }
        }
        var all = tf.textRange;
        applyRun(all.characterAttributes, dom, PI.findFont(dom));
        try { all.characterAttributes.autoLeading = false; } catch (e) {}

        var tps = tf.paragraphs, mapIdx = [];
        if (tps.length === paras.length) { for (i = 0; i < paras.length; i++) mapIdx.push(i); }
        else { var q = 0; for (i = 0; i < paras.length; i++) { if (lens[i] > 0) mapIdx.push(q++); else mapIdx.push(-1); } }
        for (i = 0; i < paras.length; i++) {
            var pi = mapIdx[i];
            if (pi < 0 || pi >= tps.length) continue;
            var P = tps[pi], pr = paras[i];
            try {
                P.paragraphAttributes.justification = just(pr.align);
                P.paragraphAttributes.hyphenation = false;
                P.paragraphAttributes.spaceBefore = 0; P.paragraphAttributes.spaceAfter = 0;
                P.paragraphAttributes.firstLineIndent = 0; P.paragraphAttributes.leftIndent = 0; P.paragraphAttributes.rightIndent = 0;
                P.characterAttributes.autoLeading = false;
                P.characterAttributes.leading = pr.lead;
            } catch (e) {}

            var off = 0;
            for (j = 0; j < pr.runs.length; j++) {
                var run = pr.runs[j], len = run.text.length;
                if (runKey(run) !== runKey(dom)) {
                    try {
                        var rg = P.characters[off];
                        try { rg.length = len; applyRun(rg.characterAttributes, run, PI.findFont(run)); }
                        catch (e1) { for (var z = 0; z < len; z++) applyRun(P.characters[off + z].characterAttributes, run, PI.findFont(run)); }
                    } catch (e2) {}
                }
                off += len;
            }
        }
        if (dom.opacity < 1 || n.opacity < 1) { try { tf.opacity = (n.opacity == null ? 1 : n.opacity) * dom.opacity * 100; } catch (e) {} }

        if (n.mode !== 'point' && n.lines) {
            try {
                var tries = 0, cnt = tf.lines.length;
                while (cnt > n.lines && tries < 6) {
                    var tp = tf.textPath, dw = n.w * 0.015, left0 = tp.left;
                    tp.width = tp.width + dw;
                    if (align === 'center') tp.left = left0 - dw / 2; else if (align === 'right') tp.left = left0 - dw; else tp.left = left0;
                    cnt = tf.lines.length; tries++;
                }
                tries = 0;
                while (cnt < n.lines && tries < 8) {
                    var tp2 = tf.textPath, dw2 = n.w * 0.005, l2 = tp2.left;
                    tp2.width = tp2.width - dw2;
                    if (align === 'center') tp2.left = l2 + dw2 / 2; else if (align === 'right') tp2.left = l2 + dw2; else tp2.left = l2;
                    cnt = tf.lines.length; tries++;
                }
                if (cnt !== n.lines) L('«' + n.name + '»: ' + T('строк ' + cnt + ' вместо ' + n.lines + ' — проверьте переносы', cnt + ' lines instead of ' + n.lines + ' — check line breaks'));
            } catch (e) {}
        }
        return tf;
    }
})();
