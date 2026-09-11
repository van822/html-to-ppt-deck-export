"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { installBuilder } = require("../../skills/html-to-ppt-deck-export/scripts/export_preview");
const { root, scripts, temp, run, success, png, assertDeckImages } = require("../helpers");

test("slide builder preserves item selection, defaults, and fit behavior", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent('<style>section{padding:20px}p{font:30px Arial}</style><main><section id="a">' +
    "<h1>Title</h1><p>Prefix two</p><p>Prefix three</p><p>Chosen four</p><p>Omitted five</p>" +
    '</section><section id="b"><p>Second block</p></section></main>');
  await installBuilder(page, { blockSelector: "main > section" }, 1600, 900);
  const build = (spec) => page.evaluate((s) => window.__buildPptSlide(s), spec);
  await build({ items: [{ block: 2 }] });
  assert.equal(await page.locator("#ppt-export-stage p").textContent(), "Second block");
  await build({ items: [{ type: "chapter", selector: "main > #a", block: 99 }] });
  assert.equal(await page.locator("#ppt-export-stage .export-chapter").count(), 1);
  assert.equal(await page.locator("#ppt-export-stage #a > *").count(), 5);
  await build({ items: [{ type: "partial", block: 1, children: [4, 3, 4] }] });
  assert.deepEqual(await page.locator("#ppt-export-stage #a > *").allTextContents(),
    ["Title", "Prefix two", "Prefix three", "Chosen four"]);
  await build({ items: [{ type: "partial", block: 1, prefixChildren: [], children: [4] }] });
  assert.deepEqual(await page.locator("#ppt-export-stage #a > *").allTextContents(), ["Chosen four"]);
  await assert.rejects(build({ items: [{ block: 99 }] }), /No block 99/);
  await assert.rejects(build({ items: [{ selector: ".absent" }] }), /No element matched/);
  await assert.rejects(build({ items: [{ type: "unknown", block: 1 }] }), /Unknown item type/);
  const fit = await build({ fit: { width: 1200, preserveWide: true, noCrop: true }, items: [{ block: 1 }] });
  assert.deepEqual(fit.clip, { x: 0, y: 0, width: 1600, height: 900 });
  assert.equal(fit.rawWidth, 1200);
  assert.ok(Number.isFinite(fit.scale) && fit.scale > 0);
  const cropped = await build({ items: [{ block: 2 }] });
  assert.ok(Math.abs(cropped.clip.width / cropped.clip.height - 16 / 9) < 0.005);
  assert.ok(cropped.clip.x >= 0 && cropped.clip.x + cropped.clip.width <= 1600);
  assert.ok(cropped.clip.y >= 0 && cropped.clip.y + cropped.clip.height <= 900);
});

test("contact sheet displays actual local PNG pixels in numeric order and rejects corrupt images", async (t) => {
  const dir = temp(t);
  fs.writeFileSync(path.join(dir, "planned_10.png"), png(0, 0, 255));
  fs.writeFileSync(path.join(dir, "planned_2.png"), png(255, 0, 0));
  const output = path.join(dir, "sheet.png");
  assert.equal(success(run("make_contact_sheet.js", [dir, output, "2"])).slides, 2);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<img id="sheet" src="data:image/png;base64,' + fs.readFileSync(output).toString("base64") + '">');
  const colors = await page.evaluate(async () => {
    const img = document.getElementById("sheet");
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return [Array.from(ctx.getImageData(450, 200, 1, 1).data), Array.from(ctx.getImageData(1350, 200, 1, 1).data)];
  });
  assert.deepEqual(colors, [[255, 0, 0, 255], [0, 0, 255, 255]]);
  fs.writeFileSync(path.join(dir, "planned_11.png"), "invalid PNG");
  const failedOutput = path.join(dir, "failed.png");
  const failed = run("make_contact_sheet.js", [dir, failedOutput]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /failed to load/);
  assert.equal(fs.existsSync(failedOutput), false);
});

