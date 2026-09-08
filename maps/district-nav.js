/*
 * district-nav.js — shared "Browse by District" panel for Vaigai Valley GIS plates.
 *
 * HOW TO USE ON A NEW PLATE
 * --------------------------------------------------------------
 * 1. Add one line before </body>, AFTER your map/markers/SITE_DATA setup:
 *      <script src="shared/district-nav.js"></script>
 * 2. That's it — no HTML markup needed. It builds its own UI.
 *
 * REQUIRED GLOBALS (must exist by the time this script runs)
 * --------------------------------------------------------------
 *   window.map      — a Leaflet map instance
 *   window.markers  — object keyed by site.id -> { marker, site }
 *   window.SITE_DATA — array of site objects, each with at least:
 *                      { id, name, lat, lng, district }
 * OPTIONAL GLOBALS
 * --------------------------------------------------------------
 *   window.showDetail(site) — if present, called on site selection
 *                              to populate a detail panel, matching
 *                              the same behavior as clicking a marker.
 *
 * If SITE_DATA / markers / map aren't found, the panel silently
 * does not initialize (safe no-op) rather than throwing errors.
 */
(function () {
  "use strict";

  function init() {
    if (typeof window.SITE_DATA === "undefined" ||
        typeof window.markers === "undefined" ||
        typeof window.map === "undefined") {
      console.warn("[district-nav] Required globals (SITE_DATA, markers, map) not found — skipping.");
      return;
    }

    var SITE_DATA = window.SITE_DATA;
    var markers = window.markers;
    var map = window.map;
    var hasShowDetail = typeof window.showDetail === "function";

    // ---------- Build district -> sites grouping ----------
    var byDistrict = {};
    SITE_DATA.forEach(function (site) {
      var d = (site.district && String(site.district).trim()) || "Unspecified";
      if (!byDistrict[d]) byDistrict[d] = [];
      byDistrict[d].push(site);
    });
    var districtNames = Object.keys(byDistrict).sort(function (a, b) {
      return a.localeCompare(b);
    });
    districtNames.forEach(function (d) {
      byDistrict[d].sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
    });

    // ---------- Inject CSS (scoped with dn- prefix) ----------
    var style = document.createElement("style");
    style.textContent = [
      ".dn-tab{position:fixed;top:16px;right:16px;z-index:1200;",
      "background:#1a5fb4;color:#fff;border:none;border-radius:6px;",
      "padding:10px 14px;font-family:'Georgia','Times New Roman',serif;",
      "font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);}",
      ".dn-tab:hover{background:#164a8f;}",
      ".dn-panel{position:fixed;top:0;right:-340px;width:320px;height:100%;",
      "background:#fff;z-index:1300;box-shadow:-2px 0 10px rgba(0,0,0,.25);",
      "transition:right .25s ease;display:flex;flex-direction:column;",
      "font-family:'Georgia','Times New Roman',serif;color:#1c1c1c;}",
      ".dn-panel.dn-open{right:0;}",
      ".dn-header{padding:14px 16px;border-bottom:1px solid #e5e2da;",
      "display:flex;align-items:center;justify-content:space-between;}",
      ".dn-header h3{margin:0;font-size:16px;}",
      ".dn-close{background:none;border:none;font-size:20px;cursor:pointer;",
      "color:#6b6b6b;line-height:1;}",
      ".dn-search{margin:10px 16px;padding:8px 10px;border:1px solid #d8d5cc;",
      "border-radius:4px;font-family:inherit;font-size:13px;width:calc(100% - 32px);}",
      ".dn-body{overflow-y:auto;flex:1;padding:0 8px 16px;}",
      ".dn-district{margin:6px 8px;}",
      ".dn-district-head{width:100%;text-align:left;background:#f7f5f0;",
      "border:none;border-radius:4px;padding:8px 10px;cursor:pointer;",
      "font-family:inherit;font-size:14px;font-weight:bold;color:#1c1c1c;",
      "display:flex;justify-content:space-between;align-items:center;}",
      ".dn-district-head:hover{background:#efece2;}",
      ".dn-count{color:#6b6b6b;font-weight:normal;font-size:12px;}",
      ".dn-sites{max-height:0;overflow:hidden;transition:max-height .2s ease;}",
      ".dn-sites.dn-expanded{max-height:1000px;}",
      ".dn-site{display:block;width:100%;text-align:left;background:none;",
      "border:none;border-bottom:1px solid #f0eee7;padding:7px 10px 7px 18px;",
      "cursor:pointer;font-family:inherit;font-size:13px;color:#1a5fb4;}",
      ".dn-site:hover{background:#f7f5f0;text-decoration:underline;}",
      ".dn-empty{padding:16px;color:#6b6b6b;font-size:13px;}",
      "@media (max-width:600px){.dn-panel{width:85%;right:-100%;}}"
    ].join("");
    document.head.appendChild(style);

    // ---------- Build DOM ----------
    var tab = document.createElement("button");
    tab.className = "dn-tab";
    tab.type = "button";
    tab.textContent = "Districts";
    document.body.appendChild(tab);

    var panel = document.createElement("div");
    panel.className = "dn-panel";
    panel.innerHTML =
      '<div class="dn-header"><h3>Browse by District</h3>' +
      '<button type="button" class="dn-close" aria-label="Close">&times;</button></div>' +
      '<input type="text" class="dn-search" placeholder="Search district or site...">' +
      '<div class="dn-body"></div>';
    document.body.appendChild(panel);

    var body = panel.querySelector(".dn-body");
    var searchInput = panel.querySelector(".dn-search");
    var closeBtn = panel.querySelector(".dn-close");

    function renderList(filterText) {
      var q = (filterText || "").trim().toLowerCase();
      body.innerHTML = "";
      var anyMatch = false;

      districtNames.forEach(function (d) {
        var sites = byDistrict[d];
        var districtMatches = d.toLowerCase().indexOf(q) !== -1;
        var matchingSites = q === "" ? sites : sites.filter(function (s) {
          return districtMatches || String(s.name).toLowerCase().indexOf(q) !== -1;
        });
        if (q !== "" && matchingSites.length === 0) return;
        anyMatch = true;

        var wrap = document.createElement("div");
        wrap.className = "dn-district";

        var head = document.createElement("button");
        head.type = "button";
        head.className = "dn-district-head";
        head.innerHTML = '<span>' + d + '</span><span class="dn-count">' +
          matchingSites.length + '</span>';

        var list = document.createElement("div");
        list.className = "dn-sites" + (q !== "" ? " dn-expanded" : "");

        matchingSites.forEach(function (site) {
          var siteBtn = document.createElement("button");
          siteBtn.type = "button";
          siteBtn.className = "dn-site";
          siteBtn.textContent = site.name;
          siteBtn.addEventListener("click", function () {
            selectSite(site);
          });
          list.appendChild(siteBtn);
        });

        head.addEventListener("click", function () {
          list.classList.toggle("dn-expanded");
        });

        wrap.appendChild(head);
        wrap.appendChild(list);
        body.appendChild(wrap);
      });

      if (!anyMatch) {
        var empty = document.createElement("div");
        empty.className = "dn-empty";
        empty.textContent = "No matching districts or sites.";
        body.appendChild(empty);
      }
    }

    // ---------- Selection behavior ----------
    function selectSite(site) {
      var entry = markers[site.id];
      var latlng = entry ? entry.marker.getLatLng() : [site.lat, site.lng];

      map.setView(latlng, Math.max(map.getZoom(), 14), { animate: true });

      if (entry && entry.marker) {
        if (entry.marker.openPopup) entry.marker.openPopup();
        highlightMarker(entry.marker);
      }

      if (hasShowDetail) {
        window.showDetail(site);
      }

      // Auto-close panel on mobile-sized viewports for a clear view of the map
      if (window.innerWidth <= 600) {
        closePanel();
      }
    }

    function highlightMarker(marker) {
      if (!marker.setRadius || !marker.getRadius) return;
      var originalRadius = marker.getRadius();
      marker.setRadius(originalRadius + 4);
      setTimeout(function () {
        marker.setRadius(originalRadius);
      }, 900);
    }

    // ---------- Open/close ----------
    function openPanel() {
      panel.classList.add("dn-open");
    }
    function closePanel() {
      panel.classList.remove("dn-open");
    }

    tab.addEventListener("click", function () {
      panel.classList.contains("dn-open") ? closePanel() : openPanel();
    });
    closeBtn.addEventListener("click", closePanel);
    searchInput.addEventListener("input", function (e) {
      renderList(e.target.value);
    });

    renderList("");
  }

  // Script is expected to be included after map/markers/SITE_DATA are set up,
  // so we can run immediately. If the DOM isn't ready yet, wait for it.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
