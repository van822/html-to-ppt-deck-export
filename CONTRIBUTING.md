# Contributing

Useful contributions include a reproducible export defect, a focused regression
test, clearer instructions, or an improvement tied to a concrete layout problem.

## Development setup

Use Windows, Node 22 or Node 24.13.1+ (24 recommended), npm, and Windows PowerShell.
Clone the repository and run from its root:

    npm ci
    npx playwright install chromium
    npm run check
    npm test
    npm run test:integration

No global Node modules or additional test framework are required. Browser binaries
are a separate Playwright installation. Linux/macOS full-pipeline support is not
claimed for v0.1; QA invokes powershell.exe.

## Tests

- npm run check: syntax-check repository JavaScript and parse JSON.
- npm run test:unit: pure replacement sequencing.
- npm run test:pipeline: filesystem behavior, PPTX image contents and Windows QA.
- npm test: both browser-free suites.
- npm run test:integration: real Chromium rendering and the four-page example.

Integration tests keep example artifacts in outputs/ci-basic-report for inspection.
Other fixtures use unique temporary directories and are cleaned up. Windows-only
checks are explicitly skipped on other operating systems, so a partial non-Windows
run is not evidence of full compatibility. Avoid byte-for-byte cross-platform PNG
snapshots: font rendering can vary.

## Reproduce the example

Follow [examples/basic-report/README.md](examples/basic-report/README.md). Inspect
the contact sheet and each preview before assembling the PPTX. After a layout
change, regenerate the documented demo image from the reviewed contact sheet.
Use a new output directory when retaining an accepted version.

## Issues and pull requests

For bugs, include Node/Windows versions, exact command, expected and actual
behavior, errors, and a minimal HTML/plan pair you can share. Remove private data
and credentials. A contact sheet is useful for pagination defects.

For features, explain the task and why existing controls are insufficient.
Consult [ROADMAP.md](ROADMAP.md) before implementing a larger feature.

Create a branch and keep commits focused. Add a regression test for a verified
defect; update docs and CHANGELOG for behavior changes. Explain test results and
any visual changes in the PR. Run git diff --check and inspect staged files.

## Compatibility and dependency policy

### Feature development workflow

Implement v0.2 work in this order: slide-plan validation, overflow detection,
then sparse/dense layout diagnostics. Each feature has its own Issue, branch
and PR; do not combine all three into a single change.

Issue → dedicated branch → implementation → tests → documentation → pull request
→ CI → merge

Each PR describes the problem, new or changed behavior, backward compatibility,
tests and remaining limitations. Reference its Issue and preserve the preview
review boundary. Dependency updates also require human review and passing CI;
Dependabot's weekly checks do not authorize automatic merging.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and the
supported-version policy. Never place sensitive source material in public Issues.

### Compatibility requirements

Preserve the preview-first architecture, script names and arguments, manifest
fields, numeric ordering, replacement aliases and valid slide plans. Reviewable
bug fixes may reject unsafe or invalid inputs that previously appeared to succeed.
Keep internal helpers private and avoid rewriting working layout logic.

Keep direct dependencies minimal and regenerate package-lock.json with npm.
Review npm audit results; do not automatically run npm audit fix --force.
The currently pinned pptxgenjs dependency brings image-size advisories; see
[README compatibility notes](README.md#compatibility). Dependency changes need
the same export and QA checks as code changes.

## Release preparation

Require clean-install checks and the Windows CI matrix to pass, inspect the demo,
review outstanding dependency advisories, and record remaining limitations.
Until release approval, changes stay under Unreleased. When publishing, move the
approved entries into a dated version section, create the corresponding tag and
GitHub Release, and attach the reviewed example output if useful. Generated decks
do not belong in source control. The package is private to prevent accidental npm
publication; GitHub is the intended distribution channel.
