import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

test("published package includes the reviewed SDK and excludes project fixtures and workspace files", () => {
  const result = spawnSync(process.execPath, ["scripts/pack.js", "--dry-run"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  })
  assert.equal(result.status, 0, result.stderr)
  const paths = JSON.parse(result.stdout)[0].files.map((file) => file.path)
  for (const path of ["src/index.js", "src/ledger.js", "README.md", "LICENSE"]) assert.ok(paths.includes(path), path)
  assert.ok(paths.includes("node_modules/@ledgerhq/hw-app-eth/package.json"))
  assert.ok(!paths.some((path) => /^node_modules\/(node-hid|usb)\//.test(path)))
  for (const path of paths)
    assert.match(path, /^(src\/|node_modules\/|docs\/privacy\.md$|package\.json$|README\.md$|LICENSE$)/)
})
