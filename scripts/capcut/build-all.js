// Build every plan in plans/ into CapCut's library, one at a time (they share
// root_meta_info.json). Themes first. Skips a name already in the library.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const STORE = path.join(process.env.LOCALAPPDATA, "CapCut/User Data/Projects/com.lveditor.draft");
const dir = path.join(__dirname, "plans");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  .sort((a, b) => (b.startsWith("Theme") - a.startsWith("Theme")) || b.localeCompare(a));
for (const f of files) {
  const plan = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (fs.existsSync(path.join(STORE, plan.name))) { console.log("exists, skipped:", plan.name); continue; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, "build-from-plan.js"), path.join(dir, f)], { encoding: "utf8" });
  const line = (r.stdout || "").trim().split("\n").pop();
  console.log(Math.round((Date.now() - t0) / 1000) + "s  " + (r.status === 0 ? line : "FAILED " + plan.name + ": " + (r.stderr || r.stdout).slice(-400)));
}
console.log("done");
