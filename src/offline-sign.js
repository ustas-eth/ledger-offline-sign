import { setTimeout } from "node:timers/promises"
import TransportNodeHID from "@ledgerhq/hw-transport-node-hid"
import AppETH from "@ledgerhq/hw-app-eth"
import { Transaction, isAddress, Signature } from "ethers"

import { intro, outro, text, group, isCancel, cancel, spinner, note, confirm } from "@clack/prompts"

import {
  selectOrCustom,
  selectOrRevert,
  textOrRevert,
  wrapString,
  IERC20,
  displayTransaction,
  transformLedgerSigtoEthers,
} from "./lib.js"

import erc20List from "./data/erc20.js"

export async function run() {
  intro(`Welcome to the Ledger Offline Sign (free of charge and telemetry)!`)

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
          validate(valueRaw) {
            const value = parseInt(valueRaw)
            if ((value != 0 && !value) || value < 0 || parseFloat(valueRaw) != value)
              return `Enter a positive number or zero (0, 1, 2, 3...)`
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

  const derivationPath = walletData.derivationPath.replace("i", walletData.index)

  async function waitLedger() {
    const s = spinner()

    s.start("Connect your Ledger and run Ethereum")

    const result = { transport: undefined, app: undefined, address: undefined }

    while (true) {
      try {
        // connect to a Ledger
        result.transport = await TransportNodeHID.default.create()

        // create an Ethereum app
        result.app = new AppETH.default(result.transport)

        // get the address by the derivation path
        let data = await result.app.getAddress(derivationPath)

        result.address = data.address

        break
      } catch (error) {
        await setTimeout(1000)
      }
    }

    s.stop(`Connected to Ledger`)

    return result
  }

  const { address } = await waitLedger()

  // display the connected address
  note(`Your account has been found: ${address}`)

  const tx = new Transaction()

  // enter the transaction details

  tx.chainId = await selectOrCustom(
    {
      message: "Select the chain id",
      initialValue: "1",
      options: [
        {
          label: "Custom",
          value: "Custom",
        },
        {
          label: "1 - Ethereum Mainnet",
          value: "1",
        },
        {
          label: "137 - Polygon Mainnet",
          value: "137",
        },
        {
          label: "8453 - Base Mainnet",
          value: "8453",
        },
        {
          label: "42161 - Arbitrum Mainnet",
          value: "42161",
        },
        {
          label: "10 - Optimism Mainnet",
          value: "10",
        },
        {
          label: "56 - BSC Mainnet",
          value: "56",
        },
        {
          label: "100 - Gnosis Chain Mainnet",
          value: "100",
        },
      ],
    },
    {
      message: "Enter the custom chain id (see on chainlist.org)",
      initialValue: "1",
    },
  )

  tx.type = await selectOrRevert({
    message: "Select the transaction type (hardcoded to EIP-1559, for now)",
    initialValue: 2,
    options: [
      {
        label: "EIP-1559",
        value: 2,
      },
    ],
  })

  tx.nonce = await textOrRevert({
    message: "Enter the nonce",
    placeholder: "e.g., 0",
    initialValue: "0",
  })

  const calldata = await selectOrCustom(
    {
      message: "Select the calldata type",
      placeholder: "e.g., 0x12dd34ff",
      options: [
        {
          label: "Custom",
          value: "Custom",
        },
        {
          label: "Native transfer",
          value: "0x",
        },
        {
          label: "ERC20 transfer",
          value: "erc20",
        },
        {
          label: "Empty calldata",
          value: "0x",
        },
      ],
    },
    {
      message: "Enter the custom calldata (or leave 0x to skip)",
      placeholder: "e.g., 0x12dd34ff",
      initialValue: "0x",
    },
  )

  if (calldata === "erc20") {
    tx.to = await selectOrCustom(
      {
        message: "Enter the ERC20 token address",
        options: [
          {
            label: "Custom",
            value: "Custom",
          },
          ...erc20List[tx.chainId],
        ],
      },
      {
        message: "Enter the token address",
        placeholder: "e.g., 0x0000000000000000000000000000000000000000",
        validate(value) {
          if (!isAddress(value)) return `Enter a valid address`
        },
      },
    )

    const receiver = await textOrRevert({
      message: "Enter the receiver address",
      placeholder: "e.g., 0x0000000000000000000000000000000000000000",
      validate(value) {
        if (!isAddress(value)) return `Enter a valid address`
      },
    })

    const transferAmount =
      (await textOrRevert({
        message: "Enter the ERC20 transfer amount",
        placeholder: "e.g., 1000000000000000000 (1 ether)",
      })) || 0

    tx.data = IERC20.encodeFunctionData("transfer", [receiver, transferAmount])
    tx.value = 0
  } else {
    tx.to = await textOrRevert({
      message: "Enter the receiver address",
      placeholder: "e.g., 0x0000000000000000000000000000000000000000",
      validate(value) {
        if (!isAddress(value)) return `Enter a valid address`
      },
    })

    tx.value =
      (await textOrRevert({
        message: "Enter the value",
        placeholder: "e.g., 1000000000000000000 (1 ether)",
      })) || 0

    tx.data = calldata
  }

  tx.maxPriorityFeePerGas = await textOrRevert({
    message: "Enter the max priority fee per gas",
    placeholder: "e.g., 100000000 (0.1 gwei)",
    initialValue: "100000000",
  })

  const maxBaseFee = await textOrRevert({
    message: "Enter the base fee per gas",
    placeholder: "e.g., 1000000000 (1 gwei)",
    initialValue: "1000000000",
  })

  tx.maxFeePerGas = BigInt(tx.maxPriorityFeePerGas) + BigInt(maxBaseFee)

  tx.gasLimit = await textOrRevert({
    message: "Enter the gas limit",
    placeholder: "e.g., 21000",
    initialValue: calldata === "erc20" ? "120000" : "21000",
  })

  const unsignedBytecode = tx.unsignedSerialized

  // display the unsigned transaction
  note(`${displayTransaction(tx, address)}\n\nTransaction bytecode:\n${wrapString(unsignedBytecode)}`)

  const confirmation = await confirm({
    message: "Do you want to sign the transaction?",
    initialValue: true,
  })

  if (isCancel(confirmation)) {
    cancel("Operation cancelled.")
    process.exit(0)
  }

  async function signTransaction() {
    const { address: addressNew, app } = await waitLedger()

    if (address && address !== addressNew) {
      throw new Error("Address mismatch")
    }

    try {
      const result = await app.signTransaction(derivationPath, unsignedBytecode.slice(2), null)
      return result
    } catch (error) {
      if (error.statusText === "CONDITIONS_OF_USE_NOT_SATISFIED") {
        cancel("The request was cancelled by the user.")
        process.exit(0)
      }
      throw error
    }
  }

  // request to sign the transaction
  // the resolution is set to null to avoid any online queries
  const result = await signTransaction(derivationPath, unsignedBytecode.slice(2), null)

  tx.signature = Signature.from(transformLedgerSigtoEthers(result))

  // display the signed transaction
  outro(`Signed transaction (bytes to broadcast): \n${tx.serialized}`)
}
