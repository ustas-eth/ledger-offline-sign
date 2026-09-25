# Privacy and offline operation

The signing flow has no RPC client, ENS lookup, metadata download, telemetry,
update check, or broadcasting step. Inputs remain in memory. Application code
does not write session files, history, or transaction logs, and does not invoke
a clipboard manager or browser.

Ledger's `signTransaction(path, rawTxHex, null)` explicitly bypasses its online
metadata resolver. Omitting the third argument can make the SDK contact external
services. Regression tests exercise the installed SDK for native, token, and
custom calls with network entry points blocked and a simulated USB transport.
They do not prove that every future dependency or operating system is harmless.

The terminal displays the account, transaction details, hash, and signed bytes.
Scrollback, terminal recording, screenshots, redirection, crash dumps, swap, OS
instrumentation, and anything you copy or save yourself may retain those details.
This utility does not claim secure memory erasure or remove terminal history.
It never asks for a seed phrase or private key.

Installations contact package registries and may download or compile native USB
bindings. Package-manager caches and logs are separate from signing. Install and
verify dependencies before disconnecting networking; use the installed command,
not `npx`. For stronger isolation, disable networking at the OS/VM boundary.

A signed transaction authorizes its encoded action and can be broadcast by
anyone who obtains it. Broadcasting later exposes transaction data publicly and
can expose your IP address to the chosen broadcasting service. This program
never submits it. Rejecting or cancelling before signing produces no signed
output; interrupting after device approval cannot undo a signature already made.

Only type-2 EIP-1559 transactions are supported. Offline checks do not establish
current nonce, available balance, gas sufficiency, token behavior, or contract
safety. The fee summary covers execution gas, not extra L2 data charges. Custom
chains must use 18-decimal native units. Nonces are limited to JavaScript's safe
integer range; chain IDs to uint32 for Ledger compatibility.

Dependency review: the checkout overrides outdated Axios and Elliptic versions
required transitively by the Ledger SDK. The npm package bundles that JavaScript
SDK and its dependency closure because npm global installs do not reliably honor
transitive overrides. Native USB bindings remain platform-installed. The current
checkout audit still reports the
upstream [low-severity Elliptic advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84)
and its dependent packages. That library is pulled in by Ledger's ethers-v5
helpers; our private-key signing happens on the device, and local signature
recovery uses ethers v6. A passing audit is not a security guarantee.
