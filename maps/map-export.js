/**
 * map-export.js — shared export controls for Vaigai Atlas map plates
 * Injected into each plate iframe by index.html (same pattern as site-labels.js).
 * Adds "Export PNG" and "Export PDF" buttons at the bottom of the layers panel.
 *
 * v3 fixes (cropped / offset exports):
 *  - Capture the Leaflet container itself, at its exact pixel size
 *  - No windowWidth/windowHeight override (it re-laid out the page and shifted layers)
 *  - Leaflet translate3d()/matrix() transforms are flattened to left/top in html2canvas's clone
 *    (html2canvas applied the SVG vector layer's offset twice -> boundary/rivers/sites shifted)
 *  - Wait for tiles to finish loading before capture
 *  - allowTaint off (a tainted canvas makes toDataURL throw)
 *  - Zoom controls and export bar are excluded from the image
 */
(function () {
  'use strict';
  if (window.__VAIGAI_MAP_EXPORT__) return;
  window.__VAIGAI_MAP_EXPORT__ = true;

  var CDN_HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var CDN_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var MAX_CANVAS_DIM = 8192; // keep within browser canvas limits

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        var tries = 0;
        (function wait() {
          if (src.indexOf('html2canvas') !== -1 && window.html2canvas) return resolve();
          if (src.indexOf('jspdf') !== -1 && (window.jspdf || window.jsPDF)) return resolve();
          if (++tries > 40) return reject(new Error('timeout loading ' + src));
          setTimeout(wait, 100);
        })();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureLibs() {
    return loadScript(CDN_HTML2CANVAS).then(function () {
      return loadScript(CDN_JSPDF);
    });
  }

  function findMapRoot() {
    // The real map element first; wrappers only as last-resort fallbacks
    var candidates = [
      document.querySelector('.leaflet-container'),
      document.querySelector('.maplibregl-map'),
      document.querySelector('#map'),
      document.querySelector('main'),
      document.body
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) return candidates[i];
    }
    return document.body;
  }

  function findLayersPanel() {
    var selectors = [
      '#sidebar',
      '#layers-panel', '#layer-panel', '#layers',
      '.layers-panel', '.layer-panel', '.layers-control', '.layer-control',
      '.sidebar-layers', '.panel-layers', '[data-panel="layers"]',
      '.leaflet-control-layers-expanded', '.leaflet-control-layers',
      'aside.layers', 'aside .layers', '#sidebar .layers',
      '#controls', '.controls-panel', '.map-sidebar', '.side-panel'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    var panels = document.querySelectorAll('aside, .panel, .sidebar, [class*="layer"], [id*="layer"]');
    for (var j = 0; j < panels.length; j++) {
      var p = panels[j];
      var inputs = p.querySelectorAll('input[type="checkbox"], input[type="radio"], .layer-toggle, .layer-item');
      if (inputs.length >= 2) return p;
    }
    return null;
  }

  function plateTitle() {
    var t = document.title || 'Vaigai-map-plate';
    return t.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
  }

  function setBusy(btns, busy, label) {
    btns.forEach(function (b) {
      b.disabled = !!busy;
      if (busy) {
        if (!b.dataset._label) b.dataset._label = b.textContent;
        b.textContent = label || 'Working…';
      } else if (b.dataset._label) {
        b.textContent = b.dataset._label;
        delete b.dataset._label;
      }
    });
  }

  /* ---------- capture helpers ---------- */

  // Wait until Leaflet has finished loading its tiles (or timeout)
  function waitForTiles(root, timeout) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function check() {
        var pending = root.querySelectorAll(
          '.leaflet-tile-loading, img.leaflet-tile:not(.leaflet-tile-loaded)'
        ).length;
        if (!pending || Date.now() - start > timeout) return setTimeout(resolve, 200);
        setTimeout(check, 150);
      })();
    });
  }

  // html2canvas mispositions Leaflet's translate3d()-positioned layers, and for the
  // SVG vector layer (boundary / rivers / site dots) it applies the offset TWICE
  // (it copies the computed style into the clone as matrix(1,0,0,1,tx,ty) and then
  // transforms again when painting). In the CLONED document only, convert each
  // translate / matrix transform into plain left/top offsets (plus scale if any).
  var NUM = '([-+]?[\\d.]+(?:e[-+]?\\d+)?)';
  var TRANSLATE_RE = new RegExp(
    '^translate(?:3d)?\\(\\s*' + NUM + '(?:px)?\\s*,\\s*' + NUM + '(?:px)?(?:\\s*,\\s*' + NUM + '(?:px)?)?\\s*\\)' +
    '\\s*(?:scale\\(\\s*' + NUM + '(?:\\s*,\\s*' + NUM + ')?\\s*\\))?$', 'i'
  );
  var MATRIX_RE = new RegExp(
    '^matrix\\(\\s*' + NUM + '\\s*,\\s*' + NUM + '\\s*,\\s*' + NUM + '\\s*,\\s*' + NUM +
    '\\s*,\\s*' + NUM + '\\s*,\\s*' + NUM + '\\s*\\)$', 'i'
  );

  // returns {x, y, s} or null when the transform is not a plain translate(+uniform scale)
  function parseSimpleTransform(t) {
    var m = TRANSLATE_RE.exec(t);
    if (m) return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0, s: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    m = MATRIX_RE.exec(t);
    if (m) {
      var a = parseFloat(m[1]), b = parseFloat(m[2]), c = parseFloat(m[3]), d = parseFloat(m[4]);
      if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || Math.abs(a - d) > 1e-6) return null;
      return { x: parseFloat(m[5]) || 0, y: parseFloat(m[6]) || 0, s: a };
    }
    return null;
  }

  function flattenLeafletTransforms(clonedDoc, rootEl) {
    var view = clonedDoc.defaultView;
    var nodes = rootEl.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var t = el.style && el.style.transform;
      if (!t || t === 'none') continue;
      var tr = parseSimpleTransform(t.trim());
      if (!tr) continue;
      var pos = view.getComputedStyle(el).position;
      if (pos !== 'absolute' && pos !== 'fixed' && pos !== 'relative') continue;

      var left = parseFloat(el.style.left) || 0;
      var top = parseFloat(el.style.top) || 0;
      el.style.left = (left + tr.x) + 'px';
      el.style.top = (top + tr.y) + 'px';
      var nt = (tr.s && Math.abs(tr.s - 1) > 1e-9) ? 'scale(' + tr.s + ')' : 'none';
      el.style.transform = nt;
      el.style.webkitTransform = nt;
    }
  }

  function captureHighRes() {
    var root = findMapRoot();
    return waitForTiles(root, 8000).then(function () {
      var rect = root.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width));
      var h = Math.max(1, Math.round(rect.height));

      var wanted = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
      var scale = Math.max(1, Math.min(wanted, MAX_CANVAS_DIM / Math.max(w, h)));

      root.setAttribute('data-vaigai-capture', '1');

      return window.html2canvas(root, {
        scale: scale,
        width: w,
        height: h,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#0d2038',
        logging: false,
        imageTimeout: 20000,
        ignoreElements: function (el) {
          if (el.id === 'vaigai-export-bar') return true;
          return !!(el.classList && el.classList.contains('leaflet-control-zoom'));
        },
        onclone: function (clonedDoc) {
          var target = clonedDoc.querySelector('[data-vaigai-capture]');
          if (target) flattenLeafletTransforms(clonedDoc, target);
        }
      }).then(function (canvas) {
        root.removeAttribute('data-vaigai-capture');
        return canvas;
      }, function (err) {
        root.removeAttribute('data-vaigai-capture');
        throw err;
      });
    });
  }

  function downloadPng(canvas) {
    var a = document.createElement('a');
    a.download = plateTitle() + '_highres.png';
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function downloadPdf(canvas) {
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDF) throw new Error('jsPDF not available');

    var imgData = canvas.toDataURL('image/png');
    var pxW = canvas.width;
    var pxH = canvas.height;

    var orient = pxW >= pxH ? 'landscape' : 'portrait';
    var pdf = new jsPDF({ orientation: orient, unit: 'mm', format: 'a3' });

    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var margin = 8;
    var maxW = pageW - margin * 2;
    var maxH = pageH - margin * 2 - 10;

    var ratio = Math.min(maxW / pxW, maxH / pxH);
    var w = pxW * ratio;
    var h = pxH * ratio;
    var x = (pageW - w) / 2;
    var y = margin + 6;

    pdf.setFontSize(10);
    pdf.setTextColor(40);
    pdf.text(document.title || 'Vaigai Valley Map Plate', margin, margin + 3);
    pdf.addImage(imgData, 'PNG', x, y, w, h);
    pdf.save(plateTitle() + '_highres.pdf');
  }

  function wireButtons(pngBtn, pdfBtn) {
    var all = [pngBtn, pdfBtn];

    pngBtn.addEventListener('click', function () {
      setBusy(all, true, 'Capturing…');
      ensureLibs()
        .then(captureHighRes)
        .then(function (canvas) { downloadPng(canvas); })
        .catch(function (err) {
          console.error('[map-export] PNG failed:', err);
          alert('Could not export PNG. The map may still be loading, or this browser blocked the capture.\n\n' + (err && err.message ? err.message : err));
        })
        .then(function () { setBusy(all, false); });
    });

    pdfBtn.addEventListener('click', function () {
      setBusy(all, true, 'Capturing…');
      ensureLibs()
        .then(captureHighRes)
        .then(function (canvas) {
          setBusy(all, true, 'Building PDF…');
          downloadPdf(canvas);
        })
        .catch(function (err) {
          console.error('[map-export] PDF failed:', err);
          alert('Could not export PDF. The map may still be loading, or this browser blocked the capture.\n\n' + (err && err.message ? err.message : err));
        })
        .then(function () { setBusy(all, false); });
    });
  }

  /* ---------- UI ---------- */

  function styleBar(bar) {
    bar.id = 'vaigai-export-bar';
    bar.setAttribute('data-vaigai-export', '1');
    Object.assign(bar.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px 10px 14px',
      marginTop: '12px',
      borderTop: '1px solid rgba(201,155,83,0.35)',
      background: 'transparent'
    });
  }

  function makeButton(label, primary) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      width: '100%',
      padding: '9px 12px',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '12px',
      fontWeight: '700',
      letterSpacing: '0.4px',
      textTransform: 'uppercase',
      cursor: 'pointer',
      borderRadius: '3px',
      border: primary ? '1px solid #c99b53' : '1px solid #4f8fa6',
      background: primary ? '#c99b53' : 'transparent',
      color: primary ? '#1a0f00' : '#8fc2d6',
      transition: 'background .15s ease, color .15s ease, opacity .15s ease'
    });
    btn.addEventListener('mouseenter', function () {
      if (btn.disabled) return;
      if (primary) {
        btn.style.background = '#ddb06a';
      } else {
        btn.style.background = 'rgba(79,143,166,0.2)';
        btn.style.color = '#c5e4f0';
      }
    });
    btn.addEventListener('mouseleave', function () {
      if (btn.disabled) return;
      if (primary) {
        btn.style.background = '#c99b53';
        btn.style.color = '#1a0f00';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = '#8fc2d6';
      }
    });
    return btn;
  }

  function mount() {
    if (document.getElementById('vaigai-export-bar')) return;

    var panel = findLayersPanel();
    var bar = document.createElement('div');
    styleBar(bar);

    var title = document.createElement('div');
    title.textContent = 'Export map (high resolution)';
    Object.assign(title.style, {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '10px',
      letterSpacing: '1px',
      textTransform: 'uppercase',
      color: '#c99b53',
      marginBottom: '2px'
    });
    bar.appendChild(title);

    var pngBtn = makeButton('Export PNG', true);
    var pdfBtn = makeButton('Export PDF', false);
    bar.appendChild(pngBtn);
    bar.appendChild(pdfBtn);
    wireButtons(pngBtn, pdfBtn);

    if (panel) {
      var scrollBody = panel.querySelector('.panel-body, .layers-body, .sidebar-content, .leaflet-control-layers-list') || panel;
      scrollBody.appendChild(bar);
      if (panel !== document.body) {
        panel.style.overflowY = panel.style.overflowY || 'auto';
      }
    } else {
      Object.assign(bar.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '9999',
        width: '200px',
        background: 'rgba(15,39,64,0.94)',
        border: '1px solid #c99b53',
        borderRadius: '4px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        marginTop: '0'
      });
      document.body.appendChild(bar);
      console.info('[map-export] layers panel not found — using floating export bar');
    }
  }

  function start() {
    var attempts = 0;
    (function tryMount() {
      attempts++;
      mount();
      if (!document.getElementById('vaigai-export-bar') && attempts < 12) {
        setTimeout(tryMount, 400);
      }
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
