const Tron = artifacts.require("Tron");

// Same relayer used by the existing EVM deployments (see RELAYER_ADDRESS in
// ../../../lib/chains.ts), expressed as a hex-form Tron address. Note Tron's
// TVM understands hex-form (0x...) addresses identically to base58 (T...) ones
// internally — TronBox/TronWeb just display base58 by convention. Override with
// INITIAL_RELAYER_HEX in .env if Tron should use a different relayer.
const DEFAULT_RELAYER_HEX = "0x1826d8D10F6a6deadDB401Fe2843fdBf34855414";

module.exports = function (deployer) {
  const destinationHex = process.env.DESTINATION_ADDRESS_HEX;
  const initialRelayerHex = process.env.INITIAL_RELAYER_HEX || DEFAULT_RELAYER_HEX;

  if (!destinationHex) {
    throw new Error(
      "Set DESTINATION_ADDRESS_HEX in deploy/tron/.env — the hex (0x...) form of the " +
        "Tron destination wallet. Convert a base58 T... address with tronWeb.address.toHex()."
    );
  }

  deployer.deploy(Tron, destinationHex, initialRelayerHex);
};
