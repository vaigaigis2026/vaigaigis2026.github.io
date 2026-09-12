/*
 * results-panel.js - chart engine for the Atlas shell's "Results" split
 * view (index.html only - NOT included by individual plate files).
 *
 * Each plate's own HTML declares its data as a top-level `RESULTS_DATA`
 * (single object or array of objects, single-series `rows` or grouped
 * `categories`+`series` shape - see results-chart.js history for the
 * two shapes). index.html reads that global from the plate's iframe
 * (same-origin) and calls ResultsPanel.renderInto(container, data) to
 * draw it here, styled for the dark navy/gold Atlas theme rather than
 * the light per-plate sidebar theme.
 *
 * Public API:
 *   window.ResultsPanel.renderInto(containerEl, resultsData)
 *   window.ResultsPanel.clear(containerEl)
 */
(function () {
  "use strict";

  // Atlas theme colors (mirrors index.html's :root custom properties;
  // hardcoded here for reliable SVG rendering across browsers).
  var COL_INK = "#eef3f7";
  var COL_INK_DIM = "#c9d6e2";
  var COL_MUTED = "#7f97ac";
  var COL_ACCENT = "#c99b53";
  var COL_LINE = "#2c4c6b";
  var COL_LINE_SOFT = "#223d57";
  var COL_PANEL = "#16324f";
  var COL_PANEL2 = "#0d1f33";

  var DEFAULT_PALETTE = ["#c99b53", "#4f8fa6", "#a3684f", "#7a9b76", "#8a7fb5", "#b56b6b", "#6b9bb5", "#a3a35a"];

  function escapeXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function truncateLabel(s, maxLen) {
    s = String(s);
    return s.length > maxLen ? s.slice(0, maxLen - 1) + "\u2026" : s;
  }
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
    if (max === maxValue) max += step;
    return { max: max, step: step };
  }

  // ---------- Single-series column chart ----------
  function buildChartSVG(dataset, opts) {
    opts = opts || {};
    var rows = dataset.rows || [];
    var n = rows.length || 1;
    var maxCount = rows.reduce(function (m, r) { return Math.max(m, r.count || 0); }, 0);
    var axis = niceAxis(maxCount);

    var width = opts.width || 620;
    var marginLeft = opts.marginLeft || 50;
    var marginRight = opts.marginRight || 16;
    var marginTop = opts.marginTop || 40;
    var titleSize = dataset.titleSize || opts.titleSize || 15;
    var tickSize = opts.tickSize || 10;
    var valueSize = opts.valueSize || 10;
    var catSize = opts.catSize || 10;
    var axisTitleSize = opts.axisTitleSize || 11;
    var catMaxLen = opts.catMaxLen || 30;
    var rotationDeg = opts.labelRotation || 55;

    // Desired plot height stays constant regardless of label length; only
    // the bottom margin (and therefore total SVG height) grows to fit
    // long rotated category labels + the axis title beneath them without
    // clipping or overlapping.
    var basePlotH = (opts.height || 400) - marginTop - (opts.marginBottom || 100);
    var plotH = Math.max(basePlotH, 180);

    var longestLen = rows.reduce(function (m, r) {
      var text = opts.truncateCategories === false ? String(r.label) : truncateLabel(r.label, catMaxLen);
      return Math.max(m, text.length);
    }, 0);
    var estCharW = catSize * 0.58;
    var diagReach = longestLen * estCharW * Math.sin(rotationDeg * Math.PI / 180);
    var neededBottom = 14 + diagReach + 18 + (dataset.xAxisLabel ? axisTitleSize + 8 : 0) + 10;
    var marginBottom = Math.max(opts.marginBottom || 100, neededBottom);

    var height = marginTop + plotH + marginBottom;
    var plotW = width - marginLeft - marginRight;
    var barSlot = plotW / n;
    var barWidth = Math.min(barSlot * 0.55, opts.maxBarWidth || 46);

    function yFor(value) { return marginTop + plotH - (value / axis.max) * plotH; }

    var p = [];
    p.push('<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;" font-family="Arial, Helvetica, sans-serif">');
    p.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="' + COL_PANEL2 + '"/>');

    if (dataset.title) {
      p.push('<text x="' + (width / 2) + '" y="' + (titleSize + 6) + '" text-anchor="middle" font-size="' + titleSize +
        '" font-weight="bold" fill="' + COL_INK + '">' + escapeXml(dataset.title) + '</text>');
    }

    var ticks = [];
    for (var v = 0; v <= axis.max; v += axis.step) ticks.push(v);
    ticks.forEach(function (t) {
      var y = yFor(t);
      p.push('<line x1="' + marginLeft + '" y1="' + y + '" x2="' + (width - marginRight) + '" y2="' + y + '" stroke="' + COL_LINE_SOFT + '" stroke-width="1"/>');
      p.push('<text x="' + (marginLeft - 8) + '" y="' + (y + 3) + '" text-anchor="end" font-size="' + tickSize + '" fill="' + COL_MUTED + '">' + t + '</text>');
    });

    p.push('<line x1="' + marginLeft + '" y1="' + marginTop + '" x2="' + marginLeft + '" y2="' + (marginTop + plotH) + '" stroke="' + COL_LINE + '" stroke-width="1"/>');
    p.push('<line x1="' + marginLeft + '" y1="' + (marginTop + plotH) + '" x2="' + (width - marginRight) + '" y2="' + (marginTop + plotH) + '" stroke="' + COL_LINE + '" stroke-width="1"/>');

    rows.forEach(function (r, i) {
      var slotX = marginLeft + i * barSlot;
      var barX = slotX + (barSlot - barWidth) / 2;
      var barY = yFor(r.count || 0);
      var barH = (marginTop + plotH) - barY;
      p.push('<rect x="' + barX.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barWidth.toFixed(1) +
        '" height="' + Math.max(barH, 0).toFixed(1) + '" fill="' + COL_ACCENT + '"/>');
      p.push('<text x="' + (slotX + barSlot / 2).toFixed(1) + '" y="' + (barY - 5).toFixed(1) +
        '" text-anchor="middle" font-size="' + valueSize + '" fill="' + COL_INK + '">' + (r.count != null ? r.count : "") + '</text>');

      var labelX = slotX + barSlot / 2;
      var labelY = marginTop + plotH + 12;
      p.push('<text x="' + labelX.toFixed(1) + '" y="' + labelY + '" text-anchor="end" font-size="' + catSize +
        '" fill="' + COL_INK_DIM + '" transform="rotate(-' + rotationDeg + ' ' + labelX.toFixed(1) + ' ' + labelY + ')">' +
        escapeXml(opts.truncateCategories === false ? String(r.label) : truncateLabel(r.label, catMaxLen)) + '</text>');
    });

    if (dataset.yAxisLabel) {
      p.push('<text x="' + (axisTitleSize + 4) + '" y="' + (marginTop + plotH / 2) + '" text-anchor="middle" font-size="' + axisTitleSize +
        '" fill="' + COL_INK_DIM + '" transform="rotate(-90 ' + (axisTitleSize + 4) + ' ' + (marginTop + plotH / 2) + ')">' +
        escapeXml(dataset.yAxisLabel) + '</text>');
    }
    if (dataset.xAxisLabel) {
      p.push('<text x="' + (width / 2) + '" y="' + (height - 6) + '" text-anchor="middle" font-size="' + axisTitleSize +
        '" fill="' + COL_INK_DIM + '">' + escapeXml(dataset.xAxisLabel) + '</text>');
    }

    p.push('</svg>');
    return p.join("");
  }

  // ---------- Grouped / multi-series column chart ----------
  function buildGroupedChartSVG(dataset, opts) {
    opts = opts || {};
    var categories = dataset.categories || [];
    var series = dataset.series || [];
    var nCat = categories.length || 1;
    var nSeries = series.length || 1;

    var maxVal = 0;
    series.forEach(function (s) { (s.data || []).forEach(function (v) { if (v > maxVal) maxVal = v; }); });
    var axis = niceAxis(maxVal);

    var width = opts.width || 620;
    var marginLeft = opts.marginLeft || 50;
    var marginRight = opts.marginRight || 16;
    var marginTop = opts.marginTop || 40;
    var legendHeight = opts.showLegend === false ? 0 : (opts.legendHeight || 70);
    var titleSize = dataset.titleSize || opts.titleSize || 15;
    var tickSize = opts.tickSize || 10;
    var valueSize = opts.valueSize || 8.5;
    var catSize = opts.catSize || 9.5;
    var axisTitleSize = opts.axisTitleSize || 11;
    var legendSize = opts.legendSize || 11;
    var showValues = opts.showValues !== false;
    var rotationDeg = opts.labelRotation || 55;
    var catMaxLenG = opts.catMaxLen || 24;

    var basePlotH = (opts.height || 460) - marginTop - (opts.marginBottom || 90) - legendHeight;
    var plotH = Math.max(basePlotH, 180);

    var longestLenG = categories.reduce(function (m, cat) {
      var text = opts.truncateCategories === false ? String(cat) : truncateLabel(String(cat), catMaxLenG);
      return Math.max(m, text.length);
    }, 0);
    var estCharWG = catSize * 0.58;
    var diagReachG = longestLenG * estCharWG * Math.sin(rotationDeg * Math.PI / 180);
    var neededBottomG = 14 + diagReachG + 18 + (dataset.xAxisLabel ? axisTitleSize + 8 : 0) + 10;
    var marginBottom = Math.max(opts.marginBottom || 90, neededBottomG);

    var height = marginTop + plotH + marginBottom + legendHeight;
    var plotW = width - marginLeft - marginRight;
    var catSlot = plotW / nCat;
    var groupPad = catSlot * 0.1;
    var barGroupW = catSlot - groupPad * 2;
    var barWidth = barGroupW / nSeries;

    function yFor(value) { return marginTop + plotH - (value / axis.max) * plotH; }

    var p = [];
    p.push('<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;" font-family="Arial, Helvetica, sans-serif">');
    p.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="' + COL_PANEL2 + '"/>');

    if (dataset.title) {
      p.push('<text x="' + (width / 2) + '" y="' + (titleSize + 6) + '" text-anchor="middle" font-size="' + titleSize +
        '" font-weight="bold" fill="' + COL_INK + '">' + escapeXml(dataset.title) + '</text>');
    }

    var ticks = [];
    for (var v = 0; v <= axis.max; v += axis.step) ticks.push(v);
    ticks.forEach(function (t) {
      var y = yFor(t);
      p.push('<line x1="' + marginLeft + '" y1="' + y + '" x2="' + (width - marginRight) + '" y2="' + y + '" stroke="' + COL_LINE_SOFT + '" stroke-width="1"/>');
      p.push('<text x="' + (marginLeft - 8) + '" y="' + (y + 3) + '" text-anchor="end" font-size="' + tickSize + '" fill="' + COL_MUTED + '">' + t + '</text>');
    });

    p.push('<line x1="' + marginLeft + '" y1="' + marginTop + '" x2="' + marginLeft + '" y2="' + (marginTop + plotH) + '" stroke="' + COL_LINE + '" stroke-width="1"/>');
    p.push('<line x1="' + marginLeft + '" y1="' + (marginTop + plotH) + '" x2="' + (width - marginRight) + '" y2="' + (marginTop + plotH) + '" stroke="' + COL_LINE + '" stroke-width="1"/>');

    categories.forEach(function (cat, ci) {
      var groupX = marginLeft + ci * catSlot + groupPad;
      series.forEach(function (s, si) {
        var val = (s.data && s.data[ci]) || 0;
        var color = s.color || DEFAULT_PALETTE[si % DEFAULT_PALETTE.length];
        var barX = groupX + si * barWidth;
        var barY = yFor(val);
        var barH = (marginTop + plotH) - barY;
        p.push('<rect x="' + barX.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + Math.max(barWidth - 1, 0.5).toFixed(1) +
          '" height="' + Math.max(barH, 0).toFixed(1) + '" fill="' + color + '"/>');
        if (showValues && val > 0) {
          p.push('<text x="' + (barX + barWidth / 2).toFixed(1) + '" y="' + (barY - 3).toFixed(1) +
            '" text-anchor="middle" font-size="' + valueSize + '" fill="' + COL_INK_DIM + '">' + val + '</text>');
        }
      });
      var labelX = marginLeft + ci * catSlot + catSlot / 2;
      var labelY = marginTop + plotH + 12;
      p.push('<text x="' + labelX.toFixed(1) + '" y="' + labelY + '" text-anchor="end" font-size="' + catSize +
        '" fill="' + COL_INK_DIM + '" transform="rotate(-' + rotationDeg + ' ' + labelX.toFixed(1) + ' ' + labelY + ')">' +
        escapeXml(opts.truncateCategories === false ? String(cat) : truncateLabel(String(cat), catMaxLenG)) + '</text>');
    });

    if (dataset.yAxisLabel) {
      p.push('<text x="' + (axisTitleSize + 4) + '" y="' + (marginTop + plotH / 2) + '" text-anchor="middle" font-size="' + axisTitleSize +
        '" fill="' + COL_INK_DIM + '" transform="rotate(-90 ' + (axisTitleSize + 4) + ' ' + (marginTop + plotH / 2) + ')">' +
        escapeXml(dataset.yAxisLabel) + '</text>');
    }
    if (dataset.xAxisLabel) {
      p.push('<text x="' + (width / 2) + '" y="' + (marginTop + plotH + marginBottom - 6) + '" text-anchor="middle" font-size="' + axisTitleSize +
        '" fill="' + COL_INK_DIM + '">' + escapeXml(dataset.xAxisLabel) + '</text>');
    }

    if (opts.showLegend !== false && legendHeight > 0) {
      var legendY = marginTop + plotH + marginBottom + 16;
      var swatchSize = legendSize;
      var cursorX = marginLeft;
      var cursorY = legendY;
      var rowHeight = legendSize + 10;
      var maxRowWidth = width - marginRight;
      series.forEach(function (s, si) {
        var name = s.name || ("Series " + (si + 1));
        var approxWidth = swatchSize + 6 + name.length * (legendSize * 0.56) + 20;
        if (cursorX + approxWidth > maxRowWidth) { cursorX = marginLeft; cursorY += rowHeight; }
        var color = s.color || DEFAULT_PALETTE[si % DEFAULT_PALETTE.length];
        p.push('<rect x="' + cursorX.toFixed(1) + '" y="' + (cursorY - swatchSize).toFixed(1) + '" width="' + swatchSize + '" height="' + swatchSize + '" fill="' + color + '"/>');
        p.push('<text x="' + (cursorX + swatchSize + 5).toFixed(1) + '" y="' + cursorY.toFixed(1) + '" font-size="' + legendSize + '" fill="' + COL_INK_DIM + '">' + escapeXml(name) + '</text>');
        cursorX += approxWidth;
      });
    }

    p.push('</svg>');
    return p.join("");
  }

  function renderChart(dataset, opts) {
    return Array.isArray(dataset.series) ? buildGroupedChartSVG(dataset, opts) : buildChartSVG(dataset, opts);
  }

  // ---------- Public: render a full results view into a container ----------
  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement("style");
    style.textContent = [
      ".rp-card{background:" + COL_PANEL + ";border:1px solid " + COL_LINE + ";border-radius:6px;",
      "margin-bottom:16px;overflow:hidden;}",
      ".rp-card-title{padding:10px 14px;font-family:'Courier New',monospace;font-size:11px;",
      "letter-spacing:1px;text-transform:uppercase;color:" + COL_ACCENT + ";border-bottom:1px solid " + COL_LINE + ";}",
      ".rp-chart-wrap{padding:6px;cursor:zoom-in;position:relative;}",
      ".rp-chart-wrap:hover::after{content:'Click to enlarge';position:absolute;bottom:6px;right:10px;",
      "font-size:10px;color:" + COL_MUTED + ";background:rgba(13,31,51,.85);padding:2px 6px;border-radius:3px;",
      "font-family:Arial,sans-serif;}",
      ".rp-caption{padding:6px 14px 12px;font-size:11.5px;color:" + COL_MUTED + ";font-family:Arial,sans-serif;}",
      ".rp-empty{padding:30px 20px;text-align:center;color:" + COL_MUTED + ";font-family:Arial,sans-serif;font-size:13px;}",
      ".rp-modal-overlay{position:fixed;inset:0;background:rgba(5,14,24,.8);z-index:2000;",
      "display:flex;align-items:center;justify-content:center;padding:24px;}",
      ".rp-modal-overlay.rp-hidden{display:none;}",
      ".rp-modal-card{background:" + COL_PANEL2 + ";border:1px solid " + COL_LINE + ";border-radius:8px;",
      "max-width:1000px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.5);position:relative;}",
      ".rp-modal-close{position:absolute;top:8px;right:12px;background:none;border:none;font-size:26px;",
      "line-height:1;cursor:pointer;color:" + COL_MUTED + ";z-index:1;}",
      ".rp-modal-close:hover{color:" + COL_ACCENT + ";}",
      ".rp-modal-body{padding:20px;}"
    ].join("");
    document.head.appendChild(style);
  }

  var modalOverlay, modalBody;
  function ensureModal() {
    if (modalOverlay) return;
    modalOverlay = document.createElement("div");
    modalOverlay.className = "rp-modal-overlay rp-hidden";
    modalOverlay.innerHTML = '<div class="rp-modal-card"><button type="button" class="rp-modal-close" aria-label="Close">&times;</button><div class="rp-modal-body"></div></div>';
    document.body.appendChild(modalOverlay);
    modalBody = modalOverlay.querySelector(".rp-modal-body");
    modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) closeModal(); });
    modalOverlay.querySelector(".rp-modal-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }
  function openModal(dataset) {
    ensureModal();
    var isGrouped = Array.isArray(dataset.series);
    modalBody.innerHTML = renderChart(dataset, {
      width: isGrouped ? 960 : 860,
      height: isGrouped ? 640 : 560,
      marginLeft: 64, marginRight: 26, marginTop: 50,
      marginBottom: isGrouped ? 150 : 150,
      legendHeight: isGrouped ? 66 : 0,
      titleSize: 19, tickSize: 12.5, valueSize: isGrouped ? 10 : 13,
      catSize: 10, axisTitleSize: 13.5, legendSize: 13,
      maxBarWidth: 66, truncateCategories: false,
      showLegend: isGrouped, showValues: true
    });
    modalOverlay.classList.remove("rp-hidden");
  }
  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.add("rp-hidden");
    modalBody.innerHTML = "";
  }

  function renderInto(container, resultsData) {
    injectStyles();
    container.innerHTML = "";

    if (!resultsData) {
      var empty = document.createElement("div");
      empty.className = "rp-empty";
      empty.textContent = "No results data available for this plate yet.";
      container.appendChild(empty);
      return;
    }

    var datasets = Array.isArray(resultsData) ? resultsData : [resultsData];

    datasets.forEach(function (dataset) {
      var rows = dataset.rows || [];
      var total;
      if (typeof dataset.total === "number") {
        total = dataset.total;
      } else if (Array.isArray(dataset.series)) {
        total = dataset.series.reduce(function (sum, s) {
          return sum + (s.data || []).reduce(function (a, b) { return a + (b || 0); }, 0);
        }, 0);
      } else {
        total = rows.reduce(function (sum, r) { return sum + (r.count || 0); }, 0);
      }
      var unitLabel = dataset.unit || "records";

      var card = document.createElement("div");
      card.className = "rp-card";
      card.innerHTML =
        '<div class="rp-card-title">' + escapeXml(dataset.title || "Results") + '</div>' +
        '<div class="rp-chart-wrap"></div>' +
        '<div class="rp-caption">Total: ' + total + ' ' + unitLabel + '</div>';
      container.appendChild(card);

      var chartWrap = card.querySelector(".rp-chart-wrap");
      chartWrap.innerHTML = renderChart(dataset, {
        width: 620, height: Array.isArray(dataset.series) ? 460 : 400,
        showLegend: Array.isArray(dataset.series), showValues: true
      });
      chartWrap.addEventListener("click", function () { openModal(dataset); });
    });
  }

  function clear(container) {
    container.innerHTML = "";
  }

  window.ResultsPanel = { renderInto: renderInto, clear: clear };
})();
