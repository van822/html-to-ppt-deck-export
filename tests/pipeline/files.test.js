"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { temp, run, success, png, assertDeckImages } = require("../helpers");

function fixture(t) {
  const dir = temp(t);
  const src = path.join(dir, "source");
  const dst = path.join(dir, "destination");
  const rules = path.join(dir, "rules.json");
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, "planned_10.png"), png(0, 0, 255));
  fs.writeFileSync(path.join(src, "planned_2.png"), png(255, 0, 0));
  fs.writeFileSync(path.join(src, "contact_sheet.png"), png(0, 255, 0));
  fs.writeFileSync(rules, "{}");
  return { dir, src, dst, rules };
}

test("replacement copies numeric order, ignores contact sheets, and renumbers", (t) => {
  const { src, dst, rules } = fixture(t);
  assert.equal(success(run("replace_preview_pages.js", [src, dst, rules])).slides, 2);
  assert.deepEqual(fs.readFileSync(path.join(dst, "planned_01.png")), png(255, 0, 0));
  assert.deepEqual(fs.readFileSync(path.join(dst, "planned_02.png")), png(0, 0, 255));
  assert.equal(fs.existsSync(path.join(dst, "contact_sheet.png")), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(dst, "replace_manifest.json")));
  assert.deepEqual(manifest.sequence.map((s) => s.slide), [1, 2]);
});

test("unsafe and failed replacements preserve existing files", (t) => {
  const { dir, src, dst, rules } = fixture(t);
  fs.mkdirSync(dst);
  const marker = path.join(dst, "keep.txt");
  fs.writeFileSync(marker, "accepted");
  for (const output of [src, dir]) {
    const result = run("replace_preview_pages.js", [src, output, rules, "--force"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe output directory/);
    assert.deepEqual(fs.readFileSync(path.join(src, "planned_2.png")), png(255, 0, 0));
  }
  assert.match(run("replace_preview_pages.js", [src, dst, rules]).stderr, /Output directory exists/);
  fs.writeFileSync(rules, JSON.stringify({ replace: [{ start: 1, image: "missing.png" }] }));
  assert.match(run("replace_preview_pages.js", [src, dst, rules, "--force"]).stderr, /Missing image/);
  assert.equal(fs.readFileSync(marker, "utf8"), "accepted");
  fs.writeFileSync(rules, "{}");
  success(run("replace_preview_pages.js", [src, dst, rules, "--force"]));
  assert.equal(fs.existsSync(marker), false);
});

test("replacement inputs and rules inside output are protected, including junction aliases", (t) => {
  const { dir, src, dst, rules } = fixture(t);
  fs.mkdirSync(dst);
  const image = path.join(dst, "approved.png");
  fs.writeFileSync(image, png(10, 20, 30));
  fs.writeFileSync(rules, JSON.stringify({ replace: [{ start: 1, image }] }));
  assert.match(run("replace_preview_pages.js", [src, dst, rules, "--force"]).stderr, /Unsafe output/);
  const nestedRules = path.join(dst, "rules.json");
  fs.writeFileSync(nestedRules, "{}");
  assert.match(run("replace_preview_pages.js", [src, dst, nestedRules, "--force"]).stderr, /Unsafe output/);
  const alias = path.join(dir, "alias");
  fs.symlinkSync(src, alias, process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(rules, "{}");
  assert.match(run("replace_preview_pages.js", [src, alias, rules, "--force"]).stderr, /Unsafe output/);
  assert.equal(fs.existsSync(image), true);
});

test("preview preflight rejects empty plans, missing HTML and unsafe output without deleting it", (t) => {
  const { dir, src, dst, rules } = fixture(t);
  const html = path.join(src, "report.html");
  fs.writeFileSync(html, "<main>hello</main>");
  fs.writeFileSync(rules, '{"slides":[]}');
  assert.match(run("export_preview.js", [html, rules, dst]).stderr, /non-empty slides array/);
  fs.writeFileSync(rules, '{"slides":[{"items":[{"block":1}]}]}');
  assert.match(run("export_preview.js", [html, rules, src]).stderr, /Unsafe output/);
  assert.match(run("export_preview.js", [path.join(dir, "missing.html"), rules, dst]).stderr, /ENOENT/);
  assert.equal(fs.existsSync(html), true);
  assert.equal(fs.existsSync(dst), false);
});

test("PPTX preserves numeric image order and empty directories fail", { skip: process.platform !== "win32" }, (t) => {
  const { dir, src } = fixture(t);
  const pptx = path.join(dir, "deck.pptx");
  assert.equal(success(run("ppt_from_preview.js", [src, pptx])).slides, 2);
  assertDeckImages(pptx, [png(255, 0, 0), png(0, 0, 255)]);
  const empty = path.join(dir, "empty");
  fs.mkdirSync(empty);
  assert.match(run("ppt_from_preview.js", [empty, pptx]).stderr, /No planned_/);
});
