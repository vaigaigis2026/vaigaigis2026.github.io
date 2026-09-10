/*
 * results-chart.js -- shared "Results" infographic panel for Vaigai Valley
 * GIS plates. Renders a horizontal bar chart from a simple category /
 * count / percentage table (the same shape as the analysis result tables
 * exported from Excel -- e.g. sites by period, by elevation zone, by slope
 * class, by aspect direction, etc.), so it can be reused across all plates.
 *
 * HOW TO USE ON A NEW PLATE
 * --------------------------------------------------------------
 * 1. Declare the result data at the top level of a <script> BEFORE this
 *    file is included (any of var/let/const, non-module, not inside a
 *    function/IIFE):
 *
 *      const RESULTS_DATA = {
 *        title: "Period Classification",     // panel heading
 *        unit: "sites",                       // optional, used in the caption
 *        rows: [
 *          { label: "Iron Age", count: 218, percent: 64.50 },
 *          { label: "Early Historic", count: 28, percent: 8.28 },
 *          ...
 *        ],
 *        total: 338                           // optional; inferred by
 *                                              // summing counts if omitted
 *      };
 *
 *    (Leave out any "Total" row from `rows` itself -- pass it via `total`,
 *    or simply omit it and let the sum be computed.)
 *
 * 2. Add one line before </body>, after that <script>:
 *      <script src="results-chart.js"></script>
 *
 * Multiple result tables on one plate: declare RESULTS_DATA as an ARRAY
 * of the objects above instead of a single object, and each renders as
 * its own collapsible panel, in order.
 *
 * If RESULTS_DATA isn't found, the panel silently does not initialize
 * (safe no-op, logged as a console warning) rather than throwing errors.
 */
(function () {
  "use strict";

  function init() {
    if (typeof RESULTS_DATA === "undefined") {
      console.warn("[results-chart] RESULTS_DATA not found -- skipping.");
      return;
    }

    var datasets = Array.isArray(RESULTS_DATA) ? RESULTS_DATA : [RESULTS_DATA];

    // ---------- Inject CSS (scoped with rc- prefix) ----------
    var style = document.createElement("style");
    style.textContent = [
      ".rc-embed{margin:10px 0 14px;border:1px solid #d8d5cc;border-radius:6px;",
      "overflow:hidden;font-family:'Georgia','Times New Roman',serif;",
      "color:#1c1c1c;background:#fff;}",
      ".rc-toggle{width:100%;text-align:left;background:#1a5fb4;border:none;",
      "padding:10px 12px;cursor:pointer;font-family:inherit;font-size:14px;",
      "font-weight:bold;color:#fff;display:flex;justify-content:space-between;",
      "align-items:center;}",
      ".rc-toggle:hover{background:#164a8f;}",
      ".rc-toggle .rc-caret{transition:transform .2s ease;font-size:11px;color:#fff;}",
      ".rc-embed.rc-open .rc-caret{transform:rotate(180deg);}",
      ".rc-content{max-height:0;overflow:hidden;transition:max-height .25s ease;}",
      ".rc-embed.rc-open .rc-content{max-height:600px;overflow-y:auto;}",
      ".rc-chart{padding:10px 12px 4px;}",
      ".rc-row{margin-bottom:8px;}",
      ".rc-row-label{display:flex;justify-content:space-between;",
      "font-size:12.5px;margin-bottom:3px;}",
      ".rc-row-name{color:#1c1c1c;}",
      ".rc-row-value{color:#6b6b6b;white-space:nowrap;margin-left:8px;}",
      ".rc-bar-track{background:#f0eee7;border-radius:3px;height:10px;",
      "overflow:hidden;}",
      ".rc-bar-fill{background:#1a5fb4;height:100%;border-radius:3px;",
      "transition:width .4s ease;}",
      ".rc-caption{padding:2px 12px 12px;font-size:11.5px;color:#6b6b6b;",
      "border-top:1px solid #f0eee7;margin-top:4px;}"
    ].join("");
    document.head.appendChild(style);

    // ---------- Find where to embed ----------
    // Preferred: right after the district-nav embed (if present, so
    // Results sits just below Districts), else after the stat-box /
    // visible-count, else top of #sidebar.
    var mountAfter = document.querySelector(".dn-embed");
    if (!mountAfter) {
      var countEl = document.getElementById("visible-count");
      if (countEl) {
        mountAfter = countEl.closest ? countEl.closest(".stat-box") : null;
        if (!mountAfter) mountAfter = countEl.parentElement;
      }
    }

    var lastInserted = mountAfter;

    datasets.forEach(function (dataset, idx) {
      var rows = (dataset.rows || []).slice();
      var total = typeof dataset.total === "number"
        ? dataset.total
        : rows.reduce(function (sum, r) { return sum + (r.count || 0); }, 0);
      var maxPercent = rows.reduce(function (m, r) {
        return Math.max(m, r.percent != null ? r.percent : (total ? (r.count / total) * 100 : 0));
      }, 0) || 1;

      var embed = document.createElement("div");
      embed.className = "rc-embed";

      var barsHtml = rows.map(function (r) {
        var pct = r.percent != null ? r.percent : (total ? (r.count / total) * 100 : 0);
        var widthPct = maxPercent ? (pct / maxPercent) * 100 : 0;
        return '<div class="rc-row">' +
          '<div class="rc-row-label"><span class="rc-row-name">' + r.label +
          '</span><span class="rc-row-value">' + r.count + ' (' + pct.toFixed(2) + '%)</span></div>' +
          '<div class="rc-bar-track"><div class="rc-bar-fill" style="width:' + widthPct.toFixed(1) + '%"></div></div>' +
          '</div>';
      }).join("");

      var unitLabel = dataset.unit || "records";
      embed.innerHTML =
        '<button type="button" class="rc-toggle">' +
        '<span>' + (dataset.title || "Results") + '</span><span class="rc-caret">&#9662;</span></button>' +
        '<div class="rc-content"><div class="rc-chart">' + barsHtml + '</div>' +
        '<div class="rc-caption">Total: ' + total + ' ' + unitLabel + '</div></div>';

      if (lastInserted && lastInserted.parentNode) {
        lastInserted.parentNode.insertBefore(embed, lastInserted.nextSibling);
      } else {
        var sidebarEl = document.getElementById("sidebar");
        if (sidebarEl) {
          sidebarEl.insertBefore(embed, sidebarEl.firstChild);
        } else {
          console.warn("[results-chart] No stat-box/sidebar mount point found -- appending to body top.");
          document.body.insertBefore(embed, document.body.firstChild);
        }
      }
      lastInserted = embed;

      var toggleBtn = embed.querySelector(".rc-toggle");
      toggleBtn.addEventListener("click", function () {
        embed.classList.toggle("rc-open");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
