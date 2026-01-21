import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { abi as OunceAbi } from "../artifacts/contracts/OunceToken.sol/OunceToken.json";

const RPC = "https://sepolia.base.org";

// ✅ paste from deployments.baseSepolia.json
const OUNCE = "0x346e6352d1D2F98fE7942084609a9037D706E61A";

// ✅ your deployer wallet address that currently holds the supply
const DEPLOYER = "0x5CA7541E7E7EA07DC0114D64090Df3f39AF5623c";

// ✅ your reserve wallet address ("500 Bricks")
const RESERVE = "0x49d118023e6bCeB0E7c4e5b7925637563A0b9805";

async function main() {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC),
  });

  const [name, symbol, decimals, totalSupply, depBal, resBal] = await Promise.all([
    publicClient.readContract({ address: OUNCE as `0x${string}`, abi: OunceAbi, functionName: "name" }),
    publicClient.readContract({ address: OUNCE as `0x${string}`, abi: OunceAbi, functionName: "symbol" }),
    publicClient.readContract({ address: OUNCE as `0x${string}`, abi: OunceAbi, functionName: "decimals" }),
    publicClient.readContract({ address: OUNCE as `0x${string}`, abi: OunceAbi, functionName: "totalSupply" }),
    publicClient.readContract({ address: OUNCE as `0x${string}`, abi: OunceAbi, functionName: "balanceOf", args: [DEPLOYER as `0x${string}`] }),
    publicClient.readContract({ address: OUNCE as `0x${string}`, abi: OunceAbi, functionName: "balanceOf", args: [RESERVE as `0x${string}`] }),
  ]);

  console.log("Token:", name, `(${symbol})`);
  console.log("Decimals:", decimals);
  console.log("TotalSupply (raw):", totalSupply.toString());
  console.log("Deployer balance (raw):", depBal.toString());
  console.log("Reserve balance (raw):", resBal.toString());

  // Optional: if your contract has a "transfersUnlocked" public var or getter, this will print it
  try {
    const unlocked = await publicClient.readContract({
      address: OUNCE as `0x${string}`,
      abi: OunceAbi,
      functionName: "transfersUnlocked",
    } as any);
    console.log("transfersUnlocked:", unlocked);
  } catch {
    console.log("No transfersUnlocked getter found (that's okay).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
