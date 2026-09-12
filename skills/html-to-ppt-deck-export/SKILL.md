---
name: html-to-ppt-deck-export
description: Convert long-page HTML, clickdeck snapshots, visual reports, and screenshot-based web decks into balanced 16:9 PPTX files. Use when Codex is asked to do HTML-to-PPT/PPTX export, 网页转PPT, HTML转PPT, optimize screenshot pagination, split/merge web sections into slides, replace screenshot pages, or diagnose PPT exports with excessive margins, tiny text, uneven spacing, or clipped panels.
---

# HTML to PPT Deck Export

## Core Rule

Do not export by taking one long webpage screenshot or by letting PowerPoint contain arbitrary screenshots. First create a slide plan, then render each planned slide into a fixed 16:9 browser stage, inspect preview PNGs, and only then write the PNGs full-bleed into PPTX.

Default dimensions:

- Browser stage: `1600x900`, `deviceScaleFactor=2`
- PPT layout: `LAYOUT_WIDE`
- Full-slide image placement: `x=0, y=0, w=13.333333, h=7.5`

## Workflow

Before starting, clone the repository and run `npm ci` and
`npx playwright install chromium` from its root. Use Node 22 or Node 24.13.1+
within the 24 series (24 recommended). Final QA requires Windows PowerShell
(`powershell.exe`); full Linux/macOS support is not claimed. See the repository
README for dependency advisories.

When installed separately as a Codex skill, run from a matching repository
checkout that has completed `npm ci`. Skill installation does not install Node
dependencies or the browser. Keep existing dependency lookup fallbacks.

Stage dimensions use CSS pixels. With scale factor 2, full-stage PNGs are
3200x1800; content cropping can produce smaller images with pixel-rounding
differences. Set per-slide `fit.noCrop: true` to capture the full stage. PPTX
content is rasterized: text, tables and diagrams are not individually editable.

1. Inspect the source HTML and any source Markdown/script.
   - Identify real content blocks and their source meaning.
   - Do not assume one HTML section equals one slide.
   - Remove or avoid temporary notes, red boxes, page-number badges, privacy checklists, placeholder suggestions, and other non-final material.

2. Write a `slide_plan.json`.
   - Each slide must map to explicit HTML blocks or selectors.
   - Split tall pages before text becomes too small.
   - Merge or enlarge short pages when the subject is lost in empty space.
   - Keep image-evidence captions and labels in final slide order.

3. Generate 16:9 preview PNGs.
   - Use `scripts/export_preview.js <source.html> <slide_plan.json> <preview_dir>`.
   - The script clones planned HTML blocks into a fixed `#ppt-export-stage`.
   - Tune each slide with `width`, `maxScale`, `padX`, `padY`, `topBias`, `cropX`, `cropY`, and `className`.
   - The preview directory is cleared each run. Use a new directory to retain an
     accepted version; never choose an input or project directory as output.
   - Read the per-slide overflow evidence in manifest.json and any concise stderr
     summaries. Findings do not change layout or stop export; inspect the affected
     previews to decide whether clipping is intentional.

4. Generate a contact sheet.
   - Use `scripts/make_contact_sheet.js <preview_dir> [contact_sheet.png]`.
   - Inspect all pages before creating PPTX.
   - Check short-page whitespace, long-page scaling, clipped white panels, inconsistent margins, and tiny text.

5. Iterate preview images, not PPTX.
   - Adjust the slide plan or export CSS.
   - For local replacements, use `scripts/replace_preview_pages.js`.
   - Keep previous accepted preview/PPT versions intact.

6. Write PPTX only after previews are acceptable.
   - Use `scripts/ppt_from_preview.js <preview_dir> <output.pptx>`.
   - Verify with `scripts/qa_pptx_full_bleed.js <output.pptx>`.

## Slide Plan Schema

Use this minimum structure:

