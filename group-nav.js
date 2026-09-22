/*
 * group-nav.js - shared "Browse by [Group]" panel for Vaigai Valley GIS
 * plates. A generalized sibling of district-nav.js: instead of always
 * grouping by site.district, it groups by ANY configurable field (e.g.
 * lithostratigraphic group, geochronological age, lithology), with an
 * optional colored swatch per group pulled from that plate's own
 * classification info object.
 *
 * Multiple instances can run on the same page (e.g. one for district,
 * one for a plate-specific classification) since each is scoped by its
 * own config and CSS uses a gn- prefix, distinct from district-nav's dn-.
 *
 * HOW TO USE ON A PLATE
 * --------------------------------------------------------------
 * 1. Before including this script, declare a config (top level, same
 *    scoping rules as district-nav.js - var/let/const/function, not
 *    inside a function/module):
 *
 *      const GROUP_NAV_CONFIGS = [
 *        {
 *          title: "Lithostratigraphic Group",   // panel header text
 *          field: "lithostrat_group",           // SITE_DATA key to group by
 *          info: AGE_INFO                       // optional: { key: {color, display} }
 *                                                // display/color are used if present;
 *                                                // falls back to the raw key otherwise.
 *        }
 *      ];
 *
 * 2. Add one line before </body>, after SITE_DATA/map/markers/GROUP_NAV_CONFIGS:
 *      <script src="group-nav.js"></script>
 *
 * REQUIRED GLOBALS (same as district-nav.js)
 * --------------------------------------------------------------
 *   map, markers, SITE_DATA, GROUP_NAV_CONFIGS (array of configs above)
 * OPTIONAL: showDetail(site)
 *
 * If any required global is missing, each panel silently no-ops
 * (console warning) rather than throwing.
 */
