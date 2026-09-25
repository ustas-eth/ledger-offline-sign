import { textOrRevert, validate } from "../lib.js"
import { nativeAmount, integer } from "../transaction.js"

export async function getGas() {
  const maxPriorityFeePerGas = nativeAmount(
    await textOrRevert({
      message: "Priority fee per gas (e.g. 1 gwei)",
      validate: validate(nativeAmount),
    }),
  )
  const maxFeePerGas = nativeAmount(
    await textOrRevert({
      message: "Maximum total fee per gas, including priority fee (e.g. 20 gwei)",
      validate: validate((value) => integer(nativeAmount(value), { min: maxPriorityFeePerGas, name: "Maximum fee" })),
    }),
  )
  const gasLimit = await textOrRevert({
    message: "Gas limit (21000 for a plain transfer to an ordinary account; contracts need more)",
    placeholder: "Use your independently estimated limit",
    validate: validate((value) => integer(value, { min: 21000n, max: 18446744073709551615n, name: "Gas limit" })),
  })
  return { maxPriorityFeePerGas, maxFeePerGas, gasLimit }
}
