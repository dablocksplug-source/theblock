// contracts/scripts/mintMockUSDC.mjs
import "dotenv/config";
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, isAddress, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// default, can override with DEPLOYMENTS_FILE env var
const DEFAULT_FILE = "deployments.baseSepolia.json";

function mustEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function mustAddr(label, v) {
  const s = String(v || "").trim();
  if (!isAddress(s)) throw new Error(`Invalid ${label} address: ${s}`);
  return s;
}

async function mustConfirm(publicClient, hash) {
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`TX reverted: ${hash}`);
  return rcpt;
}

// ---- usage ----
// node scripts/mintMockUSDC.mjs <recipient> <amountWholeUSDC>
async function main() {
  const recipient = process.argv[2];
  const amountWhole = process.argv[3] || "5000";

  if (!recipient || !isAddress(recipient)) {
    throw new Error(
      `Usage: node scripts/mintMockUSDC.mjs <recipient> <amountWholeUSDC>\n` +
        `Example: node scripts/mintMockUSDC.mjs 0xb2b7...cAEb 5000`
    );
  }

  const RPC = (process.env.BASE_SEPOLIA_RPC || process.env.RPC_URL || "").trim();
  if (!RPC) throw new Error("Missing BASE_SEPOLIA_RPC (or RPC_URL)");

  const pk = mustEnv("DEPLOYER_PRIVATE_KEY");
  const account = privateKeyToAccount(pk);

  const file = (process.env.DEPLOYMENTS_FILE || DEFAULT_FILE).trim();
  const d = readJson(file);
  const dj = d.contracts ? d.contracts : d;

  const USDC = mustAddr("MockUSDC", dj.MockUSDC || dj.USDC || dj.MockUsdc);

  // Must match your MockUSDC contract
  const MOCK_USDC_ABI = [
    {
      type: "function",
      name: "mint",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [],
    },
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "a", type: "address" }],
      outputs: [{ type: "uint256" }],
    },
    {
      type: "function",
      name: "decimals",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "uint8" }],
    },
    {
      type: "function",
      name: "symbol",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "string" }],
    },
  ];

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC, { timeout: 15_000, retryCount: 2, retryDelay: 350 }),
  });

  const walletClient = createWalletClient({
    chain: baseSepolia,
    transport: http(RPC, { timeout: 15_000, retryCount: 2, retryDelay: 350 }),
    account,
  });

  const chainId = await publicClient.getChainId();
  if (chainId !== baseSepolia.id) {
    throw new Error(`Wrong chainId. Expected ${baseSepolia.id}, got ${chainId}`);
  }

  const decimals = await publicClient
    .readContract({ address: USDC, abi: MOCK_USDC_ABI, functionName: "decimals" })
    .catch(() => 6);
  const symbol = await publicClient
    .readContract({ address: USDC, abi: MOCK_USDC_ABI, functionName: "symbol" })
    .catch(() => "USDC");

  const amount = parseUnits(String(amountWhole), Number(decimals));

  console.log("\n=== MINT MOCK USDC ===");
  console.log("Deployments file:", file);
  console.log("RPC:", RPC);
  console.log("ChainId:", chainId);
  console.log("Deployer:", account.address);
  console.log("MockUSDC:", USDC);
  console.log("Recipient:", recipient);
  console.log("Amount:", `${amountWhole} ${symbol} (raw: ${amount.toString()})`);

  const before = await publicClient.readContract({
    address: USDC,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: [recipient],
  });

  console.log("Balance before:", `${formatUnits(before, Number(decimals))} ${symbol}`);

  // simulate first (better errors)
  await publicClient.simulateContract({
    address: USDC,
    abi: MOCK_USDC_ABI,
    functionName: "mint",
    args: [recipient, amount],
    account: account.address,
  });

  const hash = await walletClient.writeContract({
    address: USDC,
    abi: MOCK_USDC_ABI,
    functionName: "mint",
    args: [recipient, amount],
  });

  console.log("Mint tx:", hash);
  await mustConfirm(publicClient, hash);

  const after = await publicClient.readContract({
    address: USDC,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: [recipient],
  });

  console.log("Balance after :", `${formatUnits(after, Number(decimals))} ${symbol}`);

  if (after <= before) {
    throw new Error(
      `Mint confirmed but balance did not increase. This usually means:\n` +
        `- you minted on a different contract address than the token you added to MetaMask, OR\n` +
        `- recipient address differs (checksum mismatch won’t matter, but wrong address will), OR\n` +
        `- mint() is not the function you think it is.\n`
    );
  }

  console.log("✅ Mint success.");
}

main().catch((e) => {
  console.error("\nERROR:", e?.shortMessage || e?.message || e);
  process.exit(1);
});