```json
{
  "stage": { "width": 1600, "height": 900, "deviceScaleFactor": 2 },
  "blockSelector": "main > header, main > .chapter, main > section.panel, main > footer",
  "background": "#F1E9D8",
  "exportCss": "#ppt-export-stage .export-tight .panel { padding: 30px 38px !important; }",
  "slides": [
    {
      "name": "Example slide",
      "fit": {
        "width": 1260,
        "maxScale": 1.28,
        "padX": 42,
        "padY": 42,
        "topBias": 0.5,
        "className": "export-tight"
      },
      "items": [
        { "type": "full", "block": 1 },
        { "type": "chapter", "block": 2 },
        { "type": "partial", "block": 3, "children": [4, 5], "prefixChildren": [1, 2, 3] }
      ]
    }
  ]
}
```

Item types:

- `full`: clone the whole block.
- `chapter`: clone the whole block and add `export-chapter`.
- `partial`: clone the block shell and append selected direct children. `prefixChildren` defaults to `[1,2,3]` unless set to `[]`.

Block references:

- Prefer 1-based `block` indexes after confirming them from the source HTML.
- Use `selector` on an item only when indexes are unstable.

Fit fields:

- `width`: raw inner width before scaling.
- `shortWidth` / `mediumWidth`: optional narrower widths for short content so it scales larger.
- `maxScale`: cap enlargement; increase for sparse pages, lower for dense pages.
- `padX` / `padY`: minimum visual margin inside the stage.
- `topBias`: vertical position inside available space, `0` top, `0.5` center, `1` bottom.
- `cropX` / `cropY` / `minClipW`: 16:9 crop around the rendered content.
- `className`: export-only CSS hook for slide-specific compression or typography.
- `noCrop`: capture the full stage instead of a content crop.
- `preserveWide`: skip automatic short/medium width adjustments.

## Plan Validation

The preview command runs dependency-free static validation before loading
Playwright, opening HTML or clearing output. JSON must contain a root object and
non-empty slides array; each slide needs a non-empty items array of item objects.
It checks supported/default types, reference forms, partial selection arrays and
effective stage/fit values. Unknown fields and overridden values are not rejected
solely because they are unused. Existing optional defaults remain in place.

After source-page readiness, DOM validation checks selector syntax/matches, block
bounds and explicit direct-child bounds. Selector precedence and first-match
behavior remain unchanged. Both phases finish before the output directory is
cleared, so static and preflight DOM errors preserve existing preview files.

Example stderr (exit 1):

```text
DOM validation failed:
slides[2].items[1].block: block 18 does not exist; available range is 1..12 (slide "Overview")
```

Diagnostic paths use zero-based array indexes; block/child references remain
one-based. Static failures start with `Static validation failed`. Malformed JSON
also identifies the plan file. Diagnostics are reported in deterministic order.

Intentional compatibility changes: missing/null/empty items are rejected, and
explicit nonexistent children/prefixChildren are rejected. The implicit default
prefix [1,2,3] still ignores absent children on short source blocks. Explicit
null/[] selects no prefix. Positive integer numeric strings and partial selection
order/deduplication remain supported. Numeric fit strings remain supported where
the renderer consumes them; explicitly supplied stage values and wait times must
be numbers. No forced 16:9 schema restriction or automatic layout change is added.

Plan validation checks inputs and references. Post-fit overflow measurements are
separate diagnostics; sparse/dense layout heuristics remain future work.
Source scripts can change the DOM after preflight. Rendering failures after output
cleanup do not roll back files; keep accepted exports in separate directories.

## Visual QA Checklist

Before writing PPTX, inspect the contact sheet and the affected individual PNGs.

- The subject should dominate the slide; avoid large empty margins.
- Text must remain readable in normal presentation view.
- White panel/card boundaries must be complete, especially at the bottom.
- Similar pages should have similar top/bottom and left/right margins.
- Screenshot evidence should preserve the important UI, not just the browser chrome.
- Captions should use stable labels such as `Screenshot A` on one line and the title/description on the next line.
- If two screenshots have very different heights, prefer separate pages or rebalance the layout instead of forcing a mismatched pair.

## Overflow/Clipping Diagnostics

Each manifest metrics entry adds an overflow object after fitting and the existing
per-slide wait. It contains coordinateSpace (stage-relative-css-pixels),
tolerancePx (1), status (inside/diagnostics/uncertain), contentBounds, stageBounds,
cropBounds, visibleBounds, diagnosticCount, truncatedDiagnostics, diagnostics and
limitations. Existing manifest fields and CLI arguments are unchanged.

