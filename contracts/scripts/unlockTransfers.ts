import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { abi as OunceAbi } from "../artifacts/contracts/OunceToken.sol/OunceToken.json";

const OUNCE = "0x346e6352d1D2F98fE7942084609a9037D706E61A";
const PK = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

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

  console.log("Unlocking transfers as:", account.address);

  const hash = await walletClient.writeContract({
    address: OUNCE as `0x${string}`,
    abi: OunceAbi,
    functionName: "unlockTransfers",
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Transfers unlocked tx:", receipt.transactionHash);
}

main().catch(console.error);
