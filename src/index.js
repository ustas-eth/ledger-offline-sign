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
import { parseArgs } from "node:util"

const help = `Usage: ledger-offline-sign [options]

Prepare and sign an EIP-1559 transaction with a USB Ledger.
No RPC is used by default. Nonce, fees, and gas limit are entered manually.

  --online          Use public chain/token/RPC lists; offer broadcasting after signing
  --lists           Use cached lists offline (no downloads or broadcasting)
  --refresh-lists   Download public lists for later use, then exit
  --broadcast       Paste a signed transaction and choose an RPC; no Ledger needed
  --local-only      Allow broadcasting only through a loopback RPC; no downloads
  --no-cache        Read/write no metadata cache (does not delete existing files)
  --testnets        Include testnets from the lists
  --help, -h        Show help
  --version, -v     Show version

Lists come from Chainlist and Uniswap. Online mode refreshes them after 24 hours.
RPC selection checks only that endpoint's chain ID. Sending needs confirmation.
No automatic retries, failover, transaction files, or custom RPC history.

Use arrow keys to choose, type to search list menus, Enter to continue.
Ctrl+C cancels prompts. Requires Node.js 22+; see README for USB setup.
`

try {
  let args
  try {
    args = parseArgs({
      options: {
        online: { type: "boolean" },
        lists: { type: "boolean" },
        "refresh-lists": { type: "boolean" },
        broadcast: { type: "boolean" },
        "local-only": { type: "boolean" },
        "no-cache": { type: "boolean" },
        testnets: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    }).values
  } catch {
    throw new Error("Unsupported arguments. Run ledger-offline-sign --help.")
  }
  if (args.help) console.log(help)
  else if (args.version)
    console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version)
  else {
    if (Number(process.versions.node.split(".")[0]) < 22)
      throw new Error("Ledger Offline Sign requires Node.js 22 or newer.")
    if (args["local-only"] && (args.online || args["refresh-lists"]))
      throw new Error("Local-only mode cannot download lists or use --online.")
    if (args["refresh-lists"] && (args.broadcast || args["no-cache"]))
      throw new Error("Refresh lists separately, with caching enabled.")
    if (!args["refresh-lists"] && (!process.stdin.isTTY || !process.stdout.isTTY))
      throw new Error("Interactive signing or broadcasting requires a terminal. Run ledger-offline-sign --help.")
    if (args.online || args["refresh-lists"]) console.log("Loading public lists…")
    const { loadCatalog } = await import("./catalog.js")
    const catalog = await loadCatalog({
      useLists: args.lists || args.broadcast || args["local-only"],
      online: args.online,
      refresh: args["refresh-lists"],
      noCache: args["no-cache"],
      testnets: args.testnets,
    })
    if (args["refresh-lists"]) {
      console.log(catalog.status)
      process.exitCode = catalog.failed || !catalog.saved ? 1 : 0
    } else {
      const { note } = await import("@clack/prompts")
      if (args.online || args.lists || args.broadcast || args["local-only"]) note(catalog.status, "Lists")
      if (args.broadcast) {
        const { broadcastExisting } = await import("./broadcast.js")
        await broadcastExisting({ catalog, localOnly: args["local-only"] })
      } else {
        const { run } = await import("./offline-sign.js")
        await run({
          catalog,
          online: args.online,
          localOnly: args["local-only"],
          searchable: args.online || args.lists || args["local-only"],
        })
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Operation failed.")
  process.exitCode = error?.constructor?.name === "Cancelled" ? 130 : 2
}
