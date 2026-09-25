import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Wallet } from "ethers"
import { requestJson, endpoint, endpointLabel } from "../src/network.js"
import { CHAIN_URL, loadCatalog, makeCatalog, normalizeLists, rpcCandidates, privacyLabel } from "../src/catalog.js"
import { broadcastPrompt, signedTransaction, submitTransaction } from "../src/broadcast.js"
import { buildTransaction } from "../src/transaction.js"

const recipient = "0x2222222222222222222222222222222222222222"
const rawChains = [
  {
    chainId: 31337,
    name: "Local fixture",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [{ url: "https://rpc.example.test/private-path", tracking: "none" }],
  },
]
const rawTokens = {
  tokens: [{ chainId: 31337, symbol: "FIXTURE", name: "Fixture token", address: recipient, decimals: 0 }],
}
async function temp(t) {
  const path = await mkdtemp(join(tmpdir(), "ledger-online-test-"))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}
async function server(t, handler) {
  const instance = createServer(handler)
  instance.listen(0, "127.0.0.1")
  await once(instance, "listening")
  t.after(
    () =>
      new Promise((resolve) => {
        instance.close(resolve)
        instance.closeAllConnections()
      }),
  )
  return `http://127.0.0.1:${instance.address().port}`
}
const wallet = Wallet.createRandom()
const unsigned = buildTransaction({
  chainId: 31337,
  nonce: 0,
  to: recipient,
  value: 0,
  data: "0x",
  gasLimit: 21000,
  maxPriorityFeePerGas: 1,
  maxFeePerGas: 2,
})
unsigned.signature = wallet.signingKey.sign(unsigned.unsignedHash)
const serialized = unsigned.serialized

test("RPC URLs reject insecure remote endpoints and keep credentials out of labels", () => {
  assert.equal(endpoint("http://localhost:8545").hostname, "127.0.0.1")
  assert.equal(endpoint("http://[::1]:8545", { localOnly: true }).hostname, "[::1]")
  assert.equal(endpointLabel("https://rpc.example.test/secret?token=secret"), "https://rpc.example.test")
  for (const value of [
    "http://remote.test",
    "https://user:password@rpc.test",
    "https://rpc.test/#fragment",
    "file:///tmp/x",
    "https://rpc.test/${KEY}",
    "https://rpc.test/\nsecret",
  ])
    assert.throws(() => endpoint(value))
  assert.throws(() => endpoint("https://remote.test", { localOnly: true }), /loopback/)
})

test("metadata labels are sanitized; invalid networks and tokens are skipped", () => {
  const result = normalizeLists(
    [
      ...rawChains,
      { ...rawChains[0], chainId: 3, nativeCurrency: { symbol: "X", decimals: 6 } },
      { ...rawChains[0], chainId: 4, name: "name\x1b[2J\n\u202e" },
    ],
    {
      tokens: [
        ...rawTokens.tokens,
        { ...rawTokens.tokens[0], address: "not-an-EVM-address" },
        { ...rawTokens.tokens[0], decimals: 256 },
      ],
    },
  )
  assert.equal(result.tokens.length, 1)
  assert.equal(result.tokens[0].decimals, 0)
  assert.equal(result.chains.length, 2)
  assert.doesNotMatch(result.chains[1].name, /[\x1b\n\u202e]/)
})

test("common entries stay first and remote metadata cannot replace built-in contracts or decimals", () => {
  const base = makeCatalog()
  const usdc = base.tokens[1].find((row) => row.symbol === "USDC")
  const catalog = makeCatalog({
    chains: [
      { id: "1", name: "Spoof", symbol: "NO", rpc: [] },
      { id: "31338", name: "Test", isTestnet: true },
    ],
    tokens: [{ ...usdc, chainId: 1, decimals: 0, symbol: "Fake" }],
  })
  assert.equal(catalog.chains[0].name, "Ethereum")
  assert.ok(!catalog.chains.some((row) => row.id === "31338"))
  assert.equal(catalog.tokens[1][0].symbol, "USDC")
  assert.equal(catalog.tokens[1][0].decimals, 6)
  assert.ok(
    makeCatalog(
      { chains: [{ id: "31338", name: "Test", isTestnet: true }], tokens: [] },
      { testnets: true },
    ).chains.some((row) => row.id === "31338"),
  )
})

test("RPC ordering uses attributed no-logging claims without probing any endpoint", () => {
  const rows = rpcCandidates([
    { url: "https://z.example.test", tracking: "none" },
    { url: "https://public.1rpc.io/eth" },
    { url: "https://a.example.test", tracking: "yes" },
    "http://remote.test",
    "https://rpc.test/YOUR_API_KEY",
    "https://z.example.test",
  ])
  assert.equal(rows.length, 3)
  assert.equal(rows[0].url, "https://public.1rpc.io/eth")
  assert.match(privacyLabel(rows[0]), /claims.*unverified/)
  assert.equal(rows[1].tracking, "none")
  assert.deepEqual(rpcCandidates(rows, { localOnly: true }), [])
})

