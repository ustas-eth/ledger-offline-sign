import http from "node:http"
import https from "node:https"
import { isIP } from "node:net"

// Only these errors contain messages safe to display without leaking RPC credentials.
export class RequestError extends Error {}

function connectionError(error) {
  const messages = {
    ENOTFOUND: "RPC hostname could not be resolved (DNS).",
    EAI_AGAIN: "RPC hostname lookup failed temporarily (DNS).",
    ECONNREFUSED: "RPC connection was refused.",
    ECONNRESET: "RPC connection was reset.",
    ETIMEDOUT: "RPC connection timed out.",
    ENETUNREACH: "RPC network is unreachable.",
    EHOSTUNREACH: "RPC host is unreachable.",
  }
  return new RequestError(messages[error.code] ?? "Connection failed (network, TLS, or endpoint unavailable).")
}

export function endpoint(value, { localOnly = false } = {}) {
  if (typeof value !== "string" || value.length > 4096 || /[\s\x00-\x1f\x7f<>${}]/.test(value))
    throw new Error("Enter an HTTPS RPC URL, or HTTP on loopback.")
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error("Invalid RPC URL.")
  }
  const host = url.hostname
  const local = host === "localhost" || host === "[::1]" || (isIP(host) === 4 && host.startsWith("127."))
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local)))
    throw new Error("Use HTTPS (HTTP only on loopback), without URL userinfo or fragments.")
  if (localOnly && !local) throw new Error("Local-only mode requires a loopback RPC URL.")
  if (host === "localhost") url.hostname = "127.0.0.1"
  return url
}

export function endpointLabel(value) {
  return endpoint(value).origin // Paths and query strings may contain credentials.
}

export function requestJson(value, { payload, localOnly = false, timeout = 12000, maxBytes = 1024 * 1024 } = {}) {
  const url = endpoint(value, { localOnly })
  const transport = url.protocol === "https:" ? https : http
  // Own agents bypass environment proxies, including for localhost.
  const agent = new transport.Agent({ keepAlive: false, proxyEnv: {} })
  return new Promise((resolve, reject) => {
    let finished = false
    let timer
    const finish = (error, data) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      agent.destroy()
      error ? reject(error) : resolve(data)
    }
    const body = payload === undefined ? undefined : JSON.stringify(payload)
    const request = transport.request(
      url,
      {
        agent,
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          "User-Agent": "ledger-offline-sign",
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
        },
      },
      (response) => {
        response.on("error", () => finish(new RequestError("Response connection failed.")))
        if (response.statusCode !== 200) {
          response.resume()
          finish(
            new RequestError(
              response.statusCode >= 300 && response.statusCode < 400
                ? "Endpoint redirect blocked."
                : `Endpoint returned HTTP ${response.statusCode}.`,
            ),
          )
          return
        }
        const chunks = []
        let bytes = 0
        response.on("data", (chunk) => {
          bytes += chunk.length
          if (bytes > maxBytes) {
            finish(new RequestError("Response exceeds the size limit."))
            response.destroy()
            return
          }
          chunks.push(chunk)
        })
        response.on("end", () => {
          try {
            finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8")))
          } catch {
            finish(new RequestError("Endpoint returned invalid JSON."))
          }
        })
      },
    )
    request.on("error", (error) => finish(connectionError(error)))
    timer = setTimeout(() => {
      finish(new RequestError("Connection timed out."))
      request.destroy()
    }, timeout)
    request.end(body)
  })
}
