import { text, group, cancel } from "@clack/prompts"

export async function getDerivationPath() {
  const walletData = await group(
    {
      derivationPath: () =>
        text({
          message: "Enter the derivation path format",
          placeholder: "e.g., 44'/60'/i'/0/0",
          initialValue: "44'/60'/i'/0/0",
          validate(value) {
            if (value.length === 0) return `Value is required`
          },
        }),
      index: () =>
        text({
          message: "Enter an index for the derivation path",
          placeholder: "e.g., 0",
          initialValue: "0",
          validate(value) {
            if (/^\d+$/.test(value) === false) return `Enter a valid number`
          },
        }),
    },
    {
      onCancel: () => {
        cancel("Operation was cancelled")
        process.exit(0)
      },
    },
  )

  return walletData.derivationPath.replace("i", walletData.index)
}
