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

const { chromium } = requireDependency("playwright");

const previewDir = process.argv[2];
const outputPng = process.argv[3];
const cols = Number(process.argv[4] || 4);

if (!previewDir) {
  console.error("Usage: node make_contact_sheet.js <preview-dir> [output.png] [columns]");
  process.exit(1);
}

const dir = path.resolve(previewDir);
const outPath = path.resolve(outputPng || path.join(dir, "contact_sheet.png"));

function slideNumber(name) {
  const m = name.match(/planned_(\d+)\.png$/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return await chromium.launch({ headless: true, channel: "msedge" });
  }
}

async function main() {
  const images = fs.readdirSync(dir)
    .filter((name) => /^planned_\d+\.png$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!images.length) throw new Error(`No planned_*.png files found in ${dir}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const cards = images.map((name) => {
    const num = slideNumber(name);
    return `
      <figure class="card">
        <div class="label">${String(num).padStart(2, "0")} · ${name}</div>
        <img src="data:image/png;base64,${fs.readFileSync(path.join(dir, name)).toString("base64")}" />
      </figure>`;
  }).join("\n");

  const html = `
    <!doctype html>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        background: #f1e9d8;
        color: #2b2a27;
        font-family: Arial, "Microsoft YaHei", sans-serif;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(${Math.max(1, cols)}, minmax(0, 1fr));
        gap: 18px;
      }
      .card {
        margin: 0;
        background: #fbf7ed;
        border: 1px solid rgba(90, 75, 48, .25);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 8px 18px rgba(91, 75, 49, .12);
      }
      .label {
        padding: 8px 10px;
        font: 700 14px/1.2 Consolas, monospace;
        color: #5d5142;
        border-bottom: 1px solid rgba(90, 75, 48, .18);
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        background: #f1e9d8;
      }
    </style>
    <div class="grid">${cards}</div>`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(imgs.map((img) => img.complete ? true : new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      })));
      for (const img of imgs) {
        if (!img.naturalWidth) throw new Error("Contact sheet image failed to load.");
        await img.decode();
      }
    });
    await page.screenshot({ path: outPath, fullPage: true });
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    output: outPath,
    slides: images.length,
    columns: cols,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
