# Arbitrum DAI bridge

# Getting started:

```
# make sure to install all submodules
git submodule update --init --recursive

# install all deps
yarn


```

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
