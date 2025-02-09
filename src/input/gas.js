import { parseEthValue, textOrRevert } from "../lib.js"

export async function getGas(txType, calldata) {
  const params = {}

  if (txType === 2) {
    const maxPriorityFeePerGas = await textOrRevert({
      message: "Enter the max priority fee per gas",
      placeholder: "e.g., '1 ether', '100 gwei', or '12345' (wei)",
      initialValue: "1 gwei",
      validate(value) {
        if (parseEthValue(value) == null) return `Enter a valid value`
      },
    })

    const maxBaseFee = await textOrRevert({
      message: "Enter the base fee per gas",
      placeholder: "e.g., '1 ether', '100 gwei', or '12345' (wei)",
      initialValue: "1 gwei",
      validate(value) {
        if (parseEthValue(value) == null) return `Enter a valid value`
      },
    })

    params.maxPriorityFeePerGas = parseEthValue(maxPriorityFeePerGas)
    params.maxBaseFee = parseEthValue(maxBaseFee)
  }

  // suggest 120000 if calldata is detected, 21000 for calls without it
  params.gasLimit = await textOrRevert({
    message: "Enter the gas limit",
    placeholder: "e.g., 21000",
    initialValue: calldata.length > 2 ? "120000" : "21000",
    validate(value) {
      if (!/^\d+$/.test(value)) return `Enter a valid number`
    },
  })

  return params
}
