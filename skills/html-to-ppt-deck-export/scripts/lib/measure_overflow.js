"use strict";

// Runs read-only in page.evaluate after fitting and the existing per-slide wait.
// All boxes include CSS transforms and are translated to the stage's visual origin.
function measureOverflow() {
  const stage = document.getElementById("ppt-export-stage");
  if (!stage) throw new Error("export stage is unavailable for measurement");
  const sr = stage.getBoundingClientRect();
  const origin = { x: sr.left, y: sr.top };
  const rect = (r) => ({ left: r.left - origin.x, top: r.top - origin.y,
    right: r.right - origin.x, bottom: r.bottom - origin.y });
  const samples = [];
  const limitations = new Set();
  const styles = new Map();
  const style = (el) => { if (!styles.has(el)) styles.set(el, getComputedStyle(el)); return styles.get(el); };
  const solid = (color) => color !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(color) && !/\/\s*0(?:\s*|%)\)$/.test(color);
  const rotated = (css) => {
    if (css.rotate && css.rotate !== "none" && !/^0(?:deg|rad|turn)?$/.test(css.rotate)) return true;
    if (css.scale && css.scale !== "none" && css.scale.split(/\s+/).some((v) => parseFloat(v) <= 0)) return true;
    if (!css.transform || css.transform === "none") return false;
    const m = new DOMMatrixReadOnly(css.transform);
    return !m.is2D || Math.abs(m.b) > 1e-8 || Math.abs(m.c) > 1e-8 || m.a <= 0 || m.d <= 0;
  };
  const clipping = (value) => ["hidden", "clip", "auto", "scroll"].includes(value);
  const boundary = (el, target, approximate) => {
    const css = style(el), r = el.getBoundingClientRect();
    const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const sy = el.offsetHeight ? r.height / el.offsetHeight : 1;
    const bounds = rect(r);
    if (!approximate) {
      bounds.left += el.clientLeft * sx;
      bounds.top += el.clientTop * sy;
      bounds.right = bounds.left + el.clientWidth * sx;
      bounds.bottom = bounds.top + el.clientHeight * sy;
    }
    return { element: el, target, bounds, axes: { x: clipping(css.overflowX), y: clipping(css.overflowY) }, approximate };
  };
  let visited = 0;
  function walk(el, target, clips, inheritedUncertainty) {
    if (++visited > 5000) { limitations.add("DOM measurement limited to 5000 elements"); return; }
    const css = style(el);
    if (css.display === "none" || Number(css.opacity) === 0) return;
    if (["absolute", "fixed"].includes(css.position)) {
      // An overflow ancestor between a positioned element and its containing
      // block does not clip it. Descendants inherit this filtered clip chain.
      const containingBlock = el.offsetParent;
      clips = containingBlock ? clips.filter((c) => c.element.contains(containingBlock)) : [];
    }
    const uncertain = [...inheritedUncertainty];
    if (rotated(css)) uncertain.push("rotated, skewed, reflected or 3D transform uses conservative bounding boxes");
    const complexClip = css.clipPath !== "none" || (css.maskImage && css.maskImage !== "none") ||
      (css.clip && css.clip !== "auto") || /paint|strict|content/.test(css.contain);
    if (complexClip) {
      const reason = "clip-path, mask, legacy clip or paint containment is not resolved";
      uncertain.push(reason); limitations.add(reason);
    }
    for (const pseudo of ["::before", "::after"]) {
      const content = getComputedStyle(el, pseudo).content;
      if (css.visibility === "visible" && content && !["none", "normal"].includes(content)) limitations.add("generated pseudo-element geometry is not measured");
    }
    const tag = el.localName;
    const atomic = ["img", "svg", "canvas", "video", "iframe", "object", "embed", "input", "textarea", "select"].includes(tag);
    if (["iframe", "object", "embed"].includes(tag) || el.shadowRoot) limitations.add("embedded document or shadow content is measured only at its outer box");
    const border = ["Top", "Right", "Bottom", "Left"].some((side) =>
      parseFloat(css[`border${side}Width`]) > 0 && !["none", "hidden"].includes(css[`border${side}Style`]) && solid(css[`border${side}Color`]));
    const add = (r, type, clipChain) => {
      if (samples.length >= 20000) { limitations.add("DOM measurement limited to 20000 box/text fragments"); return; }
      if (r.width > 0 && r.height > 0) samples.push({ target: `${target}:${type}`, bounds: rect(r),
        clips: clipChain.map(({ element, ...clip }) => clip), uncertain: [...uncertain] });
    };
    if (css.visibility === "visible" && (atomic || border || solid(css.backgroundColor) || css.backgroundImage !== "none")) {
      for (const r of el.getClientRects()) add(r, "box", clips);
    }
    if (atomic) return;
    let childClips = clips;
    if (clipping(css.overflowX) || clipping(css.overflowY)) {
      if (css.overflowClipMargin && !["0px", ""].includes(css.overflowClipMargin)) {
        uncertain.push("non-default overflow-clip-margin is not resolved");
      }
      const approximate = uncertain.length > 0;
      if (approximate) limitations.add("a complex clipping ancestor has approximate bounds");
      // Reverse ancestor order: nearest clip is applied before outer clipping.
      childClips = [boundary(el, target, approximate), ...clips];
    }
    let childIndex = 0;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        childIndex++;
        walk(node, `${target}/${node.localName}[${childIndex}]`, childClips, uncertain);
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && css.visibility === "visible") {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) add(r, "text", childClips);
      }
    }
  }
  const initialUncertainty = [];
  for (let ancestor = stage; ancestor; ancestor = ancestor.parentElement) {
    const css = style(ancestor);
    if (rotated(css)) {
      initialUncertainty.push("stage or page ancestor has a complex transform");
      limitations.add("stage or page ancestor has a complex transform");
    }
    if (css.clipPath !== "none" || (css.maskImage && css.maskImage !== "none") ||
        (css.clip && css.clip !== "auto") || /paint|strict|content/.test(css.contain)) {
      initialUncertainty.push("stage or page ancestor has unresolved clipping");
      limitations.add("stage or page ancestor has unresolved clipping");
    }
    if (css.display === "none" || Number(css.opacity) === 0 || css.visibility !== "visible") {
      initialUncertainty.push("stage or page ancestor is hidden");
      limitations.add("stage or page ancestor is hidden");
    }
  }
  if (stage.getAnimations({ subtree: true }).some((a) => a.playState === "running")) {
    initialUncertainty.push("active animation can change geometry between measurement and screenshot");
    limitations.add("active animation can change geometry between measurement and screenshot");
  }
  const inner = stage.querySelector(".ppt-export-inner");
  if (!inner) throw new Error("export content is unavailable for measurement");
  walk(inner, "content", [], initialUncertainty);
  const { element, ...stageClip } = boundary(stage, "stage", initialUncertainty.length > 0);
  return { origin, stageBounds: rect(sr), stageClip,
    viewportBounds: { left: -origin.x, top: -origin.y, right: innerWidth - origin.x, bottom: innerHeight - origin.y },
    samples, limitations: [...limitations] };
}

module.exports = { measureOverflow };
