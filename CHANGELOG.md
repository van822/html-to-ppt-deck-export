# Changelog

Notable changes are recorded here, following a simple Keep a Changelog structure.
Version numbers follow Semantic Versioning. No release date or tag is claimed yet.

## [Unreleased]

### Added

- MIT license, pinned npm dependencies, lockfile and executable npm commands.
- Repository agent guidance, contributor documentation, roadmap and GitHub templates.
- A deterministic four-page HTML/slide-plan example and demo contact sheet.
- Node unit, pipeline and Playwright integration tests, with Windows CI on Node 22/24.

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
  They remain unresolved in this pinned dependency tree; review before publishing.

[Unreleased]: https://github.com/van822/html-to-ppt-deck-export/compare/e893191078b4af15200bc63f1ce4099d58341f85...HEAD
