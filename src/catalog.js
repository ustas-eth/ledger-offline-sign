import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import { address } from "./transaction.js"
import { chains as builtinChains } from "./data/chains.js"
import builtinTokens from "./data/erc20.js"
import { endpoint, requestJson } from "./network.js"

export const CHAIN_URL = "https://chainlist.org/rpcs.json"
export const TOKEN_URL = "https://tokens.uniswap.org/"
export const MAX_LIST_BYTES = 32 * 1024 * 1024
const TTL = 86400000
const commonChains = [1, 8453, 42161, 10, 137, 56, 43114, 130, 100, 42220, 324, 59144, 534352, 5000, 81457]
const commonTokens = [
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "WETH",
  "WBTC",
  "CBBTC",
  "WSTETH",
  "STETH",
  "RETH",
  "CBETH",
  "WEETH",
  "WBNB",
  "WAVAX",
  "WPOL",
  "LINK",
  "UNI",
  "AAVE",
  "ARB",
  "OP",
]
const rank = (list, item) => (list.includes(item) ? list.indexOf(item) : list.length)
export const cleanLabel = (value, length = 80) =>
  typeof value === "string"
    ? value
        .replace(/[\p{C}\p{Z}]/gu, " ")
        .replace(/ +/g, " ")
        .trim()
        .slice(0, length)
    : ""
const chainId = (value) => Number.isSafeInteger(value) && value > 0 && value <= 4294967295

export function rpcCandidates(entries = [], { localOnly = false } = {}) {
  const seen = new Set()
  const result = []
  for (const item of entries) {
    const row = typeof item === "string" ? { url: item } : item
    if (!row || typeof row.url !== "string" || /(YOUR[_-]|API[_-]?KEY|INFURA_ID|ALCHEMY_ID)/i.test(row.url)) continue
    try {
      const url = endpoint(row.url, { localOnly }).href
      if (seen.has(url)) continue
      seen.add(url)
      result.push({ url, tracking: ["none", "limited", "yes"].includes(row.tracking) ? row.tracking : "unspecified" })
    } catch {
      /* Unusable list entries are not selectable. */
    }
  }
  return result.sort(
    (a, b) =>
      Number(!claimsNoLogs(a.url)) - Number(!claimsNoLogs(b.url)) ||
      Number(a.tracking !== "none") - Number(b.tracking !== "none") ||
      a.url.localeCompare(b.url),
  )
}

export function claimsNoLogs(value) {
  return ["1rpc.io", "public.1rpc.io"].includes(endpoint(value).hostname)
}

export function privacyLabel(row) {
  return claimsNoLogs(row.url)
    ? "1RPC claims no request logging; unverified"
    : `Chainlist reports tracking: ${row.tracking}`
}

export function normalizeLists(rawChains, rawTokens) {
  if (!Array.isArray(rawChains) || !Array.isArray(rawTokens?.tokens)) throw new Error("Invalid public metadata lists.")
  const chains = []
  const tokens = []
  const seenChains = new Set()
  const seenTokens = new Set()
  for (const row of rawChains) {
    if (
      !row ||
      !chainId(row.chainId) ||
      seenChains.has(row.chainId) ||
      row.nativeCurrency?.decimals !== 18 ||
      !cleanLabel(row.name) ||
      !Array.isArray(row.rpc)
    )
      continue
    seenChains.add(row.chainId)
    chains.push({
      id: String(row.chainId),
      name: cleanLabel(row.name),
      symbol: cleanLabel(row.nativeCurrency.symbol, 16) || "native",
      isTestnet: row.isTestnet === true,
      rpc: rpcCandidates(row.rpc),
    })
  }
  for (const row of rawTokens.tokens) {
    if (
      !row ||
      !chainId(row.chainId) ||
      !Number.isInteger(row.decimals) ||
      row.decimals < 0 ||
      row.decimals > 255 ||
      !cleanLabel(row.symbol, 32)
    )
      continue
    try {
      const value = address(row.address)
      const key = `${row.chainId}:${value}`
      if (seenTokens.has(key)) continue
      seenTokens.add(key)
      tokens.push({
        chainId: row.chainId,
        value,
        decimals: row.decimals,
        symbol: cleanLabel(row.symbol, 32),
        name: cleanLabel(row.name),
        source: "Uniswap list",
      })
    } catch {
      /* Non-EVM and malformed contracts are not usable. */
    }
  }
  if (!chains.length || !tokens.length) throw new Error("Public lists contain no usable EVM entries.")
  return { chains, tokens }
}