test("preview CLI handles literal percent, hash, spaces and Unicode; default scale factor is two", (t) => {
  const dir = temp(t);
  const source = path.join(dir, "报告 %20 # source.html");
  const plan = path.join(dir, "plan.json");
  const output = path.join(dir, "previews");
  fs.writeFileSync(source, '<main><section style="padding:30px;font:32px Arial">Local source</section></main>');
  fs.writeFileSync(plan, JSON.stringify({
    blockSelector: "main > section", waitMs: 0, perSlideWaitMs: 0,
    slides: [{ items: [{ block: 1 }] }],
  }));
  const report = success(run("export_preview.js", [source, plan, output]));
  const manifest = JSON.parse(fs.readFileSync(report.manifest));
  assert.equal(manifest.stage.deviceScaleFactor, 2);
  const image = fs.readFileSync(path.join(output, "planned_01.png"));
  const clip = manifest.metrics[0].clip;
  assert.equal(image.readUInt32BE(16), clip.width * 2);
  assert.equal(image.readUInt32BE(20), clip.height * 2);
  fs.writeFileSync(plan, JSON.stringify({ blockSelector: "main > section", waitMs: 0, slides: [{ items: [{ block: 99 }] }] }));
  const failed = run("export_preview.js", [source, plan, path.join(dir, "invalid")]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /DOM validation failed:\nslides\[0\]\.items\[0\]\.block: block 99 does not exist/);
});

test("four-page offline example produces previews, contact sheet, matching PPTX and QA",
  { skip: process.platform !== "win32" }, async (t) => {
    const dir = path.join(root, "outputs/ci-basic-report");
    const preview = path.join(dir, "previews");
    const source = path.join(root, "examples/basic-report/report.html");
    const plan = path.join(root, "examples/basic-report/slide_plan.json");
    const result = success(run("export_preview.js", [source, plan, preview]));
    assert.equal(result.slides, 4);
    const manifest = JSON.parse(fs.readFileSync(result.manifest));
    assert.equal(manifest.metrics.length, 4);
    const images = [1, 2, 3, 4].map((n) => fs.readFileSync(path.join(preview, "planned_0" + n + ".png")));
    for (const image of images) {
      assert.equal(image.readUInt32BE(16), 1600);
      assert.equal(image.readUInt32BE(20), 900);
    }
    success(run("make_contact_sheet.js", [preview, path.join(dir, "contact_sheet.png"), "2"]));
    // Automated smoke checks supplement the manual visual gate documented for contributors.
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const image of images) {
        await page.setContent('<img src="data:image/png;base64,' + image.toString("base64") + '">');
        assert.equal(await page.evaluate(async () => {
          const img = document.images[0]; await img.decode(); return img.naturalWidth;
        }), 1600);
      }
    } finally { await browser.close(); }
    const pptx = path.join(dir, "basic-report.pptx");
    success(run("ppt_from_preview.js", [preview, pptx]));
    assertDeckImages(pptx, images);
    const qa = success(run("qa_pptx_full_bleed.js", [pptx]));
    assert.equal(qa.slides, 4);
    assert.equal(qa.badCount, 0);
    fs.writeFileSync(path.join(dir, "qa.json"), JSON.stringify(qa, null, 2));

    await t.test("installed skill copy resolves dependencies from the active repository", () => {
      const external = temp(t);
      const copied = path.join(external, "skill-scripts");
      // Copy regular script files explicitly: older supported Node patches have
      // a Windows Unicode-path bug in recursive cpSync.
      for (const entry of fs.readdirSync(scripts, { recursive: true })) {
        const source = path.join(scripts, entry);
        if (!fs.statSync(source).isFile()) continue;
        const target = path.join(copied, entry);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
      const { spawnSync } = require("node:child_process");
      const exported = spawnSync(process.execPath, [path.join(copied, "ppt_from_preview.js"),
        preview, path.join(dir, "external-skill.pptx")], { cwd: root, encoding: "utf8", timeout: 60000 });
      success(exported);
      assertDeckImages(path.join(dir, "external-skill.pptx"), images);
    });
  });
