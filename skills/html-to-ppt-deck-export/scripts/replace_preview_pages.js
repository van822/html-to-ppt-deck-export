#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { assertSafeOutput } = require("./lib/output_safety");
const { replacementSequence } = require("./lib/replacement_sequence");

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

const src = path.resolve(sourceDir);
const dst = path.resolve(outputDir);
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));

const source = fs.readdirSync(src)
  .filter((name) => /^planned_\d+\.png$/i.test(name))
  .sort((a, b) => slideNumber(a) - slideNumber(b))
  .map((name) => ({ type: "source", path: path.join(src, name), original: name }));

if (!source.length) throw new Error(`No planned_*.png files found in ${src}`);
const sequence = replacementSequence(source, rules, rulesPath);
assertSafeOutput(dst, [src, rulesPath, ...sequence.map((entry) => entry.path)]);
for (const entry of sequence) {
  if (!fs.existsSync(entry.path)) throw new Error(`Missing image: ${entry.path}`);
  if (!fs.statSync(entry.path).isFile()) throw new Error(`Image is not a file: ${entry.path}`);
  fs.accessSync(entry.path, fs.constants.R_OK);
}

if (fs.existsSync(dst)) {
  if (!force) throw new Error(`Output directory exists: ${dst}. Use --force to replace it.`);
  fs.rmSync(dst, { recursive: true, force: true });
}
fs.mkdirSync(dst, { recursive: true });

sequence.forEach((entry, idx) => {
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
