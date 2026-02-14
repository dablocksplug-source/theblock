import "dotenv/config";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const RPC_URL = mustEnv("RPC_URL");
const DEPLOYER_PRIVATE_KEY = mustEnv("DEPLOYER_PRIVATE_KEY");
const USDC = mustEnv("USDC_ADDRESS");
const MERKLE = mustEnv("REWARDS_MERKLE_ADDRESS");

// 50,000 USDC (6 decimals)
const AMT = 50_000n * 1_000_000n;

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

async function main() {
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });

  console.log("Deployer:", account.address);
  console.log("USDC:", USDC);
  console.log("Merkle:", MERKLE);
  console.log("Approve amount:", AMT.toString());

  const before = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, MERKLE],
  });

  console.log("Allowance before:", before.toString());

  const hash = await walletClient.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [MERKLE, AMT],
  });

  console.log("Approve tx:", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("✅ Approved");
}

main();
