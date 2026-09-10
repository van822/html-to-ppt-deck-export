"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { temp, run, success, png, readZip, xml, changeZip } = require("../helpers");

test("Windows full-bleed QA accepts valid slides and rejects meaningful counterexamples",
  { skip: process.platform !== "win32" }, async (t) => {
    const dir = temp(t);
    const previews = path.join(dir, "previews");
    fs.mkdirSync(previews);
    fs.writeFileSync(path.join(previews, "planned_01.png"), png(50, 90, 120));
    const original = path.join(dir, "original.pptx");
    success(run("ppt_from_preview.js", [previews, original]));
    const entries = readZip(original);
    const slideName = "ppt/slides/slide1.xml";
    const slide = xml(entries, slideName);
    const picture = slide.match(/<p:pic>[\s\S]*?<\/p:pic>/)[0];
    const presentation = xml(entries, "ppt/presentation.xml");
    const report = success(run("qa_pptx_full_bleed.js", [original]));
    assert.deepEqual(Object.keys(report).sort(), ["bad", "badCount", "pptx", "slides"]);
    assert.equal(report.slides, 1);
    assert.equal(report.badCount, 0);
    assert.deepEqual(report.bad, []);
    const wrongOffset = picture.replace('<a:off x="0" y="0"/>', '<a:off x="100" y="100"/>');
    const wrongSize = picture.replace('cx="12192000" cy="6858000"', 'cx="6000000" cy="3000000"');
    const cases = [
      ["no picture", { [slideName]: slide.replace(picture, "") }, 2],
      ["two pictures", { [slideName]: slide.replace(picture, picture + picture) }, 2],
      ["wrong offset", { [slideName]: slide.replace(picture, wrongOffset) }, 2],
      ["wrong extent", { [slideName]: slide.replace(picture, wrongSize) }, 2],
      ["misleading shape", { [slideName]: slide.replace(picture, wrongSize +
        '<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm></p:spPr></p:sp>') }, 2],
      ["wrong deck size", { "ppt/presentation.xml": presentation.replace('cx="12192000"', 'cx="9000000"') }, 2],
      ["empty deck", { [slideName]: null }, 1],
      ["no declared slides", { "ppt/presentation.xml": presentation.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, "<p:sldIdLst/>") }, 1],
      ["malformed XML", { [slideName]: "<broken>" }, 1],
    ];
    for (const [name, changes, status] of cases) {
      await t.test(name, () => {
        const target = path.join(dir, name + ".pptx");
        fs.copyFileSync(original, target);
        changeZip(target, changes);
        const result = run("qa_pptx_full_bleed.js", [target]);
        assert.equal(result.status, status, result.stderr || result.stdout);
        if (status === 2) assert.equal(JSON.parse(result.stdout).badCount, 1);
      });
    }
    await t.test("XML whitespace and alternate namespace prefixes remain valid", () => {
      const target = path.join(dir, "valid-format.pptx");
      fs.copyFileSync(original, target);
      changeZip(target, { [slideName]: slide.replaceAll("a:", "d:").replace('xmlns:a=', 'xmlns:d=').replaceAll("/>", " />") });
      assert.equal(success(run("qa_pptx_full_bleed.js", [target])).badCount, 0);
    });
    await t.test("missing and invalid ZIP inputs fail", () => {
      assert.equal(run("qa_pptx_full_bleed.js", [path.join(dir, "missing.pptx")]).status, 1);
      const invalid = path.join(dir, "invalid.pptx");
      fs.writeFileSync(invalid, "not a ZIP");
      assert.equal(run("qa_pptx_full_bleed.js", [invalid]).status, 1);
    });
  });
