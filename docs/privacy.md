# Data handling

## Network access

| Mode              | List downloads                                   | RPC access                       |
| ----------------- | ------------------------------------------------ | -------------------------------- |
| Default           | None                                             | None                             |
| `--lists`         | None; cached lists only                          | None                             |
| `--refresh-lists` | Chainlist and Uniswap                            | None                             |
| `--online`        | When the cache is missing or older than 24 hours | Optional broadcast after signing |
| `--broadcast`     | None unless combined with `--online`             | Selected RPC, after confirmation |
| `--local-only`    | None                                             | Loopback RPCs only               |

Ledger signing always passes explicit `null` metadata resolution to the SDK.
It does not use the SDK's online token/plugin resolver. List downloads happen
before signing and contain no wallet addresses or transaction data.

Choosing an RPC sends an `eth_chainId` request before the final send prompt.
A failed check can be retried or a different RPC selected explicitly. The signed
transaction stays in memory, without saving a draft or signing again.
Choosing **Broadcast now** sends one `eth_sendRawTransaction` request. No other RPCs
are probed. There is no automatic retry, failover, receipt polling, or broadcast
on startup. If the send response fails, the transaction may already have been
relayed; the app reports an unknown outcome and prints its locally computed hash.

Requests require HTTPS except on loopback. Redirects are blocked. Environment
proxies are bypassed. `localhost` is resolved directly to `127.0.0.1`; local-only
mode accepts loopback addresses, not arbitrary hostnames. A local proxy that
forwards to a remote RPC still exposes requests to that provider.

## Provider labels

1RPC is listed first where available based on its
[no-logging claims](https://docs.1rpc.io/web3-relay/overview). Other endpoints are
ordered by Chainlist's reported tracking labels. The app does not audit these
policies or verify TEE attestations. Policies can change, and downstream nodes
still process the transaction.

A broadcast provider can observe your IP address, timing, and signed transaction.
The transaction becomes public when broadcast. HTTPS does not hide its contents
from the provider.

## Local storage

With list caching enabled, public metadata is stored in
`$XDG_CACHE_HOME/ledger-offline-sign/lists.json`, or
`~/.cache/ledger-offline-sign/lists.json`. Files are written atomically with
owner-only permissions. Failed downloads can fall back to a validated older cache.
`--no-cache` skips reads and writes; it does not delete an existing cache.

The app does not save wallet addresses, transaction inputs, signed bytes, custom
RPC URLs, or search history. Custom RPC URLs and pasted signed transactions use
hidden input. RPC paths and query strings are omitted from output because they
can contain credentials. Provider error bodies are not printed.

Terminal scrollback, recording, screenshots, clipboard managers, swap, crash
dumps, and OS monitoring are outside the app's control. Installation uses network
access and package-manager caches/logs. For offline use, install dependencies and
prepare lists first, then disable networking at the OS or VM level.

## Validation limits

Lists are untrusted metadata, not contract verification. Invalid entries are
filtered; built-in contract identities and decimals take precedence over list
conflicts. Check token contracts and decimals independently.

Offline validation cannot establish the current nonce, balance, gas sufficiency,
or contract behavior. Only type-2 EIP-1559 transactions without access lists are
supported. Native units assume 18 decimals; nonces are limited to JavaScript's
safe integer range and chain IDs to uint32.

The installed Ledger SDK is tested with network and filesystem-write guards.
Broadcast tests use local mock RPCs. Neither test replaces a device test or an
independent security review.

The checkout overrides old Axios and Elliptic versions from the Ledger SDK.
Release packages bundle that SDK so npm installations retain these fixes. The
[low-severity Elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84)
remains in its ethers-v5 dependencies. Private-key signing happens on the Ledger;
local signature recovery uses ethers v6.
