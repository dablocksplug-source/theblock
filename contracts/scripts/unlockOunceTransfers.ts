import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { abi as OunceAbi } from "../artifacts/contracts/OunceToken.sol/OunceToken.json";

const PK = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const OUNCE = "0xYOUR_OUNCE_CONTRACT_ADDRESS"; // paste from deployments.baseSepolia.json
const RPC = "https://sepolia.base.org";

async function main() {
  if (!PK) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
  const account = privateKeyToAccount(PK);

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  const hash = await walletClient.writeContract({
    address: OUNCE,
    abi: OunceAbi,
    functionName: "unlockTransfers",
    args: [],
  });

  console.log("unlockTransfers tx:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("status:", receipt.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
