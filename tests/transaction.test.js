import test from "node:test"
import assert from "node:assert/strict"
import { Wallet, MaxUint256, Transaction } from "ethers"
import {
  address,
  amount,
  attachSignature,
  buildTransaction,
  calldata,
  derivationPath,
  formatTokenAmount,
  integer,
  IERC20,
  nativeAmount,
  transactionReview,
} from "../src/transaction.js"
import tokens from "../src/data/erc20.js"

// Ephemeral test key: never persisted or used on a network.
const wallet = Wallet.createRandom()
const recipient = "0x1111111111111111111111111111111111111111"
const fields = {
  chainId: "1",
  nonce: "7",
  to: recipient,
  value: 1n,
  data: "0x",
  gasLimit: "21000",
  maxFeePerGas: 20000000000n,
  maxPriorityFeePerGas: 1000000000n,
}

test("amounts preserve exact uint256 precision, including zero and 255 decimals", () => {
  assert.equal(amount("9007199254740993.000001", 6), 9007199254740993000001n)
  assert.equal(amount("42", 0), 42n)
  assert.equal(amount(MaxUint256.toString(), 0), MaxUint256)
  assert.equal(amount(`0.${"0".repeat(254)}1`, 255), 1n)
  assert.equal(formatTokenAmount(1000000n, 6), "1")
  assert.equal(formatTokenAmount(100n, 0), "100")
  assert.equal(formatTokenAmount(0n, 6), "0")
})

test("invalid and excessive amounts fail before encoding", () => {
  for (const value of ["", "-1", "1e3", ".", ".1", "1.", "NaN", "1 2", "0x10"])
    assert.throws(() => amount(value), undefined, value)
  assert.throws(() => amount("0.001", 2), /decimal places/)
  assert.throws(() => amount("1", 256))
  assert.throws(() => amount((MaxUint256 + 1n).toString(), 0))
})

test("native units are unambiguous and consume the entire input", () => {
  assert.equal(nativeAmount("1"), 1n)
  assert.equal(nativeAmount(" 1   gwei "), 1000000000n)
  assert.equal(nativeAmount("0.1 ether"), 100000000000000000n)
  for (const value of ["1 eth", "1 ether junk", "-1 gwei", "0.1 wei"]) assert.throws(() => nativeAmount(value))
})

test("addresses, paths and hex bytes are validated locally", () => {
  assert.equal(address(recipient), recipient)
  assert.throws(() => address("alice.eth"))
  assert.throws(() => address("0x" + "1".repeat(39)))
  assert.equal(derivationPath("m/44'/60'/0'/0/0"), "44'/60'/0'/0/0")
  for (const value of ["", "44'/60'/i'/0/0", "44//0", "2147483648", "-1", "0/".repeat(11)])
    assert.throws(() => derivationPath(value))
  assert.equal(calldata("0x00AB"), "0x00AB")
  for (const value of ["0x1", "0xgg", "0X00", "", "0x" + "ff".repeat(131073)]) assert.throws(() => calldata(value))
})

test("transaction limits reject invalid chains, nonces, gas and fee order", () => {
  for (const patch of [
    { chainId: "0" },
    { chainId: "4294967296" },
    { nonce: "9007199254740992" },
    { nonce: "1.5" },
    { value: -1n },
    { gasLimit: "20999" },
    { maxFeePerGas: 1n },
  ])
    assert.throws(() => buildTransaction({ ...fields, ...patch }))
  assert.equal(integer(" 0007 "), 7n)
})

test("unsigned transaction round-trips without changing reviewed fields", () => {
  const tx = buildTransaction(fields)
  const roundTrip = Transaction.from(tx.unsignedSerialized)
  for (const key of ["chainId", "nonce", "to", "value", "data", "gasLimit", "maxFeePerGas", "maxPriorityFeePerGas"])
    assert.equal(roundTrip[key], tx[key])
  assert.equal(roundTrip.type, 2)
})

test("signature recovery verifies the signer and the exact payload", () => {
  const tx = buildTransaction(fields)
  const signature = wallet.signingKey.sign(tx.unsignedHash)
  const result = { r: signature.r.slice(2), s: signature.s.slice(2), v: signature.yParity.toString(16) }
  const signed = attachSignature(tx.unsignedSerialized, result, wallet.address)
  assert.equal(signed.from, wallet.address)
  assert.equal(signed.unsignedSerialized, tx.unsignedSerialized)
  assert.equal(Transaction.from(signed.serialized).hash, signed.hash)
  assert.throws(() => attachSignature(tx.unsignedSerialized, result, recipient), /signer/)
  const changed = buildTransaction({ ...fields, value: 2n })
  assert.throws(() => attachSignature(changed.unsignedSerialized, result, wallet.address), /signer/)
  for (const patch of [{ v: "25" }, { r: "00" }, { s: "xyz" }])
    assert.throws(() => attachSignature(tx.unsignedSerialized, { ...result, ...patch }, wallet.address))
})

test("review exposes decoded ERC-20 values and maximum execution cost", () => {
  const tx = buildTransaction({
    ...fields,
    value: 0n,
    data: IERC20.encodeFunctionData("transfer", [recipient, 12345678n]),
    gasLimit: "60000",
  })
  const review = transactionReview(tx, wallet.address, {
    chainName: "Ethereum",
    symbol: "ETH",
    token: { symbol: "USDC", decimals: 6 },
  })
  for (const text of [
    "12.345678 USDC",
    "12345678",
    recipient,
    "60000",
    "0.0012 ETH",
    "20.0 gwei",
    "additional",
    "chain ID 1",
    tx.data.slice(0, 40),
  ])
    assert.ok(review.includes(text), text)
})

test("every static token preset has a valid checksum, decimals and unique contract", () => {
  for (const entries of Object.values(tokens)) {
    const seen = new Set()
    for (const entry of entries) {
      const contract = address(entry.value)
      assert.equal(entry.value, contract)
      assert.ok(Number.isInteger(entry.decimals) && entry.decimals >= 0 && entry.decimals <= 255)
      assert.ok(!seen.has(contract))
      seen.add(contract)
    }
    assert.equal(entries[0].symbol, "USDC")
  }
})
