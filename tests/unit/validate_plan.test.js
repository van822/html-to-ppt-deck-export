"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateStaticPlan, assertValidPlan } = require("../../skills/html-to-ppt-deck-export/scripts/lib/validate_plan");
const basic = require("../../examples/basic-report/slide_plan.json");
const planFor = (item = { block: 1 }, fit) => ({ slides: [{ name: "Opening", items: [item], ...(fit ? { fit } : {}) }] });
const paths = (plan) => validateStaticPlan(plan).map((error) => error.path);

test("basic report, minimal plans and optional defaults validate without mutation", () => {
  const plans = [
    basic, planFor(), { slides: [{ items: [{ block: 1 }] }] },
    { stage: null, blockSelector: "", slides: [{ fit: null, items: [{ type: null, selector: "", block: "1" }] }] },
    { stage: { width: null, height: null, deviceScaleFactor: null }, ...planFor() },
    { stage: { width: 1200, height: 900, deviceScaleFactor: 1.5 }, ...planFor() },
    planFor({ type: "", selector: null, block: "1e0", customMetadata: {} }),
    planFor({ type: "partial", block: 1, children: ["2", 2, 1], prefixChildren: [] }),
    planFor({ type: "partial", block: 1, children: null, prefixChildren: null }),
    planFor({ type: "partial", block: 1 }),
  ];
  for (const plan of plans) {
    const before = JSON.stringify(plan);
    assert.deepEqual(validateStaticPlan(plan), [], before);
    assert.equal(JSON.stringify(plan), before);
  }
});

test("selector precedence and unused fields retain existing behavior", () => {
  const plan = {
    blockSelector: { ignored: true }, defaultWidth: "unused", maxScale: -99, cropX: "unused",
    slides: [{ items: [{ selector: "main > section", block: { ignored: true }, children: "ignored" }],
      fit: { width: 1200, maxScale: 1, noCrop: true, cropY: {}, preserveWide: true, shortWidth: {} } }],
  };
  assert.deepEqual(validateStaticPlan(plan), []);
  plan.slides.push({ items: [{ block: 1 }] });
  assert.ok(paths(plan).includes("blockSelector"));
  assert.ok(paths(plan).includes("defaultWidth"));
  assert.ok(paths(plan).includes("maxScale"));
});

test("numeric strings, false width switches and signed geometry controls remain usable", () => {
  const plan = planFor({ block: "01" }, {
    width: "1200", maxScale: "1.2", shortWidth: false, mediumWidth: false,
    shortHeight: "ignored", mediumHeight: {}, padX: -10, padY: 0,
    cropX: -5, cropY: -3, topBias: 1.1, fontGuardBelow: 0, cropCenterX: "-10",
  });
  assert.deepEqual(validateStaticPlan(plan), []);
});