test("offline defaults touch neither the metadata cache nor the network", async (t) => {
  const directory = await temp(t)
  const catalog = await loadCatalog({ path: join(directory, "lists.json"), request: () => assert.fail("network") })
  assert.equal(catalog.chains[0].id, "1")
  assert.deepEqual(await readdir(directory), [])
})

test("public lists cache atomically with owner-only permissions, and work offline", async (t) => {
  const path = join(await temp(t), "lists.json")
  const calls = []
  const request = async (url) => {
    calls.push(url)
    return url.includes("chainlist") ? rawChains : rawTokens
  }
  const result = await loadCatalog({ online: true, path, now: 1000, request })
  assert.equal(calls.length, 2)
  assert.equal(result.tokens[31337][0].decimals, 0)
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  const raw = JSON.parse(await readFile(path, "utf8"))
  assert.deepEqual(Object.keys(raw).sort(), ["chains", "savedAt", "tokens"])
  const cached = await loadCatalog({
    useLists: true,
    path,
    now: 864001001,
    request: () => assert.fail("offline request"),
  })
  assert.equal(cached.tokens[31337][0].symbol, "FIXTURE")
  await loadCatalog({ online: true, path, now: 1001, request: () => assert.fail("fresh-cache request") })
  const fallback = await loadCatalog({
    online: true,
    path,
    now: 864001001,
    request: async () => {
      throw new Error("private credential must not appear")
    },
  })
  assert.equal(fallback.failed, true)
  assert.match(fallback.status, /previous validated cache/)
  assert.doesNotMatch(fallback.status, /private credential/)
})

test("no-cache ignores saved data and creates no files", async (t) => {
  const directory = await temp(t)
  const path = join(directory, "lists.json")
  await writeFile(path, "untrusted existing content")
  const result = await loadCatalog({
    online: true,
    noCache: true,
    path,
    request: async (url) => (url.includes("chainlist") ? rawChains : rawTokens),
  })
  assert.equal(result.tokens[31337][0].decimals, 0)
  assert.equal(await readFile(path, "utf8"), "untrusted existing content")
  assert.deepEqual(await readdir(directory), ["lists.json"])
})

test("a failed list download waits for the other request before offline signing can start", async () => {
  const { promise, resolve } = Promise.withResolvers()
  let loaded = false
  const task = loadCatalog({
    online: true,
    noCache: true,
    request: async (url) => {
      if (url === CHAIN_URL) throw new Error("fixture failure")
      return promise
    },
  }).then((catalog) => {
    loaded = true
    return catalog
  })
  try {
    await new Promise(setImmediate)
    assert.equal(loaded, false)
  } finally {
    resolve(rawTokens)
  }
  assert.equal((await task).failed, true)
})

test("HTTP client blocks redirects and bounds responses without echoing URLs", async (t) => {
  let targetHits = 0
  const url = await server(t, (req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/target" })
      res.end()
    } else if (req.url === "/target") {
      targetHits++
      res.end("{}")
    } else if (req.url === "/error-stream") {
      res.writeHead(503)
      res.write("partial error body")
    } else if (req.url === "/big") res.end(JSON.stringify("x".repeat(100)))
    else {
      res.writeHead(403)
      res.end("secret error body")
    }
  })
  await assert.rejects(requestJson(url + "/redirect"), /redirect blocked/)
  assert.equal(targetHits, 0)
  await assert.rejects(requestJson(url + "/error-stream"), /HTTP 503/)
  await assert.rejects(requestJson(url + "/big", { maxBytes: 30 }), /size limit/)
  await assert.rejects(requestJson(url + "/credential?secret=yes"), /^Error: Endpoint returned HTTP 403\.$/)
})

test("HTTP client enforces a total deadline and rejects truncated/invalid JSON", async (t) => {
  const url = await server(t, (req, res) => {
    if (req.url === "/hang") return
    if (req.url === "/truncated") {
      res.writeHead(200)
      res.write('{"x":')
      setImmediate(() => res.destroy())
      return
    }
    res.end("not JSON")
  })
  await assert.rejects(requestJson(url + "/hang", { timeout: 50 }), /timed out/)
  await assert.rejects(requestJson(url + "/truncated"), /connection failed/)
  await assert.rejects(requestJson(url), /invalid JSON/)
})

test("loopback requests bypass environment proxies", async (t) => {
  let proxyHits = 0
  const proxy = await server(t, (_, res) => {
    proxyHits++
    res.end("{}")
  })
  const direct = await server(t, (_, res) => res.end('{"direct":true}'))
  const previous = process.env.HTTP_PROXY
  process.env.HTTP_PROXY = proxy
  t.after(() => {
    if (previous === undefined) delete process.env.HTTP_PROXY
    else process.env.HTTP_PROXY = previous
  })
  assert.deepEqual(await requestJson(direct, { localOnly: true }), { direct: true })
  assert.equal(proxyHits, 0)
})

