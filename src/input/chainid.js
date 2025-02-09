import { selectOrCustom } from "../lib.js"

export async function getChainId() {
  return selectOrCustom(
    {
      message: "Select the chain id",
      initialValue: "1",
      options: [
        {
          label: "Custom",
          value: "Custom",
        },
        {
          label: "1 - Ethereum Mainnet",
          value: "1",
        },
        {
          label: "137 - Polygon Mainnet",
          value: "137",
        },
        {
          label: "8453 - Base Mainnet",
          value: "8453",
        },
        {
          label: "42161 - Arbitrum Mainnet",
          value: "42161",
        },
        {
          label: "10 - Optimism Mainnet",
          value: "10",
        },
        {
          label: "56 - BSC Mainnet",
          value: "56",
        },
        {
          label: "100 - Gnosis Chain Mainnet",
          value: "100",
        },
      ],
    },
    {
      message: "Enter the custom chain id (see on chainlist.org)",
      initialValue: "1",
    },
  )
}
