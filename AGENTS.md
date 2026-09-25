# AGENTS

This is an interactive offline EVM signing utility for USB Ledger devices.
Keep it small: prompts, local validation, explicit review, device signing, and
raw signed output. Follow CONTRIBUTING.md for checks and release boundaries.

- No runtime network requests, RPCs, broadcasts, remote metadata, analytics,
  transaction files, or persistent wallet data. Installation is a separate phase.
- Always pass explicit `null` metadata resolution to Ledger signing. Exercise
  the actual installed SDK under network guards after dependency changes.
- Amounts and fees use integer arithmetic. Validate every input before opening
  the device. Preserve exact unsigned bytes from review through signing.
- Verify the address on-device, recheck the account before signing, and recover
  the signer from the returned signature before displaying signed output.
- Signing requires explicit confirmation, defaulting to No. Close the transport
  after success, errors, and cancellation; never silently retry signing.
- Local decoded token information is not trusted device clear signing. Document
  blind-signing and offline validation limits without promising absolute privacy.
- Use simulated hardware and ephemeral keys in tests. Keep demo code outside the
  installable package. Do not create a release or publish to npm as routine upkeep.

Keep README short and user-facing. Avoid additional hosted workflows or tooling
unless it solves a concrete need. The release workflow is the only hosted check.
