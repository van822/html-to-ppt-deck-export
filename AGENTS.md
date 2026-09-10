# Contributor instructions for coding agents

## Purpose and architecture

This repository exports planned HTML content to image-based PowerPoint decks.
It provides a Codex skill and five independently runnable Node scripts.

Preserve this architectural invariant:

HTML → slide plan → fixed 16:9 previews → contact-sheet QA → iteration → PPTX → final QA

Do not silently bypass a stage or assemble a user-facing PPTX before reviewing its
previews and contact sheet. Automated smoke tests supplement the visual review.
Fix layout in the HTML, export CSS, or slide plan; keep accepted versions intact.
The PPTX contains one full-slide image per page, not editable source objects.

## Structure

- Root: package metadata, lockfile, public documentation and contributor guidance.
- skills/html-to-ppt-deck-export/: SKILL.md, agent UI metadata and runtime scripts.
- scripts/: repository maintenance checks, not a second export implementation.
- examples/basic-report/: deterministic offline source and plan.
- tests/: pure unit, browser-free pipeline, and Playwright integration tests.
- docs/assets/: the reviewed demo contact sheet.
- outputs/, tmp/, .cache/: ignored generated files; never commit their manifests.

## Compatibility and dependencies

Keep script paths, positional arguments, JSON fields, numeric preview ordering,
replacement aliases, and valid-input behavior compatible. Preserve default
1600×900 staging, deviceScaleFactor 2, cropping controls and LAYOUT_WIDE placement.
Document every intentional behavior change and add a regression test for defects.
Internal helper exports are test seams, not a supported library API.

Use Node 22 or Node 24.13.1+ within the 24 series; recommend a current Node 24 patch.
Full QA requires Windows PowerShell (powershell.exe). Keep the existing dependency
lookup fallbacks for externally installed skills; validate normal npm ci first.
Only playwright and pptxgenjs are direct runtime dependencies. Avoid frameworks,
TypeScript, global-install requirements, and new dependencies without a concrete
need. Generate the lockfile with npm; do not hand-edit it or use audit fix --force.

## Required checks

Run npm ci, npm run check and npm test. For rendering changes install Chromium
with npx playwright install chromium and run npm run test:integration.
Review the basic example's contact sheet and individual previews before building
its PPTX; then run QA and verify the embedded images match the accepted previews.
Inspect new errors and negative cases, not just successful command exits.
Report unavailable checks explicitly; never equate structural QA with visual QA.

## Documentation and Git workflow

Keep README, SKILL.md, example instructions and CHANGELOG consistent with runtime
behavior. Claims must be supported by tests or documented manual checks. Future
features belong in ROADMAP, not in descriptions of existing capabilities.

Work on a branch with focused commits. Review git diff --check and the staged
file list. Exclude credentials, personal course materials, caches, machine paths
and large generated decks. PRs explain the problem, behavior changes, validation
and limitations. Do not create artificial issues or activity. Preserve user work;
do not force-push, merge, tag or publish without authorization.
