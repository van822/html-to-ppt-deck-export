# Roadmap

This roadmap describes release scope and possible follow-up work, not delivery
dates. Future items are not available features.

## v0.1 — reproducible baseline (release preparation)

- Reproducible npm installation with a committed lockfile and MIT license.
- An offline HTML/slide-plan example and reviewed demo contact sheet.
- Automated regression tests for rendering, replacement, PPTX assembly and QA.
- Windows CI on Node 22 and 24; contributor documentation and GitHub templates.

## v0.2 — validation and layout diagnostics (planned)

- Slide-plan validation with actionable locations and messages.
- Overflow detection for clipped content.
- Layout diagnostics for excessive margins and over-scaled or under-scaled pages.

## v0.3 — automation interfaces (planned)

- Consolidated, machine-readable QA reports with a documented report schema.
- A unified CLI wrapping the existing preview-first stages.
- Batch/headless workflow improvements that retain an explicit review boundary.

The existing preview manifest and full-bleed QA JSON are limited outputs; they
do not constitute the proposed consolidated report interface. Cross-platform QA
and upstream dependency advisory resolution should be evaluated separately,
based on contributor needs and available compatible fixes.
