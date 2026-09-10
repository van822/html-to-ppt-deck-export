"use strict";

const path = require("path");

function replacementSequence(source, rules, rulesPath) {
  const sequence = source.slice();
  const replacements = rules.replace || rules.replacements || [];
  for (const op of replacements.slice().sort((a, b) => b.start - a.start)) {
    const start = Number(op.start);
    const deleteCount = Number(op.deleteCount ?? op.remove ?? 1);
    const images = (op.images || (op.image ? [op.image] : [])).map((p) => ({
      type: "replacement",
      path: path.isAbsolute(p) ? p : path.resolve(path.dirname(path.resolve(rulesPath)), p),
      original: p,
    }));
    if (!start || start < 1) throw new Error(`Invalid replacement start: ${op.start}`);
    if (!images.length) throw new Error(`Replacement at ${start} has no images.`);
    sequence.splice(start - 1, deleteCount, ...images);
  }
  return sequence;
}

module.exports = { replacementSequence };
