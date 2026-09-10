"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const scripts = path.join(root, "skills/html-to-ppt-deck-export/scripts");

function temp(t) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "html-ppt-test-"));
  t.after(() => {
    assert.ok(path.basename(dir).startsWith("html-ppt-test-"));
    assert.equal(path.dirname(dir), fs.realpathSync(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function run(name, args, options = {}) {
  const result = spawnSync(process.execPath, [path.join(scripts, name), ...args], {
    cwd: root, encoding: "utf8", timeout: 60000, ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function powershell(script, payload) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(
      "$ErrorActionPreference='Stop'\n[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding\n[Console]::InputEncoding = New-Object System.Text.UTF8Encoding\n" +
      "$data = [Console]::In.ReadToEnd() | ConvertFrom-Json\n" + script, "utf16le",
    ).toString("base64"),
  ], { input: JSON.stringify(payload), encoding: "utf8", timeout: 30000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

function readZip(file) {
  return powershell(
    "Add-Type -AssemblyName System.IO.Compression.FileSystem\n" +
    "$zip=[System.IO.Compression.ZipFile]::OpenRead($data.file)\n" +
    "try { $entries=@{}; foreach($e in $zip.Entries) { " +
    "$s=$e.Open(); $m=New-Object System.IO.MemoryStream; try { $s.CopyTo($m); " +
    "$entries[$e.FullName]=[Convert]::ToBase64String($m.ToArray()) } finally {$s.Dispose();$m.Dispose()} }; " +
    "ConvertTo-Json -InputObject $entries -Compress } finally {$zip.Dispose()}",
    { file },
  );
}

function changeZip(file, changes) {
  powershell(
    "Add-Type -AssemblyName System.IO.Compression.FileSystem\n" +
    "$zip=[System.IO.Compression.ZipFile]::Open($data.file,'Update')\n" +
    "try { foreach($p in $data.changes.PSObject.Properties) { $e=$zip.GetEntry($p.Name); " +
    "if($null -ne $e){$e.Delete()}; if($null -ne $p.Value){$e=$zip.CreateEntry($p.Name); " +
    "$s=$e.Open(); try{$b=[Text.Encoding]::UTF8.GetBytes([string]$p.Value);$s.Write($b,0,$b.Length)}finally{$s.Dispose()}} } } " +
    "finally {$zip.Dispose()}",
    { file, changes },
  );
}

function xml(entries, name) {
  return Buffer.from(entries[name], "base64").toString("utf8");
}

// Small deterministic PNG fixtures avoid an imaging dependency and binary test files.
function png(red, green, blue) {
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const footer = Buffer.alloc(4);
    footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, footer]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0);
  ihdr.writeUInt32BE(18, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc(18 * (1 + 32 * 3));
  for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) {
    const offset = y * 97 + 1 + x * 3;
    rows[offset] = red; rows[offset + 1] = green; rows[offset + 2] = blue;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

function assertDeckImages(file, expected) {
  const entries = readZip(file);
  const slides = Object.keys(entries).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.equal(slides.length, expected.length);
  assert.match(xml(entries, "ppt/presentation.xml"), /<p:sldSz cx="12192000" cy="6858000"/);
  expected.forEach((image, index) => {
    const slide = xml(entries, "ppt/slides/slide" + (index + 1) + ".xml");
    assert.equal((slide.match(/<p:pic>/g) || []).length, 1);
    const id = slide.match(/<a:blip r:embed="([^"]+)"/)[1];
    const rels = xml(entries, "ppt/slides/_rels/slide" + (index + 1) + ".xml.rels");
    const rel = rels.match(new RegExp('<Relationship Id="' + id + '"[^>]+>'))[0];
    const target = rel.match(/Target="([^"]+)"/)[1];
    const media = path.posix.normalize("ppt/slides/" + target);
    assert.deepEqual(Buffer.from(entries[media], "base64"), image);
  });
}

module.exports = { root, scripts, temp, run, success, png, readZip, xml, changeZip, assertDeckImages };
