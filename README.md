# HTML to PPT Deck Export

[![Windows CI](https://github.com/van822/html-to-ppt-deck-export/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/van822/html-to-ppt-deck-export/actions/workflows/ci.yml?query=branch%3Amain)

A Codex skill and standalone Node scripts for turning planned HTML content into
image-based, 16:9 PowerPoint decks.

**Plan the slides, inspect the previews, then assemble the PPTX.**

## Why this project exists

Screenshot-based HTML-to-PPT workflows can produce tiny text, excessive margins,
poor pagination, clipped panels and inconsistent slide composition. A long web
page rarely maps cleanly to presentation slides.

This project makes page boundaries explicit in a slide plan. It renders selected
HTML blocks inside a fixed stage, provides PNG previews and a contact sheet for
review, and assembles accepted images into full-slide PowerPoint pages. Layout
quality still depends on the source, the plan and visual inspection.

## Key features

- Select complete blocks, chapter blocks or subsets of direct children.
- Control scaling, margins, vertical placement, cropping and export-only CSS.
- Render numbered previews and a numeric-order contact sheet.
- Report measured overflow/clipping evidence without changing slide composition.
- Replace, split or merge approved preview pages using replacement rules.
- Assemble one full-slide PNG per PowerPoint slide.
- Check picture count, slide dimensions and full-bleed placement with Windows QA.

The output preserves the rendered appearance. Text, tables and diagrams become
pixels inside the slide image; they are not individually editable PowerPoint objects.

## Demo

The [basic report example](examples/basic-report/README.md) contains text, cards,
an inline SVG diagram and a table. This contact sheet was generated from its
HTML and slide plan:

![Four-slide basic report contact sheet](docs/assets/basic-report-contact-sheet.png)

The source and plan are committed. Full preview sets, local manifests and PPTX
files stay in ignored output directories; reviewed decks can accompany GitHub
Releases. The small contact sheet serves as the documentation demo.

## Quick start

For the complete workflow, use **Windows**, **Node 22 or Node 24.13.1+ within the
24 series** (a current Node 24 patch is recommended), npm and Windows PowerShell.

    git clone https://github.com/van822/html-to-ppt-deck-export.git
    cd html-to-ppt-deck-export
    npm ci
    npx playwright install chromium
    npm run preview -- examples/basic-report/report.html examples/basic-report/slide_plan.json outputs/basic-report/previews
    npm run contact-sheet -- outputs/basic-report/previews outputs/basic-report/contact_sheet.png 2

**Open the contact sheet and individual previews.** Check readability, complete
content, page order and margins. Adjust the plan or HTML and render again as needed.
After accepting the previews:

    npm run pptx -- outputs/basic-report/previews outputs/basic-report/basic-report.pptx
    npm run qa -- outputs/basic-report/basic-report.pptx

Expect four slides and a QA report with badCount equal to zero. That result checks
PPTX structure; visual acceptance happens before assembly.

The preview command reports potential clipping in the manifest and short stderr
messages; these findings do not block export or replace visual review.
It clears its output directory after plan/reference validation. Choose a new directory when
retaining an accepted version. Do not use a source or project directory as output.

## Install as a Codex skill

In Codex, ask the built-in installer:

    $skill-installer install the skill from https://github.com/van822/html-to-ppt-deck-export/tree/main/skills/html-to-ppt-deck-export

Codex detects installed skills; restart if it does not appear. See the
[official skill documentation](https://learn.chatgpt.com/docs/build-skills).

The installer copies the skill folder, not the root npm project or browser.
Also clone this repository and run npm ci and npx playwright install chromium.
Open Codex in that repository root when invoking the installed skill so its
scripts can resolve the locked dependencies through the working directory.
Keep the skill copy and repository checkout at matching revisions when updating.

Example prompt:

    Use $html-to-ppt-deck-export for this HTML report.
    Inspect the source, write an explicit slide plan, render 16:9 previews,
    review the contact sheet, iterate as needed, assemble the accepted
    previews into PPTX, and run the full-bleed QA.

The scripts retain dependency lookup from their own location, the active
workspace, the legacy work/html_to_ppt workspace subdirectory and global npm
modules. Clean installation uses the repository lockfile; global modules are
not required and should not be used for reproducibility checks.

## Manual workflow

Run these scripts from the repository root with your own inputs.

1. **Inspect HTML and write the plan.** Split dense sections or merge sparse ones
   according to their content before rendering.
2. **Generate previews:**

       node skills/html-to-ppt-deck-export/scripts/export_preview.js source.html slide_plan.json outputs/previews

3. **Create and inspect the contact sheet:**

       node skills/html-to-ppt-deck-export/scripts/make_contact_sheet.js outputs/previews outputs/contact_sheet.png 4

4. **Iterate.** Edit source/plan and render again, or replace approved pages:

       node skills/html-to-ppt-deck-export/scripts/replace_preview_pages.js outputs/previews outputs/previews_v2 rules.json

   Add --force to replace an existing output directory. Unsafe input/output
   overlaps are rejected. Image paths are relative to the rules file. Operations
   refer to 1-based original positions and run from highest start downward.

       {
         "replace": [
           { "start": 2, "deleteCount": 2, "images": ["approved-merged-page.png"] }
         ]
       }

   This merges original pages 2 and 3 into one supplied image. Outputs are
   renumbered from planned_01.png. Legacy replacements, remove and image aliases
   remain supported. Review a new contact sheet:

       node skills/html-to-ppt-deck-export/scripts/make_contact_sheet.js outputs/previews_v2 outputs/contact_sheet_v2.png

5. **Assemble accepted previews:**

       node skills/html-to-ppt-deck-export/scripts/ppt_from_preview.js outputs/previews_v2 outputs/deck.pptx

   If no replacement was needed, use outputs/previews as the input directory.

6. **Run final structural QA:**

       node skills/html-to-ppt-deck-export/scripts/qa_pptx_full_bleed.js outputs/deck.pptx

QA exits with 0 for success, 1 for input/runtime failure and 2 for layout failure.
Its JSON retains pptx, slides, badCount and bad. Contact-sheet and PPTX scripts
consume only numbered planned_*.png files, ordered numerically.
Equivalent npm aliases are preview, contact-sheet, replace-previews, pptx and qa;
put script arguments after --.

### Layout troubleshooting

- **Tiny text:** split the slide or reduce content density.
- **Too much empty space:** narrow the raw width, raise the enlargement cap,
  or merge compatible content. Recheck text and margins.
- **Clipped panels:** lower maxScale, increase padding or split content.
- **Uneven screenshot evidence:** separate images with different heights or
  rebalance them; retain captions and labels in final slide order.
- **Browser missing:** run npx playwright install chromium. Rendering scripts
  retain an installed Microsoft Edge fallback; CI uses pinned Chromium.
- **PPTX differs from previews:** run QA and verify the correct preview directory
  was used. Defects already in PNGs need changes before assembly.

## How it works

    HTML → slide plan validation → fixed 16:9 preview rendering
         → overflow/clipping diagnostics → contact-sheet QA
         → iteration → PPTX → final QA

Playwright opens local HTML and clones selected DOM blocks into a fixed stage.
It fits and optionally crops each composition, then records PNGs and a preview
manifest with non-blocking geometry evidence. After contact-sheet review, PptxGenJS places accepted PNGs onto wide
slides. PowerShell QA reads the PPTX ZIP/XML and checks picture geometry.

Default staging is 1600×900 CSS pixels with deviceScaleFactor 2, producing
3200×1800 for a full-stage screenshot. Default content cropping can produce
smaller images with approximately the same aspect ratio, allowing for integer
rounding. The example uses scale factor 1 and noCrop for fixed 1600×900 PNGs.

## Slide-plan overview

    {
      "stage": { "width": 1600, "height": 900, "deviceScaleFactor": 2 },
      "blockSelector": "main > section",
      "slides": [{
        "name": "Opening",
        "fit": { "width": 1260, "maxScale": 1.2, "padX": 40, "padY": 40, "topBias": 0.5 },
        "items": [{ "type": "full", "block": 1 }]
      }]
    }

| Control | Behavior |
| --- | --- |
| block / selector | 1-based block index or explicit CSS selector; selector takes precedence |
| full / chapter | Clone the whole block; chapter adds an export class |
| partial | Clone selected direct children; prefixChildren defaults to [1, 2, 3] |
| width, shortWidth, mediumWidth | Raw width and optional narrower widths for short content |
| maxScale, padX, padY, topBias | Enlargement cap, margins and vertical placement |
| cropX, cropY, minClipW, noCrop | Crop padding, minimum width, or full-stage capture |
| className, exportCss | Per-slide class hook and plan-level CSS overrides |

See [SKILL.md](skills/html-to-ppt-deck-export/SKILL.md) for the reference and visual
checklist. Keep the stage at 16:9 for wide PPTX output. Sparse/dense layout
diagnostics are future work.

### Validation and early failures

The preview command validates plans in two phases before clearing its output
directory. Static validation checks JSON, a root object with a non-empty slides
array, slide/item objects, non-empty items arrays, supported types, integer
references, selection collections and effective stage/fit settings. It runs before
loading Playwright or opening the HTML. Unknown fields are allowed; optional
defaults and fields overridden by selector/fit precedence retain their behavior.

DOM validation runs after the HTML, fonts and images have reached the exporter's
existing readiness point. It checks CSS selector syntax/matches, available blocks
and explicitly selected direct children. A selector matching several elements
still uses the first. Only after both phases pass does output cleanup occur.

Errors go to stderr with exit code 1. Array paths are zero-based; block and child
references are one-based. A supplied slide name is included and escaped:

    Static validation failed:
    slides[0].items: must be a non-empty array (slide "Opening")

    DOM validation failed:
    slides[2].items[1].block: block 18 does not exist; available range is 1..12 (slide "Overview")

Compatibility changes: every slide now needs at least one item; missing, null or
empty items no longer produce blank pages. Explicit out-of-range children or
prefixChildren now fail. Omitted prefixChildren still supplies [1, 2, 3] and
ignores absent implicit children in short blocks. Explicit null or [] still means
no prefix. Selection order and deduplication are unchanged. Positive integer
numeric strings remain accepted for references, and supported numeric strings
remain accepted for fit values; stage dimensions and wait times require numbers.

This is input/reference validation, not a layout-quality check. CSS is not fully
validated, and signed crop controls and finite topBias values are not restricted
to visual heuristics. DOM changes after preflight can still cause rendering
failures. Once rendering starts, output writes are not transactional; use a new
directory when retaining an accepted version.

### Overflow and clipping evidence (unreleased)

After each slide is fitted and the existing per-slide wait finishes, the exporter
reads transformed element boxes and text-line rectangles before taking the PNG.
It compares them in **CSS pixels relative to the visual stage origin**, respecting
supported rectangular clipping ancestors and the actual screenshot crop.
Raw scrollWidth/scrollHeight values are not compared to screenshot dimensions.
padX/padY control fitting; occupying the intended padding alone is not clipping.

Each existing manifest metrics entry gains an additive **overflow** object;
all previous fields and the stdout JSON summary retain their meaning:

| Field | Meaning |
| --- | --- |
| coordinateSpace, tolerancePx | stage-relative-css-pixels; 1 CSS pixel per edge |
| status | inside, diagnostics, or uncertain; inside is not a visual approval |
| contentBounds | Union of measured fragments surviving supported container clips |
| stageBounds, cropBounds, visibleBounds | Measured stage, requested screenshot crop, and effective visible intersection |
| diagnosticCount, truncatedDiagnostics | Number of boundary groups and how many detail groups were omitted |
| diagnostics | Type, axis, confidence, intent, boundary, bounds, per-edge overflowPx, affectedCount, examples and reasons |
| limitations | Unsupported or incomplete measurement conditions |

Bounds use left/top/right/bottom. Missing or fully hidden content can have null
bounds. A finding is classified as **stage-overflow**, **crop-clipping** or
**container-clipping**, with horizontal/vertical/both axes and measured/uncertain
confidence. Intent is always unknown: crop settings and overflow:hidden may be
deliberate. With noCrop, crop-only findings disappear, while stage/container
findings remain possible. Diagnostics never resize, split or change the plan.

Example terminal summary:

    slides[2] ("Results"): stage-overflow (vertical, measured, 84px beyond boundary); tolerance 1px; inspect manifest overflow evidence and previews; clipping intent is unknown.

Differences of at most 1 CSS pixel are ignored; larger amounts are compared before
rounding evidence to three decimals. deviceScaleFactor changes PNG resolution,
not this tolerance. Ordinary shadows/outlines are excluded and borders are
included. Positive scaling/translation are supported; rotated/skewed/3D boundary
findings are conservative and marked uncertain.

The model uses boxes, not exact pixels or semantic importance. It cannot fully
resolve pseudo-elements, complex masks/clip paths, corner clipping, filters,
overlapping occlusion, embedded documents, shadow content, or internal SVG/canvas/
media drawing. Recognized unsupported conditions and active animations are
reported in limitations. Text uses line bounds, which can overestimate ink.
Content can change between measurement and screenshot. Measurement exceptions
produce an uncertain result while allowing the existing screenshot operation.

To keep output small, each slide retains up to 20 boundary groups and three
example descendant paths per group; counts expose omitted groups. Measurement
caps of 5000 elements/20000 fragments are explicitly reported when reached.
Normal slides are quiet, abnormal slides get one concise stderr line, and findings
alone preserve exit code 0. Plan/reference errors still exit 1. See the
[internal geometry notes](skills/html-to-ppt-deck-export/scripts/lib/overflow_geometry.md)
for coordinate mapping and implementation limits. Always review previews and
the contact sheet before accepting the PPTX input.

## Examples

- [Basic report](examples/basic-report/README.md): offline source, all commands,
  expected dimensions and artifact guidance.
- [Slide plan](examples/basic-report/slide_plan.json): index, selector and partial
  selection with full-stage capture.

## Repository structure

    .github/                              CI, Issue forms and PR template
    examples/basic-report/                HTML, slide plan and instructions
    docs/assets/                          Reviewed demo contact sheet
    scripts/check.js                      Syntax and JSON checks
    skills/html-to-ppt-deck-export/
      SKILL.md                            Workflow and plan reference
      agents/openai.yaml                  Codex display metadata
      scripts/                            Five commands and internal helpers
    tests/{unit,pipeline,integration}/     Node test runner suites
    package.json, package-lock.json        Pinned installation and npm commands
    AGENTS.md, CONTRIBUTING.md             Agent and contributor guidance
    ROADMAP.md, CHANGELOG.md, LICENSE      Maintenance and licensing

## Compatibility

- **Release target:** Windows, Node 22 or Node 24.13.1+ in the 24 series, npm and
  Windows PowerShell. CI exercises Node 22 and 24 on Windows. Earlier Node 24
  patches can fail to clear Unicode paths; see the
  [Node 24.13.1 fix](https://nodejs.org/en/blog/release/v24.13.1).
- **Browser:** Playwright Chromium is the reproducible path. Edge fallback is
  retained. Source fonts must be available locally.
- **Other platforms:** full Linux/macOS support is not claimed; QA invokes
  powershell.exe.
- **PowerPoint:** output is image-based wide OOXML. No certification across
  PowerPoint versions or office viewers is claimed.
- **Source material:** use trusted HTML and available assets. The exporter
  executes the page in a browser. Keep private data out of public issues.
- **QA limits:** geometry diagnostics flag potential clipping within documented
  coverage; automated checks do not judge readability or meaning and cannot
  certify that all content is visible.
- **Dependency advisories:** npm audit reports high-severity
  [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
  [JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) parser advisories in
  image-size, a transitive dependency of pinned pptxgenjs 4.0.1. These remain
  unresolved in this dependency tree. Review before publishing; npm audit fix
  --force proposes an incompatible PptxGenJS downgrade.

For vulnerability reporting and supported-version policy, see [SECURITY.md](SECURITY.md).

## Roadmap

v0.1 establishes installation, examples, regression tests and Windows CI.
Unreleased development adds slide-plan validation and overflow/clipping evidence.
Remaining planned v0.2 work covers sparse/dense layout diagnostics. Planned v0.3 work covers
consolidated QA reports, a unified CLI and
batch/headless improvements. See [ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for test layers and PR expectations. Start
with a minimal reproduction or concrete workflow need in the
[Issue tracker](https://github.com/van822/html-to-ppt-deck-export/issues).

    npm run check
    npm test
    npm run test:integration

## License

[MIT](LICENSE), copyright 2026 van822. Third-party dependencies retain their
respective licenses.
