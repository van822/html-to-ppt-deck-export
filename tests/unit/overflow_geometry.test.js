"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TOLERANCE_PX, intersection, excess, classifyOverflow, overflowSummary, unavailableOverflow } =
  require("../../skills/html-to-ppt-deck-export/scripts/lib/overflow_geometry");
const stage = { left: 0, top: 0, right: 1600, bottom: 900 };
const full = { x: 0, y: 0, width: 1600, height: 900 };
const sample = (bounds, extras = {}) => ({ target: "content/div[1]:box", bounds, clips: [], uncertain: [], ...extras });
const inspect = (samples, clip = full, extras = {}) => classifyOverflow({
  origin: { x: 0, y: 0 }, stageBounds: stage, viewportBounds: stage, samples, limitations: [], ...extras,
}, clip);

test("rectangle intersection and directional excess respect each axis", () => {
  const box = { left: -10, top: -20, right: 1650, bottom: 980 };
  assert.deepEqual(excess(box, stage), { left: 10, right: 50, top: 20, bottom: 80 });
  assert.deepEqual(intersection(box, stage), stage);
  assert.deepEqual(intersection(box, stage, { x: true, y: false }), { left: 0, top: -20, right: 1600, bottom: 980 });
  assert.equal(intersection({ left: 1700, top: 0, right: 1800, bottom: 100 }, stage), null);
});

test("subpixel tolerance uses transformed CSS pixels and does not change geometry", () => {
  assert.equal(TOLERANCE_PX, 1);
  for (const delta of [0, 0.5, 1]) {
    const result = inspect([sample({ left: 0, top: 0, right: 1600 + delta, bottom: 900 })]);
    assert.equal(result.status, "inside");
    assert.equal(result.contentBounds.right, 1600 + delta);
  }
  const result = inspect([sample({ left: 0, top: 0, right: 1601.001, bottom: 900 })]);
  assert.equal(result.diagnostics[0].axis, "horizontal");
  assert.equal(result.diagnostics[0].overflowPx.right, 1.001);
});

test("stage and crop evidence stay distinct and intent remains unknown", () => {
  const bounds = { left: -20, top: 10, right: 1700, bottom: 950 };
  const result = inspect([sample(bounds)], { x: 100, y: 50, width: 1400, height: 800 });
  assert.deepEqual(result.diagnostics.map((d) => d.type), ["stage-overflow", "crop-clipping"]);
  assert.equal(result.diagnostics[0].axis, "both");
  assert.equal(result.diagnostics[0].overflowPx.bottom, 50);
  assert.equal(result.diagnostics[1].overflowPx.right, 100);
  assert.ok(result.diagnostics.every((d) => d.confidence === "measured" && d.intent === "unknown"));
});

test("container-hidden portions do not produce duplicate stage overflow", () => {
  const clips = [{ target: "container", bounds: { left: 100, top: 100, right: 300, bottom: 200 }, axes: { x: true, y: true } }];
  const result = inspect([sample({ left: 100, top: 100, right: 1800, bottom: 1000 }, { clips })]);
  assert.deepEqual(result.diagnostics.map((d) => d.type), ["container-clipping"]);
  assert.deepEqual(result.contentBounds, clips[0].bounds);
});

test("approximate transforms retain uncertainty instead of definite clipping claims", () => {
  const result = inspect([sample({ left: 1500, top: 100, right: 1700, bottom: 200 }, { uncertain: ["rotated bounds"] })]);
  assert.equal(result.diagnostics[0].confidence, "uncertain");
  assert.deepEqual(result.diagnostics[0].reasons, ["rotated bounds"]);
  const unsupported = inspect([], full, { limitations: ["mask geometry is unresolved"] });
  assert.equal(unsupported.status, "uncertain");
  assert.equal(unsupported.diagnosticCount, 0);
});

test("zero-sized clipping containers hide their contents without leaking stage warnings", () => {
  const result = inspect([sample({ left: 0, top: 0, right: 1800, bottom: 1000 }, {
    clips: [{ target: "zero", bounds: { left: 0, top: 0, right: 0, bottom: 0 }, axes: { x: true, y: true } }],
  })]);
  assert.deepEqual(result.diagnostics.map((d) => d.type), ["container-clipping"]);
  assert.equal(result.contentBounds, null);
});

test("viewport and stage origin map the actual screenshot crop into one coordinate space", () => {
  const result = inspect([sample({ left: 0, top: 0, right: 100, bottom: 100 })],
    { x: 100, y: 50, width: 1500, height: 850 }, {
      origin: { x: 100, y: 50 },
      viewportBounds: { left: -100, top: -50, right: 1500, bottom: 850 },
    });
  assert.deepEqual(result.cropBounds, { left: 0, top: 0, right: 1500, bottom: 850 });
  assert.deepEqual(result.visibleBounds, result.cropBounds);
  assert.equal(result.status, "inside");
});

test("normal output is quiet, abnormal output is compact and diagnostics are capped explicitly", () => {
  assert.equal(overflowSummary(0, "Normal", inspect([])), null);
  const samples = Array.from({ length: 25 }, (_, i) => sample({ left: 0, top: 0, right: 100, bottom: 100 }, {
    clips: [{ target: "box" + i, bounds: { left: 0, top: 0, right: 50, bottom: 50 }, axes: { x: true, y: true } }],
  }));
  const result = inspect(samples);
  assert.equal(result.diagnosticCount, 25);
  assert.equal(result.diagnostics.length, 20);
  assert.equal(result.truncatedDiagnostics, 5);
  assert.match(overflowSummary(2, 'Results\n"x"', result), /^slides\[2\] \("Results\\n\\"x\\""\): container-clipping/);
  assert.ok(overflowSummary(2, "Results", result).length < 600);
});

test("unavailable measurement has the same additive keys and never implies a clean result", () => {
  const missing = unavailableOverflow();
  assert.deepEqual(Object.keys(missing).sort(), Object.keys(inspect([])).sort());
  assert.equal(missing.status, "uncertain");
  assert.equal(missing.contentBounds, null);
  assert.match(overflowSummary(0, "Unavailable", missing), /measurement uncertainty/);
});
