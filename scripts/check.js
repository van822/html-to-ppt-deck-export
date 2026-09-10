"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
let count = 0;

function checkDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) checkDirectory(file);
    else if (entry.name.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
      count++;
    } else if (entry.name.endsWith(".json")) {
      JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }
}

for (const dir of ["scripts", "skills", "tests", "examples"]) checkDirectory(path.join(root, dir));
for (const name of ["package.json", "package-lock.json"]) {
  JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
}
console.log(`Syntax checked ${count} JavaScript files; JSON parsed successfully.`);
