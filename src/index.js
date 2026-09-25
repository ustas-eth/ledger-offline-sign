#!/usr/bin/env node

/**
 * Copyright (c) 2024-present, ustas-eth
 *
 * The modifications and additions to the original source code are licensed under the
 * MIT license found in the LICENSE file in the root directory of this source tree.
 *
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * The original source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of https://github.com/facebook/create-react-app.
 */

import { readFileSync } from "node:fs"

const help = `Usage: ledger-offline-sign [--help | --version]

Interactively prepare and sign an EIP-1559 transaction with a USB Ledger.
Supports native transfers, ERC-20 transfers, and custom contract calldata.

Install dependencies while online, then disconnect networking before signing.
You supply the nonce, chain ID, fees, gas limit, and recipient. No RPC is used.
No session files, transaction logs, telemetry, or automatic broadcast.
Terminal scrollback, OS monitoring, and package-manager logs are outside this tool.

Use arrow keys to choose, Enter to continue, Ctrl+C to cancel.
Requires Node.js 22+ and the Ledger Ethereum app. See README for USB setup.
`

const args = process.argv.slice(2)
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log(help)
} else if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
  console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version)
} else if (args.length) {
  console.error("Unsupported arguments. Run ledger-offline-sign --help.")
  process.exitCode = 2
} else if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("Ledger Offline Sign requires Node.js 22 or newer.")
  process.exitCode = 1
} else if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Interactive signing requires a terminal. Run ledger-offline-sign --help.")
  process.exitCode = 2
} else {
  const { cancel } = await import("@clack/prompts")
  const { Cancelled } = await import("./lib.js")
  try {
    const { run } = await import("./offline-sign.js")
    await run()
  } catch (error) {
    cancel(error instanceof Error ? error.message : "Signing failed.")
    process.exitCode = error instanceof Cancelled ? 130 : 1
  }
}
