import { getAddress, Interface, MaxUint256, Signature, Transaction, formatUnits } from "ethers"

export const IERC20 = new Interface(["function transfer(address to, uint256 amount) returns (bool)"])

export function integer(value, { min = 0n, max = MaxUint256, name = "Value" } = {}) {
  const input = String(value).trim()
  if (!/^\d+$/.test(input)) throw new Error(`${name} must be a whole, non-negative number.`)
  const result = BigInt(input)
  if (result < min || result > max) throw new Error(`${name} must be between ${min} and ${max}.`)
  return result
}

export function amount(value, decimals = 18) {
  const precision = Number(integer(decimals, { max: 255n, name: "Decimals" }))
  const input = String(value).trim()
  if (!/^\d+(\.\d+)?$/.test(input)) throw new Error("Enter a non-negative decimal amount, without exponents.")
  const [whole, fraction = ""] = input.split(".")
  if (fraction.length > precision) throw new Error(`Use at most ${precision} decimal places.`)
  return integer(BigInt(whole) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0") || "0"))
}

export function nativeAmount(value) {
  const match = String(value)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(wei|gwei|ether)?$/)
  if (!match) throw new Error("Use an amount followed by wei, gwei, or ether; bare numbers mean wei.")
  return amount(match[1], { wei: 0, gwei: 9, ether: 18 }[match[2] || "wei"])
}

export function address(value) {
  try {
    return getAddress(String(value).trim())
  } catch {
    throw new Error("Enter a 0x address with 40 hex digits and a valid checksum (or all lowercase).")
  }
}

export function calldata(value) {
  const input = String(value).trim()
  if (!/^0x(?:[a-fA-F0-9]{2})*$/.test(input)) throw new Error("Use 0x followed by complete hex bytes.")
  if (input.length > 262146) throw new Error("Calldata exceeds this tool's 128 KiB limit.")
  return input
}

export function derivationPath(value) {
  const path = String(value).trim().replace(/^m\//, "")
  const parts = path.split("/")
  if (parts.length < 1 || parts.length > 10 || !parts.every((part) => /^\d+'?$/.test(part)))
    throw new Error("Use a BIP-32 path such as 44'/60'/0'/0/0 (up to 10 components).")
  for (const part of parts) integer(part.replace("'", ""), { max: 2147483647n, name: "Path index" })
  return path
}

export function buildTransaction(fields) {
  const maxPriorityFeePerGas = integer(fields.maxPriorityFeePerGas, { name: "Priority fee" })
  const maxFeePerGas = integer(fields.maxFeePerGas, { min: maxPriorityFeePerGas, name: "Maximum fee" })
  const tx = Transaction.from({
    type: 2,
    chainId: integer(fields.chainId, { min: 1n, max: 4294967295n, name: "Chain ID" }),
    nonce: Number(integer(fields.nonce, { max: BigInt(Number.MAX_SAFE_INTEGER), name: "Nonce" })),
    to: address(fields.to),
    value: integer(fields.value),
    data: calldata(fields.data),
    gasLimit: integer(fields.gasLimit, { min: 21000n, max: 18446744073709551615n, name: "Gas limit" }),
    maxPriorityFeePerGas,
    maxFeePerGas,
  })
  void tx.unsignedSerialized
  return tx
}

export function attachSignature(unsignedSerialized, result, expectedAddress) {
  if (!result || !/^[a-fA-F0-9]{64}$/.test(result.r) || !/^[a-fA-F0-9]{64}$/.test(result.s))
    throw new Error("Ledger returned an invalid signature.")
  // Type-2 transactions use parity, never an EIP-155 legacy chain-encoded v.
  if (!/^(00?|01|1|1b|1c)$/i.test(result.v)) throw new Error("Ledger returned invalid signature parity.")
  const tx = Transaction.from(unsignedSerialized)
  tx.signature = Signature.from({ r: `0x${result.r}`, s: `0x${result.s}`, v: parseInt(result.v, 16) })
  if (tx.unsignedSerialized !== unsignedSerialized || tx.from !== address(expectedAddress))
    throw new Error("Signature verification failed: the signer does not match the reviewed account.")
  return tx
}

export function transactionReview(tx, from, { chainName, symbol = "native", token } = {}) {
  const fee = tx.gasLimit * tx.maxFeePerGas
  const lines = [
    `Network        ${chainName || "Custom EVM chain"} (chain ID ${tx.chainId})`,
    "Transaction    EIP-1559 (type 2)",
    `From           ${address(from)}`,
    `To / contract  ${tx.to}`,
    `Nonce          ${tx.nonce}`,
    `Native value   ${formatUnits(tx.value, 18)} ${symbol} (${tx.value} wei)`,
  ]
  if (token) {
    const [recipient, units] = IERC20.decodeFunctionData("transfer", tx.data)
    lines.push(
      `Token          ${token.symbol} (${token.decimals} decimals; ${token.source || "local metadata"})`,
      `Recipient      ${recipient}`,
      `Token amount   ${formatTokenAmount(units, token.decimals)} ${token.symbol}`,
      `Token units    ${units}`,
    )
  }
  lines.push(
    `Gas limit      ${tx.gasLimit}`,
    `Priority fee   ${formatUnits(tx.maxPriorityFeePerGas, 9)} gwei / gas`,
    `Maximum fee    ${formatUnits(tx.maxFeePerGas, 9)} gwei / gas`,
    `Execution cap  ${formatUnits(fee, 18)} ${symbol}`,
    `Value + cap    ${formatUnits(tx.value + fee, 18)} ${symbol}`,
    "L2 data fees, if any, are additional. No fees or nonce were fetched.",
    `Calldata       ${(tx.data.length - 2) / 2} bytes${tx.data === "0x" ? " (empty)" : ""}`,
  )
  if (tx.data !== "0x") lines.push(...tx.data.match(/.{1,72}/g))
  return lines.join("\n")
}

export function formatTokenAmount(value, decimals) {
  const precision = Number(integer(decimals, { max: 255n }))
  const digits = value.toString().padStart(precision + 1, "0")
  return precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}`.replace(/\.?0+$/, "") : digits
}