export function makeCatalog(lists, { testnets = false } = {}) {
  // Built-in identities and decimals win conflicts; remote lists add entries/RPCs.
  const chainMap = new Map(
    (lists?.chains ?? []).filter((row) => testnets || !row.isTestnet).map((row) => [row.id, row]),
  )
  for (const chain of builtinChains) chainMap.set(chain.id, { ...chainMap.get(chain.id), ...chain })
  const chains = [...chainMap.values()].sort(
    (a, b) => rank(commonChains, Number(a.id)) - rank(commonChains, Number(b.id)) || a.name.localeCompare(b.name),
  )
  const tokenMap = new Map((lists?.tokens ?? []).map((row) => [`${row.chainId}:${row.value}`, row]))
  for (const [id, rows] of Object.entries(builtinTokens))
    for (const token of rows)
      tokenMap.set(`${id}:${token.value}`, { ...token, chainId: Number(id), source: "built-in" })
  const tokens = Object.create(null)
  for (const token of tokenMap.values()) (tokens[token.chainId] ??= []).push(token)
  for (const rows of Object.values(tokens))
    rows.sort(
      (a, b) =>
        rank(commonTokens, a.symbol.toUpperCase()) - rank(commonTokens, b.symbol.toUpperCase()) ||
        a.symbol.localeCompare(b.symbol) ||
        a.value.localeCompare(b.value),
    )
  return { chains, tokens }
}

export function cachePath() {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "ledger-offline-sign", "lists.json")
}

async function readCache(path) {
  try {
    if ((await stat(path)).size > MAX_LIST_BYTES * 2) return null
    const raw = JSON.parse(await readFile(path, "utf8"))
    const lists = normalizeLists(raw.chains, raw.tokens)
    if (!Number.isSafeInteger(raw.savedAt) || raw.savedAt < 0) return null
    return { lists, savedAt: raw.savedAt }
  } catch {
    return null
  }
}

async function writeCache(path, raw) {
  const folder = dirname(path)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temp, "wx", 0o600)
    try {
      await file.writeFile(JSON.stringify(raw))
    } finally {
      await file.close()
    }
    await rename(temp, path)
  } finally {
    await rm(temp, { force: true })
  }
}

export async function loadCatalog({
  useLists = false,
  online = false,
  refresh = false,
  noCache = false,
  testnets = false,
  path = cachePath(),
  request = requestJson,
  now = Date.now(),
} = {}) {
  if (!useLists && !online && !refresh) return { ...makeCatalog(), status: "Built-in lists; no downloads." }
  const cached = noCache ? null : await readCache(path)
  const fresh = cached && now >= cached.savedAt && now - cached.savedAt < TTL
  if (!refresh && (!online || fresh))
    return {
      ...makeCatalog(cached?.lists, { testnets }),
      status: cached ? "Using cached public lists; no downloads." : "No usable cache; using built-in lists.",
    }
  let raw
  let lists
  try {
    // Finish both requests before entering the offline signing flow, even on failure.
    const results = await Promise.allSettled(
      [CHAIN_URL, TOKEN_URL].map(async (url) => request(url, { maxBytes: MAX_LIST_BYTES })),
    )
    if (results.some((result) => result.status === "rejected")) throw new Error("List download failed")
    const [chains, tokens] = results.map((result) => result.value)
    lists = normalizeLists(chains, tokens)
    raw = { savedAt: now, chains, tokens }
  } catch {
    return {
      ...makeCatalog(cached?.lists, { testnets }),
      status: cached
        ? "List download failed; using the previous validated cache."
        : "List download failed; using built-in lists.",
      failed: true,
    }
  }
  let status = noCache
    ? "Downloaded public lists for this session; cache disabled."
    : "Downloaded public lists; cached for offline use."
  let saved = false
  if (!noCache)
    try {
      await writeCache(path, raw)
      saved = true
    } catch {
      status = "Downloaded lists; could not save cache. Using this session only."
    }
  return { ...makeCatalog(lists, { testnets }), status, saved }
}
