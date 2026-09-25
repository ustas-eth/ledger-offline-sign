// Online packaging check. It never opens a Ledger or broadcasts a transaction.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL, fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), "ledger-install-check-"))
const npm = process.platform === "win32" ? "npm.cmd" : "npm"
function execute(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
    env: { ...process.env, LEDGER_PACK_DESTINATION: temporary },
    maxBuffer: 16 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return result.stdout
}
try {
  const [packed] = JSON.parse(execute(process.execPath, ["scripts/pack.js"]))
  execute(npm, [
    "install",
    "--global",
    "--prefix",
    temporary,
    "--no-audit",
    "--no-fund",
    join(temporary, packed.filename),
  ])
  const installed =
    process.platform === "win32"
      ? join(temporary, "node_modules", "ledger-offline-sign")
      : join(temporary, "lib", "node_modules", "ledger-offline-sign")
  const require = createRequire(join(installed, "node_modules", "@ledgerhq", "hw-app-eth", "package.json"))
  for (const [name, version] of [
    ["axios", "1.20.0"],
    ["elliptic", "6.6.1"],
  ])
    assert.equal(require(`${name}/package.json`).version, version, `${name} override lost during packaging`)
  const { loadLedger } = await import(pathToFileURL(join(installed, "src", "ledger.js")))
  assert.equal(typeof loadLedger().Transport.create, "function")
  assert.match(execute(process.execPath, [join(installed, "src", "index.js"), "--help"]), /No RPC is used/)
  mkdirSync(join(installed, "tests"))
  copyFileSync(join(root, "tests", "offline-sdk.test.js"), join(installed, "tests", "offline-sdk.test.js"))
  execute(process.execPath, ["--test", join(installed, "tests", "offline-sdk.test.js")])
  console.log("Packed installation passed: dependency fixes, USB backend, help, and offline SDK signing.")
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
