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

## Visual QA Checklist

Before writing PPTX, inspect the contact sheet and the affected individual PNGs.

- The subject should dominate the slide; avoid large empty margins.
- Text must remain readable in normal presentation view.
- White panel/card boundaries must be complete, especially at the bottom.
- Similar pages should have similar top/bottom and left/right margins.
- Screenshot evidence should preserve the important UI, not just the browser chrome.
- Captions should use stable labels such as `Screenshot A` on one line and the title/description on the next line.
- If two screenshots have very different heights, prefer separate pages or rebalance the layout instead of forcing a mismatched pair.

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

## Failure Modes

- If a slide only looks correct after heavy downscaling, split the slide or redesign that section for PPT.
- If a slide is very short and centered with too much blank space, reduce raw `width`, raise `maxScale`, or merge with a neighboring section.
- If the bottom of a panel is clipped, lower `maxScale`, increase `padY`, or split the content.
- If the PPT looks different from previews, confirm each PPT image is full-bleed with `qa_pptx_full_bleed.js`.
- If dependencies are missing, install or expose `playwright` for preview/contact sheets and `pptxgenjs` for PPTX writing.
