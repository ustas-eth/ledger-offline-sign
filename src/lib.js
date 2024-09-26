import { select, text, isCancel, cancel } from "@clack/prompts"
import { Interface } from "ethers"

export function checkCancel(value) {
  if (isCancel(value)) {
    cancel("Operation cancelled.")
    process.exit(0)
  }
}

export async function selectOrCustom(selectData, textData) {
  const result = await select(selectData)
  checkCancel(result)

  const custom = result != "Custom" ? result : await text(textData)
  checkCancel(custom)

  return custom
}

export async function textOrRevert(textData) {
  const result = await text(textData)
  checkCancel(result)
  return result
}

export async function selectOrRevert(selectData) {
  const result = await select(selectData)
  checkCancel(result)
  return result
}

export function wrapString(string, lineLength = 60) {
  const chunks = string.match(new RegExp(`.{1,${lineLength}}`, "g")) || []
  const wrappedString = chunks.join("\n")

  return wrappedString
}

export function displayTransaction(tx, from) {
  const { chainId, type, to, nonce, value, maxPriorityFeePerGas, maxFeePerGas, data } = tx

  return `chain id: ${chainId}\ntype: ${type}\nfrom: ${from}\nto: ${to}\nnonce: ${nonce}\nvalue: ${value}\nmaxPriorityFeePerGas: ${maxPriorityFeePerGas}\nmaxFeePerGas: ${maxFeePerGas}\ndata:\n${wrapString(data, 60)}`
}

export function transformLedgerSigtoEthers({ r, s, v }) {
  return {
    r: "0x" + r,
    s: "0x" + s,
    v: "0x" + v,
  }
}

export const IERC20 = Interface.from([
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
])
