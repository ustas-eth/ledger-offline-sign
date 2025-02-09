#!/usr/bin/env node

/**
 * Copyright (c) 2024-present, ustas-eth
 *
 * The modifications and additions to the original source code are licensed under the
 * MIT license found in the LICENSE file in the root directory of this source tree.
 *
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * The original source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of https://github.com/facebook/create-react-app.
 */

"use strict"

import { run } from "./offline-sign.js"

const currentNodeVersion = process.versions.node
const semver = currentNodeVersion.split(".")
const major = semver[0]

if (major < 20) {
  console.warning(
    "You are running Node " +
      currentNodeVersion +
      ".\n" +
      "Ledger Offline Sign is being developed\n" +
      "on Node 20 or higher.\n" +
      "Please update your version of Node or" +
      "expect issues.\n",
  )
}

run()
