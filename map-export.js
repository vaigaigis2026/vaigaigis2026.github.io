/**
 * map-export.js — shared export controls for Vaigai Atlas map plates
 * Injected into each plate iframe by index.html (same pattern as site-labels.js).
 * Adds "Export PNG" and "Export PDF" buttons at the bottom of the layers panel.
 */
(function () {
  'use strict';
  if (window.__VAIGAI_MAP_EXPORT__) return;
  window.__VAIGAI_MAP_EXPORT__ = true;

  var CDN_HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var CDN_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        // already requested — wait a bit for global
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
    // Prefer the main map container used by Leaflet / MapLibre / custom plates
    var candidates = [
      document.querySelector('#map'),
      document.querySelector('.leaflet-container'),
      document.querySelector('.maplibregl-map'),
      document.querySelector('[id*="map"]'),
      document.querySelector('main'),
      document.body
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) return candidates[i];
    }
    return document.body;
  }

  function findLayersPanel() {
    // Common patterns in custom GIS plate UIs and Leaflet
    var selectors = [
      '#layers-panel',
      '#layer-panel',
      '#layers',
      '.layers-panel',
      '.layer-panel',
      '.layers-control',
      '.layer-control',
      '.sidebar-layers',
      '.panel-layers',
      '[data-panel="layers"]',
      '.leaflet-control-layers-expanded',
      '.leaflet-control-layers',
      'aside.layers',
      'aside .layers',
      '#sidebar .layers',
      '#controls',
      '.controls-panel',
      '.map-sidebar',
      '.side-panel'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    // Heuristic: look for a scrollable panel that contains checkboxes / layer toggles
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
        b.dataset._label = b.textContent;
        b.textContent = label || 'Working…';
      } else if (b.dataset._label) {
        b.textContent = b.dataset._label;
        delete b.dataset._label;
      }
    });
  }

  function captureHighRes() {
    var root = findMapRoot();
    // Hide export UI during capture so it does not appear in the image
    var bar = document.getElementById('vaigai-export-bar');
    var prevDisplay = bar ? bar.style.display : '';
    if (bar) bar.style.display = 'none';

    var scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2)); // high-res

    return window.html2canvas(root, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#0d2038',
      logging: false,
      imageTimeout: 15000,
      windowWidth: root.scrollWidth,
      windowHeight: root.scrollHeight
    }).then(function (canvas) {
      if (bar) bar.style.display = prevDisplay;
      return canvas;
    }).catch(function (err) {
      if (bar) bar.style.display = prevDisplay;
      throw err;
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

    // Fit image to A3 landscape (or portrait if taller) at ~150–200 dpi feel
    var orient = pxW >= pxH ? 'landscape' : 'portrait';
    var pdf = new jsPDF({
      orientation: orient,
      unit: 'mm',
      format: 'a3'
    });

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
        .then(function (canvas) {
          downloadPng(canvas);
        })
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
      // Prefer appending inside a scrollable body if present
      var scrollBody = panel.querySelector('.panel-body, .layers-body, .sidebar-content, .leaflet-control-layers-list') || panel;
      scrollBody.appendChild(bar);
      // Ensure the panel can scroll to the button
      if (panel !== document.body) {
        panel.style.overflowY = panel.style.overflowY || 'auto';
      }
    } else {
      // Fallback: fixed bottom-right control so export is still available
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
    // Plates may build their UI after load; retry a few times
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
