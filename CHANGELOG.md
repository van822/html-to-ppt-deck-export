# Changelog

Notable changes are recorded here, following a simple Keep a Changelog structure.
Version numbers follow Semantic Versioning.

## [Unreleased]

### Added

- Two-phase slide-plan validation with deterministic slide/item/field diagnostics:
  static checks before browser loading, and DOM reference checks before output cleanup.
- Regression coverage for invalid plans, reference errors and preservation of
  existing previews and manifests on preflight failures.

### Changed

- Upgrade Playwright from 1.61.1 to 1.63.0 and its matching Chromium runtime.
- Each slide now requires a non-empty items array; blank slides from missing,
  null or empty items are rejected. Explicit nonexistent partial child references
  fail; absent implicit default prefix children continue to be ignored.
- Plan errors print concise phase-specific diagnostics to stderr and exit 1.
  Existing valid plans retain defaults, selector precedence, output names and
  manifest fields. Rendering after preflight remains non-transactional.

## [0.1.0] - 2026-09-10

### Added

- MIT license, pinned npm dependencies, lockfile and executable npm commands.
- Repository agent guidance, contributor documentation, roadmap and GitHub templates.
- A deterministic four-page HTML/slide-plan example and demo contact sheet.
- Node unit, pipeline and Playwright integration tests, with Windows CI on Node 22/24.
- Security policy and GitHub private vulnerability reporting guidance.
- Weekly npm dependency update checks through Dependabot, with manual review.
- A main-branch CI badge and an Issue-to-PR development workflow.

### Fixed

- Contact sheets embed local PNGs and fail when an image cannot be decoded.
- Local HTML paths preserve literal percent signs, hashes, spaces and Unicode.
- Output preflight protects source files, rules and replacement images from deletion.
- PPTX QA rejects empty decks and checks each picture's own full-bleed transform
  and the presentation dimensions, including XML namespace/whitespace variations.
- Browser instances close after rendering errors.

### Changed

- README describes installation, review steps, output dimensions and limitations.
- Node 24 requires 24.13.1 or newer because earlier patches can fail to remove
  Unicode output paths on Windows.

### Known limitations

- Full QA requires Windows PowerShell; exported slide content is rasterized.
- Structural QA does not detect unreadable text, clipping or poor composition.
- npm audit reports high-severity image-size advisories through pptxgenjs 4.0.1.
  They remain unresolved in this release's pinned dependency tree; see SECURITY.md.

[Unreleased]: https://github.com/van822/html-to-ppt-deck-export/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/van822/html-to-ppt-deck-export/compare/e893191078b4af15200bc63f1ce4099d58341f85...v0.1.0
