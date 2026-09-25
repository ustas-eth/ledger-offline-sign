# AGENTS

This is an interactive offline EVM signing utility for USB Ledger devices.
Keep it small: prompts, local validation, explicit review, device signing, and
raw signed output. Follow CONTRIBUTING.md for checks and release boundaries.

- Signing stays offline. Public list downloads and RPC broadcasting require
  explicit online options; cached lists can be used offline. Never persist
  wallets, signed transactions, custom RPC URLs, search history, or analytics.
- Broadcast only to the selected RPC after checking its chain ID and obtaining
  explicit confirmation. A failed chain check may be retried or the RPC changed
  only by user choice; retain the signed bytes in memory. Never automatically
  retry, fail over, follow redirects, or probe other endpoints. Treat errors after
  submission as an unknown broadcast outcome; do not offer a send retry.
- Cache only public metadata. Sanitize labels and validate contracts, decimals,
  URLs, and chain IDs; provider privacy labels are attributed claims.
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
