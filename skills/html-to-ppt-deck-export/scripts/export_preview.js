#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { assertSafeOutput } = require("./lib/output_safety");
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

const sourceHtml = process.argv[2];
const planPath = process.argv[3];
const outputDir = process.argv[4];

if (require.main === module && (!sourceHtml || !planPath || !outputDir)) {
  console.error("Usage: node export_preview.js <source.html> <slide_plan.json> <preview_dir>");
  process.exit(1);
}

function fileUrl(p) {
  return pathToFileURL(path.resolve(p)).href;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return await chromium.launch({ headless: true, channel: "msedge" });
  }
}

async function waitForPage(page, waitMs) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map((img) => img.complete ? true : new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    })));
  }).catch(() => {});
  await page.waitForTimeout(waitMs ?? 1200);
}

function stageCss(plan, stageW, stageH) {
  const bg = plan.background || "#F1E9D8";
  const gridColor = plan.gridColor || "rgba(57,85,110,.035)";
  return `
    #ppt-export-stage {
      width: ${stageW}px;
      height: ${stageH}px;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 2147483647;
      overflow: hidden;
      box-sizing: border-box;
      display: block;
      background-color: ${bg};
      background-image:
        linear-gradient(${gridColor} 1px, transparent 1px),
        linear-gradient(90deg, ${gridColor} 1px, transparent 1px);
      background-size: ${plan.gridSize || 34}px ${plan.gridSize || 34}px;
    }
    #ppt-export-stage .ppt-export-inner {
      position: absolute;
      width: 1260px;
      transform-origin: top left;
    }
    #ppt-export-stage .ppt-export-inner > * {
      margin-bottom: 0 !important;
    }
    #ppt-export-stage .ppt-export-inner > * + * {
      margin-top: 24px !important;
    }
    #ppt-export-stage .export-chapter {
      padding-top: 28px !important;
      padding-bottom: 28px !important;
      margin-bottom: 0 !important;
    }
    #ppt-export-stage .export-font-guard .say,
    #ppt-export-stage .export-font-guard .note p,
    #ppt-export-stage .export-font-guard .bullet-card p,
    #ppt-export-stage .export-font-guard .bullet-card li,
    #ppt-export-stage .export-font-guard .risk-card p,
    #ppt-export-stage .export-font-guard .summary-item p {
      line-height: 1.42 !important;
    }
    ${plan.exportCss || ""}
  `;
}

async function installBuilder(page, plan, stageW, stageH) {
  await page.addStyleTag({ content: stageCss(plan, stageW, stageH) });
  await page.evaluate(({ plan, stageW, stageH }) => {
    const blockSelector = plan.blockSelector || "main > header, main > .chapter, main > section.panel, main > footer";

    function blockFromItem(item) {
      if (item.selector) {
        const node = document.querySelector(item.selector);
        if (!node) throw new Error(`No element matched item selector: ${item.selector}`);
        return node;
      }
      const blocks = Array.from(document.querySelectorAll(blockSelector));
      const idx = Number(item.block || 0) - 1;
      if (!blocks[idx]) throw new Error(`No block ${item.block}; selector matched ${blocks.length} blocks.`);
      return blocks[idx];
    }

    function cloneFull(item) {
      return blockFromItem(item).cloneNode(true);
    }

    function cloneChapter(item) {
      const node = cloneFull(item);
      node.classList.add("export-chapter");
      return node;
    }

    function clonePartial(item) {
      const src = blockFromItem(item);
      const node = src.cloneNode(false);
      node.className = src.className;
      for (const attr of Array.from(src.attributes)) {
        if (attr.name !== "class") node.setAttribute(attr.name, attr.value);
      }
      const children = Array.from(src.children);
      const prefix = Object.prototype.hasOwnProperty.call(item, "prefixChildren") ? item.prefixChildren : [1, 2, 3];
      const wanted = [...(prefix || []), ...(item.children || [])];
      const seen = new Set();
      for (const num of wanted) {
        const key = Number(num);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const child = children[key - 1];
        if (child) node.appendChild(child.cloneNode(true));
      }
      return node;
    }

    function cloneItem(item) {
      if (item.type === "chapter") return cloneChapter(item);
      if (item.type === "partial") return clonePartial(item);
      if (!item.type || item.type === "full") return cloneFull(item);
      throw new Error(`Unknown item type: ${item.type}`);
    }

    function applyShortWidth(inner, fit) {
      const baseWidth = fit.width ?? plan.defaultWidth ?? 1260;
      inner.style.width = `${baseWidth}px`;
      let r = inner.getBoundingClientRect();
      if (fit.preserveWide) return r;
      if (r.height < (fit.shortHeight ?? 650) && fit.shortWidth !== false) {
        inner.style.width = `${Math.min(baseWidth, fit.shortWidth ?? 1040)}px`;
      } else if (r.height < (fit.mediumHeight ?? 760) && fit.mediumWidth !== false) {
        inner.style.width = `${Math.min(baseWidth, fit.mediumWidth ?? 1140)}px`;
      }
      return inner.getBoundingClientRect();
    }

    function computeClip(stageRect, innerRect, fit) {
      const aspect = stageW / stageH;
      const cropX = fit.cropX ?? plan.cropX ?? 40;
      const cropY = fit.cropY ?? plan.cropY ?? 36;
      const minClipW = fit.minClipW ?? plan.minClipW ?? 1220;
      const contentLeft = innerRect.left - stageRect.left;
      const contentTop = innerRect.top - stageRect.top;
      const contentRight = contentLeft + innerRect.width;
      const contentBottom = contentTop + innerRect.height;
      const neededW = Math.min(stageW, innerRect.width + cropX * 2);
      const neededH = Math.min(stageH, innerRect.height + cropY * 2);
      let clipW;
      let clipH;
      if (neededW / neededH > aspect) {
        clipW = Math.max(minClipW, neededW);
        clipH = clipW / aspect;
      } else {
        clipH = neededH;
        clipW = clipH * aspect;
        if (clipW < minClipW) {
          clipW = minClipW;
          clipH = clipW / aspect;
        }
      }
      if (clipW > stageW) {
        clipW = stageW;
        clipH = clipW / aspect;
      }
      if (clipH > stageH) {
        clipH = stageH;
        clipW = clipH * aspect;
      }
      const centerX = fit.cropCenterX ?? ((contentLeft + contentRight) / 2);
      const centerY = fit.cropCenterY ?? ((contentTop + contentBottom) / 2);
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const clipLeft = clamp(centerX - clipW / 2, 0, stageW - clipW);
      const clipTop = clamp(centerY - clipH / 2, 0, stageH - clipH);
      return {
        x: Math.round(clipLeft),
        y: Math.round(clipTop),
        width: Math.round(clipW),
        height: Math.round(clipH),
      };
    }

    window.__buildPptSlide = (spec) => {
      const old = document.getElementById("ppt-export-stage");
      if (old) old.remove();

      const stage = document.createElement("div");
      stage.id = "ppt-export-stage";
      const inner = document.createElement("div");
      inner.className = "ppt-export-inner export-stack";
      const fit = spec.fit || {};
      if (fit.className) inner.className += ` ${fit.className}`;
      stage.appendChild(inner);
      document.body.appendChild(stage);

      for (const item of spec.items || []) {
        inner.appendChild(cloneItem(item));
      }

      let r = applyShortWidth(inner, fit);
      const padX = fit.padX ?? plan.padX ?? 42;
      const padY = fit.padY ?? plan.padY ?? 42;
      const maxScale = fit.maxScale ?? plan.maxScale ?? 1.3;
      let scale = Math.min(maxScale, (stageW - padX * 2) / r.width, (stageH - padY * 2) / r.height);
      if (scale < (fit.fontGuardBelow ?? plan.fontGuardBelow ?? 1.02)) {
        inner.classList.add("export-font-guard");
        r = inner.getBoundingClientRect();
        scale = Math.min(maxScale, (stageW - padX * 2) / r.width, (stageH - padY * 2) / r.height);
      }
      const left = padX + ((stageW - padX * 2) - r.width * scale) / 2;
      const topBias = fit.topBias ?? plan.topBias ?? 0.5;
      const top = padY + ((stageH - padY * 2) - r.height * scale) * topBias;
      inner.style.left = `${left}px`;
      inner.style.top = `${top}px`;
      inner.style.transform = `scale(${scale})`;

      const stageRect = stage.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();
      const clip = fit.noCrop ? { x: 0, y: 0, width: stageW, height: stageH } : computeClip(stageRect, innerRect, fit);

      return {
        name: spec.name || "",
        scale,
        rawWidth: Math.round(r.width),
        rawHeight: Math.round(r.height),
        left: Math.round(left),
        top: Math.round(top),
        clip,
      };
    };
  }, { plan, stageW, stageH });
}

