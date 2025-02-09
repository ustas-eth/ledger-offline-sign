import { setTimeout } from "node:timers/promises"
import TransportNodeHID from "@ledgerhq/hw-transport-node-hid"
import AppETH from "@ledgerhq/hw-app-eth"
import { spinner, cancel } from "@clack/prompts"

export async function waitLedger(derivationPath) {
  const s = spinner()

  s.start("Connect your Ledger and run Ethereum")

  const result = { transport: undefined, app: undefined, address: undefined }

  while (true) {
    try {
      // connect to a Ledger
      result.transport = await TransportNodeHID.default.create()

      // create an Ethereum app
      result.app = new AppETH.default(result.transport)

      // get the address by the derivation path
      let { address } = await result.app.getAddress(derivationPath)
      result.address = address

      break
    } catch (error) {
      await setTimeout(1000)
    }
  }

  s.stop(`Connected to Ledger`)

  return result
}

export async function signTransaction(derivationPath, prevAddress, unsignedBytecode) {
  const { address: addressNew, app } = await waitLedger(derivationPath)

  // make sure that the address hasn't changed
  if (prevAddress !== addressNew) throw new Error("Address mismatch")

  // request to sign the transaction
  // the resolution is set to null to avoid any online queries
  return app.signTransaction(derivationPath, unsignedBytecode.slice(2), null).catch((error) => {
    if (error.statusText === "CONDITIONS_OF_USE_NOT_SATISFIED") {
      cancel("The request was cancelled by the user.")
      process.exit(0)
    } else if (error.name === "EthAppPleaseEnableContractData") {
      cancel("Enable Blind signing or Debug (Contract) data on your Ledger.")
      process.exit(0)
    }

    console.error(error)
    throw error
  })
}
