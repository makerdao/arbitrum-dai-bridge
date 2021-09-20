[![Lint](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/lint.yml/badge.svg)](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/lint.yml)
[![Check](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/slither.yml/badge.svg)](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/slither.yml)
[![Tests](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/tests.yml/badge.svg)](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/tests.yml)
[![Fuzz](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/fuzz.yml/badge.svg)](https://github.com/makerdao/arbitrum-dai-bridge/actions/workflows/fuzz.yml)

# Arbitrum Dai Bridge

Arbitrum Dai, upgradable token bridge and governance relay

## Contracts

- `dai.sol` - Improved DAI contract.
- `L1DaiGateway.sol` - L1 side of the bridge. Escrows L1 DAI in `L1Escrow` contract. Unlocks L1 DAI upon withdrawal
  message from `L2DaiGateway`.
- `L2DaiGateway.sol` - L2 side of the bridge. Mints new L2 DAI after receiving a message from `L1DaiGateway`. Burns L2
  DAI tokens when withdrawals happen.
- `L1Escrow` - Hold funds on L1. Allows having many bridges coexist on L1 and share liquidity.
- `L1GovernanceRelay` & `L2GovernanceRelay` - allows to execute a governance spell on L2.

## Diagrams:

![Basic deposit](docs/deposit.png?raw=true 'Basic deposit')

[Full diagram](docs/full.png)

## Upgrade guide

### Deploying new token bridge

This bridge stores funds in an external escrow account rather than on the bridge address itself. To upgrade, deploy the
new bridge independently and connect it to the same escrow. Thanks to this, multiple bridges can operate at the same
time (with potentially different interfaces), and no bridge will ever run out of funds.

### Closing bridge

After deploying a new bridge, you might consider closing the old one. The procedure is slightly complicated due to async
messages (`finalizeInboundTransfer`) that can be in progress.

An owner calls `L2DaiGateway.close()` and `L1DaiGateway.close()` so no new async messages can be sent to the other part
of the bridge. After all async messages are done processing (can take up to 1 week), the bridge is effectively closed.
Now, the owner can consider revoking approval to access funds from escrow on L1 and token minting rights on L2.

## Emergency shutdown

If ES is triggered, ESM contract can be used to `deny` access from the `PauseProxy` (governance). In such scenario the
bridge continues to work as usual and it's impossible to close it.

## Known Risks

### Wrong parameters for xchain messages

Arbitrum's xchain messages require
[a couple of arguments](https://developer.offchainlabs.com/docs/l1_l2_messages#parameters). We expose these in our
public interfaces so it's up to the users to select appropriate values. Wrong values will cause a need to manually retry
L1 -> L2 messages or in the worst case can cause a message to be lost. This is especially difficult when interacting
with `L1GovernanceRelay` via MakerDAO governance spells with a long delay (2 days).

### Arbitrum bug

In this section, we describe various risks caused by possible **bugs** in Arbitrum system.

**L1 -> L2 message passing bug**

Bug allowing to send arbitrary messages from L1 to L2 ie. This could result in minting of uncollateralized L2 DAI. This
can be done via:

- sending `finalizeInboundTransfer` messages directly to `L2DaiGateway`
- granting minting rights by executing malicious spell with `L2GovernanceRelay`

Immediately withdrawing L2 DAI to L1 DAI is not possible because of the dispute period (1 week). In case of such bug,
governance can disconnect `L1DAITokenBridge` from `L1Escrow`, ensuring that no L1 DAI can be stolen. Even with 2 days
delay on governance actions, there should be plenty of time to coordinate action. Later off-chain coordination is
required to send DAI back to rightful owners or redeploy Arbitrum system.

**L2 -> L1 message passing bug**

Bug allowing to send arbitrary messages from L2 to L1 is potentially more harmful. This can happen in two ways:

1. Bug in `Outbox` allows sending arbitrary messages on L1 bypassing the dispute period,
2. The fraud proof system stops working which allows submitting incorrect state root. Such state root can be used to
   proof an arbitrary message sent from L2 to L1. This will be a subject to a dispute period (1 week).

If (1) happens, an attacker can immediately drain L1 DAI from `L1Escrow`.

If (2) happens, governance can disconnect `L1DAITokenBridge` from `L1Escrow` and prevent the theft of L1 DAI.

**Malicious router**

`GatewayRouter` developed by Arbitrum team, is a privileged actor in our system and allows explicitly passing addresses
that initiated deposits/withdrawals. It was reviewed by our team but if there is a bug in its implementation it could in
theory be used to steal funds from the escrow (burn arbitrary L2 DAI tokens and withdraw them to any address, or steal
DAI that was already approved on L1). If it's malicious, it could be used to steal funds.

### Arbitrum upgrade

Arbitrum contracts ARE upgradable. A malicious upgrade could result in stealing user funds in many ways. Users need to
trust Arbitrum admins while using this bridge or while interacting with the Arbitrum network.

### Governance mistake during upgrade

Bridge upgrade is not a trivial procedure due to the async messages between L1 and L2. The whole process is described in
_Upgrade guide_ in this document.

If a governance spell mistakenly revokes old bridge approval to access escrow funds, async withdrawal messages will
fail. Fortunately, reverted messages can be retried at a later date (for one week for L1 -> L2 messages), so governance
has a chance to fix its mistake and process pending messages again.

## Invariants

### L1 DAI Locked and L2 DAI Minted

```
L1DAI.balanceOf(escrow) ≥ L2DAI.totalSupply()
```

All DAI available on L2 should be locked on L1. This should hold true with more bridges as well.

It's `>=` because:

a) when depositing on L1, locking is instant but minting is an async message

b) when withdrawing from L2, burning is instant but unlocking on L1 is an async message and is subject to a dispute
period (1 week)

