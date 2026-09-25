import test from "node:test"
import { CANCEL_SYMBOL } from "@clack/prompts"
import assert from "node:assert/strict"
import { Wallet } from "ethers"
import { openLedger } from "../src/ledger.js"
import { buildTransaction } from "../src/transaction.js"
import { run } from "../src/offline-sign.js"
import { Cancelled } from "../src/lib.js"

const wallet = Wallet.createRandom()
const path = "44'/60'/0'/0/0"
const tx = buildTransaction({
  chainId: 1,
  nonce: 0,
  to: wallet.address,
  value: 0,
  data: "0x",
  gasLimit: 21000,
  maxPriorityFeePerGas: 1,
  maxFeePerGas: 2,
})
function device({ changed = false, reject = false, failConstructor = false } = {}) {
  const calls = []
  const transport = {
    setExchangeTimeout: (ms) => calls.push(["timeout", ms]),
    close: async () => calls.push(["close"]),
  }
  class App {
    constructor() {
      if (failConstructor) throw new Error("fixture")
    }
    async getAddress(...args) {
      calls.push(["address", ...args])
      return { address: changed ? "0x1111111111111111111111111111111111111111" : wallet.address }
    }
    async signTransaction(...args) {
      calls.push(["sign", ...args])
      if (reject) throw Object.assign(new Error("must not leak raw error"), { statusCode: 0x6985 })
      const signature = wallet.signingKey.sign(tx.unsignedHash)
      return { r: signature.r.slice(2), s: signature.s.slice(2), v: signature.yParity.toString(16) }
    }
  }
  return {
    calls,
    dependencies: {
      Transport: {
        create: async (...args) => {
          calls.push(["open", ...args])
          return transport
        },
      },
      App,
    },
  }
}

test("one connection, on-device address verification, null metadata, verified signature and idempotent close", async () => {
  const fixture = device()
  const session = await openLedger(path, fixture.dependencies)
  assert.equal(await session.getAddress(), wallet.address)
  assert.equal((await session.sign(tx.unsignedSerialized, wallet.address)).from, wallet.address)
  await session.close()
  await session.close()
  assert.deepEqual(
    fixture.calls.filter(([name]) => name === "address"),
    [
      ["address", path, true],
      ["address", path, false],
    ],
  )
  assert.deepEqual(
    fixture.calls.find(([name]) => name === "sign"),
    ["sign", path, tx.unsignedSerialized.slice(2), null],
  )
  assert.equal(fixture.calls.filter(([name]) => name === "close").length, 1)
  assert.equal(fixture.calls.filter(([name]) => name === "open").length, 1)
})

test("a changed account stops before signing", async () => {
  const fixture = device({ changed: true })
  const session = await openLedger(path, fixture.dependencies)
  await assert.rejects(session.sign(tx.unsignedSerialized, wallet.address), /account changed/)
  await session.close()
  assert.ok(!fixture.calls.some(([name]) => name === "sign"))
})

test("device rejection is actionable without exposing the raw error", async () => {
  const fixture = device({ reject: true })
  const session = await openLedger(path, fixture.dependencies)
  await assert.rejects(session.sign(tx.unsignedSerialized, wallet.address), /^Error: Request rejected on the Ledger/)
  await session.close()
})

test("transport is closed if Ethereum app construction fails", async () => {
  const fixture = device({ failConstructor: true })
  await assert.rejects(openLedger(path, fixture.dependencies), /communication failed/)
  assert.ok(fixture.calls.some(([name]) => name === "close"))
})

for (const outcome of ["cancel", "ctrl-c", "address-error", "sign-error", "success"]) {
  test(`interactive flow closes the device on ${outcome}`, async (t) => {
    const calls = []
    const logs = []
    t.mock.method(console, "log", (value) => logs.push(value))
    const ui = {
      intro() {},
      note() {},
      outro() {},
      async confirm(options) {
        assert.equal(options.initialValue, false)
        return outcome === "ctrl-c" ? CANCEL_SYMBOL : outcome !== "cancel"
      },
    }
    const session = {
      async getAddress(display) {
        assert.equal(display, true)
        if (outcome === "address-error") throw new Error("address failed")
        return wallet.address
      },
      async sign(serialized, from) {
        calls.push("sign")
        assert.equal(serialized, tx.unsignedSerialized)
        assert.equal(from, wallet.address)
        if (outcome === "sign-error") throw new Error("sign failed")
        return { hash: "fixture-hash", serialized: "fixture-bytes" }
      },
      async close() {
        calls.push("close")
      },
    }
    const operation = run({ ui, collect: async () => ({ path, tx, metadata: {} }), connect: async () => session })
    if (outcome === "success") {
      await operation
      assert.deepEqual(logs, ["fixture-bytes"])
    } else {
      await assert.rejects(operation, outcome === "cancel" || outcome === "ctrl-c" ? Cancelled : Error)
      assert.deepEqual(logs, [])
    }
    assert.equal(calls.at(-1), "close")
    if (outcome === "cancel" || outcome === "ctrl-c") assert.ok(!calls.includes("sign"))
  })
}

test("online mode offers broadcast only after verification, device close and signed output", async (t) => {
  const order = []
  t.mock.method(console, "log", () => order.push("output"))
  await run({
    online: true,
    ui: { intro() {}, note() {}, outro() {}, confirm: async () => true },
    collect: async () => ({ path, tx, metadata: {} }),
    connect: async () => ({
      getAddress: async () => wallet.address,
      sign: async () => {
        order.push("sign")
        return { serialized: "fixture-bytes", hash: "fixture-hash" }
      },
      close: async () => order.push("close"),
    }),
    broadcast: async (bytes) => {
      assert.equal(bytes, "fixture-bytes")
      order.push("broadcast")
    },
  })
  assert.deepEqual(order, ["sign", "close", "output", "broadcast"])
})
