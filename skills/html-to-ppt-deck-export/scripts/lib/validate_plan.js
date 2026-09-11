"use strict";

const DEFAULT_BLOCK_SELECTOR = "main > header, main > .chapter, main > section.panel, main > footer";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNumeric = (value) => (typeof value === "number" ||
  (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value));
const isIndex = (value) => isNumeric(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

// Inspect effective values without normalizing/mutating the plan sent to the renderer.
function validateStaticPlan(plan) {
  const errors = [];
  const add = (path, reason, slide) => errors.push({ path, reason,
    ...(typeof slide?.name === "string" && slide.name ? { slideName: slide.name } : {}) });
  if (!isObject(plan)) return [{ path: "$", reason: "must be an object" }];
  if (!Array.isArray(plan.slides) || plan.slides.length === 0) {
    return [{ path: "slides", reason: "must be a non-empty slides array" }];
  }

  if (plan.stage != null && !isObject(plan.stage)) add("stage", "must be an object or null");
  if (isObject(plan.stage)) {
    for (const field of ["width", "height", "deviceScaleFactor"]) {
      const value = plan.stage[field];
      if (value == null) continue;
      const integer = field !== "deviceScaleFactor";
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 ||
          (integer && !Number.isSafeInteger(value))) {
        add(`stage.${field}`, integer ? "must be a positive integer" : "must be a finite positive number");
      }
    }
  }
  for (const field of ["waitMs", "perSlideWaitMs"]) {
    if (plan[field] != null && (typeof plan[field] !== "number" || !Number.isFinite(plan[field]) || plan[field] < 0)) {
      add(field, "must be a finite non-negative number");
    }
  }
  for (const field of ["background", "gridColor", "exportCss"]) {
    if (plan[field] && typeof plan[field] !== "string") add(field, "must be a string when supplied");
  }
  if (plan.gridSize && (!isNumeric(plan.gridSize) || Number(plan.gridSize) <= 0)) {
    add("gridSize", "must be a finite positive number or numeric string");
  }

  let needsBlocks = false;
  plan.slides.forEach((slide, si) => {
    const sp = `slides[${si}]`;
    if (!isObject(slide)) { add(sp, "must be an object"); return; }
    if (!Array.isArray(slide.items) || slide.items.length === 0) {
      add(`${sp}.items`, "must be a non-empty array", slide);
    } else {
      slide.items.forEach((item, ii) => {
        const ip = `${sp}.items[${ii}]`;
        if (!isObject(item)) { add(ip, "must be an object", slide); return; }
        // Falsy type/selector values retain the old default/fallback behavior.
        if (item.type && !["full", "chapter", "partial"].includes(item.type)) {
          add(`${ip}.type`, "must be full, chapter, partial, or a default (falsy) value", slide);
        }
        if (item.selector) {
          if (typeof item.selector !== "string" || !item.selector.trim()) {
            add(`${ip}.selector`, "must be a non-blank CSS selector string", slide);
          }
        } else {
          needsBlocks = true;
          if (!isIndex(item.block)) add(`${ip}.block`, "must be a positive integer or integer numeric string", slide);
        }
        if (item.type !== "partial") return;
        for (const field of ["prefixChildren", "children"]) {
          const selected = item[field];
          if (selected == null) continue;
          if (!Array.isArray(selected)) { add(`${ip}.${field}`, "must be an array or null", slide); continue; }
          selected.forEach((value, ci) => {
            if (!isIndex(value)) add(`${ip}.${field}[${ci}]`, "must be a positive integer or integer numeric string", slide);
          });
        }
      });
    }

    if (slide.fit != null && !isObject(slide.fit)) { add(`${sp}.fit`, "must be an object or null", slide); return; }
    const fit = slide.fit || {};
    const effective = (field, parent, fallback) => fit[field] != null
      ? { value: fit[field], path: `${sp}.fit.${field}` }
      : parent && plan[parent] != null
        ? { value: plan[parent], path: parent }
        : { value: fallback, path: `${sp}.fit.${field}` };
    const numeric = (entry, positive = false) => {
      if (!isNumeric(entry.value) || (positive && Number(entry.value) <= 0)) {
        add(entry.path, `must be a finite ${positive ? "positive " : ""}number or numeric string`, slide);
        return false;
      }
      return true;
    };
    for (const field of ["preserveWide", "noCrop"]) {
      if (fit[field] != null && typeof fit[field] !== "boolean") add(`${sp}.fit.${field}`, "must be a boolean or null", slide);
    }
    if (fit.className && typeof fit.className !== "string") add(`${sp}.fit.className`, "must be a string", slide);
    numeric(effective("width", "defaultWidth", 1260), true);
    numeric(effective("maxScale", "maxScale", 1.3), true);
    numeric(effective("topBias", "topBias", 0.5));
    numeric(effective("fontGuardBelow", "fontGuardBelow", 1.02));
    for (const [field, dimension, fallback] of [["padX", "width", 1600], ["padY", "height", 900]]) {
      const entry = effective(field, field, 42);
      const extent = plan.stage?.[dimension] ?? fallback;
      if (numeric(entry) && typeof extent === "number" && extent > 0 &&
          (!Number.isFinite(extent - Number(entry.value) * 2) || Number(entry.value) * 2 >= extent)) {
        add(entry.path, `must leave finite positive stage space (2 * ${field} < ${extent})`, slide);
      }
    }
    if (!fit.preserveWide) {
      for (const [kind, defaultWidth, defaultHeight] of [["short", 1040, 650], ["medium", 1140, 760]]) {
        if (fit[`${kind}Width`] === false) continue;
        numeric(effective(`${kind}Width`, null, defaultWidth), true);
        numeric(effective(`${kind}Height`, null, defaultHeight));
      }
    }
    if (!fit.noCrop) {
      for (const [field, fallback] of [["cropX", 40], ["cropY", 36]]) numeric(effective(field, field, fallback));
      numeric(effective("minClipW", "minClipW", 1220), true);
      for (const field of ["cropCenterX", "cropCenterY"]) {
        if (fit[field] != null) numeric(effective(field, null));
      }
    }
  });
  if (needsBlocks && plan.blockSelector && (typeof plan.blockSelector !== "string" || !plan.blockSelector.trim())) {
    add("blockSelector", "must be a non-blank CSS selector string");
  }
  return errors;
}

