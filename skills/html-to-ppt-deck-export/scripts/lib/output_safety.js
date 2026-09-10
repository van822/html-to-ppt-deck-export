"use strict";

const fs = require("fs");
const path = require("path");

// Resolve existing ancestors too, so a junction cannot hide an input/output overlap.
function realPath(p) {
  const absolute = path.resolve(p);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  const parent = path.dirname(absolute);
  if (parent === absolute) return absolute;
  return path.join(realPath(parent), path.basename(absolute));
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function assertSafeOutput(output, inputs) {
  const destination = realPath(output);
  for (const input of [...inputs, process.cwd(), __dirname]) {
    if (contains(destination, realPath(input))) {
      throw new Error(`Unsafe output directory: ${output} contains or aliases protected input: ${input}`);
    }
  }
}

module.exports = { assertSafeOutput };
