# Ledger Offline Sign

Prepare an EVM transaction, review every field, and sign it with a USB Ledger.
The result is a raw signed transaction you can broadcast separately.

![Transaction review with demo addresses](docs/screenshots/review.png)

Native transfers, ERC-20 transfers, and custom calldata. Common networks and
tokens come first; custom chain IDs, contracts, and derivation paths remain
available. EIP-1559 transactions only, with 18-decimal native currency units.

## Install

Use **Node.js 22+** and a Ledger with the Ethereum app installed. Install while
online, then disconnect networking before signing.

To use this checkout:

```sh
git clone https://github.com/ustas-eth/ledger-offline-sign.git
cd ledger-offline-sign
npm ci
npm start
```

To install the checkout as a command:

```sh
npm install -g .
ledger-offline-sign
```

The existing npm release is also available with `npm install -g ledger-offline-sign`;
it may lag behind this checkout. Avoid `npx` on the offline machine: it can try
to download packages. `ledger-offline-sign --help` and `--version` work without a
connected device.

**Linux:** native USB dependencies may need compilation. On Debian/Ubuntu, install
`build-essential python3 pkg-config libusb-1.0-0-dev libudev-dev` first. Other
Linux distributions need the equivalent packages. Follow Ledger's
[USB permissions guidance](https://github.com/LedgerHQ/udev-rules) if the device
is inaccessible; don't run this utility as root.

## Sign

1. Prepare the nonce (including pending transactions), gas limit, fees, and
   recipient/contract details before going offline. Nothing is fetched for you.
2. Choose the account, network, and transfer or contract call. Bare amounts mean
   **wei**; use `0.1 ether` or `1 gwei` for native value and fees. Token amounts
   use the selected token's decimals.
3. Connect and unlock the Ledger, open Ethereum, and close other wallet apps.
   Verify the account address on the device.
4. Review the recipient, amount, nonce, calldata, gas limit, and fee cap. Confirm
   signing in the terminal, then on the Ledger.
5. Copy the raw signed transaction. **Anyone holding it can broadcast it.**

The maximum fee includes the priority fee. The execution cost cap excludes any
additional L2 data fees. No balances, transaction simulation, gas estimates, or
nonce checks are available offline. Static token presets are conveniences:
verify the chain, contract, and decimals independently.

For contract calls, the device may require blind signing. The terminal's decoded
review is not a substitute for a trusted device display. Do not approve calldata
you do not understand. Ctrl+C cancels terminal prompts; reject a pending request
on the device to leave the signing step.

## Privacy

No RPC, telemetry, runtime metadata downloads, automatic broadcast, session files,
or transaction logs. The Ledger SDK is called with online metadata resolution
disabled, and the returned signature is checked against the reviewed account
and transaction.

Your terminal can retain scrollback; terminal recording, OS monitoring, swap,
crash dumps, and package-manager caches/logs are outside this tool. Network
isolation provides a stronger boundary than application promises.
[Privacy details](docs/privacy.md) · [Contributing](CONTRIBUTING.md)

The screenshot shows the actual interface with a simulated Ledger and dummy
addresses. Automated tests use fake devices; the renovated flow still needs a
physical-device smoke test before a release.
