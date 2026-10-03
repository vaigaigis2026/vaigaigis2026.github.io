/**
 * site-labels.js — Tooltip-style site name labels for Vaigai atlas plates.
 * Loaded automatically by index.html into each plate iframe (no per-plate edit needed).
 * Can also be included directly: <script src="site-labels.js"></script>
 */
(function () {
  if (window.__siteLabelsInstalled) return;
  window.__siteLabelsInstalled = true;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function getMap() {
    try { if (typeof map !== 'undefined' && map) return map; } catch (e) {}
    return window.map || null;
  }

  function getMarkers() {
    try { if (typeof markers !== 'undefined' && markers) return markers; } catch (e) {}
    return window.markers || null;
  }

  function waitForGlobals(cb, tries) {
    tries = tries || 0;
    var m = getMarkers();
    var mp = getMap();
    if (mp && m && Object.keys(m).length > 0) {
      cb(mp, m);
      return;
    }
    if (tries > 120) {
      console.warn('[site-labels] map/markers not ready');
      return;
    }
    setTimeout(function () { waitForGlobals(cb, tries + 1); }, 100);
  }

  function ensureStyles() {
    if (document.getElementById('site-labels-style')) return;
    var s = document.createElement('style');
    s.id = 'site-labels-style';
    s.textContent = [
      '.site-name-tooltip{background:rgba(255,255,255,.92)!important;border:1px solid rgba(0,0,0,.25)!important;',
      'border-radius:3px!important;color:#1a1a1a!important;font-size:10px!important;font-weight:600!important;',
      'line-height:1.2!important;padding:2px 5px!important;box-shadow:0 1px 3px rgba(0,0,0,.15)!important;white-space:nowrap!important;}',
      '.site-name-tooltip:before{display:none!important;}',
      '.leaflet-tooltip-top.site-name-tooltip:before,.leaflet-tooltip-bottom.site-name-tooltip:before,',
      '.leaflet-tooltip-left.site-name-tooltip:before,.leaflet-tooltip-right.site-name-tooltip:before{display:none!important;}',
      '.layer-toggle.site-labels-toggle{margin-top:4px;}'
    ].join('');
    document.head.appendChild(s);
  }

  function addToggle(onChange) {
    if (document.getElementById('toggle-site-labels')) return;
    ensureStyles();
    var host = document.getElementById('sidebar') || document.body;
    var wrap = document.createElement('div');
    wrap.className = 'layer-toggle site-labels-toggle';
    wrap.innerHTML = '<label><input type="checkbox" id="toggle-site-labels"><span>Site names</span></label>';
    var toggles = host.querySelectorAll('.layer-toggle');
    if (toggles.length) {
      var last = toggles[toggles.length - 1];
      if (last.nextSibling) host.insertBefore(wrap, last.nextSibling);
      else host.appendChild(wrap);
    } else {
      host.insertBefore(wrap, host.firstChild);
    }
    document.getElementById('toggle-site-labels').addEventListener('change', function (e) {
      onChange(e.target.checked);
    });
  }

  function setLabels(enabled, mapRef, markersRef) {
    Object.keys(markersRef).forEach(function (id) {
      var entry = markersRef[id];
      if (!entry || !entry.marker) return;
      var name = (entry.site && entry.site.name) || ('Site ' + id);
      var m = entry.marker;
      if (enabled) {
        m.unbindTooltip();
        m.bindTooltip(name, {
          permanent: true,
          direction: 'right',
          offset: [8, 0],
          opacity: 0.95,
          className: 'site-name-tooltip',
          sticky: false
        });
        if (mapRef.hasLayer(m)) {
          try { m.openTooltip(); } catch (e) {}
        }
      } else {
        m.unbindTooltip();
      }
    });
  }

  ready(function () {
    waitForGlobals(function (mapRef, markersRef) {
      addToggle(function (on) { setLabels(on, mapRef, markersRef); });
      if (!mapRef._siteLabelsHooked) {
        mapRef._siteLabelsHooked = true;
        mapRef.on('layeradd', function (e) {
          var cb = document.getElementById('toggle-site-labels');
          if (!cb || !cb.checked) return;
          if (e.layer && e.layer.getTooltip && e.layer.getTooltip()) {
            try { e.layer.openTooltip(); } catch (err) {}
          }
        });
      }
    });
  });
})();
