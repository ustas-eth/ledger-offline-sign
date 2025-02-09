import { selectOrRevert } from "../lib.js"

export async function getTxType() {
  return selectOrRevert({
    message: "Select the transaction type (hardcoded to EIP-1559, for now)",
    initialValue: 2,
    options: [
      {
        label: "EIP-1559",
        value: 2,
      },
    ],
  })
}