for (const scenario of ["approve", "decline", "wrong-chain", "wrong-hash", "rpc-error", "disconnect"]) {
  test(`broadcast to a local fixture: ${scenario}`, async (t) => {
    const calls = []
    const url = await server(t, (req, res) => {
      let body = ""
      req.on("data", (part) => (body += part))
      req.on("end", () => {
        const call = JSON.parse(body)
        calls.push(call)
        if (call.method === "eth_sendRawTransaction" && scenario === "disconnect") {
          req.socket.destroy()
          return
        }
        const result =
          call.method === "eth_chainId"
            ? scenario === "wrong-chain"
              ? "0x1"
              : "0x7a69"
            : scenario === "wrong-hash"
              ? "0x" + "00".repeat(32)
              : unsigned.hash
        res.end(
          JSON.stringify(
            call.method === "eth_sendRawTransaction" && scenario === "rpc-error"
              ? { jsonrpc: "2.0", id: call.id, error: { code: -32000, message: "credential-leak" } }
              : { jsonrpc: "2.0", id: call.id, result },
          ),
        )
      })
    })
    let approvals = 0
    const task = submitTransaction(serialized, url, {
      localOnly: true,
      approve: async (tx) => {
        approvals++
        assert.equal(tx.hash, unsigned.hash)
        return scenario !== "decline"
      },
    })
    if (scenario === "wrong-chain") {
      await assert.rejects(task, /chain ID does not match/)
      assert.equal(approvals, 0)
    } else if (["wrong-hash", "rpc-error", "disconnect"].includes(scenario))
      await assert.rejects(task, /Broadcast outcome unknown.*Do not resend automatically/)
    else assert.equal((await task).sent, scenario === "approve")
    assert.deepEqual(
      calls.map((row) => row.method),
      ["eth_chainId", ...(["decline", "wrong-chain"].includes(scenario) ? [] : ["eth_sendRawTransaction"])],
    )
    assert.deepEqual(calls[0].params, [])
    if (calls.length === 2) assert.deepEqual(calls[1].params, [serialized])
  })
}

test("unsupported signed payloads are rejected before contacting an RPC", async () => {
  assert.throws(() => signedTransaction("not a transaction"))
  await assert.rejects(
    submitTransaction(unsigned.unsignedSerialized, "http://127.0.0.1:8545", { request: () => assert.fail("network") }),
    /valid signed/,
  )
  await assert.rejects(
    submitTransaction(serialized, "https://remote.test", { localOnly: true, request: () => assert.fail("network") }),
    /loopback/,
  )
})

test("declining broadcast sends no requests and offers no RPC picker", async () => {
  await broadcastPrompt(serialized, {
    catalog: makeCatalog(),
    ui: {
      confirm: async (options) => {
        assert.equal(options.initialValue, false)
        return false
      },
      autocomplete: () => assert.fail("picker"),
    },
    request: () => assert.fail("network"),
  })
})

test("invalid RPC envelopes stop before broadcast approval", async () => {
  for (const response of [
    { jsonrpc: "2.0", id: 99, result: "0x7a69" },
    { jsonrpc: "1.0", id: 1, result: "0x7a69" },
    { jsonrpc: "2.0", id: 1, error: { message: "secret" } },
  ]) {
    await assert.rejects(
      submitTransaction(serialized, "http://127.0.0.1:8545", {
        request: async () => response,
        approve: () => assert.fail("approval"),
      }),
      /^Error: RPC returned an error or an invalid response\.$/,
    )
  }
})

test("cache write failures remain visible to refresh-only callers", async (t) => {
  const directory = await temp(t)
  const file = join(directory, "not-a-directory")
  await writeFile(file, "fixture")
  const result = await loadCatalog({
    refresh: true,
    path: join(file, "lists.json"),
    request: async (url) => (url.includes("chainlist") ? rawChains : rawTokens),
  })
  assert.equal(result.saved, false)
  assert.match(result.status, /could not save cache/)
})

test("approval cannot change the signed bytes selected for broadcast", async () => {
  const calls = []
  const result = await submitTransaction(serialized, "http://127.0.0.1:8545", {
    approve: async (tx) => {
      tx.nonce = 9
      return true
    },
    request: async (_, { payload }) => {
      calls.push(payload)
      return { jsonrpc: "2.0", id: payload.id, result: payload.method === "eth_chainId" ? "0x7a69" : unsigned.hash }
    },
  })
  assert.deepEqual(calls[1].params, [serialized])
  assert.equal(result.hash, unsigned.hash)
})
