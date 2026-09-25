import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const cli = new URL("../src/index.js", import.meta.url)
const run = (...args) => spawnSync(process.execPath, [cli.pathname, ...args], { encoding: "utf8", timeout: 10000 })
test("help and version work without a Ledger or a terminal", () => {
  const help = run("--help")
  assert.equal(help.status, 0)
  assert.match(help.stdout, /No RPC is used/)
  assert.equal(help.stderr, "")
  const version = run("--version")
  assert.equal(version.status, 0)
  assert.equal(version.stdout.trim(), JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version)
})
test("unknown arguments and non-terminal signing fail clearly", () => {
  assert.equal(run("--anything").status, 2)
  const noTerminal = run()
  assert.equal(noTerminal.status, 2)
  assert.match(noTerminal.stderr, /requires a terminal/)
  assert.doesNotMatch(noTerminal.stderr, /node-hid|stack|at file:/)
})

test("conflicting online options fail before any download", () => {
  for (const args of [
    ["--online", "--local-only"],
    ["--refresh-lists", "--local-only"],
    ["--refresh-lists", "--broadcast"],
    ["--refresh-lists", "--no-cache"],
  ]) {
    const result = run(...args)
    assert.equal(result.status, 2)
    assert.doesNotMatch(result.stdout + result.stderr, /Downloaded|credential/)
  }
})
