require("dotenv").config();

const { DEPLOYER_PRIVATE_KEY, TRON_FULL_HOST, TRON_SOLIDITY_HOST } = process.env;

module.exports = {
  contracts_directory: "../../contracts", // flat folder: Base.sol + Tron.sol
  contracts_build_directory: "./build/contracts",
  networks: {
    mainnet: {
      privateKey: DEPLOYER_PRIVATE_KEY,
      consume_user_resource_percent: 30,
      fee_limit: 1_000_000_000,
      fullHost: TRON_FULL_HOST || "https://api.trongrid.io",
      network_id: "1",
    },
    shasta: {
      // Tron's public testnet — deploy here first to sanity check before mainnet.
      privateKey: DEPLOYER_PRIVATE_KEY,
      consume_user_resource_percent: 30,
      fee_limit: 1_000_000_000,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2",
    },
  },
  compilers: {
    solc: {
      version: "0.8.24",
      settings: {
        optimizer: { enabled: true, runs: 10000 },
        evmVersion: "istanbul", // TVM does not support post-Istanbul opcodes (e.g. PUSH0)
      },
    },
  },
};
