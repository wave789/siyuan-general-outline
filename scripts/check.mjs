import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
for (const file of ["index.js", "src/plugin.js", "src/headings.js", "src/rail.js", "src/styles.js"]) {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(new URL(file, root))], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
if (manifest.name !== "siyuan-general-outline" || manifest.displayName.default !== manifest.name) throw new Error("Plugin name mismatch");
console.log("Syntax and manifest checks passed");