// Serialized into page.evaluate: use only arguments and the source document.
// Run before installing the stage so selectors cannot resolve to export clones.
function validateDomReferences({ plan, defaultBlockSelector }) {
  const errors = [];
  let blocks;
  let blockError;
  for (let si = 0; si < plan.slides.length; si++) {
    const slide = plan.slides[si];
    const add = (path, reason) => errors.push({ path, reason,
      ...(typeof slide.name === "string" && slide.name ? { slideName: slide.name } : {}) });
    for (let ii = 0; ii < slide.items.length; ii++) {
      const item = slide.items[ii];
      const ip = `slides[${si}].items[${ii}]`;
      let source;
      if (item.selector) {
        try { source = document.querySelector(item.selector); }
        catch { add(`${ip}.selector`, "invalid CSS selector syntax"); continue; }
        if (!source) { add(`${ip}.selector`, `no element matches ${JSON.stringify(item.selector)}`); continue; }
      } else {
        if (!blocks && !blockError) {
          try { blocks = Array.from(document.querySelectorAll(plan.blockSelector || defaultBlockSelector)); }
          catch { blockError = true; }
        }
        if (blockError) { add("blockSelector", `invalid CSS selector syntax (used by ${ip}.block)`); continue; }
        source = blocks[Number(item.block) - 1];
        if (!source) {
          const range = blocks.length ? `available range is 1..${blocks.length}` : "no blocks matched blockSelector";
          add(`${ip}.block`, `block ${Number(item.block)} does not exist; ${range}`);
          continue;
        }
      }
      if (item.type !== "partial") continue;
      // Check only explicit references. Absent implicit prefix children have
      // always been ignored, including short blocks with fewer than 3 children.
      for (const field of ["prefixChildren", "children"]) {
        if (!Object.prototype.hasOwnProperty.call(item, field) || item[field] == null) continue;
        item[field].forEach((value, ci) => {
          if (Number(value) > source.children.length) {
            const range = source.children.length ? `available range is 1..${source.children.length}` : "the block has no direct children";
            add(`${ip}.${field}[${ci}]`, `child ${Number(value)} does not exist; ${range}`);
          }
        });
      }
    }
  }
  return errors;
}

function assertValidPlan(phase, errors) {
  if (!errors.length) return;
  const details = errors.map(({ path, reason, slideName }) =>
    `${path}: ${reason}${slideName ? ` (slide ${JSON.stringify(slideName)})` : ""}`);
  const error = new Error(`${phase} validation failed:\n${details.join("\n")}`);
  error.name = "SlidePlanValidationError";
  throw error;
}

module.exports = { DEFAULT_BLOCK_SELECTOR, validateStaticPlan, validateDomReferences, assertValidPlan };
