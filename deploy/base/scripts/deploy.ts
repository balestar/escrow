import { ethers } from "hardhat";

// Same relayer used by the existing Ethereum / BNB Chain / Polygon deployments
// (see RELAYER_ADDRESS in ../../lib/chains.ts). Override with INITIAL_RELAYER
// in .env if you want Base to use a different relayer from day one.
const DEFAULT_RELAYER = "0x1826d8D10F6a6deadDB401Fe2843fdBf34855414";

async function main() {
  const destination = process.env.DESTINATION_ADDRESS;
  const initialRelayer = process.env.INITIAL_RELAYER || DEFAULT_RELAYER;

  if (!destination) {
    throw new Error(
      "Set DESTINATION_ADDRESS in deploy/base/.env — this is the wallet that " +
        "swept funds get forwarded to. Do NOT deploy with a placeholder address."
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Base contract to Base network with account:", deployer.address);
  console.log("  destination:", destination);
  console.log("  initialRelayer:", initialRelayer);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  deployer ETH balance:", ethers.formatEther(balance));

  const Factory = await ethers.getContractFactory("Base");
  const contract = await Factory.deploy(destination, initialRelayer);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ Base deployed to Base mainnet at:", address);
  console.log("\nVerify it (contract name will show as \"Base\" on Basescan):");
  console.log(`  npx hardhat verify --network base ${address} ${destination} ${initialRelayer}`);
  console.log("\nThen send the address back so it can be wired into lib/chains.ts as the");
  console.log("Base chain's `contract` field (currently left blank/inactive on purpose).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
