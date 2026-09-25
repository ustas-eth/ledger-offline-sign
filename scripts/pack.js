// Build a publishable CLI with the reviewed SDK dependency closure.
// npm ignores dependency overrides in consumer installs, and combining overrides
// with bundles in the development manifest can hang npm installs (#9227).
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const stage = mkdtempSync(join(tmpdir(), "ledger-pack-"))
const dryRun = process.argv.includes("--dry-run")
const destination = resolve(process.env.LEDGER_PACK_DESTINATION || join(root, "dist"))
try {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  delete manifest.overrides
  delete manifest.devDependencies
  manifest.scripts = { start: manifest.scripts.start }
  manifest.bundleDependencies = ["@ledgerhq/hw-app-eth"]
  writeFileSync(join(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n")
  for (const path of [...manifest.files, "node_modules"])
    cpSync(join(root, path), join(stage, path), { recursive: true, verbatimSymlinks: true })
  if (!dryRun) mkdirSync(destination, { recursive: true })
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["pack", "--json", "--ignore-scripts", ...(dryRun ? ["--dry-run"] : ["--pack-destination", destination])],
    { cwd: stage, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
  )
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Package build failed")
  process.stdout.write(result.stdout)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
