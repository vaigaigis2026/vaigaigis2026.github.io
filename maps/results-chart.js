/*
 * results-chart.js - shared "Results" infographic panel for Vaigai Valley
 * GIS plates. Renders a proper vertical column chart (title, gridlines,
 * Y-axis, value labels on bars, X-axis category labels) matching the
 * Excel chart style used in the underlying analysis workbooks, so it can
 * be reused across all plates.
 *
 * HOW TO USE ON A NEW PLATE
 * --------------------------------------------------------------
 * 1. Declare the result data at the top level of a <script> BEFORE this
 *    file is included (any of var/let/const, non-module, not inside a
 *    function/IIFE):
 *
 *      const RESULTS_DATA = {
 *        title: "Distribution of Archaeological Sites by Cultural Period",
 *        xAxisLabel: "Cultural Period",
 *        yAxisLabel: "Site Count",
 *        unit: "sites",
 *        total: 338,                        // optional; inferred by
 *                                            // summing counts if omitted
 *        rows: [
 *          { label: "Iron Age", count: 218, percent: 64.50 },
 *          { label: "Early Historic", count: 28, percent: 8.28 },
 *          ...
 *        ]
 *      };
 *
 *    (Leave out any "Total" row from `rows` itself.)
 *
 * 2. Add one line before </body>, after that <script>:
 *      <script src="results-chart.js"></script>
 *
 * Multiple result tables on one plate: declare RESULTS_DATA as an ARRAY
 * of the objects above instead of a single object, and each renders as
 * its own collapsible panel, in order.
 *
 * The chart itself is only drawn the first time its panel is opened
 * (lazy render), not on page load.
 *
 * If RESULTS_DATA isn't found, the panel silently does not initialize
 * (safe no-op, logged as a console warning) rather than throwing errors.
 */
