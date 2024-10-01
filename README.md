# Ledger Offline Sign

<a href="https://github.com/ustas-eth/ledger-offline-sign"><img src ="https://img.shields.io/github/commit-activity/t/ustas-eth/ledger-offline-sign" /></a> <a href="https://github.com/ustas-eth/ledger-offline-sign"><img src ="https://img.shields.io/github/stars/ustas-eth/ledger-offline-sign" /></a> <a href="https://github.com/ustas-eth/ledger-offline-sign"><img src ="https://img.shields.io/github/license/ustas-eth/ledger-offline-sign" /></a>

<video src="https://github.com/user-attachments/assets/9ebd56b8-d263-458e-89fd-990d859fa020" controls></video>

## What

This is a tool that allows you to sign an offline Ethereum (or L2) transaction using Ledger (tested with Nano X) with full control of the transaction data.

As a result, you will receive a bytecode that you can broadcast when necessary.

> The script is meant to be used by EVM power users. If you don't know what the derivation path is, how to calculate current nonce, or how to encode calldata it's better to use a normal wallet.

## Why

It's not safe to take Ledger if you have a meeting or there are cameras around that can catch your PIN on video. A good solution to this problem is to sign the transaction offline beforehand and then broadcast it when needed without the risk of exposing your entire wallet or getting a physical rekt.

I found such simple action quite hard to do with existing solutions (it's basically what any wallet does minus the network broadcasting). They either don't provide a way to change the derivation path / chain id that I need or throw errors. That's the main reason I decided to make this tool.

## Privacy and telemetry

The script doesn't attempt to make any network requests and doesn't need an RPC to work. All the information you enter will not be stored anywhere except temporarily in your terminal.

The two weak points here are:

- Transaction broadcasting, obviously. Depending on which RPC you use to broadcast the transaction, tracking your IP address and collecting other information might be possible.
- Supply chain attack, because you need to download `@ledgerhq/hw-app-eth`, `@ledgerhq/hw-transport-node-hid`, `ethers`, and `@clack/prompts` in order to run the script. The versions of these packages can change, and vendors may add telemetry.

It's better to turn off the network connection or use a VM if you're concerned about privacy.

## Usage

You'll need NodeJS (v20 is tested) for all the installation methods.

### Run with `npx`

The easiest way to run the tool is to use: `npx ledger-offline-sign`
This command will download and run the latest version of the script from the npm servers.

### Using git

1. Clone the repository with `git clone https://github.com/ustas-eth/ledger-offline-sign`
2. Run `yarn` to install the required dependencies
3. Run `yarn start` to start the script

## Broadcasting

To broadcast the transaction you can use any public RPC endpoint (see on [Chainlist](https://chainlist.org/)) with this command:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0xTRANSACTION_BYTECODE"],"id":1}' https://LINK_TO_RPC_ENDPOINT
```

Or a web interface like [Etherscan](https://etherscan.io/pushTx) or [MyCrypto](https://app.mycrypto.com/broadcast-transaction).

<video src="https://github.com/user-attachments/assets/d9de2ac3-96ba-48d1-bb46-520173392829" controls></video>