Element/client text rectangles already include transforms. Subtract the stage's
visual origin and compare against stage/viewport/crop intersections in CSS pixels.
The 1px tolerance is applied per edge before rounding evidence to three decimals;
deviceScaleFactor affects PNG resolution only. Fitting margins are not clipping
boundaries. Do not infer clipping from raw scroll dimensions.

Types are stage-overflow, crop-clipping and container-clipping. Findings carry
horizontal/vertical/both axes, measured/uncertain confidence, unknown intent,
boundary and content/visible bounds, per-edge overflowPx, affected fragment count,
up to three example descendant paths and reasons. Rectangular container clipping
is applied before stage/crop checks. noCrop removes crop-only loss but not stage
or internal clipping. Explicit crop/overflow:hidden may be intentional.

Inside means no detected problem within measurement coverage, not approval.
Shadows/outlines are excluded; borders are included. Positive axis-aligned scale
and translation are supported. Rotation/skew/3D intersections are conservative
and flagged uncertain. Complex masks, generated content, embedded/shadow content
and animations have explicit coverage limitations. SVG/canvas/media/control
internals, corner masks, filters and occlusion are not fully analyzed.

Diagnostics cap detail at 20 boundary groups per slide, recording omissions.
Traversal caps of 5000 elements/20000 fragments also produce limitations.
Unavailable measurements retain the same object fields, with null bounds and an
uncertain status. One concise stderr line is emitted per affected/uncertain slide;
stdout stays JSON and diagnostics alone keep exit 0. Plan/reference failures
remain exit 1. Nothing automatically changes the HTML, fit settings or plan.

See [internal geometry notes](scripts/lib/overflow_geometry.md). Read the evidence,
inspect the individual preview and contact sheet, and iterate only through the
existing preview-first workflow. These diagnostics do not replace visual review.

## Script Usage

Preview:

```bash
node path/to/skill/scripts/export_preview.js source.html slide_plan.json outputs/previews
```

Contact sheet:

```bash
node path/to/skill/scripts/make_contact_sheet.js outputs/previews outputs/contact_sheet.png
```

Replace preview pages:

```bash
node path/to/skill/scripts/replace_preview_pages.js outputs/previews outputs/previews_v2 rules.json --force
```

PPTX:

```bash
node path/to/skill/scripts/ppt_from_preview.js outputs/previews_v2 outputs/deck.pptx
```

QA:

```bash
node path/to/skill/scripts/qa_pptx_full_bleed.js outputs/deck.pptx
```

## Replacement Rules

Use `replace_preview_pages.js` for local iteration after a replacement PNG has already been approved.

```json
{
  "replace": [
    { "start": 14, "deleteCount": 2, "images": ["merged_14.png"] }
  ]
}
```

The script copies source `planned_*.png` files to a new output directory and renumbers them from `planned_01.png`.
Starts refer to 1-based positions in the original sequence; operations run in
descending start order. Image paths resolve relative to the rules file.
`replacements`, `remove`, and `image` remain accepted aliases. `--force` replaces
existing output after preflight; overlaps that would remove inputs are rejected.

QA reports `pptx`, `slides`, `badCount` and `bad`. Exit codes are 0 for success,
1 for input/runtime failure and 2 for layout failure. It checks a non-empty
presentation, wide dimensions, one picture per slide and that picture's own
full-bleed transform. Inspect readability, clipping and whitespace in previews;
structural QA does not assess them.

## Failure Modes

- If a slide only looks correct after heavy downscaling, split the slide or redesign that section for PPT.
- If a slide is very short and centered with too much blank space, reduce raw `width`, raise `maxScale`, or merge with a neighboring section.
- If the bottom of a panel is clipped, lower `maxScale`, increase `padY`, or split the content.
- If the PPT looks different from previews, confirm each PPT image is full-bleed with `qa_pptx_full_bleed.js`.
- If dependencies are missing, install or expose `playwright` for preview/contact sheets and `pptxgenjs` for PPTX writing.
