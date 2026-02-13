import "dotenv/config";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const PK = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

async function main() {
  if (!PK) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  const account = privateKeyToAccount(PK);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  console.log("Deployer:", account.address);

  const bal = await publicClient.getBalance({ address: account.address });
  console.log("ETH balance (wei):", bal.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
