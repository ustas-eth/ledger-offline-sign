import { isAddress, parseUnits } from "ethers"
import { selectOrCustom, textOrRevert, IERC20, parseEthValue } from "../lib.js"

import erc20ByChain from "../data/erc20.js"

export async function getCalldata(chainId) {
  const params = {}

  // ask the user to select the calldata type
  // it will be either a custom calldata like "0x112233"
  // or the "erc20" placeholder for ERC20 transfer (to be filled later)
  params.data = await selectOrCustom(
    {
      message: "Select the calldata type",
      placeholder: "e.g., 0x12dd34ff",
      options: [
        {
          label: "Custom",
          value: "Custom",
        },
        {
          label: "Native transfer",
          value: "0x",
        },
        {
          label: "ERC20 transfer",
          value: "erc20",
        },
        {
          label: "Empty calldata",
          value: "0x",
        },
      ],
    },
    {
      message: "Enter the custom calldata (or leave 0x to skip)",
      placeholder: "e.g., 0x12dd34ff",
      initialValue: "0x",
      validate(value) {
        if (!/^0x[0-9A-Fa-f]*$/i.test(value) || value.length % 2 !== 0)
          return `Enter a valid hex string (with 0x prefix and even length)`
      },
    },
  )

  if (params.data === "erc20") {
    const erc20List = erc20ByChain[chainId]

    params.to = await selectOrCustom(
      {
        message: "Enter the ERC20 token address",
        options: [
          {
            label: "Custom",
            value: "Custom",
          },
          ...erc20List,
        ],
      },
      {
        message: "Enter the token address",
        placeholder: "e.g., 0x0000000000000000000000000000000000000000",
        validate(value) {
          if (!isAddress(value)) return `Enter a valid address`
        },
      },
    )

    // try to find decimals in the list or ask the user
    const decimals =
      erc20List.find((item) => item.value === params.to)?.decimals ||
      (await textOrRevert({
        message: "Enter the ERC20 token decimals",
        placeholder: "e.g., 18",
        initialValue: "18",
        validate(value) {
          if (!/^\d+$/.test(value)) return `Enter a valid number`
        },
      }))

    const receiver = await textOrRevert({
      message: "Enter the receiver address",
      placeholder: "e.g., 0x0000000000000000000000000000000000000000",
      validate(value) {
        if (!isAddress(value)) return `Enter a valid address`
      },
    })

    const amount = parseUnits(
      await textOrRevert({
        message: `Enter the ERC20 transfer amount (${decimals} decimals)`,
        placeholder: "e.g., 10.01",
        validate(value) {
          if (!/^-?\d*(\.\d+)?$/.test(value)) return `Enter a valid amount`
        },
      }),
      parseInt(decimals),
    )

    // override the placeholder calldata with the ERC20 transfer
    params.data = IERC20.encodeFunctionData("transfer", [receiver, amount])

    params.value = 0
  } else {
    params.to = await textOrRevert({
      message: "Enter the receiver address",
      placeholder: "e.g., 0x0000000000000000000000000000000000000000",
      validate(value) {
        if (!isAddress(value)) return `Enter a valid address`
      },
    })

    const value = await textOrRevert({
      message: "Enter the value",
      placeholder: "e.g., '1 ether', '100 gwei', or '12345' (wei)",
      validate(value) {
        if (parseEthValue(value) == null) return `Enter a valid value`
      },
    })

    params.value = parseEthValue(value)
  }

  return params
}