(function () {
  "use strict";

  function init() {
    if (typeof SITE_DATA === "undefined" ||
        typeof markers === "undefined" ||
        typeof map === "undefined" ||
        typeof GROUP_NAV_CONFIGS === "undefined") {
      console.warn("[group-nav] Required globals (SITE_DATA, markers, map, GROUP_NAV_CONFIGS) not found - skipping.");
      return;
    }

    var hasShowDetail = typeof showDetail === "function";
    injectStyles();

    GROUP_NAV_CONFIGS.forEach(function (cfg) {
      buildPanel(cfg, hasShowDetail);
    });
  }

  function injectStyles() {
    var style = document.createElement("style");
    style.textContent = [
      ".gn-embed{margin:10px 0 14px;border:1px solid #d8d5cc;border-radius:6px;",
      "overflow:hidden;font-family:'Georgia','Times New Roman',serif;",
      "color:#1c1c1c;background:#fff;}",
      ".gn-toggle{width:100%;text-align:left;background:#1a5fb4;border:none;",
      "padding:10px 12px;cursor:pointer;font-family:inherit;font-size:14px;",
      "font-weight:bold;color:#fff;display:flex;justify-content:space-between;",
      "align-items:center;}",
      ".gn-toggle:hover{background:#164a8f;}",
      ".gn-toggle .gn-caret{transition:transform .2s ease;font-size:11px;color:#fff;}",
      ".gn-embed.gn-open .gn-caret{transform:rotate(180deg);}",
      ".gn-content{max-height:0;overflow:hidden;transition:max-height .25s ease;}",
      ".gn-embed.gn-open .gn-content{max-height:380px;}",
      ".gn-search{margin:10px 10px 6px;padding:7px 9px;border:1px solid #d8d5cc;",
      "border-radius:4px;font-family:inherit;font-size:13px;",
      "width:calc(100% - 22px);box-sizing:border-box;}",
      ".gn-body{overflow-y:auto;max-height:280px;padding:0 6px 10px;}",
      ".gn-group{margin:4px 4px;}",
      ".gn-group-head{width:100%;text-align:left;background:#f7f5f0;",
      "border:none;border-radius:4px;padding:7px 9px;cursor:pointer;",
      "font-family:inherit;font-size:13px;font-weight:bold;color:#1c1c1c;",
      "display:flex;align-items:center;gap:7px;}",
      ".gn-group-head:hover{background:#efece2;}",
      ".gn-swatch{width:11px;height:11px;border-radius:3px;flex-shrink:0;",
      "border:1px solid rgba(0,0,0,.15);}",
      ".gn-group-name{flex:1;}",
      ".gn-count{color:#6b6b6b;font-weight:normal;font-size:11px;}",
      ".gn-sites{max-height:0;overflow:hidden;transition:max-height .2s ease;}",
      ".gn-sites.gn-expanded{max-height:1000px;}",
      ".gn-site{display:block;width:100%;text-align:left;background:none;",
      "border:none;border-bottom:1px solid #f0eee7;padding:6px 8px 6px 16px;",
      "cursor:pointer;font-family:inherit;font-size:12.5px;color:#1a5fb4;}",
      ".gn-site:hover{background:#f7f5f0;text-decoration:underline;}",
      ".gn-empty{padding:12px;color:#6b6b6b;font-size:12.5px;}"
    ].join("");
    document.head.appendChild(style);
  }

  function normalizeText(str) {
    var s = String(str || "").toLowerCase();
    if (typeof s.normalize === "function") {
      s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    return s;
  }

  function buildPanel(cfg, hasShowDetail) {
    var field = cfg.field;
    var info = cfg.info || {};
    var title = cfg.title || field;

    function displayName(key) {
      return (info[key] && info[key].display) || key;
    }
    function swatchColor(key) {
      return (info[key] && info[key].color) || null;
    }

    // ---------- Build group -> sites ----------
    var byGroup = {};
    SITE_DATA.forEach(function (site) {
      var g = (site[field] && String(site[field]).trim()) || "Unspecified";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(site);
    });
    var groupKeys = Object.keys(byGroup).sort(function (a, b) {
      return displayName(a).localeCompare(displayName(b));
    });
    groupKeys.forEach(function (g) {
      byGroup[g].sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    });

    // ---------- Find mount point: after the last .dn-embed / .gn-embed already
    // on the page, else after the stat-box, else top of sidebar ----------
    var existing = document.querySelectorAll(".dn-embed, .gn-embed");
    var mountAfter = existing.length ? existing[existing.length - 1] : null;
    if (!mountAfter) {
      var countEl = document.getElementById("visible-count");
      if (countEl) {
        mountAfter = countEl.closest ? countEl.closest(".stat-box") : null;
        if (!mountAfter) mountAfter = countEl.parentElement;
      }
    }

    var embed = document.createElement("div");
    embed.className = "gn-embed";
    embed.innerHTML =
      '<button type="button" class="gn-toggle">' +
      '<span>Browse by ' + title + '</span><span class="gn-caret">&#9662;</span></button>' +
      '<div class="gn-content">' +
      '<input type="text" class="gn-search" placeholder="Search ' + title.toLowerCase() + ' or site...">' +
      '<div class="gn-body"></div>' +
      '</div>';

    if (mountAfter && mountAfter.parentNode) {
      mountAfter.parentNode.insertBefore(embed, mountAfter.nextSibling);
    } else if (document.getElementById("sidebar")) {
      var sidebarEl = document.getElementById("sidebar");
      sidebarEl.insertBefore(embed, sidebarEl.firstChild);
    } else {
      console.warn("[group-nav] No mount point found for '" + title + "' - appending to body top.");
      document.body.insertBefore(embed, document.body.firstChild);
    }

    var toggleBtn = embed.querySelector(".gn-toggle");
    var body = embed.querySelector(".gn-body");
    var searchInput = embed.querySelector(".gn-search");

    function renderList(filterText) {
      var q = normalizeText(filterText).trim();
      body.innerHTML = "";
      var anyMatch = false;

      groupKeys.forEach(function (g) {
        var sites = byGroup[g];
        var label = displayName(g);
        var groupMatches = normalizeText(label).indexOf(q) !== -1;
        var matchingSites = q === "" ? sites : sites.filter(function (s) {
          return groupMatches || normalizeText(s.name).indexOf(q) !== -1;
        });
        if (q !== "" && matchingSites.length === 0) return;
        anyMatch = true;

        var wrap = document.createElement("div");
        wrap.className = "gn-group";

        var head = document.createElement("button");
        head.type = "button";
        head.className = "gn-group-head";
        var color = swatchColor(g);
        head.innerHTML =
          (color ? '<span class="gn-swatch" style="background:' + color + '"></span>' : "") +
          '<span class="gn-group-name">' + label + '</span>' +
          '<span class="gn-count">' + matchingSites.length + '</span>';

        var list = document.createElement("div");
        list.className = "gn-sites" + (q !== "" ? " gn-expanded" : "");

        matchingSites.forEach(function (site) {
          var siteBtn = document.createElement("button");
          siteBtn.type = "button";
          siteBtn.className = "gn-site";
          siteBtn.textContent = site.name;
          siteBtn.addEventListener("click", function () {
            selectSite(site);
          });
          list.appendChild(siteBtn);
        });

        head.addEventListener("click", function () {
          list.classList.toggle("gn-expanded");
        });

        wrap.appendChild(head);
        wrap.appendChild(list);
        body.appendChild(wrap);
      });

      if (!anyMatch) {
        var empty = document.createElement("div");
        empty.className = "gn-empty";
        empty.textContent = "No matching " + title.toLowerCase() + "s or sites.";
        body.appendChild(empty);
      }
    }

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

    function openPanel() { embed.classList.add("gn-open"); }
    function closePanel() { embed.classList.remove("gn-open"); }

    toggleBtn.addEventListener("click", function () {
      embed.classList.contains("gn-open") ? closePanel() : openPanel();
    });
    searchInput.addEventListener("input", function (e) {
      renderList(e.target.value);
    });

    renderList("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
