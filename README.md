# HTML to PPT Deck Export

A Codex skill for converting long-page HTML, clickdeck snapshots, visual reports, and screenshot-based web decks into clean 16:9 PowerPoint decks.

The system is designed to avoid low-quality “full page screenshot → PPT” workflows. Instead, it uses a **preview-first pipeline**: plan slides → render fixed 16:9 previews → QA via contact sheet → generate full-bleed PPTX.

---

## What this skill does

* Converts complex HTML reports into structured slide decks
* Builds an explicit `slide_plan.json` before rendering
* Generates 1600×900 preview images for each slide
* Produces a contact sheet for fast visual QA
* Assembles PPTX using full-bleed slide images
* Supports iterative replacement of preview slides
* Ensures consistent margins and readable typography

---

## Repository structure

```text
html-to-ppt-deck-export/
├─ README.md
├─ .gitignore
└─ skills/
   └─ html-to-ppt-deck-export/
      ├─ SKILL.md
      ├─ agents/openai.yaml
      └─ scripts/
         ├─ export_preview.js
         ├─ make_contact_sheet.js
         ├─ ppt_from_preview.js
         ├─ replace_preview_pages.js
         └─ qa_pptx_full_bleed.js
```

---

## Requirements

* Node.js (runtime for all scripts)
* Playwright (for browser rendering)
* pptxgenjs (for PPTX generation)

Install dependencies:

```bash
npm install playwright pptxgenjs
npx playwright install chromium
```

Scripts also support fallback resolution from:

* local `node_modules`
* global npm modules
* workspace-specific package paths

---

## Install as Codex skill

Adjust path if needed:

```powershell
python C:\CodexHome\skills\.system\skill-installer\scripts\install-skill-from-github.py `
  --repo van822/html-to-ppt-deck-export `
  --path skills/html-to-ppt-deck-export
```

Restart Codex after installation.

---

## Typical usage prompt (Codex)

```text
Use the html-to-ppt-deck-export skill.

Steps:
1. Analyze input HTML
2. Build slide_plan.json
3. Generate preview PNGs
4. Create contact sheet and review layout
5. Iterate until slides are readable and balanced
6. Export final PPTX
7. Run QA full-bleed validation
```

---

## Manual workflow

### 1. Generate preview slides

```bash
node skills/html-to-ppt-deck-export/scripts/export_preview.js source.html slide_plan.json outputs/previews
```

### 2. Generate contact sheet

```bash
node skills/html-to-ppt-deck-export/scripts/make_contact_sheet.js outputs/previews outputs/contact_sheet.png
```

### 3. Replace slides (iteration)

```bash
node skills/html-to-ppt-deck-export/scripts/replace_preview_pages.js outputs/previews outputs/previews_v2 rules.json --force
```

### 4. Build PPTX

```bash
node skills/html-to-ppt-deck-export/scripts/ppt_from_preview.js outputs/previews_v2 outputs/deck.pptx
```

### 5. QA check

```bash
node skills/html-to-ppt-deck-export/scripts/qa_pptx_full_bleed.js outputs/deck.pptx
```

---

## Slide plan schema (minimal)

```json
{
  "stage": {
    "width": 1600,
    "height": 900,
    "deviceScaleFactor": 2
  },
  "blockSelector": "main > section",
  "slides": [
    {
      "name": "Slide 1",
      "fit": {
        "width": 1260,
        "maxScale": 1.2,
        "padX": 40,
        "padY": 40,
        "topBias": 0.5
      },
      "items": [
        { "type": "full", "block": 1 }
      ]
    }
  ]
}
```

---

## Design principles

* Slides must be readable at presentation scale
* Avoid full-page raw screenshots
* Always preview before exporting PPTX
* Prefer splitting over shrinking text
* Ensure consistent margins across slides

---

## Troubleshooting

### Text too small

Split slides or reduce content density.

### Large empty space

Increase scale or merge adjacent sections.

### Cropped content

Lower scale or increase padding.

---

## License

No license file currently included. Add a license before public redistribution or reuse.
