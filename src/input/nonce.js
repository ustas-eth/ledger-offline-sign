import { textOrRevert, validate } from "../lib.js"
import { integer } from "../transaction.js"

export async function getNonce() {
  return textOrRevert({
    message: "Nonce (obtain it before going offline; include pending transactions)",
    placeholder: "No network lookup",
    validate: validate((value) => integer(value, { max: BigInt(Number.MAX_SAFE_INTEGER), name: "Nonce" })),
  })
}
