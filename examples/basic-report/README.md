# Basic report example

Four slides demonstrate heading/text, cards, an inline SVG diagram and a table.
The last slide uses a partial block to omit a source-only note. Other slides use
1-based block indexes and an explicit selector.

The example has fixed content and no remote resources, scripts, clock or random
input. System fonts may render slightly differently on different machines.

## Run from the repository root

On Windows with Node 22 or Node 24.13.1+:

    npm ci
    npx playwright install chromium
    npm run preview -- examples/basic-report/report.html examples/basic-report/slide_plan.json outputs/basic-report/previews
    npm run contact-sheet -- outputs/basic-report/previews outputs/basic-report/contact_sheet.png 2

Open the contact sheet and all four planned_01.png through planned_04.png files.
Check readable text, complete cards/table edges, consistent margins and page order.
If needed, edit the HTML or plan and repeat these two export commands.

After accepting the previews:

    npm run pptx -- outputs/basic-report/previews outputs/basic-report/basic-report.pptx
    npm run qa -- outputs/basic-report/basic-report.pptx

Expected QA result: slides is 4, badCount is 0, and exit code is 0.
The example explicitly sets deviceScaleFactor to 1 and noCrop to true, producing
four 1600×900 PNGs. The general exporter defaults to scale factor 2 and content
cropping; see the [skill reference](../../skills/html-to-ppt-deck-export/SKILL.md).

The preview command clears its output directory on each run. Use a different
directory to preserve previously accepted previews.

## Outputs and demo asset

All generated output above is ignored by Git. The preview manifest contains local
absolute paths and should not be committed. The PPTX embeds the accepted PNGs
without converting text, diagrams or tables to editable PowerPoint objects.

The repository keeps only the reviewed contact sheet in
docs/assets/basic-report-contact-sheet.png for the README demo. To refresh it,
review the generated contact sheet and copy it from the root with:

    node -e "require('node:fs').copyFileSync('outputs/basic-report/contact_sheet.png', 'docs/assets/basic-report-contact-sheet.png')"

Full previews and PPTX files can be attached to a reviewed GitHub Release. CI
keeps its example artifacts temporarily under outputs/ci-basic-report.
The automated end-to-end smoke test runs with:

    npm run test:integration

Automated image checks supplement the manual review above.
