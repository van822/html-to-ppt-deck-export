#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const pptxPath = process.argv[2];
if (!pptxPath) {
  console.error("Usage: node qa_pptx_full_bleed.js <deck.pptx>");
  process.exit(1);
}

const resolved = path.resolve(pptxPath);
if (!fs.existsSync(resolved)) throw new Error(`PPTX not found: ${resolved}`);

const script = `
$ErrorActionPreference = 'Stop'
$p = Resolve-Path -LiteralPath '${resolved.replace(/'/g, "''")}'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($p)
try {
  $slides = $zip.Entries |
    Where-Object { $_.FullName -match '^ppt/slides/slide\\d+\\.xml$' } |
    Sort-Object { [int]([regex]::Match($_.FullName, 'slide(\\d+)\\.xml').Groups[1].Value) }
  $bad = @()
  foreach ($e in $slides) {
    $sr = New-Object System.IO.StreamReader($e.Open())
    $xml = $sr.ReadToEnd()
    $sr.Close()
    $picCount = ([regex]::Matches($xml, '<p:pic>')).Count
    $fullBleed = $xml -match '<a:off x="0" y="0"/>' -and $xml -match '<a:ext cx="12192000" cy="6858000"/>'
    if ($picCount -ne 1 -or -not $fullBleed) {
      $bad += [pscustomobject]@{ slide = $e.FullName; pictureCount = $picCount; fullBleed = $fullBleed }
    }
  }
  [pscustomobject]@{
    pptx = [string]$p
    slides = $slides.Count
    badCount = $bad.Count
    bad = $bad
  } | ConvertTo-Json -Depth 6
} finally {
  $zip.Dispose()
}
`;

const encoded = Buffer.from(script, "utf16le").toString("base64");
const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
  encoding: "utf8",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const output = JSON.parse(result.stdout);
console.log(JSON.stringify(output, null, 2));
if (output.badCount > 0) process.exit(2);
