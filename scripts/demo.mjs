// Documentation fixture only. Not shipped, never opens a device, never signs.
import { run } from "../src/offline-sign.js"
import { Cancelled } from "../src/lib.js"
import { cancel } from "@clack/prompts"
console.log("DEMO — simulated Ledger, dummy addresses; signing disabled")
try {
  await run({
    connect: async () => ({
      getAddress: async () => "0x1111111111111111111111111111111111111111",
      sign: async () => {
        throw new Error("Signing is disabled in this documentation fixture.")
      },
      close: async () => {},
    }),
  })
} catch (error) {
  if (!(error instanceof Cancelled)) throw error
  cancel(error.message)
}
