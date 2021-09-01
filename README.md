# Arbitrum DAI bridge

# Getting started:

```
# make sure to install all submodules
git submodule update --init --recursive

# install all deps
yarn


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
