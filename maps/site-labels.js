/**
 * site-labels.js — Tooltip-style site name labels for Vaigai atlas plates.
 * Toggle: "Site names" — when enabled, shows each site name next to its marker.
 * Expects globals: map, markers (id -> {marker, site}), SITE_DATA
 */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function waitForGlobals(cb, tries) {
    tries = tries || 0;
    if (typeof map !== 'undefined' && typeof markers !== 'undefined' && markers && Object.keys(markers).length) {
      cb();
      return;
    }
    if (tries > 80) return;
    setTimeout(function () { waitForGlobals(cb, tries + 1); }, 100);
  }

  function ensureStyles() {
    if (document.getElementById('site-labels-style')) return;
    var s = document.createElement('style');
    s.id = 'site-labels-style';
    s.textContent = [
      '.site-name-tooltip {',
      '  background: rgba(255,255,255,0.92) !important;',
      '  border: 1px solid rgba(0,0,0,0.25) !important;',
      '  border-radius: 3px !important;',
      '  color: #1a1a1a !important;',
      '  font-size: 10px !important;',
      '  font-weight: 600 !important;',
      '  line-height: 1.2 !important;',
      '  padding: 2px 5px !important;',
      '  box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;',
      '  white-space: nowrap !important;',
      '}',
      '.site-name-tooltip:before { display: none !important; }',
      '.leaflet-tooltip-top.site-name-tooltip:before,',
      '.leaflet-tooltip-bottom.site-name-tooltip:before,',
      '.leaflet-tooltip-left.site-name-tooltip:before,',
      '.leaflet-tooltip-right.site-name-tooltip:before { display: none !important; }',
      '.layer-toggle.site-labels-toggle { margin-top: 4px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function findToggleHost() {
    var toggles = document.querySelectorAll('.layer-toggle');
    if (toggles.length) return toggles[toggles.length - 1].parentNode;
    var sidebar = document.querySelector('.sidebar') || document.querySelector('#sidebar') || document.querySelector('aside');
    if (sidebar) return sidebar;
    return document.body;
  }

  function addToggle(onChange) {
    if (document.getElementById('toggle-site-labels')) return;
    ensureStyles();
    var host = findToggleHost();
    var wrap = document.createElement('div');
    wrap.className = 'layer-toggle site-labels-toggle';
    wrap.innerHTML =
      '<label>' +
      '<input type="checkbox" id="toggle-site-labels">' +
      '<span>Site names</span>' +
      '</label>';
    var last = host.querySelector('.layer-toggle:last-of-type');
    if (last && last.parentNode === host) {
      if (last.nextSibling) host.insertBefore(wrap, last.nextSibling);
      else host.appendChild(wrap);
    } else {
      host.appendChild(wrap);
    }
    var cb = document.getElementById('toggle-site-labels');
    cb.addEventListener('change', function () { onChange(cb.checked); });
  }

  function setLabels(enabled) {
    Object.keys(markers).forEach(function (id) {
      var entry = markers[id];
      if (!entry || !entry.marker) return;
      var site = entry.site || {};
      var name = site.name || ('Site ' + id);
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
        if (map.hasLayer(m)) m.openTooltip();
      } else {
        m.unbindTooltip();
      }
    });
  }

  ready(function () {
    waitForGlobals(function () {
      addToggle(setLabels);
      if (map && !map._siteLabelsHooked) {
        map._siteLabelsHooked = true;
        map.on('layeradd', function (e) {
          var cb = document.getElementById('toggle-site-labels');
          if (!cb || !cb.checked) return;
          var layer = e.layer;
          if (layer && layer.getTooltip && layer.getTooltip()) {
            try { layer.openTooltip(); } catch (err) {}
          }
        });
      }
    });
  });
})();
