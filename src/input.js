import { input, selectOrCustom, selectValue } from "./lib.js"
import {
  address,
  amount,
  buildTransaction,
  calldata,
  derivationPath,
  integer,
  IERC20,
  nativeAmount,
} from "./transaction.js"

export async function collectTransaction(catalog, searchable = false) {
  const path = await getDerivationPath()
  const chainId = await getChainId(catalog.chains, searchable)
  const nonce = await input(
    {
      message: "Nonce (obtain it before going offline; include pending transactions)",
      placeholder: "No network lookup",
    },
    (value) => integer(value, { max: BigInt(Number.MAX_SAFE_INTEGER), name: "Nonce" }),
  )
  const call = await getCalldata(chainId, catalog.tokens, searchable)
  const gas = await getGas()
  const chain = catalog.chains.find((item) => item.id === String(chainId))
  return {
    path,
    tx: buildTransaction({ chainId, nonce, ...call, ...gas }),
    metadata: { chainName: chain?.name, symbol: chain?.symbol, token: call.token },
  }
}

async function getDerivationPath() {
  const mode = await selectValue({
    message: "Ledger account",
    options: [
      { value: "live", label: "Ledger Live", hint: "44'/60'/account'/0/0" },
      { value: "custom", label: "Custom derivation path" },
    ],
  })
  if (mode === "custom") return input({ message: "Derivation path" }, derivationPath)
  const index = await input(
    {
      message: "Account index (0 is the first account)",
      initialValue: "0",
    },
    (value) => integer(value, { max: 2147483647n, name: "Account index" }),
  )
  return `44'/60'/${index}'/0/0`
}

async function getChainId(available, searchable) {
  return selectOrCustom(
    {
      message: "Network",
      searchable,
      initialValue: "1",
      options: [
        ...available.map(({ id, name }) => ({
          value: id,
          label: searchable ? `${name} (${id})` : name,
          hint: `chain ID ${id}`,
        })),
        { value: "Custom", label: "Custom chain ID" },
      ],
    },
    { message: "Chain ID (must support EIP-1559)" },
    (value) => integer(value, { min: 1n, max: 4294967295n, name: "Chain ID" }),
  )
}

async function getCalldata(chainId, tokenLists, searchable) {
  const kind = await selectValue({
    message: "Transaction",
    options: [
      { value: "native", label: "Native transfer" },
      { value: "erc20", label: "ERC-20 transfer" },
      { value: "custom", label: "Contract call", hint: "custom calldata" },
    ],
  })
  if (kind === "erc20") {
    const tokens = tokenLists[chainId] ?? []
    const to = await selectOrCustom(
      {
        message: "Token (local metadata; verify the contract)",
        searchable,
        options: [
          ...tokens.map((token) => ({ value: token.value, label: token.symbol, hint: token.value })),
          { value: "Custom", label: "Custom token" },
        ],
      },
      { message: "Token contract address" },
      address,
    )
    const known = tokens.find((token) => address(token.value) === to)
    const decimals =
      known?.decimals ??
      Number(
        await input({ message: "Token decimals (from the contract, not fetched)" }, (value) =>
          integer(value, { max: 255n, name: "Decimals" }),
        ),
      )
    const recipient = await input({ message: "Token recipient" }, address)
    const units = await input({ message: `Amount in ${known?.symbol ?? "tokens"} (${decimals} decimals)` }, (value) =>
      amount(value, decimals),
    )
    return {
      to,
      value: 0n,
      data: IERC20.encodeFunctionData("transfer", [recipient, units]),
      token: { symbol: known?.symbol ?? "custom token", decimals, source: known?.source ?? "user-entered" },
    }
  }
  const to = await input({ message: kind === "native" ? "Recipient address" : "Contract address" }, address)
  const data = kind === "native" ? "0x" : await input({ message: "Calldata (0x for empty)" }, calldata)
  const value = await input({ message: "Native value (e.g. 0.1 ether; use 0 for none)" }, nativeAmount)
  return { to, value, data }
}

async function getGas() {
  const maxPriorityFeePerGas = await input({ message: "Priority fee per gas (e.g. 1 gwei)" }, nativeAmount)
  const maxFeePerGas = await input(
    { message: "Maximum total fee per gas, including priority fee (e.g. 20 gwei)" },
    (value) => integer(nativeAmount(value), { min: maxPriorityFeePerGas, name: "Maximum fee" }),
  )
  const gasLimit = await input(
    {
      message: "Gas limit (21000 for a plain transfer to an ordinary account; contracts need more)",
      placeholder: "Use your independently estimated limit",
    },
    (value) => integer(value, { min: 21000n, max: 18446744073709551615n, name: "Gas limit" }),
  )
  return { maxPriorityFeePerGas, maxFeePerGas, gasLimit }
}
