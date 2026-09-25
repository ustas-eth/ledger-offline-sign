import { createRequire } from "node:module"
import { address, attachSignature, derivationPath } from "./transaction.js"

const require = createRequire(import.meta.url)

export function loadLedger() {
  try {
    // Ledger's CommonJS entry points also work with its older native HID binding.
    const Transport = require("@ledgerhq/hw-transport-node-hid").default
    const App = require("@ledgerhq/hw-app-eth").default
    return { Transport, App }
  } catch {
    throw new Error("Cannot load Ledger USB support. Reinstall dependencies; see the README's Linux setup notes.")
  }
}

export function ledgerError(error) {
  if (error.statusCode === 0x6985 || error.statusText === "CONDITIONS_OF_USE_NOT_SATISFIED")
    return new Error("Request rejected on the Ledger. Nothing was broadcast.")
  if (error.name === "EthAppPleaseEnableContractData")
    return new Error(
      "The device requires blind signing for this calldata. Enable it only if you understand and trust the call.",
    )
  if (error.statusCode === 0x6d00 || error.statusCode === 0x6e00 || error.statusCode === 0x6511)
    return new Error("Unlock the Ledger and open the Ethereum app, then try again.")
  return new Error(
    "Ledger communication failed. Check the cable, unlock the device, open Ethereum, and close other wallet apps.",
  )
}

export async function openLedger(path, dependencies = loadLedger()) {
  const checkedPath = derivationPath(path)
  const { Transport, App } = dependencies
  let transport
  try {
    transport = await Transport.create(10000, 10000)
    transport.setExchangeTimeout(120000)
    const app = new App(transport)
    let closed = false
    return {
      async getAddress(display = true) {
        try {
          return address((await app.getAddress(checkedPath, display)).address)
        } catch (error) {
          throw ledgerError(error)
        }
      },
      async sign(unsignedSerialized, expectedAddress) {
        let result
        try {
          const current = address((await app.getAddress(checkedPath, false)).address)
          if (current !== address(expectedAddress)) throw new Error("ACCOUNT_CHANGED")
          // Explicit null is essential: undefined invokes Ledger's online resolution.
          result = await app.signTransaction(checkedPath, unsignedSerialized.slice(2), null)
        } catch (error) {
          if (error.message === "ACCOUNT_CHANGED")
            throw new Error("Ledger account changed. Start again and verify the address.")
          throw ledgerError(error)
        }
        return attachSignature(unsignedSerialized, result, expectedAddress)
      },
      async close() {
        if (closed) return
        closed = true
        try {
          await transport.close()
        } catch {
          throw new Error("Could not close the Ledger connection. Disconnect the device before retrying.")
        }
      },
    }
  } catch (error) {
    if (transport) await transport.close().catch(() => {})
    throw ledgerError(error)
  }
}
