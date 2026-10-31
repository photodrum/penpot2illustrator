(function (root) {
  'use strict';

  var ROOT_ID = '00000000-0000-0000-0000-000000000000';
  var api;
  function T(ru, en) { return api && api.lang === 'en' ? en : ru; }

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

  function pages(file) {
    var d = file.data || file;
    var idx = d.pagesIndex || {};
    return (d.pages || Object.keys(idx)).map(function (id) {
      var p = idx[id] || {};
      return { id: id, name: p.name || id };
    });
  }

  function objectsOf(file, pageId) {
    var d = file.data || file;
    var p = (d.pagesIndex || {})[pageId];
    if (!p) throw new Error(T('Страница не найдена: ', 'Page not found: ') + pageId);
    return p.objects || {};
  }

  function boards(file, pageId) {
    var objs = objectsOf(file, pageId);
    var rootObj = objs[ROOT_ID];
    var order = rootObj && rootObj.shapes ? rootObj.shapes.slice() : Object.keys(objs);
    var out = [];
    order.forEach(function (id) {
      var s = objs[id];
      if (s && s.type === 'frame' && s.parentId === ROOT_ID) {
        out.push({ id: id, name: s.name, x: s.x, y: s.y, w: s.width, h: s.height, hidden: !!s.hidden });
      }
    });
    out.sort(function (a, b) { return Math.abs(a.y - b.y) > 50 ? a.y - b.y : a.x - b.x; });
    return out;
  }

  function hex(c) {
    if (!c) return null;
    c = String(c).replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return '#' + c.slice(0, 6).toLowerCase();
  }

  function convFill(f, warn) {
    if (!f) return null;
    var op = num(f.fillOpacity, 1);
    if (f.fillImage) {
      var im = f.fillImage;
      return { type: 'image', mediaId: im.id, iw: im.width, ih: im.height, mtype: im.mtype,
               keepAspect: im.keepAspectRatio !== false, opacity: op, ref: f.fillColorRefId || null };
    }
    if (f.fillColorGradient) {
      var g = f.fillColorGradient;
      return {
        type: g.type === 'radial' ? 'radial' : 'linear',
        sx: num(g.startX, 0.5), sy: num(g.startY, 0), ex: num(g.endX, 0.5), ey: num(g.endY, 1),
        width: num(g.width, 1),
        stops: (g.stops || []).map(function (s) {
          return { color: hex(s.color), opacity: num(s.opacity, 1), offset: num(s.offset, 0) };
        }),
        opacity: op, ref: f.fillColorRefId || null
      };
    }
    if (f.fillColor) return { type: 'solid', color: hex(f.fillColor), opacity: op, ref: f.fillColorRefId || null };
    warn(T('неподдерживаемая заливка', 'unsupported fill'));
    return null;
  }

  function convFills(list, warn) {
    var out = [];
    (list || []).forEach(function (f) { var c = convFill(f, warn); if (c) out.push(c); });
    return out.reverse();
  }

  function convStroke(s, shape, warn) {
    if (!s || !s.strokeWidth) return null;
    var attrs = shape.svgAttrs || {};
    var cap = s.strokeCapStart || s.strokeCapEnd || attrs.strokeLinecap || null;
    var st = {
      color: hex(s.strokeColor) || '#000000',
      opacity: num(s.strokeOpacity, 1),
      width: num(s.strokeWidth, 1),
      align: s.strokeAlignment || 'center',
      style: s.strokeStyle || 'solid',
      cap: cap === 'round' || cap === 'circle-marker' ? 'round' : (cap === 'square' ? 'square' : 'butt'),
      join: attrs.strokeLinejoin || 'miter',
      ref: s.strokeColorRefId || null
    };
    if (s.strokeColorGradient && s.strokeColorGradient.stops && s.strokeColorGradient.stops[0])
      st.color = hex(s.strokeColorGradient.stops[0].color);
    return st;
  }

  function radii(s) {
    if (s.r1 != null || s.r2 != null || s.r3 != null || s.r4 != null)
      return [num(s.r1, 0), num(s.r2, 0), num(s.r3, 0), num(s.r4, 0)];
    var r = num(s.rx, 0);
    return [r, r, r, r];
  }

  function parsePath(d, ox, oy) {
    var subs = [];
    if (Array.isArray(d)) d = commandsToString(d);
    if (!d) return subs;
    var tok = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    var i = 0, cmd = null, cur = null, x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
    function n() { return parseFloat(tok[i++]); }
    function P(px, py) { return [px - ox, py - oy]; }
    function start(px, py) {
      cur = { closed: false, nodes: [{ a: P(px, py), l: P(px, py), r: P(px, py) }] };
      subs.push(cur);
    }
    function lineTo(px, py) {
      if (!cur) start(x, y);
      cur.nodes.push({ a: P(px, py), l: P(px, py), r: P(px, py) });
    }
    function curveTo(x1, y1, x2, y2, px, py) {
      if (!cur) start(x, y);
      cur.nodes[cur.nodes.length - 1].r = P(x1, y1);
      cur.nodes.push({ a: P(px, py), l: P(x2, y2), r: P(px, py) });
    }
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      var bx = rel ? x : 0, by = rel ? y : 0;
      if (C === 'M') {
        x = bx + n(); y = by + n(); start(x, y); sx = x; sy = y;
        cmd = rel ? 'l' : 'L'; lc = lq = null;
      } else if (C === 'L') { x = bx + n(); y = by + n(); lineTo(x, y); lc = lq = null; }
      else if (C === 'H') { x = bx + n(); lineTo(x, y); lc = lq = null; }
      else if (C === 'V') { y = by + n(); lineTo(x, y); lc = lq = null; }
      else if (C === 'C') {
        var x1 = bx + n(), y1 = by + n(), x2 = bx + n(), y2 = by + n(); x = bx + n(); y = by + n();
        curveTo(x1, y1, x2, y2, x, y); lc = [x2, y2]; lq = null;
      } else if (C === 'S') {
        var rx1 = lc ? 2 * x - lc[0] : x, ry1 = lc ? 2 * y - lc[1] : y;
        var sx2 = bx + n(), sy2 = by + n(); var nx = bx + n(), ny = by + n();
        curveTo(rx1, ry1, sx2, sy2, nx, ny); x = nx; y = ny; lc = [sx2, sy2]; lq = null;
      } else if (C === 'Q' || C === 'T') {
        var qx, qy;
        if (C === 'Q') { qx = bx + n(); qy = by + n(); } else { qx = lq ? 2 * x - lq[0] : x; qy = lq ? 2 * y - lq[1] : y; }
        var ex = bx + n(), ey = by + n();
        curveTo(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey), ex, ey);
        x = ex; y = ey; lq = [qx, qy]; lc = null;
      } else if (C === 'A') {
        var arx = n(), ary = n(), rot = n(), la = n(), sw = n(); var ax = bx + n(), ay = by + n();
        arcToCurves(x, y, arx, ary, rot, la, sw, ax, ay).forEach(function (c) { curveTo(c[0], c[1], c[2], c[3], c[4], c[5]); });
        x = ax; y = ay; lc = lq = null;
      } else if (C === 'Z') {
        if (cur) {
          var nodes = cur.nodes, f = nodes[0], l = nodes[nodes.length - 1];
          if (nodes.length > 1 && Math.abs(f.a[0] - l.a[0]) < 0.01 && Math.abs(f.a[1] - l.a[1]) < 0.01) {
            f.l = l.l; nodes.pop();
          }
          cur.closed = true;
        }
        x = sx; y = sy; cur = null; lc = lq = null;
      } else { i++; }
    }
    return subs.filter(function (s) { return s.nodes.length > 1; });
  }

  function commandsToString(arr) {
    return arr.map(function (c) {
      var p = c.params || {};
      switch (c.command) {
        case 'move-to': return 'M' + p.x + ',' + p.y;
        case 'line-to': return 'L' + p.x + ',' + p.y;
        case 'curve-to': return 'C' + p.c1x + ',' + p.c1y + ' ' + p.c2x + ',' + p.c2y + ' ' + p.x + ',' + p.y;
        case 'close-path': return 'Z';
        default: return '';
      }
    }).join('');
  }

  function arcToCurves(x1, y1, rx, ry, angle, large, sweep, x2, y2) {
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    var phi = angle * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    var sign = large === sweep ? -1 : 1;
    var sq = Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) / (rx * rx * y1p * y1p + ry * ry * x1p * x1p));
    var coef = sign * Math.sqrt(sq);
    var cxp = coef * rx * y1p / ry, cyp = -coef * ry * x1p / rx;
    var cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) {
      var a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a;
    }
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    var dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    var segs = Math.ceil(Math.abs(dt) / (Math.PI / 2)), out = [], d = dt / segs;
    var k = 4 / 3 * Math.tan(d / 4);
    for (var s = 0; s < segs; s++) {
      var a1 = t1 + s * d, a2 = a1 + d;
      var c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
      var p = function (ex, ey) { return [cx + rx * ex * cp - ry * ey * sp, cy + rx * ex * sp + ry * ey * cp]; };
      var q1 = p(c1 - k * s1, s1 + k * c1), q2 = p(c2 + k * s2, s2 - k * c2), e = p(c2, s2);
      out.push([q1[0], q1[1], q2[0], q2[1], e[0], e[1]]);
    }
    return out;
  }

  function leafStyle(l, p) {
    var g = function (k, d) { return l[k] != null && l[k] !== '' ? l[k] : (p && p[k] != null ? p[k] : d); };
    var fills = g('fills', []);
    var f0 = fills && fills[0] ? fills[0] : { fillColor: '#000000', fillOpacity: 1 };
    var fs = num(g('fontSize', 14), 14);
    return {
      family: g('fontFamily', 'sourcesanspro'),
      weight: parseInt(g('fontWeight', '400'), 10) || 400,
      italic: /italic/i.test(g('fontStyle', 'normal')),
      size: fs,
      lh: (function (v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? n : 1.2; })(g('lineHeight', '1.2')),
      tracking: Math.round(num(g('letterSpacing', 0), 0) / fs * 1000),
      color: hex(f0.fillColor) || (f0.fillColorGradient && f0.fillColorGradient.stops && f0.fillColorGradient.stops[0] ? hex(f0.fillColorGradient.stops[0].color) : '#000000'),
      gradient: f0.fillColorGradient ? convFill(f0, function () {}) : null,
      opacity: num(f0.fillOpacity, 1),
      transform: g('textTransform', 'none'),
      decoration: g('textDecoration', 'none'),
      align: g('textAlign', 'left'),
      ref: f0.fillColorRefId || null,
      typo: g('typographyRefId', null) || null
    };
  }

  function applyTransform(t, mode) {
    if (mode === 'uppercase') return t.toUpperCase();
    if (mode === 'lowercase') return t.toLowerCase();
    if (mode === 'capitalize') return t.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    return t;
  }

  var SCRIPT_MAP = {
    '⁺': ['+', 'super'], '⁻': ['–', 'super'], '⁼': ['=', 'super'], '⁽': ['(', 'super'], '⁾': [')', 'super'],
    '₊': ['+', 'sub'], '₋': ['–', 'sub'], '₌': ['=', 'sub'], '₍': ['(', 'sub'], '₎': [')', 'sub']
  };
  function fixScripts(runs) {
    var out = [], prevNormal = null;
    runs.forEach(function (r) {
      var buf = '', mode = null;
      function flush() {
        if (!buf) return;
        var n = Object.assign({}, r, { text: buf });
        if (mode) {
          n.script = mode;
          if (prevNormal) { n.family = prevNormal.family; n.weight = prevNormal.weight; n.italic = prevNormal.italic; }
        } else prevNormal = n;
        out.push(n); buf = '';
      }
      for (var i = 0; i < r.text.length; i++) {
        var ch = r.text[i], m = SCRIPT_MAP[ch], md = m ? m[1] : null;
        if (md !== mode) { flush(); mode = md; }
        buf += m ? m[0] : ch;
      }
      flush();
    });

    var merged = [];
    out.forEach(function (r) {
      var last = merged[merged.length - 1];
      var key = function (x) { return [x.family, x.weight, x.italic, x.size, x.color, x.opacity, x.tracking, x.decoration, x.script || '', x.ref || '', x.typo || ''].join('|'); };
      if (last && key(last) === key(r)) last.text += r.text;
      else merged.push(Object.assign({}, r));
    });
    return merged;
  }

  function convText(s, bx, by) {
    var paras = [];
    var rootC = s.content || {};
    (rootC.children || []).forEach(function (set) {
      (set.children || []).forEach(function (p) {
        var runs = [];
        (p.children || []).forEach(function (l) {
          var st = leafStyle(l, p);
          var text = applyTransform(String(l.text == null ? '' : l.text), st.transform);
          if (text.length) { st.text = text.replace(/\r\n?/g, '\n').replace(/\n/g, '\u0003'); runs.push(st); }
        });
        var ps = leafStyle(p, null);
        var lead = 0, maxSize = 0;
        runs.forEach(function (r) { lead = Math.max(lead, r.size * r.lh); maxSize = Math.max(maxSize, r.size); });
        if (!runs.length) { lead = ps.size * ps.lh; maxSize = ps.size; }
        runs = fixScripts(runs);
        paras.push({ align: ps.align, lead: lead, size: maxSize, runs: runs, empty: !runs.length, style: ps });
      });
    });
    var pd = (s.positionData || []).filter(function (e) { return e && isFinite(e.y); });
    var p0 = null;
    paras.forEach(function (p) { if (!p0 && !p.empty) p0 = p; });
    p0 = p0 || paras[0] || { lead: 16, size: 14 };
    var minLead = paras.reduce(function (m, p) { return Math.min(m, p.lead || m); }, p0.lead || 16);

    var sorted = pd.slice().sort(function (a, b) { return a.y - b.y; }), clusters = [];
    sorted.forEach(function (e) {
      var c = clusters[clusters.length - 1];
      if (c && Math.abs(e.y - c.y) < minLead * 0.5) c.items.push(e);
      else clusters.push({ y: e.y, items: [e] });
    });
    var pdLines = clusters.length || null;
    var first = null, tallest = null;
    if (clusters.length) {
      clusters[0].items.forEach(function (e) {
        if (!first || e.x < first.x) first = e;
        if (!tallest || num(e.height, 0) > num(tallest.height, 0)) tallest = e;
      });
    }

    var avgLead = paras.length ? paras.reduce(function (a, p) { return a + p.lead; }, 0) / paras.length : p0.lead;
    var est = s.growType !== 'fixed' && avgLead > 0 ? Math.max(paras.length, Math.round(s.height / avgLead)) : null;
    var pdOk = false;
    if (tallest) {
      var expectBottom = s.y + (p0.lead + num(tallest.height, p0.size)) / 2;
      pdOk = Math.abs(tallest.y - expectBottom) <= 0.35 * p0.size;
    }
    return {
      kind: 'text',
      x: s.x - bx, y: s.y - by, w: s.width, h: s.height,
      mode: s.growType === 'auto-width' ? 'point' : 'area',
      valign: s.verticalAlign || 'top',
      paras: paras,
      pdFirstY: first && pdOk ? first.y - by : null,
      pdFirstH: first ? first.height : null,
      pdFirstX: first && pdOk ? first.x - bx : null,
      lines: est != null ? est : (pdOk ? pdLines : null),
      pdStale: !!first && (!pdOk || (est != null && pdLines !== est)),
      plain: paras.map(function (p) { return p.runs.map(function (r) { return r.text; }).join(''); }).join('\n')
    };
  }

  var MARKERS = { 'line-arrow': 1, 'triangle-arrow': 1, 'square-marker': 1, 'circle-marker': 1, 'diamond-marker': 1 };
  var SVG_CAMEL = { viewBox: 1, preserveAspectRatio: 1, gradientUnits: 1, gradientTransform: 1, patternUnits: 1,
    patternContentUnits: 1, patternTransform: 1, stdDeviation: 1, clipPathUnits: 1, maskUnits: 1, maskContentUnits: 1,
    spreadMethod: 1, markerWidth: 1, markerHeight: 1, refX: 1, refY: 1, markerUnits: 1, textLength: 1, lengthAdjust: 1,
    startOffset: 1, baseFrequency: 1, numOctaves: 1, kernelMatrix: 1, primitiveUnits: 1, filterUnits: 1, pathLength: 1 };

  function isIdentity(t) {
    return !t || (Math.abs(num(t.a, 1) - 1) < 1e-6 && Math.abs(num(t.b, 0)) < 1e-6 && Math.abs(num(t.c, 0)) < 1e-6 && Math.abs(num(t.d, 1) - 1) < 1e-6);
  }

  function decompose(t, s) {
    var a = num(t.a, 1), b = num(t.b, 0), c = num(t.c, 0), d = num(t.d, 1);
    var det = a * d - b * c;
    var ortho = Math.abs(a * c + b * d) < 1e-3 && Math.abs(Math.sqrt(a * a + b * b) - 1) < 1e-3 && Math.abs(Math.sqrt(c * c + d * d) - 1) < 1e-3;
    if (!ortho) return { matrix: { a: a, b: b, c: c, d: d } };
    var rot = Math.atan2(-c, d) * 180 / Math.PI;
    var out = {};
    if (Math.abs(rot) > 1e-3) out.rot = rot;
    if (det < 0) out.flip = true;
    return out;
  }

  function convShadows(s) {
    var list = s.shadow || s.shadows || [];
    return list.filter(function (sh) { return sh && !sh.hidden; }).map(function (sh) {
      var c = sh.color || {};
      return {
        style: sh.style === 'inner-shadow' ? 'inner' : 'drop',
        dx: num(sh.offsetX, 0), dy: num(sh.offsetY, 0), blur: num(sh.blur, 0), spread: num(sh.spread, 0),
        color: hex(c.color) || '#000000', opacity: num(c.opacity, 0.2)
      };
    });
  }

  function isBgType(b) { return b && String(b.type || '').replace(/^:/, '') === 'background-blur'; }
  function blurValue(b) { return b && !b.hidden && num(b.value, 0) > 0 ? num(b.value, 0) : 0; }
  function layerBlurOf(s) { return isBgType(s.blur) ? 0 : blurValue(s.blur); }
  function backgroundBlurOf(s) {
    var b = s.backgroundBlur || s['background-blur'];
    if (!b && isBgType(s.blur)) b = s.blur;
    return blurValue(b);
  }

  function svgMarkup(c) {
    if (c == null) return '';
    if (typeof c === 'string') return c.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    var tag = c.tag || 'g', attrs = c.attrs || {}, out = '<' + tag;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === 'style' && typeof v === 'object') {
        v = Object.keys(v).map(function (sk) { return sk.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }) + ':' + v[sk]; }).join(';');
      }
      var name = k === 'xlinkHref' ? 'xlink:href' : (SVG_CAMEL[k] ? k : k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }));
      out += ' ' + name + '="' + String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
    });
    var kids = c.content || c.children || [];
    if (!Array.isArray(kids)) kids = [kids];
    if (!kids.length) return out + '/>';
    return out + '>' + kids.map(svgMarkup).join('') + '</' + tag + '>';
  }

  function markerNodes(subs, st, which) {
    var nodes = [];
    subs.forEach(function (sp) {
      if (sp.closed || sp.nodes.length < 2) return;
      var type = which === 'start' ? st.capStart : st.capEnd;
      if (!MARKERS[type]) return;
      var N = sp.nodes, p, q;
      if (which === 'start') {
        p = N[0].a; q = (N[0].r[0] !== p[0] || N[0].r[1] !== p[1]) ? N[0].r : N[1].a;
      } else {
        var L = N[N.length - 1]; p = L.a; q = (L.l[0] !== p[0] || L.l[1] !== p[1]) ? L.l : N[N.length - 2].a;
      }
      var dx = p[0] - q[0], dy = p[1] - q[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len, vx = -uy, vy = ux, w = st.width;
      var P = function (along, side) { return [p[0] + ux * along + vx * side, p[1] + uy * along + vy * side]; };
      var poly = function (pts, closed) {
        return { closed: closed, nodes: pts.map(function (a) { return { a: a, l: a, r: a }; }) };
      };
      var m = { kind: 'path', name: 'Наконечник', fill: null, stroke: null };
      if (type === 'triangle-arrow') { m.subs = [poly([P(w * 2, 0), P(-w * 3, w * 3.3), P(-w * 3, -w * 3.3)], true)]; m.fill = st.paint; }
      else if (type === 'line-arrow') {
        m.subs = [poly([P(-w * 2, w * 4.25), P(w * 2.5, 0), P(-w * 2, -w * 4.25)], false)];
        m.stroke = Object.assign({}, st, { capStart: 'round', capEnd: 'round', cap: 'round', join: 'round', align: 'center', style: 'solid' });
      }
      else if (type === 'square-marker') { var h = w * 2; m.subs = [poly([P(h, h), P(h, -h), P(-h, -h), P(-h, h)], true)]; m.fill = st.paint; }
      else if (type === 'diamond-marker') { var d = w * 2.5; m.subs = [poly([P(d, 0), P(0, d), P(-d, 0), P(0, -d)], true)]; m.fill = st.paint; }
      else if (type === 'circle-marker') {
        var r = w * 2, k = 0.5523 * r, c0 = p;
        m.subs = [{ closed: true, nodes: [
          { a: [c0[0] + r, c0[1]], l: [c0[0] + r, c0[1] - k], r: [c0[0] + r, c0[1] + k] },
          { a: [c0[0], c0[1] + r], l: [c0[0] + k, c0[1] + r], r: [c0[0] - k, c0[1] + r] },
          { a: [c0[0] - r, c0[1]], l: [c0[0] - r, c0[1] + k], r: [c0[0] - r, c0[1] - k] },
          { a: [c0[0], c0[1] - r], l: [c0[0] - k, c0[1] - r], r: [c0[0] + k, c0[1] - r] }] }];
        m.fill = st.paint;
      }
      if (m.subs) nodes.push(m);
    });
    return nodes;
  }

  // Отпечатки для обновления без пересборки: n.fpOwn — свои свойства узла (вместе с частями без id: фон, обводки рамки),
  // n.fpAll — всё поддерево. FNV-1a, 32 бита. (Не h/o: у фигур h — высота.)
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function hashTree(n) {
    var own = {}, k, parts = [], kids = [];
    for (k in n) if (n.hasOwnProperty(k) && k !== 'children' && k !== 'fpAll' && k !== 'fpOwn' && k !== 'file') own[k] = n[k];
    (n.children || []).forEach(function (ch) {
      if (ch.id) kids.push(ch.id + '=' + hashTree(ch));
      else parts.push(JSON.stringify(ch));
    });
    n.fpOwn = fnv(JSON.stringify(own) + '|' + parts.join(','));
    n.fpAll = fnv(n.fpOwn + ':' + kids.join(','));
    return n.fpAll;
  }

  function convert(file, pageId, boardId, opts) {
    opts = opts || {};
    var objs = objectsOf(file, pageId);
    var board = objs[boardId];
    if (!board) throw new Error(T('Доска не найдена: ', 'Board not found: ') + boardId);
    var bx = board.x, by = board.y;
    var warnings = [], media = {};
    var stats = { shapes: 0 }, svgRaw = [];
    var keepHidden = opts.hidden !== 'skip' && opts.skipHidden !== true;

    function warn(name, msg) { warnings.push((name ? '«' + name + '»: ' : '') + msg); }
    function rectGeom(s) { return { x: s.x - bx, y: s.y - by, w: s.width, h: s.height }; }
    function copy(dst, src) { for (var k in src) dst[k] = src[k]; return dst; }

    function strokesOf(s) {
      var w = function (m) { warn(s.name, m); };
      var list = (s.strokes || []).map(function (st) {
        var c = convStroke(st, s, w);
        if (!c) return null;
        var g = st.strokeColorGradient ? convFill({ fillColorGradient: st.strokeColorGradient, fillOpacity: st.strokeOpacity }, w) : null;
        c.paint = g || { type: 'solid', color: c.color, opacity: c.opacity };
        c.capStart = st.strokeCapStart || null; c.capEnd = st.strokeCapEnd || null;
        return c;
      }).filter(Boolean);
      return list.reverse();
    }

    function filledShape(s, geomKind, extra) {
      var w = function (m) { warn(s.name, m); };
      var fills = convFills(s.fills, w);
      var strokes = strokesOf(s);
      var g = rectGeom(s);
      var items = [];
      var mk = function (fill, stroke) {
        var n = copy({ kind: geomKind, name: s.name || geomKind, opacity: 1 }, g);
        copy(n, extra);
        n.fill = fill || null; n.stroke = stroke || null;
        return n;
      };
      fills.forEach(function (f) {
        if (f.type === 'image') {
          media[f.mediaId] = { id: f.mediaId, mtype: f.mtype };
          var im = copy({ kind: 'image', name: s.name || 'image', opacity: f.opacity }, g);
          im.mediaId = f.mediaId; im.mtype = f.mtype; im.iw = f.iw; im.ih = f.ih; im.keepAspect = f.keepAspect;
          im.clip = geomKind === 'rect' ? { kind: 'rect', radii: extra.radii || [0, 0, 0, 0] } :
                    geomKind === 'ellipse' ? { kind: 'ellipse' } : { kind: 'path', subs: extra.subs };
          items.push(im);
        } else items.push(mk(f, null));
      });
      var markers = [];
      strokes.forEach(function (st, i) {
        var hasMarkers = geomKind === 'path' && (MARKERS[st.capStart] || MARKERS[st.capEnd]);
        if (hasMarkers) {
          markers = markers.concat(markerNodes(extra.subs, st, 'start'), markerNodes(extra.subs, st, 'end'));
          st.cap = 'butt';
        } else {
          var c = st.capStart || st.capEnd;
          if (c === 'round' || c === 'square') st.cap = c;
        }
        var last = items[items.length - 1];
        if (strokes.length === 1 && last && last.kind !== 'image' && !last.stroke && items.length === fills.length) last.stroke = st;
        else items.push(mk(null, st));
      });
      items = items.concat(markers);
      if (!items.length) return null;
      if (items.length === 1) return items[0];
      return { kind: 'group', name: s.name || 'group', children: items, opacity: 1 };
    }

    function decorate(n, s, allowMatrix) {
      if (!n) return n;
      n.id = s.id;
      n.name = s.name || n.name;
      n.opacity = (n.kind === 'group' || n.kind === 'text' || n.kind === 'svg') ? num(s.opacity, 1) : num(s.opacity, 1) * (n.opacity == null ? 1 : n.opacity);
      if (s.blendMode && s.blendMode !== 'normal') n.blend = s.blendMode;
      if (s.hidden) n.hidden = true;
      var sh = convShadows(s);
      if (sh.length) n.shadows = sh;
      var lb = layerBlurOf(s), bb = backgroundBlurOf(s);
      if (lb) n.blur = lb;
      if (bb) n.bgBlur = bb;
      if (allowMatrix && !isIdentity(s.transform)) {
        copy(n, decompose(s.transform, s));
        n.cx = s.x - bx + s.width / 2; n.cy = s.y - by + s.height / 2;
      }
      return n;
    }

    function conv(id) {
      var s = objs[id];
      if (!s) return null;
      if (s.hidden && !keepHidden) return null;
      stats.shapes++;
      var n;
      switch (s.type) {
        case 'frame': return convFrame(s, false);
        case 'group': {
          n = { kind: 'group', name: s.name, children: (s.shapes || []).map(conv).filter(Boolean) };
          if (s.maskedGroup) n.mask = true;
          if (!n.children.length) return null;
          return decorate(n, s, false);
        }
        case 'rect': return decorate(filledShape(s, 'rect', { radii: radii(s) }), s, true);
        case 'circle': return decorate(filledShape(s, 'ellipse', {}), s, true);
        case 'path': case 'bool': {
          var subs = parsePath(s.content, bx, by);
          if (!subs.length) {
            if (s.type === 'bool' && s.shapes && s.shapes.length) {
              warn(s.name, T('логическая операция без готового контура — перенесены исходные фигуры', 'boolean without a ready path — source shapes transferred'));
              n = { kind: 'group', name: s.name, children: s.shapes.map(conv).filter(Boolean) };
              return n.children.length ? decorate(n, s, false) : null;
            }
            warn(s.name, T('пустой контур', 'empty path')); return null;
          }
          return decorate(filledShape(s, 'path', { subs: subs }), s, false);
        }
        case 'text': {
          n = convText(s, bx, by);
          var ts = strokesOf(s);
          if (ts.length) n.textStroke = ts[ts.length - 1];
          return decorate(n, s, true);
        }
        case 'image': {
          var m = s.metadata || {};
          media[m.id] = { id: m.id, mtype: m.mtype };
          n = copy({ kind: 'image', name: s.name, opacity: 1 }, rectGeom(s));
          n.mediaId = m.id; n.mtype = m.mtype; n.iw = m.width; n.ih = m.height; n.keepAspect = true;
          n.clip = { kind: 'rect', radii: radii(s) };
          return decorate(n, s, true);
        }
        case 'svg-raw': {
          var INVIS = { defs: 1, title: 1, desc: 1, metadata: 1, style: 1, lineargradient: 1, radialgradient: 1, filter: 1, clippath: 1, mask: 1, pattern: 1, symbol: 1, marker: 1 };
          var visible = function (c) {
            if (c == null || typeof c === 'string') return false;
            var tag = String(c.tag || '').toLowerCase();
            if (INVIS[tag]) return false;
            if (tag === 'g' || tag === 'svg') {
              var kids = c.content || c.children || [];
              if (!Array.isArray(kids)) kids = [kids];
              return kids.some(visible);
            }
            return true;
          };
          if (s.name === 'svg-defs' || !visible(s.content)) { stats.shapes--; return null; }
          var sr = s.selrect || { x: s.x, y: s.y, width: s.width, height: s.height };
          var vb = s.svgViewbox;
          var inner = svgMarkup(s.content);
          var defs = '';
          if (s.svgDefs) Object.keys(s.svgDefs).forEach(function (k) { defs += svgMarkup(s.svgDefs[k]); });
          var markup = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + sr.width + '" height="' + sr.height +
            '" viewBox="' + (vb ? [vb.x, vb.y, vb.width, vb.height].join(' ') : [sr.x, sr.y, sr.width, sr.height].join(' ')) + '">' +
            (defs ? '<defs>' + defs + '</defs>' : '') + inner + '</svg>';
          n = { kind: 'svg', name: s.name, x: sr.x - bx, y: sr.y - by, w: sr.width, h: sr.height, markup: markup };
          svgRaw.push(s.name || 'svg');
          return decorate(n, s, false);
        }
        default: warn(s.name, T('тип «', 'type “') + s.type + T('» не поддерживается', '” is not supported')); return null;
      }
    }

    function layoutOrder(s) {
      var ids = (s.shapes || []).slice();
      if (!s.layout) return ids;
      var dir = s.layoutFlexDir || s.layoutFlexDirection || '';
      var reverse = s.layout === 'flex' && /reverse/.test(String(dir));
      var zi = function (id) { var o = objs[id]; return o ? num(o.layoutItemZIndex, 0) : 0; };
      return ids.map(function (id, i) { return [i, id]; }).sort(function (A, B) {
        var za = zi(A[1]), zb = zi(B[1]);
        if (za > zb) return 1;
        if (za < zb) return -1;
        if (reverse) return A[0] - B[0];
        return B[0] - A[0];
      }).map(function (p) { return p[1]; });
    }

    function frameMatrix(s) {
      if (isIdentity(s.transform)) return null;
      return copy(decompose(s.transform, s), { cx: s.x - bx + s.width / 2, cy: s.y - by + s.height / 2 });
    }

    function gridGuides(s) {
      var out = { v: [], h: [] };
      (s.grids || []).forEach(function (gr) {
        var p = gr.params || {};
        if (gr.type === 'column' || gr.type === 'row') {
          var total = gr.type === 'column' ? s.width : s.height;
          var n = Math.max(1, num(p.size, 1)), mg = num(p.margin, 0), gt = num(p.gutter, 0), item = num(p.itemLength, 0);
          var start, len;
          if (p.type === 'stretch' || !item) { len = (total - 2 * mg - (n - 1) * gt) / n; start = mg; }
          else {
            len = item;
            var all = n * len + (n - 1) * gt;
            start = p.type === 'center' ? (total - all) / 2 : (p.type === 'right' || p.type === 'bottom' ? total - mg - all : mg);
          }
          var arr = gr.type === 'column' ? out.v : out.h;
          for (var i = 0; i < n; i++) { var a = start + i * (len + gt); arr.push(a, a + len); }
        } else if (gr.type === 'square') {
          var sz = num(p.size, 0);
          if (sz >= 8) {
            for (var x = sz; x < s.width; x += sz) out.v.push(x);
            for (var y = sz; y < s.height; y += sz) out.h.push(y);
          }
        }
      });
      var uniq = function (a) { var m = {}; return a.filter(function (v) { v = Math.round(v * 100) / 100; if (m[v]) return false; m[v] = 1; return true; }); };
      out.v = uniq(out.v); out.h = uniq(out.h);
      return out.v.length || out.h.length ? out : null;
    }

    function convFrame(s, isBoard) {
      var n = { kind: 'group', name: s.name, frame: true };
      var fm = isBoard ? null : frameMatrix(s);
      var children = [];
      var bg = filledShape(copy(copy({}, s), { strokes: [] }), 'rect', { radii: radii(s) });
      if (bg) {
        bg.name = isBoard ? 'Фон доски' : 'Фон';
        if (fm) copy(bg, fm);
        children.push(bg);
      }
      layoutOrder(s).forEach(function (cid) { var c = conv(cid); if (c) children.push(c); });
      var strokes = strokesOf(s);
      strokes.forEach(function (st) {
        var so = copy({ kind: 'rect', name: 'Обводка', opacity: 1, radii: radii(s), fill: null, stroke: st }, rectGeom(s));
        if (fm) copy(so, fm);
        children.push(so);
      });
      n.children = children;
      if (!s.showContent) {
        var g2 = rectGeom(s);
        n.clip = { kind: 'rect', x: g2.x, y: g2.y, w: g2.w, h: g2.h, radii: radii(s) };
        if (fm) copy(n.clip, fm);
      }
      if (!children.length) return null;
      decorate(n, s, false);
      if (isBoard) { n.opacity = 1; delete n.hidden; delete n.blend; }
      return n;
    }

    var tree = convFrame(board, true) || { kind: 'group', name: board.name, children: [] };
    tree.id = boardId;
    hashTree(tree);
    var guides = gridGuides(board);
    return {
      board: { id: boardId, name: board.name, w: board.width, h: board.height, x: board.x, y: board.y, guides: guides },
      tree: tree,
      media: Object.keys(media).map(function (k) { return media[k]; }),
      warnings: warnings,
      svgRaw: svgRaw,
      stats: stats
    };
  }

  function fontsUsed(file, pageId, boardIds) {
    var objs = objectsOf(file, pageId), set = {};
    var want = {};
    boardIds.forEach(function (b) { want[b] = true; });
    Object.keys(objs).forEach(function (id) {
      var s = objs[id];
      if (s.type !== 'text' || !want[s.frameId] && !want[topBoard(objs, s)]) return;
      convText(s, 0, 0).paras.forEach(function (p) {
        p.runs.forEach(function (r) {
          var k = r.family + '|' + r.weight + '|' + (r.italic ? 'i' : 'n');
          set[k] = { family: r.family, weight: r.weight, italic: r.italic };
        });
      });
    });
    return Object.keys(set).sort().map(function (k) { set[k].key = k; return set[k]; });
  }
  function topBoard(objs, s) {
    var cur = s, guard = 0;
    while (cur && cur.parentId && cur.parentId !== ROOT_ID && guard++ < 100) cur = objs[cur.parentId];
    return cur ? cur.id : null;
  }

  // ---- Библиотеки: цвета и типографика ----
  function values(m) {
    if (!m) return [];
    if (Array.isArray(m)) return m.slice();
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function fullName(it) {
    var parts = [];
    String(it.path || '').split('/').concat(String(it.name || '').split('/')).forEach(function (p) {
      p = p.trim(); if (p) parts.push(p);
    });
    return parts.join(' / ') || String(it.id || '');
  }
  function libColor(c) {
    if (!c || !c.id) return null;
    var out = { id: c.id, name: fullName(c), opacity: num(c.opacity, 1) };
    if (c.gradient && c.gradient.stops && c.gradient.stops.length) {
      var g = convFill({ fillColorGradient: c.gradient, fillOpacity: out.opacity }, function () {});
      if (!g) return null;
      out.type = g.type; out.stops = g.stops;
    } else if (c.color) {
      out.type = 'solid'; out.color = hex(c.color);
    } else return null;
    return out;
  }
  function libTypo(t) {
    if (!t || !t.id) return null;
    var fs = num(t.fontSize, 14);
    var lh = parseFloat(t.lineHeight);
    return {
      id: t.id, name: fullName(t),
      family: t.fontFamily || 'sourcesanspro',
      weight: parseInt(t.fontWeight, 10) || 400,
      italic: /italic/i.test(String(t.fontStyle || '') + String(t.fontVariantId || '')),
      size: fs,
      lh: isFinite(lh) && lh > 0 ? lh : 1.2,
      tracking: Math.round(num(t.letterSpacing, 0) / fs * 1000)
    };
  }
  // Цвета и типографика из data файла; only — {id: true}, если нужны не все.
  function libraryOf(file, only) {
    var d = file.data || file, out = { colors: [], typos: [] };
    values(d.colors).forEach(function (c) { if (!only || only[c && c.id]) { c = libColor(c); if (c) out.colors.push(c); } });
    values(d.typographies).forEach(function (t) { if (!only || only[t && t.id]) { t = libTypo(t); if (t) out.typos.push(t); } });
    var byName = function (a, b) { return a.name.localeCompare(b.name); };
    out.colors.sort(byName); out.typos.sort(byName);
    return out;
  }
  // Какие цвета/типографика библиотек использованы на досках: { colors: {id: fileId}, typos: {id: fileId} }.
  function refsUsed(file, pageId, boardIds) {
    var objs = objectsOf(file, pageId), want = {}, out = { colors: {}, typos: {} };
    var self = file.id || null;
    boardIds.forEach(function (b) { want[b] = true; });
    function col(id, f) { if (id) out.colors[id] = f || self; }
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      (node.fills || []).forEach(function (f) { if (f) col(f.fillColorRefId, f.fillColorRefFile); });
      if (node.typographyRefId) out.typos[node.typographyRefId] = node.typographyRefFile || self;
      (node.children || []).forEach(walk);
    }
    Object.keys(objs).forEach(function (id) {
      var s = objs[id];
      if (!s || s.id === ROOT_ID) return;
      if (!want[s.id] && !want[topBoard(objs, s)]) return;
      (s.fills || []).forEach(function (f) { if (f) col(f.fillColorRefId, f.fillColorRefFile); });
      (s.strokes || []).forEach(function (st) { if (st) col(st.strokeColorRefId, st.strokeColorRefFile); });
      if (s.type === 'text') walk(s.content);
    });
    return out;
  }

  function parseLink(link) {
    var m = String(link || '').match(/file-id=([0-9a-f-]{36})/i);
    var p = String(link || '').match(/page-id=([0-9a-f-]{36})/i);
    var host = String(link || '').match(/^(https?:\/\/[^\/?#]+)/i);
    return { fileId: m ? m[1] : null, pageId: p ? p[1] : null, server: host ? host[1] : null };
  }

  api = { lang: 'ru', pages: pages, boards: boards, convert: convert, fontsUsed: fontsUsed, parsePath: parsePath, parseLink: parseLink,
    libraryOf: libraryOf, refsUsed: refsUsed, hashTree: hashTree };
  if (typeof window !== 'undefined') window.P2A = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