c) someone can send L1 DAI directly to the escrow

## Deployments

### Mainnet

```json
{
  "l1DaiGateway": "0xD3B5b60020504bc3489D6949d545893982BA3011",
  "l1Escrow": "0xA10c7CE4b876998858b1a9E12b10092229539400",
  "l2Dai": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  "l2DaiGateway": "0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65",
  "l1Dai": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  "l1GovRelay": "0x9ba25c289e351779E0D481Ba37489317c34A899d",
  "l2GovRelay": "0x10E6593CDda8c58a1d0f14C5164B376352a55f2F"
}
```

### Rinkeby

```json
{
  "l1DaiGateway": "0x10E6593CDda8c58a1d0f14C5164B376352a55f2F",
  "l1Escrow": "0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65",
  "l2Dai": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  "l2DaiGateway": "0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65",
  "l1Dai": "0xd9e66A2f546880EA4d800F189d6F12Cc15Bff281",
  "l1GovRelay": "0x09B354CDA89203BB7B3131CC728dFa06ab09Ae2F",
  "l2GovRelay": "0x10E6593CDda8c58a1d0f14C5164B376352a55f2F"
}
```

## Running

```
yarn
yarn build
yarn test  # runs unit tests
```

## Running E2E tests

Arbitrum doesn't provide local dev environment so E2E tests are executed against the Rinkeby network.

## Development

Run `yarn test:fix` to run linting in fix mode, auto-formatting and unit tests.

Running `yarn test` makes sure that contracts are compiled. Running `yarn test-e2e` doesn't.

## Fuzzing

### Install Echidna

- Precompiled Binaries (recommended)

Before starting, make sure Slither is installed:

```
$ pip3 install slither-analyzer
```

To quickly test Echidna in Linux or MacOS: [release page](https://github.com/crytic/echidna/releases)

### Local Dependencies

- Slither:
  ```
  $ pip3 install slither-analyzer
  ```
- solc-select:
  ```
  $ pip3 install solc-select
  ```

### Run Echidna Tests

- Install solc version:
  ```
  $ solc-select install 0.6.11
  ```
- Select solc version:
  ```
  $ solc-select use 0.6.11
  ```
- Run Echidna Tests:
  ```
  $ yarn fuzz
  ```

## Certora

### Install Certora

- Install Java
  ```
  sudo apt install openjdk-14-jdk
  ```
- Install Certora Prover
  ```
  pip3 install certora-cli
  ```
- Set Certora Key
  ```
  export CERTORAKEY=<key>
  ```

### Local Dependencies

- solc-select:
  ```
  pip3 install solc-select
  ```

### Run Certora Specs

- Install solc version:
  ```
  solc-select install 0.6.11
  ```
- Run Certora Specs:
  ```
  yarn certora
  ```
