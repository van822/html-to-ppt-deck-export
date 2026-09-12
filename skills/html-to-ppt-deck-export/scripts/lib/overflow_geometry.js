"use strict";

const TOLERANCE_PX = 1;
const SIDES = ["left", "top", "right", "bottom"];
const round = (value) => Math.round(value * 1000) / 1000;
const rounded = (rect) => rect && Object.fromEntries(SIDES.map((side) => [side, round(rect[side])]));
const validRect = (rect) => rect && SIDES.every((side) => Number.isFinite(rect[side])) &&
  rect.right > rect.left && rect.bottom > rect.top;
const validBoundary = (rect) => rect && SIDES.every((side) => Number.isFinite(rect[side])) &&
  rect.right >= rect.left && rect.bottom >= rect.top;

function intersection(a, b, axes = { x: true, y: true }) {
  const result = {
    left: axes.x ? Math.max(a.left, b.left) : a.left,
    right: axes.x ? Math.min(a.right, b.right) : a.right,
    top: axes.y ? Math.max(a.top, b.top) : a.top,
    bottom: axes.y ? Math.min(a.bottom, b.bottom) : a.bottom,
  };
  return validRect(result) ? result : null;
}

function excess(content, visible, axes = { x: true, y: true }) {
  return {
    left: axes.x ? Math.max(0, visible.left - content.left) : 0,
    right: axes.x ? Math.max(0, content.right - visible.right) : 0,
    top: axes.y ? Math.max(0, visible.top - content.top) : 0,
    bottom: axes.y ? Math.max(0, content.bottom - visible.bottom) : 0,
  };
}

function union(a, b) {
  if (!a) return { ...b };
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}

// Pure rectangle operations; DOM measurement is kept in measure_overflow.js.
function classifyOverflow(measurement, clip) {
  const { stageBounds, samples = [], limitations = [] } = measurement;
  const cropBounds = { left: clip.x - measurement.origin.x, top: clip.y - measurement.origin.y,
    right: clip.x + clip.width - measurement.origin.x, bottom: clip.y + clip.height - measurement.origin.y };
  const viewport = measurement.viewportBounds;
  let stageVisible = validRect(stageBounds) && validRect(viewport) ? intersection(stageBounds, viewport) : null;
  if (stageVisible && measurement.stageClip && !measurement.stageClip.approximate) {
    stageVisible = intersection(stageVisible, measurement.stageClip.bounds, measurement.stageClip.axes);
  }
  const visibleBounds = stageVisible && validRect(cropBounds) ? intersection(stageVisible, cropBounds) : null;
  const groups = new Map();
  let contentBounds = null;

  function record(type, sample, bounds, visible, axes = { x: true, y: true }, target = "stage") {
    const amount = excess(bounds, visible, axes);
    if (!SIDES.some((side) => amount[side] > TOLERANCE_PX)) return;
    const uncertain = sample.uncertain?.length > 0;
    const confidence = uncertain ? "uncertain" : "measured";
    const key = `${type}:${target}:${confidence}`;
    let group = groups.get(key);
    if (!group) {
      group = { type, confidence, intent: "unknown", boundary: target,
        contentBounds: null, visibleBounds: rounded(visible), overflowPx: { left: 0, top: 0, right: 0, bottom: 0 },
        affectedCount: 0, examples: [], reasons: [] };
      groups.set(key, group);
    }
    group.contentBounds = union(group.contentBounds, bounds);
    for (const side of SIDES) group.overflowPx[side] = Math.max(group.overflowPx[side], amount[side]);
    group.affectedCount++;
    if (group.examples.length < 3 && !group.examples.includes(sample.target)) group.examples.push(sample.target);
    for (const reason of sample.uncertain || []) if (!group.reasons.includes(reason)) group.reasons.push(reason);
  }

  for (const sample of samples) {
    if (!validRect(sample.bounds)) continue;
    let bounds = sample.bounds;
    for (const container of sample.clips || []) {
      if (!bounds) break;
      if (!validBoundary(container.bounds)) continue;
      // Complex clips cannot be reduced to an axis-aligned padding rectangle.
      // Keep their bounds as evidence, but never use them to assert definite loss.
      record("container-clipping", sample, bounds, container.bounds, container.axes, container.target);
      if (!container.approximate) bounds = intersection(bounds, container.bounds, container.axes);
    }
    if (!bounds) continue;
    contentBounds = union(contentBounds, bounds);
    if (!stageVisible || !visibleBounds) continue;
    record("stage-overflow", sample, bounds, stageVisible);
    const withinStage = intersection(bounds, stageVisible);
    if (withinStage) record("crop-clipping", sample, withinStage, visibleBounds, undefined, "crop");
  }

  const diagnostics = [...groups.values()].map((group) => {
    const x = group.overflowPx.left > TOLERANCE_PX || group.overflowPx.right > TOLERANCE_PX;
    const y = group.overflowPx.top > TOLERANCE_PX || group.overflowPx.bottom > TOLERANCE_PX;
    return { ...group, axis: x && y ? "both" : x ? "horizontal" : "vertical",
      contentBounds: rounded(group.contentBounds), overflowPx: rounded(group.overflowPx) };
  });
  const reasons = [...new Set(limitations)];
  if (!visibleBounds) reasons.push("stage and screenshot crop have no measurable visible intersection");
  const diagnosticCount = diagnostics.length;
  // Bound manifest size without hiding how much evidence was omitted.
  const returned = diagnostics.slice(0, 20);
  const truncatedDiagnostics = diagnosticCount - returned.length;
  if (truncatedDiagnostics) reasons.push("diagnostic detail limited to 20 boundary groups");
  return {
    coordinateSpace: "stage-relative-css-pixels", tolerancePx: TOLERANCE_PX,
    status: diagnostics.length ? "diagnostics" : reasons.length ? "uncertain" : "inside",
    stageBounds: rounded(stageBounds), cropBounds: rounded(cropBounds), visibleBounds: rounded(visibleBounds),
    contentBounds: rounded(contentBounds), diagnosticCount, truncatedDiagnostics,
    diagnostics: returned, limitations: reasons,
  };
}

function overflowSummary(index, name, result) {
  if (result.status === "inside") return null;
  const types = [...new Set(result.diagnostics.map((d) => `${d.type} (${d.axis}, ${d.confidence}, ` +
    `${Math.max(...Object.values(d.overflowPx))}px beyond boundary)`))].slice(0, 3);
  if (result.limitations.length) types.push("measurement uncertainty");
  return `slides[${index}]${name ? ` (${JSON.stringify(name)})` : ""}: ${types.join("; ")}; ` +
    `tolerance ${TOLERANCE_PX}px; inspect manifest overflow evidence and previews; clipping intent is unknown.`;
}

function unavailableOverflow() {
  return { coordinateSpace: "stage-relative-css-pixels", tolerancePx: TOLERANCE_PX,
    status: "uncertain", stageBounds: null, cropBounds: null, visibleBounds: null, contentBounds: null,
    diagnosticCount: 0, truncatedDiagnostics: 0, diagnostics: [],
    limitations: ["overflow measurement unavailable; inspect preview manually"] };
}

module.exports = { TOLERANCE_PX, intersection, excess, classifyOverflow, overflowSummary, unavailableOverflow };
