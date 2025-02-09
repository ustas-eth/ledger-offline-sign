import { Transaction, Signature } from "ethers"
import { intro, outro, isCancel, cancel, note, confirm } from "@clack/prompts"
import { wrapString, displayTransaction, transformLedgerSigtoEthers } from "./lib.js"

import { signTransaction, waitLedger } from "./ledger.js"

import { getDerivationPath } from "./input/walletData.js"
import { getChainId } from "./input/chainid.js"
import { getTxType } from "./input/txType.js"
import { getNonce } from "./input/nonce.js"
import { getCalldata } from "./input/calldata.js"
import { getGas } from "./input/gas.js"

export async function run() {
  intro(`Welcome to the Ledger Offline Sign (free of charge and telemetry)!`)

  const derivationPath = await getDerivationPath()
  const { address } = await waitLedger(derivationPath)

  note(`Your account has been found: ${address}`)

  // enter the transaction details
  const tx = new Transaction()

  tx.chainId = await getChainId()
  tx.type = await getTxType()
  tx.nonce = await getNonce()

  const calldata = await getCalldata(tx.chainId)

  tx.to = calldata.to
  tx.data = calldata.data
  tx.value = calldata.value

  const gas = await getGas(tx.type, tx.data)

  tx.maxPriorityFeePerGas = gas.maxPriorityFeePerGas
  tx.maxFeePerGas = tx.maxPriorityFeePerGas + gas.maxBaseFee
  tx.gasLimit = gas.gasLimit

  const unsignedBytecode = tx.unsignedSerialized

  // display the unsigned transaction
  note(`${displayTransaction(tx, address)}\n\nTransaction bytecode:\n${wrapString(unsignedBytecode)}`)

  const confirmation = await confirm({
    message: "Do you want to sign the transaction?",
    initialValue: true,
  })

  if (!confirmation || isCancel(confirmation)) {
    cancel("Operation cancelled.")
    process.exit(0)
  }

  // call the inner function to sign the transaction
  const result = await signTransaction(derivationPath, address, unsignedBytecode)

  tx.signature = Signature.from(transformLedgerSigtoEthers(result))

  // display the signed transaction
  outro(`Signed transaction (bytes to broadcast): \n\n${tx.serialized}`)
}
