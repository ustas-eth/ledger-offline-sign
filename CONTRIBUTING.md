# Contributing

Use Node.js 22+ and npm. The lockfile pins the checkout dependency tree.
The npm package bundles the JavaScript Ledger SDK to preserve its reviewed
security overrides; native USB bindings are installed for the target platform.

```sh
npm ci
git config core.hooksPath .githooks
npm run check
```

`npm start` runs the checkout. `npm run format` formats it.
Tests use Node's built-in runner, ephemeral test keys, and simulated devices.
`npm run check:install` builds and installs a tarball in a temporary directory,
checks that security overrides survived packaging, and exercises the installed
SDK under network guards. Installation itself needs network access or a warm npm
cache. Run it when changing dependencies or distribution.

Use only local mock RPCs for broadcast tests. Never use a real wallet, seed
phrase, personal address, or live broadcast in tests or screenshots. Review `npm run pack -- --dry-run` when changing packaging.
`npm run pack` writes the release tarball under `dist/`; publish that tarball,
not the development directory. A temporary staging manifest keeps npm override
and bundle rules from conflicting.

Use a branch and pull request for behavioral changes. Commit messages use
`type(scope): description`; scopes are `cli`, `signing`, `privacy`, `repo`, and
`release`. Keep explanations focused on behavior and relevant verification.
Run the local checks before committing. There is no pull-request CI workflow.
The existing release workflow runs checks before publishing a GitHub release to
npm; creating a release is a separate, explicit publishing action.
If publication fails, the same workflow can be run manually with the release tag.

Before releasing, test on a physical Ledger with an account that holds no funds:
verify the displayed address, reject a transaction, cancel a prompt, reconnect,
and sign a transaction without broadcasting it. Check the recovered signer and
payload independently. Dependency upgrades must preserve explicit null metadata
resolution and pass the SDK network-blocking test. Record any remaining upstream
dependency advisories rather than implying an audit proves safety.

Screenshots and terminal smoke tests use the real prompts with a simulated
Ledger. The demo entry point cannot sign and is excluded from the npm package:

```sh
uv run --no-project --with pexpect --with pyte --with pillow python scripts/screenshots.py
uv run --no-project --with pexpect python scripts/terminal-broadcast.py
```

Inspect generated images before committing them. Do not add simulated-device
flags or environment overrides to the installed command.
