import { textOrRevert } from "../lib.js"

export async function getNonce() {
  return textOrRevert({
    message: "Enter the nonce",
    placeholder: "e.g., 0",
    initialValue: "0",
    validate(value) {
      if (!/^\d+$/.test(value)) return "Enter a valid number"
    },
  })
}
