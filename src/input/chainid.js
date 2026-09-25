import { selectOrCustom, validate } from "../lib.js"
import { integer } from "../transaction.js"
import { chains } from "../data/chains.js"

export async function getChainId() {
  return selectOrCustom(
    {
      message: "Network",
      initialValue: "1",
      options: [
        ...chains.map(({ id, name }) => ({ value: id, label: name, hint: `chain ID ${id}` })),
        { value: "Custom", label: "Custom chain ID" },
      ],
    },
    {
      message: "Chain ID (must support EIP-1559)",
      validate: validate((value) => integer(value, { min: 1n, max: 4294967295n, name: "Chain ID" })),
    },
  )
}
