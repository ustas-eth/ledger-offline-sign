import { selectOrRevert, textOrRevert, validate } from "../lib.js"
import { derivationPath, integer } from "../transaction.js"

export async function getDerivationPath() {
  const mode = await selectOrRevert({
    message: "Ledger account",
    options: [
      { value: "live", label: "Ledger Live", hint: "44'/60'/account'/0/0" },
      { value: "custom", label: "Custom derivation path" },
    ],
  })
  if (mode === "custom")
    return derivationPath(await textOrRevert({ message: "Derivation path", validate: validate(derivationPath) }))
  const index = integer(
    await textOrRevert({
      message: "Account index (0 is the first account)",
      initialValue: "0",
      validate: validate((value) => integer(value, { max: 2147483647n, name: "Account index" })),
    }),
  )
  return `44'/60'/${index}'/0/0`
}
