import test from "node:test"
import assert from "node:assert/strict"
import { createRequire, syncBuiltinESMExports } from "node:module"
import fs from "node:fs"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import tls from "node:tls"
import dns from "node:dns"
import dgram from "node:dgram"
import { Wallet } from "ethers"
import { attachSignature, buildTransaction, IERC20 } from "../src/transaction.js"

const require = createRequire(import.meta.url)

test("installed Ledger SDK signs native, ERC-20 and custom calls without network or metadata resolution", async (t) => {
  let networkAttempts = 0
  const blocked = () => {
    networkAttempts++
    throw new Error("Network access forbidden in offline signing test")
  }
  for (const [object, method] of [
    [http, "request"],
    [http, "get"],
    [https, "request"],
    [https, "get"],
    [net.Socket.prototype, "connect"],
    [tls, "connect"],
    [dns, "lookup"],
    [dns, "resolve"],
    [dns.promises, "lookup"],
    [dns.promises, "resolve"],
    [dgram, "createSocket"],
    [globalThis, "fetch"],
  ])
    t.mock.method(object, method, blocked)
  let fileWrites = 0
  const blockedWrite = () => {
    fileWrites++
    throw new Error("Filesystem writes forbidden in offline signing test")
  }
  for (const method of [
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "createWriteStream",
    "mkdir",
    "mkdirSync",
  ])
    t.mock.method(fs, method, blockedWrite)
  for (const method of ["writeFile", "appendFile", "mkdir"]) t.mock.method(fs.promises, method, blockedWrite)
  syncBuiltinESMExports()
  const { default: App, ledgerService } = require("@ledgerhq/hw-app-eth")
  let resolutions = 0
  t.mock.method(ledgerService, "resolveTransaction", () => {
    resolutions++
    throw new Error("Online metadata resolution forbidden")
  })
  const wallet = Wallet.createRandom()
  for (const data of ["0x", IERC20.encodeFunctionData("transfer", [wallet.address, 1000000n]), "0x12345678"]) {
    const tx = buildTransaction({
      chainId: 1,
      nonce: 0,
      to: wallet.address,
      value: 0,
      data,
      gasLimit: 100000,
      maxPriorityFeePerGas: 1,
      maxFeePerGas: 2,
    })
    const signature = wallet.signingKey.sign(tx.unsignedHash)
    let commands = 0
    const transport = {
      decorateAppAPIMethods() {},
      async send(cla, ins) {
        assert.equal(cla, 0xe0)
        assert.equal(ins, 0x04)
        commands++
        return Buffer.concat([
          Buffer.from([signature.yParity]),
          Buffer.from(signature.r.slice(2), "hex"),
          Buffer.from(signature.s.slice(2), "hex"),
        ])
      },
    }
    const app = new App(transport)
    const result = await app.signTransaction("44'/60'/0'/0/0", tx.unsignedSerialized.slice(2), null)
    assert.equal(attachSignature(tx.unsignedSerialized, result, wallet.address).from, wallet.address)
    assert.ok(commands > 0)
  }
  assert.equal(networkAttempts, 0)
  assert.equal(resolutions, 0)
  assert.equal(fileWrites, 0)
})
