import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { abi as OunceAbi } from "../artifacts/contracts/OunceToken.sol/OunceToken.json";

const OUNCE = "0x346e6352d1D2F98fE7942084609a9037D706E61A";
const RESERVE = "0x49d118023e6bCeB0E7c4e5b7925637563A0b9805";
const PK = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

// 500 Bricks = 500 * 36 = 18,000 OUNCE
const AMOUNT = parseUnits("18000", 18);

async function main() {
  if (!PK) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  const account = privateKeyToAccount(PK);

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const hash = await walletClient.writeContract({
    address: OUNCE as `0x${string}`,
    abi: OunceAbi,
    functionName: "transfer",
    args: [RESERVE as `0x${string}`, AMOUNT],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("✅ Sent 18,000 OUNCE to reserves. Tx:", receipt.transactionHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
