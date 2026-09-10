"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { replacementSequence } = require("../../skills/html-to-ppt-deck-export/scripts/lib/replacement_sequence");
const source = [1, 2, 3, 4, 5].map((n) => ({ type: "source", path: String(n) }));
const rulesPath = path.resolve("example/rules.json");
const sequence = (rules) => replacementSequence(source, rules, rulesPath);

test("multiple replacements refer to original page positions without mutating inputs", () => {
  const rules = { replace: [
    { start: 2, deleteCount: 2, images: ["merged.png"] },
    { start: 5, images: ["last-a.png", "last-b.png"] },
  ] };
  const before = JSON.stringify({ source, rules });
  const result = sequence(rules);
  assert.deepEqual(result.map((x) => x.original || x.path), ["1", "merged.png", "4", "last-a.png", "last-b.png"]);
  assert.equal(JSON.stringify({ source, rules }), before);
});

test("legacy aliases, relative paths, and deleteCount zero retain their semantics", () => {
  const result = sequence({ replacements: [{ start: 2, remove: 0, image: "insert.png" }] });
  assert.equal(result.length, 6);
  assert.equal(result[1].path, path.resolve("example/insert.png"));
  assert.equal(result[2].path, "2");
});

test("absolute replacement paths and default one-page removal are preserved", () => {
  const absolute = path.resolve("replacement.png");
  const result = sequence({ replace: [{ start: 5, image: absolute }] });
  assert.equal(result.length, 5);
  assert.equal(result[4].path, absolute);
});

test("empty rules keep source order; invalid operations fail", () => {
  assert.deepEqual(sequence({}), source);
  assert.throws(() => sequence({ replace: [{ start: 0, image: "a.png" }] }), /Invalid replacement start/);
  assert.throws(() => sequence({ replace: [{ start: 1, images: [] }] }), /has no images/);
});
