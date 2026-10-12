(function () {
  'use strict';
  var root = document.getElementById('cv-app');
  if (!root) return;

  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8');

  // ---------- helpers ----------
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' o';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' Ko';
    return (n / 1048576).toFixed(2) + ' Mo';
  }

  function baseName(name) {
    var i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  }

  function readText(file) {
    return file.text ? file.text() : new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result)); };
      r.onerror = rej;
      r.readAsText(file);
    });
  }

  function readBytes(file) {
    return file.arrayBuffer ? file.arrayBuffer().then(function (b) { return new Uint8Array(b); }) :
      new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(new Uint8Array(r.result)); };
        r.onerror = rej;
        r.readAsArrayBuffer(file);
      });
  }

  function textOut(name, text, type) {
    return { name: name, blob: new Blob([text], { type: type || 'text/plain;charset=utf-8' }) };
  }

  // ---------- images ----------
  var FORMATS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Image illisible : ' + file.name)); };
      img.src = url;
    });
  }

  function toBlob(canvas, type, q) {
    return new Promise(function (res) { canvas.toBlob(res, type, q); });
  }

  async function imgRun(files, o, warn) {
    var out = [];
    for (var f of files) {
      var bmp = await loadBitmap(f);
      var w = bmp.width, h = bmp.height;
      var scale = (parseFloat(o.scale) || 100) / 100;
      var maxw = parseFloat(o.maxw) || 0;
      if (maxw > 0) scale = Math.min(scale, maxw / w);
      var dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
      var rot = parseInt(o.rotate, 10) || 0;
      var swap = rot === 90 || rot === 270;
      var c = document.createElement('canvas');
      c.width = swap ? dh : dw;
      c.height = swap ? dw : dh;
      var ctx = c.getContext('2d');
      if (o.format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(rot * Math.PI / 180);
      ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
      if (o.gray) {
        var id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
        for (var i = 0; i < d.length; i += 4) {
          var g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        ctx.putImageData(id, 0, 0);
      }
      var blob = await toBlob(c, o.format, (parseFloat(o.quality) || 90) / 100);
      if (!blob) throw new Error('Conversion impossible : ' + f.name);
      if (blob.type && blob.type !== o.format) {
        warn('Ce navigateur ne sait pas écrire ce format, ' + f.name + ' a été enregistré en ' + blob.type + '.');
      }
      out.push({ name: baseName(f.name) + '.' + (FORMATS[blob.type] || 'png'), blob: blob });
    }
    return out;
  }

  // ---------- image -> PDF ----------
  function buildPdf(pages, mode) {
    var parts = [], len = 0, offs = [];
    function push(x) {
      var b = typeof x === 'string' ? enc.encode(x) : x;
      parts.push(b);
      len += b.length;
    }
    function num(v) { return (Math.round(v * 100) / 100).toString(); }
    push('%PDF-1.4\n%âãÏÓ\n');
    var kids = pages.map(function (p, i) { return (3 + i * 3) + ' 0 R'; }).join(' ');
    offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offs[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>\nendobj\n');
    pages.forEach(function (p, i) {
      var po = 3 + i * 3, co = po + 1, io = po + 2;
      var pw, ph, dw, dh, x, y;
      if (mode === 'a4') {
        pw = 595.28; ph = 841.89;
        var s = Math.min((pw - 40) / p.w, (ph - 40) / p.h);
        dw = p.w * s; dh = p.h * s; x = (pw - dw) / 2; y = (ph - dh) / 2;
      } else {
        pw = dw = p.w * 0.75; ph = dh = p.h * 0.75; x = 0; y = 0;
      }
      var content = 'q ' + num(dw) + ' 0 0 ' + num(dh) + ' ' + num(x) + ' ' + num(y) + ' cm /Im0 Do Q';
      offs[po] = len;
      push(po + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(pw) + ' ' + num(ph) + '] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>\nendobj\n');
      offs[co] = len;
      push(co + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
      offs[io] = len;
      push(io + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
      push(p.jpeg);
      push('\nendstream\nendobj\n');
    });
    var total = 2 + pages.length * 3;
    var xref = len;
    var x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= total; n++) x += ('0000000000' + offs[n]).slice(-10) + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  async function pdfRun(files, o) {
    var pages = [];
    for (var f of files) {
      var bmp = await loadBitmap(f);
      var c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0);
      var blob = await toBlob(c, 'image/jpeg', 0.92);
      pages.push({ w: c.width, h: c.height, jpeg: await readBytes(blob) });
    }
    return [{ name: 'images.pdf', blob: buildPdf(pages, o.size) }];
  }

  // ---------- CSV / JSON ----------
  function detectDelim(text) {
    var line = text.split(/\r?\n/)[0] || '';
    var best = ',', max = -1;
    [',', ';', '\t', '|'].forEach(function (d) {
      var n = line.split(d).length;
      if (n > max) { max = n; best = d; }
    });
    return best;
  }

  function parseCSV(text, delim) {
    var rows = [], row = [], cur = '', q = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        rows.push(row); row = [];
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
  }

  function toCSV(rows, delim) {
    return rows.map(function (r) {
      return r.map(function (v) {
        v = v == null ? '' : String(v);
        return /["\n\r]/.test(v) || v.indexOf(delim) >= 0 ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(delim);
    }).join('\n') + '\n';
  }

  function rowsToObjects(rows) {
    var head = rows[0] || [];
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (k, i) { o[k] = r[i] === undefined ? '' : r[i]; });
      return o;
    });
  }

  function jsonToRows(data) {
    if (!Array.isArray(data)) data = [data];
    if (data.length && Array.isArray(data[0])) return data;
    var keys = [];
    data.forEach(function (o) {
      Object.keys(o || {}).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    });
    return [keys].concat(data.map(function (o) {
      return keys.map(function (k) {
        var v = o[k];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
    }));
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function dataRun(files, o) {
    var out = [];
    for (var f of files) {
      var text = await readText(f), n = baseName(f.name), k = o.mode;
      if (k === 'csv2json') {
        out.push(textOut(n + '.json', JSON.stringify(rowsToObjects(parseCSV(text, detectDelim(text))), null, 2), 'application/json'));
      } else if (k === 'json2csv') {
        out.push(textOut(n + '.csv', toCSV(jsonToRows(JSON.parse(text)), ','), 'text/csv'));
      } else if (k === 'csv2tsv') {
        out.push(textOut(n + '.tsv', toCSV(parseCSV(text, detectDelim(text)), '\t'), 'text/tab-separated-values'));
      } else if (k === 'tsv2csv') {
        out.push(textOut(n + '.csv', toCSV(parseCSV(text, '\t'), ','), 'text/csv'));
      } else if (k === 'csv2html') {
        var rows = parseCSV(text, detectDelim(text));
        var html = '<table border="1" cellpadding="4" cellspacing="0">\n' + rows.map(function (r, i) {
          var t = i === 0 ? 'th' : 'td';
          return '<tr>' + r.map(function (c) { return '<' + t + '>' + escHtml(c) + '</' + t + '>'; }).join('') + '</tr>';
        }).join('\n') + '\n</table>\n';
        out.push(textOut(n + '.html', html, 'text/html'));
      } else if (k === 'jsonpretty') {
        out.push(textOut(n + '.json', JSON.stringify(JSON.parse(text), null, 2), 'application/json'));
      } else if (k === 'jsonmin') {
        out.push(textOut(n + '.min.json', JSON.stringify(JSON.parse(text)), 'application/json'));
      }
    }
    return out;
  }

  // ---------- text ----------
  function md2html(md) {
    function inline(s) {
      s = escHtml(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      return s;
    }
    var lines = md.replace(/\r\n?/g, '\n').split('\n'), out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i], m;
      if (/^```/.test(l)) {
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push('<pre><code>' + escHtml(code.join('\n')) + '</code></pre>');
      } else if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
        out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++;
      } else if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) {
        out.push('<hr>'); i++;
      } else if (/^>\s?/.test(l)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>');
      } else if (/^\s*[-*+]\s+/.test(l)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) ul.push('<li>' + inline(lines[i++].replace(/^\s*[-*+]\s+/, '')) + '</li>');
        out.push('<ul>' + ul.join('') + '</ul>');
      } else if (/^\s*\d+\.\s+/.test(l)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) ol.push('<li>' + inline(lines[i++].replace(/^\s*\d+\.\s+/, '')) + '</li>');
        out.push('<ol>' + ol.join('') + '</ol>');
      } else if (l.trim() === '') {
        i++;
      } else {
        var p = [];
        while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) p.push(lines[i++]);
        out.push('<p>' + inline(p.join(' ')) + '</p>');
      }
    }
    return out.join('\n') + '\n';
  }

  async function textRun(files, o) {
    var out = [];
    for (var f of files) {
      var text = await readText(f), n = baseName(f.name), k = o.mode;
      if (k === 'md2html') {
        out.push(textOut(n + '.html', '<!doctype html><meta charset="utf-8">\n' + md2html(text), 'text/html'));
      } else if (k === 'html2txt') {
        var doc = new DOMParser().parseFromString(text.replace(/<\/(p|div|h[1-6]|li|tr|section|article)\s*>|<br\s*\/?>/gi, '$&\n'), 'text/html');
        out.push(textOut(n + '.txt', (doc.body ? doc.body.textContent : text).replace(/\n{3,}/g, '\n\n').trim() + '\n'));
      } else if (k === 'crlf2lf') {
        out.push(textOut(n + '.txt', text.replace(/\r\n?/g, '\n')));
      } else if (k === 'lf2crlf') {
        out.push(textOut(n + '.txt', text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')));
      } else if (k === 'sort') {
        out.push(textOut(n + '.txt', text.replace(/\r\n?/g, '\n').split('\n').filter(Boolean).sort(function (a, b) { return a.localeCompare(b); }).join('\n') + '\n'));
      } else if (k === 'dedupe') {
        var seen = {};
        out.push(textOut(n + '.txt', text.replace(/\r\n?/g, '\n').split('\n').filter(function (x) {
          if (seen[x]) return false; seen[x] = 1; return true;
        }).join('\n')));
      } else if (k === 'upper') {
        out.push(textOut(n + '.txt', text.toUpperCase()));
      } else if (k === 'lower') {
        out.push(textOut(n + '.txt', text.toLowerCase()));
      } else if (k === 'stats') {
        var words = (text.match(/\S+/g) || []).length;
        out.push(textOut(n + '-stats.txt', 'Fichier : ' + f.name + '\nCaractères : ' + text.length + '\nMots : ' + words + '\nLignes : ' + text.split(/\r?\n/).length + '\n'));
      }
    }
    return out;
  }

  // ---------- encoding / hashes ----------
  function bytesToB64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  async function encRun(files, o) {
    var out = [];
    if (o.mode === 'hash') {
      var report = '';
      for (var f of files) {
        var d = await crypto.subtle.digest(o.algo, await readBytes(f));
        report += hex(d) + '  ' + f.name + '\n';
      }
      return [textOut('empreintes-' + o.algo.toLowerCase() + '.txt', report)];
    }
    for (var g of files) {
      if (o.mode === 'b64enc') {
        out.push(textOut(g.name + '.b64.txt', bytesToB64(await readBytes(g)) + '\n'));
      } else if (o.mode === 'b64dec') {
        var t = (await readText(g)).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
        var bin = atob(t), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        out.push({ name: (o.outname || baseName(baseName(g.name)) + '.bin'), blob: new Blob([arr]) });
      } else if (o.mode === 'hex') {
        var bytes = await readBytes(g), lines = [];
        for (var p = 0; p < bytes.length; p += 16) {
          var chunk = Array.prototype.slice.call(bytes.subarray(p, p + 16));
          lines.push(('00000000' + p.toString(16)).slice(-8) + '  ' + chunk.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ').padEnd(47) + '  ' +
            chunk.map(function (b) { return b >= 32 && b < 127 ? String.fromCharCode(b) : '.'; }).join(''));
        }
        out.push(textOut(g.name + '.hex.txt', lines.join('\n') + '\n'));
      }
    }
    return out;
  }

  // ---------- audio -> WAV ----------
  function encodeWav(audio, mono) {
    var ch = mono ? 1 : audio.numberOfChannels, rate = audio.sampleRate, n = audio.length;
    var data = new Int16Array(n * ch);
    var chans = [];
    for (var c = 0; c < audio.numberOfChannels; c++) chans.push(audio.getChannelData(c));
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < ch; k++) {
        var s;
        if (mono) {
          s = 0;
          for (var m = 0; m < chans.length; m++) s += chans[m][i];
          s /= chans.length;
        } else s = chans[k][i];
        s = Math.max(-1, Math.min(1, s));
        data[i * ch + k] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }
    var buf = new ArrayBuffer(44 + data.length * 2), v = new DataView(buf);
    function str(o, t) { for (var j = 0; j < t.length; j++) v.setUint8(o + j, t.charCodeAt(j)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, data.length * 2, true);
    new Int16Array(buf, 44).set(data);
    return new Blob([buf], { type: 'audio/wav' });
  }

  async function audioRun(files, o) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Ce navigateur ne sait pas décoder l\'audio.');
    var ctx = new AC(), out = [];
    for (var f of files) {
      var ab = (await readBytes(f)).buffer;
      var audio = await new Promise(function (res, rej) {
        var p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      out.push({ name: baseName(f.name) + '.wav', blob: encodeWav(audio, !!o.mono) });
    }
    if (ctx.close) ctx.close();
    return out;
  }

  // ---------- ZIP ----------
  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function makeZip(items) {
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (var it of items) {
      var name = enc.encode(it.name), data = await readBytes(it.blob), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    var csize = 0;
    central.forEach(function (c) { csize += c.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, items.length, true); end.setUint16(10, items.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser ce ZIP.');
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(file) {
    var b = await readBytes(file), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var e = b.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Archive ZIP invalide : ' + file.name);
    var count = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), out = [];
    for (var i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Archive ZIP corrompue.');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.slice(-1) === '/') continue;
      var lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
      var start = lho + 30 + lnlen + lxlen, raw = b.subarray(start, start + csize);
      var data = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
      if (!data) throw new Error('Méthode de compression non prise en charge : ' + name);
      out.push({ name: name.split('/').pop(), blob: new Blob([data]) });
    }
    return out;
  }

  async function zipRun(files, o) {
    if (o.mode === 'unzip') {
      var all = [];
      for (var f of files) all = all.concat(await unzip(f));
      return all;
    }
    return [{ name: 'archive.zip', blob: await makeZip(files.map(function (f) { return { name: f.name, blob: f }; })) }];
  }

  // ---------- tool definitions ----------
  var TOOLS = [
    {
      id: 'img', label: 'Images', accept: 'image/*', multiple: true, run: imgRun,
      hint: 'Convertissez, compressez, redimensionnez et pivotez vos images (PNG, JPEG, WebP).',
      opts: [
        { id: 'format', label: 'Format de sortie', type: 'select', val: 'image/jpeg', values: [['image/jpeg', 'JPEG (.jpg)'], ['image/png', 'PNG (.png)'], ['image/webp', 'WebP (.webp)']] },
        { id: 'quality', label: 'Qualité (JPEG / WebP)', type: 'range', min: 10, max: 100, val: 90 },
        { id: 'scale', label: 'Taille en %', type: 'number', val: 100 },
        { id: 'maxw', label: 'Largeur maximale (px, optionnel)', type: 'number', val: '' },
        { id: 'rotate', label: 'Rotation', type: 'select', val: '0', values: [['0', 'Aucune'], ['90', '90° droite'], ['180', '180°'], ['270', '90° gauche']] },
        { id: 'gray', label: 'Noir et blanc', type: 'checkbox', val: false }
      ]
    },
    {
      id: 'pdf', label: 'Image → PDF', accept: 'image/*', multiple: true, run: pdfRun,
      hint: 'Assemblez une ou plusieurs images dans un seul document PDF, une image par page.',
      opts: [{ id: 'size', label: 'Taille de page', type: 'select', val: 'a4', values: [['a4', 'A4 (image centrée)'], ['fit', 'Taille de l\'image']] }]
    },
    {
      id: 'data', label: 'CSV / JSON', accept: '.csv,.tsv,.json,.txt,text/*,application/json', multiple: true, run: dataRun,
      hint: 'Passez d\'un format de données à l\'autre : tableur, JSON, TSV, tableau HTML.',
      opts: [{
        id: 'mode', label: 'Conversion', type: 'select', val: 'csv2json', values: [
          ['csv2json', 'CSV → JSON'], ['json2csv', 'JSON → CSV'], ['csv2tsv', 'CSV → TSV'], ['tsv2csv', 'TSV → CSV'],
          ['csv2html', 'CSV → tableau HTML'], ['jsonpretty', 'JSON → mis en forme'], ['jsonmin', 'JSON → minifié']]
      }]
    },
    {
      id: 'text', label: 'Texte', accept: '.txt,.md,.markdown,.html,.htm,text/*', multiple: true, run: textRun,
      hint: 'Markdown en HTML, HTML en texte, fins de ligne, tri, doublons, majuscules et statistiques.',
      opts: [{
        id: 'mode', label: 'Opération', type: 'select', val: 'md2html', values: [
          ['md2html', 'Markdown → HTML'], ['html2txt', 'HTML → texte brut'], ['crlf2lf', 'Fins de ligne Windows → Unix'],
          ['lf2crlf', 'Fins de ligne Unix → Windows'], ['sort', 'Trier les lignes A → Z'], ['dedupe', 'Supprimer les doublons'],
          ['upper', 'MAJUSCULES'], ['lower', 'minuscules'], ['stats', 'Compter caractères, mots et lignes']]
      }]
    },
    {
      id: 'enc', label: 'Encodage', accept: '*/*', multiple: true, run: encRun,
      hint: 'Base64, empreintes SHA et affichage hexadécimal de n\'importe quel fichier.',
      opts: [
        { id: 'mode', label: 'Opération', type: 'select', val: 'b64enc', values: [['b64enc', 'Fichier → Base64'], ['b64dec', 'Base64 → fichier'], ['hash', 'Empreinte du fichier'], ['hex', 'Affichage hexadécimal']] },
        { id: 'algo', label: 'Algorithme (empreinte)', type: 'select', val: 'SHA-256', values: [['SHA-256', 'SHA-256'], ['SHA-1', 'SHA-1'], ['SHA-512', 'SHA-512']] },
        { id: 'outname', label: 'Nom du fichier décodé (Base64 → fichier)', type: 'text', val: '' }
      ]
    },
    {
      id: 'audio', label: 'Audio → WAV', accept: 'audio/*,.mp3,.m4a,.ogg,.aac,.flac,.wav', multiple: true, run: audioRun,
      hint: 'Convertissez un fichier audio (MP3, M4A, OGG...) en WAV sans perte.',
      opts: [{ id: 'mono', label: 'Mélanger en mono', type: 'checkbox', val: false }]
    },
    {
      id: 'zip', label: 'ZIP', accept: '*/*', multiple: true, run: zipRun,
      hint: 'Regroupez plusieurs fichiers dans une archive ZIP, ou extrayez une archive.',
      opts: [{ id: 'mode', label: 'Opération', type: 'select', val: 'zip', values: [['zip', 'Créer une archive ZIP'], ['unzip', 'Extraire une archive ZIP']] }]
    }
  ];

  // ---------- UI ----------
  var state = { tool: TOOLS[0], files: [], values: {}, outputs: [] };
  var tabs = el('div', { 'class': 'cv-tabs' });
  var card = el('div', { 'class': 'cv-card' });

  root.appendChild(el('div', { 'class': 'cv' },
    el('h1', { text: 'Convertisseur de fichiers' }),
    el('p', { 'class': 'sub', text: 'Simple, gratuit et privé : tout se passe dans votre navigateur, vos fichiers ne sont jamais envoyés.' }),
    tabs, card,
    el('ul', { 'class': 'cv-feat', html:
      '<li><b>7 outils</b>Images, PDF, données, texte, encodage, audio et ZIP.</li>' +
      '<li><b>Plusieurs fichiers</b>Déposez-en autant que vous voulez, puis tout télécharger en un ZIP.</li>' +
      '<li><b>Sans compte</b>Aucune inscription, aucune limite de taille imposée.</li>' +
      '<li><b>Hors ligne</b>Fonctionne sans connexion une fois la page chargée.</li>' })
  ));

  function selectTool(t) {
    state.tool = t;
    state.files = [];
    state.outputs = [];
    state.values = {};
    t.opts.forEach(function (o) { state.values[o.id] = o.val; });
    renderTabs();
    renderCard();
  }

  function renderTabs() {
    tabs.innerHTML = '';
    TOOLS.forEach(function (t) {
      tabs.appendChild(el('button', {
        'class': 'cv-tab' + (t === state.tool ? ' on' : ''), type: 'button', text: t.label,
        onclick: function () { selectTool(t); }
      }));
    });
  }

  function optControl(o) {
    var wrap, input;
    if (o.type === 'select') {
      input = el('select');
      o.values.forEach(function (v) { input.appendChild(el('option', { value: v[0], text: v[1] })); });
      input.value = state.values[o.id];
      input.addEventListener('change', function () { state.values[o.id] = input.value; });
      wrap = el('label', { text: o.label }, input);
    } else if (o.type === 'range') {
      var out = el('span', { text: ' ' + state.values[o.id] });
      input = el('input', { type: 'range', min: o.min, max: o.max, value: state.values[o.id] });
      input.addEventListener('input', function () { state.values[o.id] = input.value; out.textContent = ' ' + input.value; });
      wrap = el('label', { text: o.label }, out, input);
    } else if (o.type === 'checkbox') {
      input = el('input', { type: 'checkbox' });
      input.checked = !!state.values[o.id];
      input.addEventListener('change', function () { state.values[o.id] = input.checked; });
      wrap = el('label', { 'class': 'chk' }, input, o.label);
    } else {
      input = el('input', { type: o.type, value: state.values[o.id] });
      input.addEventListener('input', function () { state.values[o.id] = input.value; });
      wrap = el('label', { text: o.label }, input);
    }
    return wrap;
  }

  function renderCard() {
    var t = state.tool;
    card.innerHTML = '';
    card.appendChild(el('p', { 'class': 'cv-hint', text: t.hint }));

    var fileInput = el('input', { type: 'file', accept: t.accept });
    if (t.multiple) fileInput.multiple = true;
    var drop = el('label', { 'class': 'cv-drop' },
      el('div', { html: '<strong>Choisir des fichiers</strong> ou les déposer ici' }), fileInput);
    function setFiles(list) {
      state.files = Array.prototype.slice.call(list);
      state.outputs = [];
      renderCard();
    }
    fileInput.addEventListener('change', function () { setFiles(fileInput.files); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) setFiles(e.dataTransfer.files); });
    card.appendChild(drop);

    if (state.files.length) {
      var ul = el('ul', { 'class': 'cv-files' });
      state.files.forEach(function (f) {
        ul.appendChild(el('li', null, el('span', { text: f.name }), el('span', { 'class': 'sz', text: fmtSize(f.size) })));
      });
      card.appendChild(ul);
    }

    var opts = el('div', { 'class': 'cv-opts' });
    t.opts.forEach(function (o) { opts.appendChild(optControl(o)); });
    card.appendChild(opts);

    var msg = el('p', { 'class': 'cv-msg' });
    var results = el('div', { 'class': 'cv-out' });
    var go = el('button', { 'class': 'cv-go', type: 'button', text: 'Convertir' });
    go.disabled = !state.files.length;
    go.addEventListener('click', async function () {
      go.disabled = true;
      msg.className = 'cv-msg';
      msg.textContent = 'Conversion en cours...';
      results.innerHTML = '';
      var warnings = [];
      try {
        var outs = await t.run(state.files, state.values, function (w) { warnings.push(w); });
        state.outputs = outs;
        msg.textContent = outs.length ? outs.length + ' fichier' + (outs.length > 1 ? 's' : '') + ' prêt' + (outs.length > 1 ? 's' : '') + '.' : 'Aucun fichier produit.';
        if (warnings.length) { msg.className = 'cv-msg warn'; msg.textContent += ' ' + warnings.join(' '); }
        showResults(results, outs);
      } catch (e) {
        msg.className = 'cv-msg err';
        msg.textContent = 'Erreur : ' + (e && e.message ? e.message : e);
      }
      go.disabled = !state.files.length;
    });
    card.appendChild(go);
    card.appendChild(msg);
    card.appendChild(results);
    if (state.outputs.length) showResults(results, state.outputs);
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function showResults(box, outs) {
    box.innerHTML = '';
    if (!outs.length) return;
    box.appendChild(el('h3', { text: 'Résultat' }));
    outs.forEach(function (o) {
      var url = URL.createObjectURL(o.blob);
      box.appendChild(el('div', { 'class': 'cv-row' },
        el('span', { 'class': 'nm', text: o.name + ' (' + fmtSize(o.blob.size) + ')' }),
        el('a', { href: url, download: o.name, text: 'Télécharger' })));
    });
    if (outs.length > 1) {
      box.appendChild(el('div', { 'class': 'cv-row' },
        el('span', { 'class': 'nm', text: 'Tous les fichiers' }),
        el('button', {
          type: 'button', text: 'Télécharger en ZIP', onclick: async function () {
            saveBlob(await makeZip(outs), 'fichiers-convertis.zip');
          }
        })));
    }
  }

  // ---------- footer documents ----------
  var DOCS = {
    about: ['À propos', '<p>Draw and Paint est un convertisseur de fichiers gratuit qui fonctionne entièrement dans votre navigateur : images, PDF, données (CSV, JSON), texte, encodage, audio et archives ZIP.</p><p>Aucun fichier n\'est envoyé sur un serveur : la conversion est faite sur votre appareil, ce qui la rend rapide et privée.</p>'],
    legal: ['Mentions légales', '<h3>Éditeur</h3><p>Draw and Paint, site personnel à but non commercial.</p><h3>Hébergement</h3><p>Le site est hébergé par GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis).</p><h3>Propriété intellectuelle</h3><p>Le contenu et le code de ce site sont fournis tels quels. Les fichiers que vous convertissez restent votre propriété.</p>'],
    privacy: ['Confidentialité', '<p>Les fichiers que vous choisissez sont traités localement dans votre navigateur et ne quittent jamais votre appareil.</p><p>Ce site ne crée pas de compte et ne vous demande aucune donnée personnelle. Il peut mémoriser localement, dans votre navigateur, des préférences techniques ; vous pouvez les effacer à tout moment depuis les réglages de votre navigateur.</p>'],
    terms: ['Conditions d\'utilisation', '<p>Le service est proposé gratuitement, sans garantie. Vérifiez toujours le résultat d\'une conversion avant de supprimer vos fichiers d\'origine.</p><p>Vous vous engagez à n\'utiliser l\'outil qu\'avec des fichiers dont vous avez le droit de disposer.</p>'],
    sitemap: ['Plan du site', '<ul><li>Accueil : convertisseur de fichiers</li><li>Images (JPEG, PNG, WebP)</li><li>Image vers PDF</li><li>CSV / JSON</li><li>Texte</li><li>Encodage (Base64, empreintes, hexadécimal)</li><li>Audio vers WAV</li><li>ZIP (créer et extraire)</li><li>À propos, mentions légales, confidentialité, conditions d\'utilisation, contact</li></ul>'],
    contact: ['Contact', '<p>Pour une question ou un signalement, utilisez la rubrique « Issues » du dépôt du projet sur GitHub.</p>']
  };

  function openDoc(key) {
    var d = DOCS[key];
    if (!d) return;
    var box = el('div', { html: '<h2></h2>' + d[1] });
    box.querySelector('h2').textContent = d[0];
    var close = el('button', { type: 'button', text: 'Fermer' });
    box.appendChild(close);
    var modal = el('div', { 'class': 'cv-modal' }, box);
    function shut() { modal.remove(); }
    close.addEventListener('click', shut);
    modal.addEventListener('click', function (e) { if (e.target === modal) shut(); });
    document.body.appendChild(modal);
  }

  var foot = document.getElementById('cover-foot');
  if (foot) {
    foot.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('[data-doc]') : null;
      if (!a) return;
      e.preventDefault();
      openDoc(a.getAttribute('data-doc'));
    });
  }

  selectTool(TOOLS[0]);
})();
