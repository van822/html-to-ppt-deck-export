"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { root, temp, run, success } = require("../helpers");
const { installBuilder } = require("../../skills/html-to-ppt-deck-export/scripts/export_preview");
const { measureOverflow } = require("../../skills/html-to-ppt-deck-export/scripts/lib/measure_overflow");
const { classifyOverflow } = require("../../skills/html-to-ppt-deck-export/scripts/lib/overflow_geometry");

test("rendered geometry handles overflow, scaling, crop intent, decoration and uncertainty", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const fixture = pathToFileURL(path.join(root, "tests/fixtures/overflow.html")).href;
  async function inspect(id, fit = {}, exportCss = "") {
    await page.goto(fixture);
    await installBuilder(page, { blockSelector: "main > section", exportCss }, 1600, 900);
    const spec = { fit: { width: 1600, preserveWide: true, maxScale: 1, padX: 0, padY: 0, topBias: 0, noCrop: true, ...fit },
      items: [{ selector: "main > #" + id }] };
    const metrics = await page.evaluate((s) => window.__buildPptSlide(s), spec);
    const before = await page.locator("#ppt-export-stage").innerHTML();
    const measured = await page.evaluate(measureOverflow);
    assert.equal(await page.locator("#ppt-export-stage").innerHTML(), before, "measurement must not alter DOM");
    return classifyOverflow(measured, metrics.clip);
  }
  for (const id of ["inside", "scaled", "translated", "rotated", "near", "decorated", "transparent", "not-displayed"]) {
    await t.test(id + " is not a false positive", async () => {
      const result = await inspect(id);
      assert.equal(result.status, "inside", JSON.stringify(result));
      assert.deepEqual(result.diagnostics, []);
    });
  }
  for (const [id, axis, amount] of [["horizontal", "horizontal", 100], ["vertical", "vertical", 80], ["both", "both", 100]]) {
    await t.test(id + " overflow is measured", async () => {
      const result = await inspect(id);
      const d = result.diagnostics.find((d) => d.type === "stage-overflow");
      assert.equal(d.axis, axis);
      assert.equal(d.confidence, "measured");
      assert.equal(Math.max(...Object.values(d.overflowPx)), amount);
    });
  }
  await t.test("more than 1 CSS pixel is significant", async () => {
    const d = (await inspect("beyond-tolerance")).diagnostics[0];
    assert.equal(d.overflowPx.right, 1.5);
  });
  await t.test("long unwrapped text uses line rectangles", async () => {
    const d = (await inspect("text")).diagnostics[0];
    assert.equal(d.type, "stage-overflow");
    assert.ok(d.overflowPx.right > 100);
    assert.ok(d.examples.some((e) => e.endsWith(":text")));
  });
  await t.test("hidden, scrolling and nested clips report containers rather than invisible stage overflow", async () => {
    for (const id of ["hidden", "scroll", "nested"]) {
      const result = await inspect(id);
      assert.ok(result.diagnostics.length > 0, JSON.stringify(result));
      assert.ok(result.diagnostics.every((d) => d.type === "container-clipping"), JSON.stringify(result));
    }
  });
  await t.test("positioned content escaping an unpositioned overflow ancestor is not falsely clipped there", async () => {
    const result = await inspect("escaped");
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].type, "stage-overflow");
    assert.equal(result.diagnostics[0].overflowPx.right, 100);
  });
  await t.test("deliberate crop is separate from stage loss; noCrop restores visibility", async () => {
    const fit = { width: 1200, noCrop: false, cropX: -100, cropY: -100, minClipW: 200 };
    const cropped = await inspect("cropped", fit);
    assert.ok(cropped.diagnostics.some((d) => d.type === "crop-clipping" && d.intent === "unknown"));
    assert.ok(cropped.diagnostics.every((d) => d.type !== "stage-overflow"));
    assert.equal((await inspect("cropped", { ...fit, noCrop: true })).status, "inside");
    assert.equal((await inspect("cropped", { width: 1200, noCrop: false })).status, "inside");
  });
  await t.test("fit scale, adaptive widths and topBias are measured after transformation", async () => {
    assert.equal((await inspect("horizontal", { maxScale: 0.5 })).status, "inside");
    assert.equal((await inspect("inside", { preserveWide: false, shortWidth: 1100, mediumWidth: 1200 })).status, "inside");
    assert.equal((await inspect("inside", { preserveWide: false, shortHeight: 200, mediumHeight: 500, mediumWidth: 900 })).status, "inside");
    const result = await inspect("cropped", { topBias: 2 });
    assert.equal(result.diagnostics[0].axis, "vertical");
  });
  await t.test("export CSS and per-slide classes affect measurements without plan mutation", async () => {
    const result = await inspect("inside", { className: "wide-test" },
      "#ppt-export-stage .wide-test .paint { left: 1580px; }");
    assert.equal(result.diagnostics[0].overflowPx.right, 140);
  });
  await t.test("stage border uses its inner clipping edge while page/stage offsets retain viewport mapping", async () => {
    const bordered = await inspect("decorated", {}, "#ppt-export-stage { border: 10px solid black; }");
    assert.ok(bordered.diagnostics.some((d) => d.type === "stage-overflow" && d.overflowPx.right > 1));
    const translated = await inspect("inside", {}, "#ppt-export-stage { left: 20px; top: 10px; }");
    assert.equal(translated.status, "inside");
    assert.equal(translated.cropBounds.left, -20);
    assert.equal(translated.cropBounds.top, -10);
  });
  await t.test("complex transforms and unsupported clipping remain uncertain", async () => {
    const rotated = await inspect("rotated-outside");
    assert.equal(rotated.diagnostics[0].confidence, "uncertain");
    for (const id of ["masked", "generated", "animated"]) {
      const result = await inspect(id);
      assert.ok(result.limitations.length, JSON.stringify(result));
      assert.notEqual(result.status, "inside");
    }
    const maskedStage = await inspect("inside", {}, "#ppt-export-stage { clip-path: circle(30%); }");
    assert.equal(maskedStage.status, "uncertain");
    assert.ok(maskedStage.limitations.includes("stage or page ancestor has unresolved clipping"));
  });
});

test("preview CLI adds manifest evidence, retains successful exit and leaves stdout JSON compatible", (t) => {
  const dir = temp(t);
  const planPath = path.join(dir, "plan.json");
  fs.writeFileSync(planPath, JSON.stringify({ waitMs: 0, perSlideWaitMs: 0, slides: [
    { name: "Overflow", fit: { width: 1600, preserveWide: true, maxScale: 1, padX: 0, padY: 0, topBias: 0, noCrop: true },
      items: [{ selector: "main > #both" }] },
  ] }));
  const result = run("export_preview.js", [path.join(root, "tests/fixtures/overflow.html"), planPath, path.join(dir, "previews")]);
  const report = success(result);
  assert.equal(report.slides, 1);
  assert.match(result.stderr, /slides\[0\] \("Overflow"\): stage-overflow \(both, measured, 100px/);
  const manifest = JSON.parse(fs.readFileSync(report.manifest));
  const metric = manifest.metrics[0];
  for (const key of ["slide", "name", "scale", "rawWidth", "rawHeight", "top", "left", "clip", "path"]) assert.ok(key in metric);
  assert.equal(metric.overflow.coordinateSpace, "stage-relative-css-pixels");
  assert.equal(metric.overflow.tolerancePx, 1);
  assert.equal(metric.overflow.diagnostics[0].type, "stage-overflow");
  assert.ok(fs.existsSync(metric.path));
});