(function () {
  "use strict";

  function init() {
    if (typeof RESULTS_DATA === "undefined") {
      console.warn("[results-chart] RESULTS_DATA not found - skipping.");
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
      ".rc-embed.rc-open .rc-content{max-height:520px;overflow-y:auto;}",
      ".rc-chart-wrap{padding:8px 6px 4px;}",
      ".rc-svg-title{font-family:'Georgia','Times New Roman',serif;font-weight:bold;}",
      ".rc-caption{padding:2px 12px 12px;font-size:11.5px;color:#6b6b6b;",
      "border-top:1px solid #f0eee7;margin-top:4px;}",
      ".rc-chart-wrap{cursor:zoom-in;position:relative;}",
      ".rc-chart-wrap:hover::after{content:'Click to enlarge';position:absolute;",
      "bottom:2px;right:6px;font-size:9px;color:#8a8676;background:rgba(255,255,255,.85);",
      "padding:1px 4px;border-radius:3px;}",
      ".rc-modal-overlay{position:fixed;inset:0;background:rgba(28,28,28,.65);",
      "z-index:2000;display:flex;align-items:center;justify-content:center;padding:24px;}",
      ".rc-modal-overlay.rc-hidden{display:none;}",
      ".rc-modal-card{background:#fff;border-radius:8px;max-width:900px;width:100%;",
      "max-height:90vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.35);",
      "font-family:'Georgia','Times New Roman',serif;position:relative;}",
      ".rc-modal-close{position:absolute;top:8px;right:12px;background:none;border:none;",
      "font-size:26px;line-height:1;cursor:pointer;color:#6b6b6b;z-index:1;}",
      ".rc-modal-close:hover{color:#1c1c1c;}",
      ".rc-modal-body{padding:20px 24px 24px;}"
    ].join("");
    document.head.appendChild(style);

    // ---------- Shared modal (one instance, reused by all panels) ----------
    var modalOverlay = document.createElement("div");
    modalOverlay.className = "rc-modal-overlay rc-hidden";
    modalOverlay.innerHTML =
      '<div class="rc-modal-card">' +
      '<button type="button" class="rc-modal-close" aria-label="Close">&times;</button>' +
      '<div class="rc-modal-body"></div>' +
      '</div>';
    document.body.appendChild(modalOverlay);
    var modalBody = modalOverlay.querySelector(".rc-modal-body");
    var modalCard = modalOverlay.querySelector(".rc-modal-card");

    function openModal(dataset) {
      modalBody.innerHTML = buildChartSVG(dataset, {
        width: 760,
        height: 460,
        marginLeft: 60,
        marginRight: 20,
        marginTop: 46,
        marginBottom: 110,
        titleSize: 18,
        tickSize: 12,
        valueSize: 12,
        catSize: 11,
        axisTitleSize: 13,
        catMaxLen: 40,
        maxBarWidth: 60
      });
      modalOverlay.classList.remove("rc-hidden");
    }
    function closeModal() {
      modalOverlay.classList.add("rc-hidden");
      modalBody.innerHTML = "";
    }
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) closeModal();
    });
    modalOverlay.querySelector(".rc-modal-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    // ---------- Find where to embed ----------
    var mountAfter = document.querySelector(".dn-embed");
    if (!mountAfter) {
      var countEl = document.getElementById("visible-count");
      if (countEl) {
        mountAfter = countEl.closest ? countEl.closest(".stat-box") : null;
        if (!mountAfter) mountAfter = countEl.parentElement;
      }
    }
    var lastInserted = mountAfter;

    // ---------- "Nice" axis max/step, e.g. 218 -> max 250, step 50 ----------
    function niceAxis(maxValue) {
      if (maxValue <= 0) return { max: 10, step: 2 };
      var roughStep = maxValue / 5;
      var magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
      var normalized = roughStep / magnitude;
      var niceNormalized;
      if (normalized <= 1) niceNormalized = 1;
      else if (normalized <= 2) niceNormalized = 2;
      else if (normalized <= 5) niceNormalized = 5;
      else niceNormalized = 10;
      var step = niceNormalized * magnitude;
      var max = Math.ceil(maxValue / step) * step;
      if (max === maxValue) max += step; // headroom so tallest bar isn't flush with top
      return { max: max, step: step };
    }

    // ---------- Build one SVG column chart ----------
    // `opts` lets the same function produce a small inline chart or a
    // large modal chart from identical data.
    function buildChartSVG(dataset, opts) {
      opts = opts || {};
      var rows = dataset.rows || [];
      var n = rows.length || 1;
      var maxCount = rows.reduce(function (m, r) { return Math.max(m, r.count || 0); }, 0);
      var axis = niceAxis(maxCount);

      var width = opts.width || 300;
      var height = opts.height || 290;
      var marginLeft = opts.marginLeft || 34;
      var marginRight = opts.marginRight || 8;
      var marginTop = opts.marginTop || 34;
      var marginBottom = opts.marginBottom || 68; // room for rotated category labels
      var titleSize = opts.titleSize || 11.5;
      var tickSize = opts.tickSize || 8;
      var valueSize = opts.valueSize || 8;
      var catSize = opts.catSize || 7.5;
      var axisTitleSize = opts.axisTitleSize || 8;
      var catMaxLen = opts.catMaxLen || 22;

      var plotW = width - marginLeft - marginRight;
      var plotH = height - marginTop - marginBottom;

      var barSlot = plotW / n;
      var barWidth = Math.min(barSlot * 0.55, opts.maxBarWidth || 30);

      function yFor(value) {
        return marginTop + plotH - (value / axis.max) * plotH;
      }

      var svgParts = [];
      svgParts.push(
        '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" ' +
        'font-family="Georgia, Times New Roman, serif">'
      );

      // Chart title
      if (dataset.title) {
        svgParts.push(
          '<text x="' + (width / 2) + '" y="' + (titleSize + 4) + '" text-anchor="middle" ' +
          'font-size="' + titleSize + '" font-weight="bold" fill="#1c1c1c">' + escapeXml(dataset.title) + '</text>'
        );
      }

      // Y-axis gridlines + tick labels
      var ticks = [];
      for (var v = 0; v <= axis.max; v += axis.step) ticks.push(v);
      ticks.forEach(function (t) {
        var y = yFor(t);
        svgParts.push(
          '<line x1="' + marginLeft + '" y1="' + y + '" x2="' + (width - marginRight) + '" y2="' + y +
          '" stroke="#e5e2da" stroke-width="1"/>'
        );
        svgParts.push(
          '<text x="' + (marginLeft - 6) + '" y="' + (y + 3) + '" text-anchor="end" ' +
          'font-size="' + tickSize + '" fill="#6b6b6b">' + t + '</text>'
        );
      });

      // Axes
      svgParts.push(
        '<line x1="' + marginLeft + '" y1="' + marginTop + '" x2="' + marginLeft + '" y2="' + (marginTop + plotH) +
        '" stroke="#8a8676" stroke-width="1"/>'
      );
      svgParts.push(
        '<line x1="' + marginLeft + '" y1="' + (marginTop + plotH) + '" x2="' + (width - marginRight) + '" y2="' + (marginTop + plotH) +
        '" stroke="#8a8676" stroke-width="1"/>'
      );

      // Bars + value labels + rotated category labels
      rows.forEach(function (r, i) {
        var slotX = marginLeft + i * barSlot;
        var barX = slotX + (barSlot - barWidth) / 2;
        var barY = yFor(r.count || 0);
        var barH = (marginTop + plotH) - barY;

        svgParts.push(
          '<rect x="' + barX.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barWidth.toFixed(1) +
          '" height="' + Math.max(barH, 0).toFixed(1) + '" fill="#1a5fb4"/>'
        );
        svgParts.push(
          '<text x="' + (slotX + barSlot / 2).toFixed(1) + '" y="' + (barY - 4).toFixed(1) +
          '" text-anchor="middle" font-size="' + valueSize + '" fill="#1c1c1c">' + (r.count != null ? r.count : "") + '</text>'
        );

        var labelX = slotX + barSlot / 2;
        var labelY = marginTop + plotH + 10;
        svgParts.push(
          '<text x="' + labelX.toFixed(1) + '" y="' + labelY + '" text-anchor="end" font-size="' + catSize + '" ' +
          'fill="#1c1c1c" transform="rotate(-40 ' + labelX.toFixed(1) + ' ' + labelY + ')">' +
          escapeXml(truncateLabel(r.label, catMaxLen)) + '</text>'
        );
      });

      // Axis titles
      if (dataset.yAxisLabel) {
        svgParts.push(
          '<text x="' + (axisTitleSize + 2) + '" y="' + (marginTop + plotH / 2) + '" text-anchor="middle" font-size="' + axisTitleSize + '" ' +
          'fill="#1c1c1c" transform="rotate(-90 ' + (axisTitleSize + 2) + ' ' + (marginTop + plotH / 2) + ')">' +
          escapeXml(dataset.yAxisLabel) + '</text>'
        );
      }
      if (dataset.xAxisLabel) {
        svgParts.push(
          '<text x="' + (width / 2) + '" y="' + (height - 2) + '" text-anchor="middle" font-size="8" ' +
          'fill="#1c1c1c">' + escapeXml(dataset.xAxisLabel) + '</text>'
        );
      }

      svgParts.push('</svg>');
      return svgParts.join("");
    }

    function escapeXml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function truncateLabel(s, maxLen) {
      s = String(s);
      return s.length > maxLen ? s.slice(0, maxLen - 1) + "\u2026" : s;
    }

    // ---------- Build one panel per dataset ----------
    datasets.forEach(function (dataset) {
      var rows = dataset.rows || [];
      var total = typeof dataset.total === "number"
        ? dataset.total
        : rows.reduce(function (sum, r) { return sum + (r.count || 0); }, 0);
      var unitLabel = dataset.unit || "records";

      var embed = document.createElement("div");
      embed.className = "rc-embed";
      embed.innerHTML =
        '<button type="button" class="rc-toggle">' +
        '<span>' + (dataset.title || "Results") + '</span><span class="rc-caret">&#9662;</span></button>' +
        '<div class="rc-content"><div class="rc-chart-wrap"></div>' +
        '<div class="rc-caption">Total: ' + total + ' ' + unitLabel + '</div></div>';

      if (lastInserted && lastInserted.parentNode) {
        lastInserted.parentNode.insertBefore(embed, lastInserted.nextSibling);
      } else {
        var sidebarEl = document.getElementById("sidebar");
        if (sidebarEl) {
          sidebarEl.insertBefore(embed, sidebarEl.firstChild);
        } else {
          console.warn("[results-chart] No stat-box/sidebar mount point found - appending to body top.");
          document.body.insertBefore(embed, document.body.firstChild);
        }
      }
      lastInserted = embed;

      var toggleBtn = embed.querySelector(".rc-toggle");
      var chartWrap = embed.querySelector(".rc-chart-wrap");
      var rendered = false;

      toggleBtn.addEventListener("click", function () {
        var willOpen = !embed.classList.contains("rc-open");
        embed.classList.toggle("rc-open");
        if (willOpen && !rendered) {
          chartWrap.innerHTML = buildChartSVG(dataset);
          rendered = true;
        }
      });

      chartWrap.addEventListener("click", function () {
        if (rendered) openModal(dataset);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
