// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
pragma solidity ^0.6.11;

contract BadSpell {
  uint256 public someVar;

  function abort() external pure {
    require(false, "ABORT!");
  }
}
