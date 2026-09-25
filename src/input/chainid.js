import { selectOrCustom, validate } from "../lib.js"
import { integer } from "../transaction.js"
import { chains } from "../data/chains.js"

export async function getChainId(available = chains, searchable = false) {
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
    {
      message: "Chain ID (must support EIP-1559)",
      validate: validate((value) => integer(value, { min: 1n, max: 4294967295n, name: "Chain ID" })),
    },
  )
}
