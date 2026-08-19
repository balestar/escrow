import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

// Loaded only from your local .env — never committed, never sent anywhere.
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 10000 },
      evmVersion: "paris",
    },
  },
  paths: {
    // Hardhat requires sources to live inside its project root, so the root is
    // pointed at the repo root and everything else stays scoped to this folder.
    root: "../../",
    sources: "./contracts", // flat folder: Base.sol + Tron.sol
    cache: "./deploy/base/cache",
    artifacts: "./deploy/base/artifacts",
    tests: "./deploy/base/test",
  },
  networks: {
    base: {
      url: BASE_RPC_URL,
      chainId: 8453,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      base: BASESCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
    },
  },
  typechain: {
    outDir: "./deploy/base/typechain-types",
  },
};

export default config;
