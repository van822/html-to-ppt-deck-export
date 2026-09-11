"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { DEFAULT_BLOCK_SELECTOR, validateStaticPlan, validateDomReferences, assertValidPlan } =
  require("../../skills/html-to-ppt-deck-export/scripts/lib/validate_plan");
const { installBuilder } = require("../../skills/html-to-ppt-deck-export/scripts/export_preview");
const { temp, run, png } = require("../helpers");

test("DOM checks localize invalid references and preserve partial/selector semantics", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const html = '<main><section class="panel"><p>A</p><p>B</p></section>' +
    '<section class="panel"><p>C</p></section><section class="panel"></section></main>';
  await page.setContent(html);
  const check = (plan) => {
    assert.deepEqual(validateStaticPlan(plan), []);
    return page.evaluate(validateDomReferences, { plan, defaultBlockSelector: DEFAULT_BLOCK_SELECTOR });
  };
  const plan = { slides: [{ name: "Overview", items: [
    { block: 18 }, { selector: ".absent" }, { selector: "[" },
    { type: "partial", block: 1, prefixChildren: [3], children: [1, 4] },
    { type: "partial", block: 3, prefixChildren: [], children: [1] },
  ] }] };
  const errors = await check(plan);
  assert.deepEqual(errors.map((e) => e.path), [
    "slides[0].items[0].block", "slides[0].items[1].selector", "slides[0].items[2].selector",
    "slides[0].items[3].prefixChildren[0]", "slides[0].items[3].children[1]", "slides[0].items[4].children[0]",
  ]);
  assert.equal(errors[0].reason, "block 18 does not exist; available range is 1..3");
  assert.ok(errors.every((error) => error.slideName === "Overview"));
  assert.throws(() => assertValidPlan("DOM", errors), /DOM validation failed:\nslides\[0\]\.items\[0\]\.block/);
  assert.deepEqual(await check(plan), errors);
  assert.equal(await page.locator("#ppt-export-stage").count(), 0);
  assert.equal(await page.locator("main").innerHTML(), '<section class="panel"><p>A</p><p>B</p></section>' +
    '<section class="panel"><p>C</p></section><section class="panel"></section>');
  const invalidBlockSelector = await check({ blockSelector: "[", slides: [{ items: [{ block: 1 }] }] });
  assert.equal(invalidBlockSelector[0].path, "blockSelector");
  assert.match(invalidBlockSelector[0].reason, /slides\[0\]\.items\[0\]\.block/);
  const noBlocks = await check({ blockSelector: ".absent", slides: [{ items: [{ block: 1 }] }] });
  assert.match(noBlocks[0].reason, /no blocks matched/);

  const valid = { blockSelector: "[", slides: [
    { items: [{ type: "partial", selector: "main > section", block: {}, children: ["2", 1, 2] }] },
    { items: [{ type: "partial", selector: "main > section", prefixChildren: [], children: ["2", 1, 2] }] },
    { items: [{ type: "partial", selector: "main > section", prefixChildren: null, children: [2] }] },
  ] };
  assert.deepEqual(await check(valid), []); // First match wins; unused blockSelector is ignored.
  await installBuilder(page, valid, 1600, 900);
  for (const [index, expected] of [[0, ["A", "B"]], [1, ["B", "A"]], [2, ["B"]]]) {
    await page.evaluate((spec) => window.__buildPptSlide(spec), valid.slides[index]);
    assert.deepEqual(await page.locator("#ppt-export-stage p").allTextContents(), expected);
  }
});

test("DOM failures occur before output cleanup, including errors on later slides", (t) => {
  const dir = temp(t);
  const source = path.join(dir, "report.html");
  const planPath = path.join(dir, "plan.json");
  fs.writeFileSync(source, '<main><section><p>One</p><p>Two</p></section></main>');
  const existing = path.join(dir, "accepted");
  const absent = path.join(dir, "new-output");
  fs.mkdirSync(existing);
  const files = { "planned_01.png": png(80, 90, 100), "manifest.json": Buffer.from('{"accepted":true}'), "sentinel.txt": Buffer.from("keep") };
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(existing, name), bytes);
  const cases = [
    [{ block: 18 }, /slides\[1\]\.items\[0\]\.block: block 18 does not exist/],
    [{ selector: ".absent" }, /slides\[1\]\.items\[0\]\.selector: no element matches/],
    [{ selector: "[" }, /slides\[1\]\.items\[0\]\.selector: invalid CSS selector syntax/],
    [{ type: "partial", block: 1, children: [4] }, /slides\[1\]\.items\[0\]\.children\[0\]: child 4 does not exist/],
  ];
  for (const [item, message] of cases) {
    fs.writeFileSync(planPath, JSON.stringify({
      blockSelector: "main > section", waitMs: 0, perSlideWaitMs: 0,
      slides: [{ items: [{ block: 1 }] }, { name: "Broken", items: [item] }],
    }));
    for (const output of [existing, absent]) {
      const result = run("export_preview.js", [source, planPath, output]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^DOM validation failed:/);
      assert.match(result.stderr, message);
      assert.match(result.stderr, /\(slide "Broken"\)/);
      assert.doesNotMatch(result.stderr, /at main/);
    }
    for (const [name, bytes] of Object.entries(files)) assert.deepEqual(fs.readFileSync(path.join(existing, name)), bytes);
    assert.deepEqual(fs.readdirSync(existing).sort(), Object.keys(files).sort());
    assert.equal(fs.existsSync(absent), false);
  }
});
