import { selectOrCustom, selectOrRevert, textOrRevert, validate } from "../lib.js"
import { address, amount, calldata, integer, IERC20, nativeAmount } from "../transaction.js"
import erc20ByChain from "../data/erc20.js"

export async function getCalldata(chainId) {
  const kind = await selectOrRevert({
    message: "Transaction",
    options: [
      { value: "native", label: "Native transfer" },
      { value: "erc20", label: "ERC-20 transfer" },
      { value: "custom", label: "Contract call", hint: "custom calldata" },
    ],
  })
  if (kind === "erc20") {
    const tokens = erc20ByChain[chainId] ?? []
    const to = address(
      await selectOrCustom(
        {
          message: "Token (built-in metadata is static; verify the contract)",
          options: [
            ...tokens.map((token) => ({ value: token.value, label: token.symbol, hint: token.value })),
            { value: "Custom", label: "Custom token" },
          ],
        },
        { message: "Token contract address", validate: validate(address) },
      ),
    )
    const known = tokens.find((token) => address(token.value) === to)
    const decimals =
      known?.decimals ??
      Number(
        await textOrRevert({
          message: "Token decimals (from the contract, not fetched)",
          validate: validate((value) => integer(value, { max: 255n, name: "Decimals" })),
        }),
      )
    const recipient = address(await textOrRevert({ message: "Token recipient", validate: validate(address) }))
    const units = amount(
      await textOrRevert({
        message: `Amount in ${known?.symbol ?? "tokens"} (${decimals} decimals)`,
        validate: validate((value) => amount(value, decimals)),
      }),
      decimals,
    )
    return {
      to,
      value: 0n,
      data: IERC20.encodeFunctionData("transfer", [recipient, units]),
      token: { symbol: known?.symbol ?? "custom token", decimals },
    }
  }
  const to = address(
    await textOrRevert({
      message: kind === "native" ? "Recipient address" : "Contract address",
      validate: validate(address),
    }),
  )
  const data =
    kind === "native"
      ? "0x"
      : calldata(await textOrRevert({ message: "Calldata (0x for empty)", validate: validate(calldata) }))
  const value = nativeAmount(
    await textOrRevert({
      message: "Native value (e.g. 0.1 ether; use 0 for none)",
      validate: validate(nativeAmount),
    }),
  )
  return { to, value, data }
}
