#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { execSync } = require("child_process");

function requireDependency(name) {
  const attempts = [
    () => require(name),
    () => createRequire(path.join(process.cwd(), "package.json"))(name),
    () => createRequire(path.join(process.cwd(), "work", "html_to_ppt", "package.json"))(name),
  ];
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (globalRoot) attempts.push(() => require(path.join(globalRoot, name)));
  } catch {
    // Ignore missing npm.
  }
  let lastErr;
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(`Missing Node dependency: ${name}`);
  console.error("Install it in the active workspace or globally, or run from a project that exposes it.");
  throw lastErr;
}

const pptxgen = requireDependency("pptxgenjs");

const previewDir = process.argv[2];
const outputPptx = process.argv[3];

if (!previewDir || !outputPptx) {
  console.error("Usage: node ppt_from_preview.js <preview-dir> <output.pptx>");
  process.exit(1);
}

const dir = path.resolve(previewDir);
const outPath = path.resolve(outputPptx);
const PPT_W = 13.333333;
const PPT_H = 7.5;
const PAPER = "F1E9D8";

function slideNumber(name) {
  const m = name.match(/planned_(\d+)\.png$/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

const images = fs.readdirSync(dir)
  .filter((name) => /^planned_\d+\.png$/i.test(name))
  .sort((a, b) => slideNumber(a) - slideNumber(b))
  .map((name) => path.join(dir, name));

if (!images.length) {
  throw new Error(`No planned_*.png files found in ${dir}`);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Codex";
pptx.subject = "HTML-to-PPT screenshot deck export";
pptx.company = "";
pptx.lang = "zh-CN";
pptx.theme = {
  headFontFace: "Noto Serif SC",
  bodyFontFace: "Noto Sans SC",
  lang: "zh-CN",
};

for (const imagePath of images) {
  const slide = pptx.addSlide();
  slide.background = { color: PAPER };
  slide.addImage({ path: imagePath, x: 0, y: 0, w: PPT_W, h: PPT_H });
}

pptx.writeFile({ fileName: outPath }).then(() => {
  console.log(JSON.stringify({
    output: outPath,
    slides: images.length,
    sourceImages: dir,
  }, null, 2));
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
