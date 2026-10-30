// Minimal lint: syntax-check every Oribu module, forbid debug leftovers and non-determinism in the sim.
import { readdirSync, readFileSync } from "node:fs"; import { execFileSync } from "node:child_process";
const dir = new URL("../app/oribu/", import.meta.url).pathname; let bad = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith(".js"))) {
  const src = readFileSync(dir + f, "utf8");
  try { execFileSync(process.execPath, ["--check", dir + f], { stdio: "pipe" }); } catch (e) { console.error(f, String(e.stderr)); bad++; }
  if (/console\.log|debugger/.test(src)) { console.error(f, "debug leftover"); bad++; }
  if (["physics.js", "tuning.js", "level.js"].includes(f) && /Math\.random|Date\.now|performance\.|document\.|window\./.test(src)) { console.error(f, "sim must stay pure"); bad++; }
}
console.log(bad ? `lint: ${bad} problem(s)` : "lint: ok"); process.exit(bad ? 1 : 0);
