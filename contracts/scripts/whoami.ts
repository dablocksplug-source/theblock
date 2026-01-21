import hre from "hardhat";

async function main() {
  const walletClient = await hre.viem.getWalletClient();
  console.log("Deployer address:", walletClient.account.address);
  console.log("Chain ID:", await walletClient.getChainId());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
