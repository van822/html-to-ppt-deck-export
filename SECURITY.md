# Security policy

## Supported versions

Security fixes target the latest patch release in the newest stable minor series.
For the initial release, that is 0.1.0 in the 0.1.x series. Development on main is
not a stable release. Older minor series and historical development snapshots do
not have a guaranteed backport policy. There is no guaranteed response or fix time.

## Report a vulnerability privately

Use GitHub's [private vulnerability reporting form](https://github.com/van822/html-to-ppt-deck-export/security/advisories/new),
or choose **Report a vulnerability** on the repository's
[Security Advisories page](https://github.com/van822/html-to-ppt-deck-export/security/advisories).
GitHub sign-in is required. Private reporting is enabled for this repository.

Include the affected version, Node/Windows versions, reproduction steps, expected
impact and a minimal sanitized example. Do not publish an unpatched vulnerability
or sensitive reproduction in a public Issue. Public bug reports must not contain
private HTML, personal data, credentials, signed asset URLs or confidential images.
Coordinate disclosure through the private report. No security email is advertised.

## Input and execution boundaries

The exporter loads local HTML in a browser, including page scripts and referenced
local or remote assets. Only render HTML and image assets you trust, in an
environment appropriate for that material. The toolkit is not an isolation service
for hostile content. PPTX structural QA checks geometry and does not establish that
source HTML, image files or generated artifacts are safe.

## Dependency advisories

The 0.1.0 lockfile includes image-size through pptxgenjs 4.0.1. npm audit reports
high-severity denial-of-service advisories in image-size's
[ICNS parser](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[JXL/HEIF parsers](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
These advisories remain unresolved in this release's dependency tree. They are
not evidence of a tested exploit of this toolkit, nor a claim that it is unaffected.

Review upstream fixes and applicability, test compatible updates through the
preview/contact-sheet/PPTX/QA workflow, and document remediation in CHANGELOG and
release notes. Do not run npm audit fix --force or add untested overrides solely
to suppress a report. Keep the lockfile reproducible and review dependency PRs
manually. Weekly Dependabot checks assist maintenance; they do not automatically
merge updates or guarantee resolution of transitive advisories.
