#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const sourceDir = process.argv[2];
const outputDir = process.argv[3];
const rulesPath = process.argv[4];
const force = process.argv.includes("--force");

if (!sourceDir || !outputDir || !rulesPath) {
  console.error("Usage: node replace_preview_pages.js <source-preview-dir> <output-preview-dir> <rules.json> [--force]");
  process.exit(1);
}

function slideNumber(name) {
  const m = name.match(/planned_(\d+)\.png$/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function resolveFromRules(p) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(path.dirname(path.resolve(rulesPath)), p);
}

const src = path.resolve(sourceDir);
const dst = path.resolve(outputDir);
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));

if (fs.existsSync(dst)) {
  if (!force) throw new Error(`Output directory exists: ${dst}. Use --force to replace it.`);
  fs.rmSync(dst, { recursive: true, force: true });
}
fs.mkdirSync(dst, { recursive: true });

let sequence = fs.readdirSync(src)
  .filter((name) => /^planned_\d+\.png$/i.test(name))
  .sort((a, b) => slideNumber(a) - slideNumber(b))
  .map((name) => ({ type: "source", path: path.join(src, name), original: name }));

if (!sequence.length) throw new Error(`No planned_*.png files found in ${src}`);

const replacements = rules.replace || rules.replacements || [];
for (const op of replacements.slice().sort((a, b) => b.start - a.start)) {
  const start = Number(op.start);
  const deleteCount = Number(op.deleteCount ?? op.remove ?? 1);
  const images = (op.images || (op.image ? [op.image] : [])).map((p) => ({
    type: "replacement",
    path: resolveFromRules(p),
    original: p,
  }));
  if (!start || start < 1) throw new Error(`Invalid replacement start: ${op.start}`);
  if (!images.length) throw new Error(`Replacement at ${start} has no images.`);
  sequence.splice(start - 1, deleteCount, ...images);
}

sequence.forEach((entry, idx) => {
  if (!fs.existsSync(entry.path)) throw new Error(`Missing image: ${entry.path}`);
  const outName = `planned_${String(idx + 1).padStart(2, "0")}.png`;
  fs.copyFileSync(entry.path, path.join(dst, outName));
});

const manifest = {
  source: src,
  output: dst,
  rules: path.resolve(rulesPath),
  slides: sequence.length,
  sequence: sequence.map((entry, idx) => ({
    slide: idx + 1,
    source: entry.path,
    type: entry.type,
  })),
};
fs.writeFileSync(path.join(dst, "replace_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log(JSON.stringify({
  output: dst,
  slides: sequence.length,
  manifest: path.join(dst, "replace_manifest.json"),
}, null, 2));
