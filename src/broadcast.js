import * as prompts from "@clack/prompts"
import { Transaction } from "ethers"
import { buildTransaction, IERC20, transactionReview } from "./transaction.js"
import { checkCancel, validate } from "./lib.js"
import { endpoint, endpointLabel, requestJson } from "./network.js"
import { privacyLabel, rpcCandidates } from "./catalog.js"

export function signedTransaction(value) {
  let tx
  try {
    if (typeof value !== "string" || value.length > 264192 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value.trim()))
      throw new Error()
    tx = Transaction.from(value.trim())
    if (tx.type !== 2 || !tx.isSigned() || !tx.from) throw new Error()
    const checked = buildTransaction(tx)
    if (checked.unsignedSerialized !== tx.unsignedSerialized) throw new Error()
  } catch {
    throw new Error("Enter a valid signed EIP-1559 transaction supported by this tool.")
  }
  return tx
}

async function rpc(url, method, params, id, { request, localOnly }) {
  const data = await request(url, { payload: { jsonrpc: "2.0", id, method, params }, localOnly })
  if (!data || data.jsonrpc !== "2.0" || data.id !== id || data.error || !Object.hasOwn(data, "result"))
    throw new Error("RPC returned an error or an invalid response.")
  return data.result
}

export async function submitTransaction(serialized, url, { approve, localOnly = false, request = requestJson } = {}) {
  const tx = signedTransaction(serialized)
  const raw = tx.serialized
  const hash = tx.hash
  const target = endpoint(url, { localOnly }).href
  const chain = await rpc(target, "eth_chainId", [], 1, { request, localOnly })
  if (typeof chain !== "string" || !/^0x[0-9a-fA-F]+$/.test(chain) || BigInt(chain) !== tx.chainId)
    throw new Error("RPC chain ID does not match the signed transaction. Nothing was sent for broadcast.")
  if (!approve || (await approve(tx)) !== true) return { sent: false, hash }
  try {
    const result = await rpc(target, "eth_sendRawTransaction", [raw], 2, { request, localOnly })
    if (
      typeof result !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(result) ||
      result.toLowerCase() !== hash.toLowerCase()
    )
      throw new Error()
  } catch {
    // A failed response does not establish whether the provider relayed the bytes.
    throw new Error(`Broadcast outcome unknown. Do not resend automatically. Check transaction ${hash} independently.`)
  }
  return { sent: true, hash }
}

export async function chooseRpc(chain, { ui = prompts, localOnly = false } = {}) {
  const candidates = rpcCandidates(chain?.rpc, { localOnly })
  const selected = checkCancel(
    await ui.autocomplete({
      message: "Broadcast RPC (only the selected endpoint is checked)",
      options: [
        ...candidates.map((row, index) => ({
          value: String(index),
          label: `${endpointLabel(row.url)} · endpoint ${index + 1}`,
          hint: privacyLabel(row),
        })),
        { value: "local", label: "Local node", hint: "http://127.0.0.1:8545" },
        { value: "custom", label: "Custom RPC", hint: localOnly ? "loopback only" : "HTTPS, or HTTP on loopback" },
      ],
    }),
  )
  if (selected === "local") return "http://127.0.0.1:8545"
  if (selected === "custom")
    return endpoint(
      checkCancel(
        await ui.password({
          message: "RPC URL (hidden; not saved)",
          validate: validate((value) => endpoint(value, { localOnly })),
        }),
      ),
      { localOnly },
    ).href
  return candidates[Number(selected)].url
}

export async function broadcastPrompt(value, { catalog, ui = prompts, localOnly = false, request = requestJson } = {}) {
  if (!checkCancel(await ui.confirm({ message: "Broadcast this signed transaction now?", initialValue: false }))) return
  const tx = signedTransaction(value)
  const chain = catalog.chains.find((row) => row.id === String(tx.chainId))
  const url = await chooseRpc(chain, { ui, localOnly })
  ui.note(
    `Selected RPC: ${endpointLabel(url)}\nThe RPC receives your IP and signed transaction. Broadcasting makes the transaction public.\nProvider privacy labels are claims, not verified guarantees.`,
    "Broadcast",
  )
  const result = await submitTransaction(tx.serialized, url, {
    request,
    localOnly,
    approve: async () =>
      checkCancel(
        await ui.confirm({
          message: `RPC reports chain ${tx.chainId}. Send this transaction to ${endpointLabel(url)}?`,
          initialValue: false,
        }),
      ),
  })
  ui.note(
    result.sent
      ? `RPC accepted ${result.hash}\nThis does not confirm inclusion or execution.`
      : "Not broadcast. Keep the signed transaction if you need it later.",
    result.sent ? "Submitted" : "Cancelled",
  )
  return result
}

export async function broadcastExisting({ catalog, ui = prompts, localOnly = false, request = requestJson }) {
  ui.intro("Broadcast signed transaction")
  const raw = checkCancel(
    await ui.password({ message: "Raw signed transaction (hidden; not saved)", validate: validate(signedTransaction) }),
  )
  const tx = signedTransaction(raw)
  const chain = catalog.chains.find((row) => row.id === String(tx.chainId))
  let token = catalog.tokens[tx.chainId]?.find((row) => row.value === tx.to)
  try {
    if (tx.data.length !== 138 || tx.value !== 0n) token = undefined
    else IERC20.decodeFunctionData("transfer", tx.data)
  } catch {
    token = undefined
  }
  ui.note(
    transactionReview(tx, tx.from, { chainName: chain?.name, symbol: chain?.symbol, token }),
    "Signed transaction",
  )
  ui.note(tx.hash, "Transaction hash")
  return broadcastPrompt(tx.serialized, { catalog, ui, localOnly, request })
}
