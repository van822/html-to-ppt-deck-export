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
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$p = Resolve-Path -LiteralPath '${resolved.replace(/'/g, "''")}'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($p)
function Read-EntryXml($entry) {
  if ($null -eq $entry) { throw 'Missing XML entry in PPTX.' }
  $sr = New-Object System.IO.StreamReader($entry.Open())
  try {
    $document = New-Object System.Xml.XmlDocument
    $document.XmlResolver = $null
    $document.LoadXml($sr.ReadToEnd())
    return ,$document
  } finally { $sr.Dispose() }
}
function Get-Namespaces($document) {
  $ns = New-Object System.Xml.XmlNamespaceManager($document.NameTable)
  $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
  $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
  return ,$ns
}
try {
  $slides = @($zip.Entries |
    Where-Object { $_.FullName -match '^ppt/slides/slide\\d+\\.xml$' } |
    Sort-Object { [int]([regex]::Match($_.FullName, 'slide(\\d+)\\.xml').Groups[1].Value) })
  if ($slides.Count -eq 0) { throw 'PPTX contains no slide XML entries.' }
  $presentation = Read-EntryXml ($zip.GetEntry('ppt/presentation.xml'))
  $presentationNs = Get-Namespaces $presentation
  $declaredSlides = $presentation.SelectNodes('/p:presentation/p:sldIdLst/p:sldId', $presentationNs)
  if ($declaredSlides.Count -ne $slides.Count) { throw 'PPTX slide count does not match presentation.xml.' }
  $size = $presentation.SelectSingleNode('/p:presentation/p:sldSz', $presentationNs)
  $wide = $null -ne $size -and $size.GetAttribute('cx') -eq '12192000' -and $size.GetAttribute('cy') -eq '6858000'
  $bad = @()
  foreach ($e in $slides) {
    $xml = Read-EntryXml $e
    $ns = Get-Namespaces $xml
    $picCount = $xml.SelectNodes('//p:pic', $ns).Count
    $picture = $xml.SelectSingleNode('/p:sld/p:cSld/p:spTree/p:pic', $ns)
    $fullBleed = $false
    if ($null -ne $picture) {
      $off = $picture.SelectSingleNode('p:spPr/a:xfrm/a:off', $ns)
      $ext = $picture.SelectSingleNode('p:spPr/a:xfrm/a:ext', $ns)
      $fullBleed = $wide -and $null -ne $off -and $null -ne $ext -and
        $off.GetAttribute('x') -eq '0' -and $off.GetAttribute('y') -eq '0' -and
        $ext.GetAttribute('cx') -eq '12192000' -and $ext.GetAttribute('cy') -eq '6858000'
    }
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