test("invalid static fields are localized deterministically", async (t) => {
  const cases = [
    ["null root", null, "$"], ["array root", [], "$"], ["scalar root", 4, "$"],
    ["missing slides", {}, "slides"], ["empty slides", { slides: [] }, "slides"],
    ["wrong slides", { slides: {} }, "slides"],
    ["null slide", { slides: [null] }, "slides[0]"],
    ["array slide", { slides: [[]] }, "slides[0]"],
    ["missing items", { slides: [{}] }, "slides[0].items"],
    ["null items", { slides: [{ items: null }] }, "slides[0].items"],
    ["empty items", { slides: [{ items: [] }] }, "slides[0].items"],
    ["object items", { slides: [{ items: {} }] }, "slides[0].items"],
    ["null item", planFor(null), "slides[0].items[0]"],
    ["array item", planFor([]), "slides[0].items[0]"],
    ["unsupported type", planFor({ type: "image", block: 1 }), "slides[0].items[0].type"],
    ["missing block", planFor({}), "slides[0].items[0].block"],
    ["fraction block", planFor({ block: 1.5 }), "slides[0].items[0].block"],
    ["zero block", planFor({ block: 0 }), "slides[0].items[0].block"],
    ["negative block", planFor({ block: -1 }), "slides[0].items[0].block"],
    ["boolean block", planFor({ block: true }), "slides[0].items[0].block"],
    ["array block", planFor({ block: [1] }), "slides[0].items[0].block"],
    ["bad numeric string", planFor({ block: "1foo" }), "slides[0].items[0].block"],
    ["blank block", planFor({ block: " " }), "slides[0].items[0].block"],
    ["object selector", planFor({ selector: {} }), "slides[0].items[0].selector"],
    ["blank selector", planFor({ selector: "  " }), "slides[0].items[0].selector"],
    ["bad children collection", planFor({ type: "partial", block: 1, children: "12" }), "slides[0].items[0].children"],
    ["bad prefix collection", planFor({ type: "partial", block: 1, prefixChildren: {} }), "slides[0].items[0].prefixChildren"],
    ["bad child", planFor({ type: "partial", block: 1, children: [0] }), "slides[0].items[0].children[0]"],
    ["boolean child", planFor({ type: "partial", block: 1, children: [true] }), "slides[0].items[0].children[0]"],
    ["bad prefix", planFor({ type: "partial", block: 1, prefixChildren: [1, 2.5] }), "slides[0].items[0].prefixChildren[1]"],
    ["wrong fit", { slides: [{ items: [{ block: 1 }], fit: [] }] }, "slides[0].fit"],
    ["zero fit width", planFor(undefined, { width: 0 }), "slides[0].fit.width"],
    ["bad scale", planFor(undefined, { maxScale: Infinity }), "slides[0].fit.maxScale"],
    ["boolean scale", planFor(undefined, { maxScale: true }), "slides[0].fit.maxScale"],
    ["bad bias", planFor(undefined, { topBias: "center" }), "slides[0].fit.topBias"],
    ["zero available width", planFor(undefined, { padX: 800 }), "slides[0].fit.padX"],
    ["negative available height", planFor(undefined, { padY: 500 }), "slides[0].fit.padY"],
    ["non-finite derived space", planFor(undefined, { padX: -1e308 }), "slides[0].fit.padX"],
    ["wrong flag", planFor(undefined, { noCrop: "false" }), "slides[0].fit.noCrop"],
    ["bad crop", planFor(undefined, { minClipW: -1 }), "slides[0].fit.minClipW"],
    ["wrong stage", { stage: [], ...planFor() }, "stage"],
    ["zero stage", { stage: { width: 0 }, ...planFor() }, "stage.width"],
    ["fraction stage", { stage: { height: 900.5 }, ...planFor() }, "stage.height"],
    ["string stage", { stage: { width: "1600" }, ...planFor() }, "stage.width"],
    ["negative factor", { stage: { deviceScaleFactor: -1 }, ...planFor() }, "stage.deviceScaleFactor"],
    ["negative wait", { waitMs: -1, ...planFor() }, "waitMs"],
    ["string wait", { perSlideWaitMs: "0", ...planFor() }, "perSlideWaitMs"],
  ];
  for (const [name, plan, location] of cases) {
    await t.test(name, () => {
      const result = validateStaticPlan(plan);
      assert.ok(result.some((error) => error.path === location), JSON.stringify(result));
      assert.deepEqual(validateStaticPlan(plan), result);
    });
  }
});

test("error messages retain item paths, slide names and stable phase labels", () => {
  const plan = { slides: [{ name: 'Intro\n"one"', items: [{ block: 0 }, { type: "unknown", selector: ".x" }] }] };
  assert.throws(() => assertValidPlan("Static", validateStaticPlan(plan)), (error) => {
    assert.equal(error.name, "SlidePlanValidationError");
    assert.equal(error.message,
      'Static validation failed:\n' +
      'slides[0].items[0].block: must be a positive integer or integer numeric string (slide "Intro\\n\\"one\\"")\n' +
      'slides[0].items[1].type: must be full, chapter, partial, or a default (falsy) value (slide "Intro\\n\\"one\\"")');
    return true;
  });
});
