import * as prompts from "@clack/prompts"
import { buildTransaction, transactionReview } from "./transaction.js"
import { Cancelled, checkCancel } from "./lib.js"
import { openLedger } from "./ledger.js"
import { getDerivationPath } from "./input/walletData.js"
import { getChainId } from "./input/chainid.js"
import { getNonce } from "./input/nonce.js"
import { getCalldata } from "./input/calldata.js"
import { getGas } from "./input/gas.js"
import { makeCatalog } from "./catalog.js"
import { broadcastPrompt } from "./broadcast.js"

export async function collectTransaction(catalog = makeCatalog(), searchable = false) {
  const path = await getDerivationPath()
  const chainId = await getChainId(catalog.chains, searchable)
  const nonce = await getNonce()
  const call = await getCalldata(chainId, catalog.tokens, searchable)
  const gas = await getGas()
  const chain = catalog.chains.find((item) => item.id === String(chainId))
  return {
    path,
    tx: buildTransaction({ chainId, nonce, ...call, ...gas }),
    metadata: { chainName: chain?.name, symbol: chain?.symbol, token: call.token },
  }
}

export async function run({
  ui = prompts,
  collect,
  connect = openLedger,
  catalog = makeCatalog(),
  online = false,
  localOnly = false,
  searchable = false,
  broadcast = broadcastPrompt,
} = {}) {
  ui.intro("Ledger Offline Sign")
  ui.note(
    online || localOnly
      ? "Signing runs offline. Broadcasting is optional after signing.\nHave your nonce, fees, and contract details ready."
      : "No RPC is used. Broadcasting is disabled.\nHave your nonce, fees, and contract details ready.",
    "Signing",
  )
  const { path, tx, metadata } = await (collect ? collect() : collectTransaction(catalog, searchable))
  // Snapshot the precise payload before review and pass only that snapshot to signing.
  const unsignedSerialized = tx.unsignedSerialized
  ui.note(
    `Path: ${path}\nConnect and unlock your Ledger, open Ethereum, and close other wallet apps.\nVerify the account address on the device when prompted.`,
    "Connect Ledger",
  )
  const session = await connect(path)
  let signed
  try {
    const from = await session.getAddress(true)
    ui.note(transactionReview(tx, from, metadata), "Review every field")
    if (tx.data !== "0x")
      ui.note(
        "The terminal's decoded details are not a trusted device display.\nOffline calldata signing may require blind signing; verify the contract and raw data independently.",
        "Contract data",
      )
    if (!checkCancel(await ui.confirm({ message: "Sign this exact transaction on the Ledger?", initialValue: false })))
      throw new Cancelled("Cancelled. No signing request was sent.")
    signed = await session.sign(unsignedSerialized, from)
  } finally {
    await session.close()
  }
  ui.note(`Signer verified. Transaction hash:\n${signed.hash}`, "Signed — not broadcast")
  ui.outro("Raw signed transaction (anyone holding it can broadcast it):")
  // One uninterrupted line for copying; never write transaction data to a file.
  console.log(signed.serialized)
  if (online || localOnly) await broadcast(signed.serialized, { catalog, ui, localOnly })
  return signed
}
