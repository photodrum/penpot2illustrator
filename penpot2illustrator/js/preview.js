(function (root) {
  'use strict';

  function f2(v) { return Math.round(v * 100) / 100; }

  function pathD(subs) {
    var d = '';
    subs.forEach(function (sp) {
      var N = sp.nodes;
      if (!N || !N.length) return;
      d += 'M' + f2(N[0].a[0]) + ' ' + f2(N[0].a[1]);
      for (var i = 1; i < N.length; i++) {
        var p = N[i - 1], c = N[i];
        d += 'C' + f2(p.r[0]) + ' ' + f2(p.r[1]) + ' ' + f2(c.l[0]) + ' ' + f2(c.l[1]) + ' ' + f2(c.a[0]) + ' ' + f2(c.a[1]);
      }
      if (sp.closed) {
        var l = N[N.length - 1], f = N[0];
        d += 'C' + f2(l.r[0]) + ' ' + f2(l.r[1]) + ' ' + f2(f.l[0]) + ' ' + f2(f.l[1]) + ' ' + f2(f.a[0]) + ' ' + f2(f.a[1]) + 'Z';
      }
    });
    return d;
  }

  function rrectD(x, y, w, h, R) {
    var m = Math.min(w, h) / 2;
    var a = Math.min(R[0] || 0, m), b = Math.min(R[1] || 0, m), c = Math.min(R[2] || 0, m), d = Math.min(R[3] || 0, m);
    return 'M' + f2(x + a) + ' ' + f2(y) + 'H' + f2(x + w - b) + (b ? 'A' + b + ' ' + b + ' 0 0 1 ' + f2(x + w) + ' ' + f2(y + b) : '') +
      'V' + f2(y + h - c) + (c ? 'A' + c + ' ' + c + ' 0 0 1 ' + f2(x + w - c) + ' ' + f2(y + h) : '') +
      'H' + f2(x + d) + (d ? 'A' + d + ' ' + d + ' 0 0 1 ' + f2(x) + ' ' + f2(y + h - d) : '') +
      'V' + f2(y + a) + (a ? 'A' + a + ' ' + a + ' 0 0 1 ' + f2(x + a) + ' ' + f2(y) : '') + 'Z';
  }

  function render(conv) {
    var defs = [], uid = 0;

    function transform(n) {
      if (n.matrix) {
        var M = n.matrix;
        return ' transform="translate(' + f2(n.cx) + ' ' + f2(n.cy) + ') matrix(' + [M.a, M.b, M.c, M.d, 0, 0].join(' ') + ') translate(' + f2(-n.cx) + ' ' + f2(-n.cy) + ')"';
      }
      var t = '';
      if (n.rot) t += 'rotate(' + f2(n.rot) + ' ' + f2(n.cx) + ' ' + f2(n.cy) + ') ';
      if (n.flip) t += 'translate(' + f2(2 * n.cx) + ' 0) scale(-1 1)';
      return t ? ' transform="' + t.trim() + '"' : '';
    }

    function paint(f) {
      if (!f) return 'none';
      if (f.type === 'solid') return f.color;
      if ((f.type === 'linear' || f.type === 'radial') && f.stops && f.stops.length) {
        var id = 'g' + (uid++);
        var stops = f.stops.map(function (s) {
          return '<stop offset="' + f2(s.offset) + '" stop-color="' + s.color + '" stop-opacity="' + f2(s.opacity) + '"/>';
        }).join('');
        if (f.type === 'linear') {
          defs.push('<linearGradient id="' + id + '" x1="' + f2(f.sx) + '" y1="' + f2(f.sy) + '" x2="' + f2(f.ex) + '" y2="' + f2(f.ey) + '">' + stops + '</linearGradient>');
        } else {
          var r = Math.sqrt(Math.pow(f.ex - f.sx, 2) + Math.pow(f.ey - f.sy, 2)) || 0.5;
          defs.push('<radialGradient id="' + id + '" cx="' + f2(f.sx) + '" cy="' + f2(f.sy) + '" r="' + f2(r) + '">' + stops + '</radialGradient>');
        }
        return 'url(#' + id + ')';
      }
      return '#9a9a9a';
    }

    function shapeAttrs(n) {
      var a = ' fill="' + paint(n.fill) + '"';
      if (n.fill && n.fill.opacity != null && n.fill.opacity < 1) a += ' fill-opacity="' + f2(n.fill.opacity) + '"';
      var st = n.stroke;
      if (st && st.width) {
        a += ' stroke="' + (st.paint && st.paint.type !== 'solid' ? paint(st.paint) : st.color) + '" stroke-width="' + f2(st.width) + '"';
        if (st.opacity != null && st.opacity < 1) a += ' stroke-opacity="' + f2(st.opacity) + '"';
        if (st.style === 'dashed') a += ' stroke-dasharray="' + f2(st.width * 3) + ' ' + f2(st.width * 2) + '"';
      }
      if (n.opacity != null && n.opacity < 1) a += ' opacity="' + f2(n.opacity) + '"';
      return a + transform(n);
    }

    function geom(n, attrs) {
      if (n.kind === 'ellipse') return '<ellipse cx="' + f2(n.x + n.w / 2) + '" cy="' + f2(n.y + n.h / 2) + '" rx="' + f2(n.w / 2) + '" ry="' + f2(n.h / 2) + '"' + attrs + '/>';
      if (n.kind === 'path') return '<path d="' + pathD(n.subs || []) + '"' + attrs + (n.subs && n.subs.length > 1 ? ' fill-rule="evenodd"' : '') + '/>';
      var R = n.radii || [0, 0, 0, 0];
      if (!R[0] && !R[1] && !R[2] && !R[3]) return '<rect x="' + f2(n.x) + '" y="' + f2(n.y) + '" width="' + f2(n.w) + '" height="' + f2(n.h) + '"' + attrs + '/>';
      return '<path d="' + rrectD(n.x, n.y, n.w, n.h, R) + '"' + attrs + '/>';
    }

    function text(n) {
      var out = '', y = n.y, op = n.opacity != null && n.opacity < 1 ? ' opacity="' + f2(n.opacity) + '"' : '';
      (n.paras || []).forEach(function (p) {
        var lead = p.lead || 16;
        if (p.empty || !p.runs.length) { y += lead; return; }
        var size = p.size || 14, chars = 0;
        p.runs.forEach(function (r) { chars += r.text.length; });
        var full = chars * size * 0.52;
        var lines = n.mode === 'point' ? 1 : Math.max(1, Math.ceil(full / Math.max(n.w, 1)));
        var color = p.runs[0].color || '#000000';
        for (var i = 0; i < lines; i++) {
          var w = n.mode === 'point' ? full : (i === lines - 1 ? Math.max(full - n.w * (lines - 1), n.w * 0.3) : n.w);
          w = Math.min(w, n.w || w);
          var x = p.align === 'center' ? n.x + (n.w - w) / 2 : (p.align === 'right' ? n.x + n.w - w : n.x);
          out += '<rect x="' + f2(x) + '" y="' + f2(y + (lead - size * 0.62) / 2) + '" width="' + f2(w) + '" height="' + f2(size * 0.62) + '" rx="' + f2(size * 0.15) + '" fill="' + color + '" fill-opacity="0.75"/>';
          y += lead;
        }
      });
      return '<g' + op + transform(n) + '>' + out + '</g>';
    }

    function node(n) {
      if (!n || n.hidden) return '';
      switch (n.kind) {
        case 'group': {
          var inner = (n.children || []).map(node).join('');
          if (!inner) return '';
          var clip = '';
          if (n.clip) {
            var cid = 'c' + (uid++), c = n.clip;
            defs.push('<clipPath id="' + cid + '"><path d="' + rrectD(c.x, c.y, c.w, c.h, c.radii || [0, 0, 0, 0]) + '"' + transform(c) + '/></clipPath>');
            clip = ' clip-path="url(#' + cid + ')"';
          }
          var op = n.opacity != null && n.opacity < 1 ? ' opacity="' + f2(n.opacity) + '"' : '';
          return '<g' + clip + op + '>' + inner + '</g>';
        }
        case 'rect': case 'ellipse': case 'path': return geom(n, shapeAttrs(n));
        case 'image': {
          var cl = n.clip || { kind: 'rect' };
          var g = { kind: cl.kind === 'ellipse' ? 'ellipse' : (cl.kind === 'path' ? 'path' : 'rect'), x: n.x, y: n.y, w: n.w, h: n.h,
                    radii: cl.radii, subs: cl.subs, rot: n.rot, flip: n.flip, matrix: n.matrix, cx: n.cx, cy: n.cy };
          return geom(g, ' fill="#8c8c8c" fill-opacity="0.55"' + transform(g));
        }
        case 'text': return text(n);
        case 'svg': return n.markup ? '<g transform="translate(' + f2(n.x) + ' ' + f2(n.y) + ')"' + (n.opacity != null && n.opacity < 1 ? ' opacity="' + f2(n.opacity) + '"' : '') + '>' + n.markup + '</g>' : '';
        default: return '';
      }
    }

    var b = conv.board, body = node(conv.tree);
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + f2(b.w) + ' ' + f2(b.h) +
      '" width="' + f2(b.w) + '" height="' + f2(b.h) + '" preserveAspectRatio="xMidYMid meet">' +
      (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') +
      '<clipPath id="board"><rect width="' + f2(b.w) + '" height="' + f2(b.h) + '"/></clipPath><g clip-path="url(#board)">' + body + '</g></svg>';
  }

  function preview(file, pageId, boardId) {
    var conv = root.P2A.convert(file, pageId, boardId, { hidden: 'skip' });
    return render(conv);
  }
  function dataUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

  root.P2A.previewSvg = preview;
  root.P2A.renderPreview = render;
  root.P2A.svgDataUrl = dataUrl;
})(typeof window !== 'undefined' ? window : this);
