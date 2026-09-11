"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { temp, run, png } = require("../helpers");

test("static invalid plans preserve existing previews and never create new output", (t) => {
  const dir = temp(t);
  const plan = path.join(dir, "bad-plan.json");
  const existing = path.join(dir, "accepted");
  const absent = path.join(dir, "new-output");
  fs.mkdirSync(existing);
  const accepted = {
    "planned_01.png": png(10, 20, 30),
    "manifest.json": Buffer.from('{"accepted":true}'),
    "keep.txt": Buffer.from("Do not remove"),
  };
  for (const [name, bytes] of Object.entries(accepted)) fs.writeFileSync(path.join(existing, name), bytes);
  const inputs = [
    "{", "null", "[]", "{}", '{"slides":[]}', '{"slides":[{}]}',
    '{"slides":[{"name":"Opening","items":[{"block":0}]}]}',
    '{"slides":[{"items":[{"type":"partial","block":1,"children":"12"}]}]}',
    '{"stage":{"width":0},"slides":[{"items":[{"block":1}]}]}',
  ];
  for (const input of inputs) {
    fs.writeFileSync(plan, input);
    for (const output of [existing, absent]) {
      // Missing HTML + nonexistent browser cache proves the static phase runs first.
      const result = run("export_preview.js", [path.join(dir, "missing.html"), plan, output], {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(dir, "no-browser") },
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Static validation failed/);
      assert.doesNotMatch(result.stderr, /at main|Missing Node dependency|ENOENT|browserType/);
      if (input === "{") assert.match(result.stderr, /bad-plan\.json.*invalid JSON/);
    }
    assert.deepEqual(fs.readdirSync(existing).sort(), Object.keys(accepted).sort());
    for (const [name, bytes] of Object.entries(accepted)) assert.deepEqual(fs.readFileSync(path.join(existing, name)), bytes);
    assert.equal(fs.existsSync(absent), false);
  }
});
