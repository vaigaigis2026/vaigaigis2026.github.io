/*
 * district-nav.js — shared "Browse by District" panel for Vaigai Valley GIS plates.
 *
 * HOW TO USE ON A NEW PLATE
 * --------------------------------------------------------------
 * 1. Add one line before </body>, AFTER your map/markers/SITE_DATA setup:
 *      <script src="shared/district-nav.js"></script>
 * 2. That's it — no HTML markup needed. It builds its own UI.
 *
 * REQUIRED (must be declared, in any of `var`/`let`/`const`/function form,
 * at the top level of a preceding <script> on the same page — NOT inside
 * a function, module, or IIFE — so this script can see them as globals)
 * --------------------------------------------------------------
 *   map        — a Leaflet map instance
 *   markers    — object keyed by site.id -> { marker, site }
 *   SITE_DATA  — array of site objects, each with at least:
 *                { id, name, lat, lng, district }
 * OPTIONAL
 * --------------------------------------------------------------
 *   showDetail(site) — if present, called on site selection to
 *                       populate a detail panel, matching the same
 *                       behavior as clicking a marker.
 *
 * If SITE_DATA / markers / map aren't found, the panel silently
 * does not initialize (safe no-op, logged as a console warning)
 * rather than throwing errors.
 */
(function () {
  "use strict";

  function init() {
    // NOTE: we deliberately check bare identifiers (not window.X) because
    // top-level `const`/`let` declarations in a classic <script> do NOT
    // attach to `window` — only `var` and function declarations do. Bare
    // identifiers are still safe to `typeof`-check even if undeclared.
    if (typeof SITE_DATA === "undefined" ||
        typeof markers === "undefined" ||
        typeof map === "undefined") {
      console.warn("[district-nav] Required globals (SITE_DATA, markers, map) not found — skipping.");
      return;
    }

    var hasShowDetail = typeof showDetail === "function";

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

    // ---------- Inject CSS (scoped with dn- prefix, inline embedded layout) ----------
    var style = document.createElement("style");
    style.textContent = [
      ".dn-embed{margin:10px 0 14px;border:1px solid #d8d5cc;border-radius:6px;",
      "overflow:hidden;font-family:'Georgia','Times New Roman',serif;",
      "color:#1c1c1c;background:#fff;}",
      ".dn-toggle{width:100%;text-align:left;background:#1a5fb4;border:none;",
      "padding:10px 12px;cursor:pointer;font-family:inherit;font-size:14px;",
      "font-weight:bold;color:#fff;display:flex;justify-content:space-between;",
      "align-items:center;}",
      ".dn-toggle:hover{background:#164a8f;}",
      ".dn-toggle .dn-caret{transition:transform .2s ease;font-size:11px;color:#fff;}",
      ".dn-embed.dn-open .dn-caret{transform:rotate(180deg);}",
      ".dn-content{max-height:0;overflow:hidden;transition:max-height .25s ease;}",
      ".dn-embed.dn-open .dn-content{max-height:380px;}",
      ".dn-search{margin:10px 10px 6px;padding:7px 9px;border:1px solid #d8d5cc;",
      "border-radius:4px;font-family:inherit;font-size:13px;",
      "width:calc(100% - 22px);box-sizing:border-box;}",
      ".dn-body{overflow-y:auto;max-height:280px;padding:0 6px 10px;}",
      ".dn-district{margin:4px 4px;}",
      ".dn-district-head{width:100%;text-align:left;background:#f7f5f0;",
      "border:none;border-radius:4px;padding:7px 9px;cursor:pointer;",
      "font-family:inherit;font-size:13px;font-weight:bold;color:#1c1c1c;",
      "display:flex;justify-content:space-between;align-items:center;}",
      ".dn-district-head:hover{background:#efece2;}",
      ".dn-count{color:#6b6b6b;font-weight:normal;font-size:11px;}",
      ".dn-sites{max-height:0;overflow:hidden;transition:max-height .2s ease;}",
      ".dn-sites.dn-expanded{max-height:1000px;}",
      ".dn-site{display:block;width:100%;text-align:left;background:none;",
      "border:none;border-bottom:1px solid #f0eee7;padding:6px 8px 6px 16px;",
      "cursor:pointer;font-family:inherit;font-size:12.5px;color:#1a5fb4;}",
      ".dn-site:hover{background:#f7f5f0;text-decoration:underline;}",
      ".dn-empty{padding:12px;color:#6b6b6b;font-size:12.5px;}"
    ].join("");
    document.head.appendChild(style);

    // ---------- Diacritic-insensitive matching ----------
    // Strips combining diacritical marks (macrons, dots-below, underlines,
    // etc.) via Unicode NFD decomposition, so "Kovilpatti" matches
    // "Kōvilpaṭṭi", "Ramanathapuram" matches itself regardless of any
    // accenting, etc. Falls back gracefully on lowercasing alone if a
    // very old browser lacks String.prototype.normalize.
    function normalizeText(str) {
      var s = String(str || "").toLowerCase();
      if (typeof s.normalize === "function") {
        s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      }
      return s;
    }

    // ---------- Find where to embed ----------
    // Preferred: right after the "N sites shown" stat box, so the block
    // sits inline in the sidebar's normal scroll flow (scrolls with it,
    // not fixed/floating). Falls back gracefully if a future plate
    // doesn't use this exact markup.
    var mountAfter = null;
    var countEl = document.getElementById("visible-count");
    if (countEl) {
      mountAfter = countEl.closest ? countEl.closest(".stat-box") : null;
      if (!mountAfter) mountAfter = countEl.parentElement;
    }

    // ---------- Build DOM (inline embedded accordion, not a floating overlay) ----------
    var embed = document.createElement("div");
    embed.className = "dn-embed";
    embed.innerHTML =
      '<button type="button" class="dn-toggle">' +
      '<span>Browse by District</span><span class="dn-caret">&#9662;</span></button>' +
      '<div class="dn-content">' +
      '<input type="text" class="dn-search" placeholder="Search district or site...">' +
      '<div class="dn-body"></div>' +
      '</div>';

    if (mountAfter && mountAfter.parentNode) {
      mountAfter.parentNode.insertBefore(embed, mountAfter.nextSibling);
    } else if (document.getElementById("sidebar")) {
      var sidebarEl = document.getElementById("sidebar");
      sidebarEl.insertBefore(embed, sidebarEl.firstChild);
    } else {
      console.warn("[district-nav] No stat-box/sidebar mount point found — appending to body top.");
      document.body.insertBefore(embed, document.body.firstChild);
    }

    var toggleBtn = embed.querySelector(".dn-toggle");
    var body = embed.querySelector(".dn-body");
    var searchInput = embed.querySelector(".dn-search");

    function renderList(filterText) {
      var q = normalizeText(filterText).trim();
      body.innerHTML = "";
      var anyMatch = false;

      districtNames.forEach(function (d) {
        var sites = byDistrict[d];
        var districtMatches = normalizeText(d).indexOf(q) !== -1;
        var matchingSites = q === "" ? sites : sites.filter(function (s) {
          return districtMatches || normalizeText(s.name).indexOf(q) !== -1;
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
        showDetail(site);
      }

      // Collapse the embedded panel on mobile-sized viewports after a
      // selection, for a clearer view of the map.
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

    // ---------- Open/close (inline accordion, not an overlay) ----------
    function openPanel() {
      embed.classList.add("dn-open");
    }
    function closePanel() {
      embed.classList.remove("dn-open");
    }

    toggleBtn.addEventListener("click", function () {
      embed.classList.contains("dn-open") ? closePanel() : openPanel();
    });
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
