import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { abi as OunceAbi } from "../artifacts/contracts/OunceToken.sol/OunceToken.json";

const OUNCE = "0x346e6352d1D2F98fE7942084609a9037D706E61A"; // your OUNCE token
const RESERVE = "0x49d118023e6bCeB0E7c4e5b7925637563A0b9805"; // the reserve wallet shown in your log
const AMOUNT_WHOLE_OUNCE = "18000";
const RPC = "https://sepolia.base.org";

const PK = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

async function main() {
  if (!PK) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  const account = privateKeyToAccount(PK);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC),
  });

  console.log("From (deployer):", account.address);
  console.log("To (reserve):", RESERVE);
  console.log("Ounce contract:", OUNCE);

  const bal = await publicClient.readContract({
    address: OUNCE as `0x${string}`,
    abi: OunceAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log("Deployer OUNCE balance:", bal.toString());

  const amount = parseUnits(AMOUNT_WHOLE_OUNCE, 18);

  // ✅ 1) Simulate first (catches revert reasons)
  const { request } = await publicClient.simulateContract({
    account,
    address: OUNCE as `0x${string}`,
    abi: OunceAbi,
    functionName: "transfer",
    args: [RESERVE as `0x${string}`, amount],
  });

  console.log("Sim OK. Broadcasting tx...");

  // ✅ 2) Actually send
  const hash = await walletClient.writeContract(request);
  console.log("TX hash:", hash);

  // ✅ 3) Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Receipt status:", receipt.status);

  if (receipt.status !== "success") {
    throw new Error("Transfer failed on-chain. Check explorer with tx hash above.");
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