async function main() {
  const plan = readJson(planPath);
  const stageW = plan.stage?.width || 1600;
  const stageH = plan.stage?.height || 900;
  const deviceScaleFactor = plan.stage?.deviceScaleFactor || 2;
  const slides = plan.slides || [];
  if (!slides.length) throw new Error("slide_plan.json must contain a non-empty slides array.");

  const shotDir = path.resolve(outputDir);
  fs.accessSync(sourceHtml, fs.constants.R_OK);
  assertSafeOutput(shotDir, [sourceHtml, planPath]);
  cleanDir(shotDir);

  const browser = await launchBrowser();
  const rendered = [];
  try {
    const page = await browser.newPage({
      viewport: { width: stageW, height: stageH },
      deviceScaleFactor,
    });

    await page.goto(fileUrl(sourceHtml), { waitUntil: "domcontentloaded" });
    await waitForPage(page, plan.waitMs);
    await installBuilder(page, plan, stageW, stageH);

    for (let i = 0; i < slides.length; i++) {
      const spec = slides[i];
      const metrics = await page.evaluate((s) => window.__buildPptSlide(s), spec);
      await page.waitForTimeout(plan.perSlideWaitMs ?? 120);
      const shotPath = path.join(shotDir, `planned_${String(i + 1).padStart(2, "0")}.png`);
      await page.screenshot({ path: shotPath, clip: metrics.clip });
      rendered.push({ slide: i + 1, ...metrics, path: shotPath });
    }
  } finally {
    await browser.close();
  }

  const manifestPath = path.join(shotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    source: path.resolve(sourceHtml),
    plan: path.resolve(planPath),
    screenshots: shotDir,
    slides: rendered.length,
    stage: { width: stageW, height: stageH, deviceScaleFactor },
    minScale: Math.min(...rendered.map((r) => r.scale)),
    maxRawHeight: Math.max(...rendered.map((r) => r.rawHeight)),
    metrics: rendered.map((r) => ({
      slide: r.slide,
      name: r.name,
      scale: Number(r.scale.toFixed(3)),
      rawWidth: r.rawWidth,
      rawHeight: r.rawHeight,
      top: r.top,
      left: r.left,
      clip: r.clip,
      path: r.path,
    })),
  }, null, 2), "utf8");

  console.log(JSON.stringify({
    source: path.resolve(sourceHtml),
    plan: path.resolve(planPath),
    screenshots: shotDir,
    manifest: manifestPath,
    slides: rendered.length,
    minScale: Math.min(...rendered.map((r) => r.scale)),
  }, null, 2));
}

// Internal test seam; command-line arguments and output remain the public interface.
module.exports = { installBuilder };
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
