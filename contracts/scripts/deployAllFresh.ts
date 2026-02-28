import "dotenv/config";
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseUnits,
  formatUnits,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

import MockUSDC from "../artifacts/contracts/MockUSDC.sol/MockUSDC.json";
import OZToken from "../artifacts/contracts/OZToken.sol/OZToken.json";
import BlockSwap from "../artifacts/contracts/BlockSwap.sol/BlockSwap.json";

// --------------------
// helpers
// --------------------
function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function optEnv(name: string) {
  const v = process.env[name];
  return v ? String(v).trim() : "";
}

function mustAddr(name: string, v: string): `0x${string}` {
  const s = String(v || "").trim();
  // Allow lowercase / non-checksummed by normalizing.
  // getAddress throws if not a valid 20-byte hex address.
  try {
    const norm = getAddress(s);
    return norm as `0x${string}`;
  } catch {
    // Keep the old strict message for clarity
    if (!isAddress(s)) throw new Error(`Invalid address for ${name}: ${v}`);
    // If isAddress passes but getAddress fails (rare), still throw
    throw new Error(`Invalid address (checksum) for ${name}: ${v}`);
  }
}

async function mustConfirm(publicClient: any, hash: `0x${string}`) {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`TX reverted: ${hash}`);
  return r;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function assertHasCode(publicClient: any, label: string, addr: `0x${string}`) {
  for (let i = 1; i <= 7; i++) {
    const code = await publicClient.getBytecode({ address: addr });
    if (code && code !== "0x") return;
    console.log(`⏳ bytecode not ready for ${label} (try ${i}/7): ${addr}`);
    await sleep(1200);
  }
  throw new Error(`No bytecode at ${label} address (RPC/chain/address mismatch): ${addr}`);
}

async function readWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  tries = 7,
  delayMs = 900
): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      console.log(`⏳ read failed (${label}) try ${i}/${tries}: ${msg}`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function writeJson(path: string, obj: any) {
  fs.writeFileSync(path, JSON.stringify(obj, null, 2));
}

function fmt6(n: bigint) {
  return formatUnits(n, 6);
}

function fmt18(n: bigint) {
  return formatUnits(n, 18);
}

// --------------------
// main
// --------------------
async function main() {
  // Determine which chain we are targeting (defaults to baseSepolia if not provided)
  const targetChainId = Number(optEnv("CHAIN_ID") || optEnv("TARGET_CHAIN_ID") || "84532");
  const chain = targetChainId === base.id ? base : baseSepolia;

  // Choose RPC based on chain
  const RPC = (
    (chain.id === base.id ? optEnv("BASE_MAINNET_RPC") : optEnv("BASE_SEPOLIA_RPC")) ||
    optEnv("RPC_URL") ||
    (chain.id === base.id ? "https://mainnet.base.org" : "https://sepolia.base.org")
  ).trim();

  const pk = mustEnv("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(pk);

  const reserve = mustAddr("RESERVE_WALLET", mustEnv("RESERVE_WALLET"));
  const treasury = mustAddr("TREASURY_WALLET", mustEnv("TREASURY_WALLET"));
  const relayer = mustAddr("RELAYER_WALLET", mustEnv("RELAYER_WALLET"));

  // Optional: if you want the owner to be a different wallet than deployer
  const owner =
    process.env.OWNER_WALLET && isAddress(process.env.OWNER_WALLET)
      ? (mustAddr("OWNER_WALLET", process.env.OWNER_WALLET) as `0x${string}`)
      : account.address;

  // OZ supply split (whole ounces)
  const reserveWholeOz = 18000n;
  const saleWholeOz = 54000n;

  // Prices (USDC 6 decimals)
  const sellPerBrick = 1000n * 10n ** 6n;
  const floorPerBrick = 500n * 10n ** 6n;

  // Lock behavior on fresh deploy
  const START_PAUSED = true; // set false if you want buys live immediately

  // USDC behavior:
  // - On mainnet: use native USDC by default
  // - On sepolia: deploy MockUSDC by default
  const FORCE_MOCK_USDC = optEnv("FORCE_MOCK_USDC").toLowerCase() === "true";

  // Lowercased native USDC (Base mainnet) — will be checksummed by mustAddr/getAddress
  const NATIVE_USDC_MAINNET = "0x833589fcD6edb6e08f4c7c32d4f71b54bda02913".toLowerCase();

  const publicClient = createPublicClient({
    chain,
    transport: http(RPC, { timeout: 15_000, retryCount: 2, retryDelay: 350 }),
  });

  const walletClient = createWalletClient({
    chain,
    transport: http(RPC, { timeout: 15_000, retryCount: 2, retryDelay: 350 }),
    account,
  });

  const liveChainId = await publicClient.getChainId();
  console.log("RPC:", RPC);
  console.log("ChainId:", liveChainId);
  console.log("Target :", chain.name, `(expected ${chain.id})`);
  console.log("Deployer:", account.address);
  console.log("Owner   :", owner);
  console.log("Reserve :", reserve);
  console.log("Treasury:", treasury);
  console.log("Relayer :", relayer);

  if (liveChainId !== chain.id) {
    throw new Error(
      `Wrong chainId from RPC. Expected ${chain.id} (${chain.name}), got ${liveChainId}. Fix RPC env vars.`
    );
  }

  // Output file
  const FILE =
    chain.id === base.id ? "deployments.baseMainnet.json" : "deployments.baseSepolia.json";

  // 1) USDC
  let USDC: `0x${string}`;

  if (chain.id === base.id && !FORCE_MOCK_USDC) {
    // mainnet: use native USDC unless explicitly overridden
    const envUsdcRaw = optEnv("USDC_ADDRESS") || optEnv("USDC");
    const pickedRaw = envUsdcRaw || NATIVE_USDC_MAINNET;
    USDC = mustAddr("USDC_ADDRESS", pickedRaw);
    console.log("\n✅ Using native USDC (no deployment):", USDC);
  } else {
    // testnet (or forced mock): deploy MockUSDC
    console.log("\n▶ Deploying MockUSDC...");
    const usdcHash = await walletClient.deployContract({
      abi: MockUSDC.abi,
      bytecode: MockUSDC.bytecode as `0x${string}`,
      args: [owner],
    });
    const usdcRcpt = await mustConfirm(publicClient, usdcHash);
    USDC = usdcRcpt.contractAddress!;
    console.log("✅ MockUSDC:", USDC);
    await assertHasCode(publicClient, "MockUSDC", USDC);
  }

  // 2) Deploy OZToken
  console.log("\n▶ Deploying OZToken...");
  const ozHash = await walletClient.deployContract({
    abi: OZToken.abi,
    bytecode: OZToken.bytecode as `0x${string}`,
    args: [
      owner,           // initialOwner
      reserve,         // reserve gets 18k
      account.address, // saleInventory gets 54k ✅ MUST BE DEPLOYER for seeding
      reserveWholeOz,
      saleWholeOz,
    ],
  });
  const ozRcpt = await mustConfirm(publicClient, ozHash);
  const OZ = ozRcpt.contractAddress!;
  console.log("✅ OZToken:", OZ);
  await assertHasCode(publicClient, "OZToken", OZ);

  // 3) Deploy BlockSwap
  console.log("\n▶ Deploying BlockSwap...");
  const swapHash = await walletClient.deployContract({
    abi: BlockSwap.abi,
    bytecode: BlockSwap.bytecode as `0x${string}`,
    args: [owner, OZ, USDC, treasury, relayer, sellPerBrick, floorPerBrick],
  });
  const swapRcpt = await mustConfirm(publicClient, swapHash);
  const SWAP = swapRcpt.contractAddress!;
  console.log("✅ BlockSwap:", SWAP);
  await assertHasCode(publicClient, "BlockSwap", SWAP);

  // Write deployments EARLY so you can inspect even if seed fails
  const deployments: any = {
    network: chain.id === base.id ? "baseMainnet" : "baseSepolia",
    chainId: chain.id,
    rpc: RPC,
    deployer: account.address,
    contracts:
      chain.id === base.id && !FORCE_MOCK_USDC
        ? { OZToken: OZ, BlockSwap: SWAP, USDC }
        : { MockUSDC: USDC, OZToken: OZ, BlockSwap: SWAP },
    params: {
      reserve,
      treasury,
      relayer,
      inventoryOZ: saleWholeOz.toString(),
      reserveOZ: reserveWholeOz.toString(),
      sellPerBrick: sellPerBrick.toString(),
      floorPerBrick: floorPerBrick.toString(),
      saleInventory: account.address,
      seeded: "false",
      startPaused: String(START_PAUSED),
      owner,
      forceMockUsdc: String(FORCE_MOCK_USDC),
    },
  };
  writeJson(FILE, deployments);
  console.log("\n✅ Wrote", FILE, "(pre-seed)");

  // 4) Verify OZ balances BEFORE seeding (with retries)
  const reserveBal = (await readWithRetry(
    () =>
      publicClient.readContract({
        address: OZ,
        abi: OZToken.abi,
        functionName: "balanceOf",
        args: [reserve],
      }),
    "OZ.balanceOf(reserve)"
  )) as bigint;

  const deployerBal = (await readWithRetry(
    () =>
      publicClient.readContract({
        address: OZ,
        abi: OZToken.abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
    "OZ.balanceOf(deployer)"
  )) as bigint;

  const swapBalBefore = (await readWithRetry(
    () =>
      publicClient.readContract({
        address: OZ,
        abi: OZToken.abi,
        functionName: "balanceOf",
        args: [SWAP],
      }),
    "OZ.balanceOf(swap)"
  )) as bigint;

  console.log("\nOZ balances right after deploy:");
  console.log(" - reserve   OZ:", fmt18(reserveBal));
  console.log(" - deployer  OZ:", fmt18(deployerBal));
  console.log(" - swap      OZ:", fmt18(swapBalBefore));

  const targetSwapInv = parseUnits(saleWholeOz.toString(), 18);

  if (deployerBal === 0n) {
    throw new Error(
      `Deployer OZ balance is 0. That means OZToken saleInventory was NOT minted to deployer.\n` +
        `Confirm OZToken constructor args: saleInventory MUST be account.address.`
    );
  }

  // 5) Seed inventory (IDEMPOTENT): top up swap to exactly 54,000 OZ
  if (swapBalBefore < targetSwapInv) {
    const needed = targetSwapInv - swapBalBefore;

    if (deployerBal < needed) {
      throw new Error(
        `Deployer does not have enough OZ to seed.\n` +
          `Needed top-up: ${fmt18(needed)} OZ\n` +
          `Deployer has:   ${fmt18(deployerBal)} OZ\n` +
          `This means saleInventory mint did not go to deployer OR deployer already spent OZ.`
      );
    }

    console.log(`\n▶ Seeding BlockSwap OZ (idempotent)...`);
    console.log(" - swap current:", fmt18(swapBalBefore));
    console.log(" - target      :", fmt18(targetSwapInv));
    console.log(" - topping up  :", fmt18(needed));

    const seedHash = await walletClient.writeContract({
      address: OZ,
      abi: OZToken.abi,
      functionName: "transfer",
      args: [SWAP, needed],
    });
    await mustConfirm(publicClient, seedHash);

    const swapBalAfter = (await readWithRetry(
      () =>
        publicClient.readContract({
          address: OZ,
          abi: OZToken.abi,
          functionName: "balanceOf",
          args: [SWAP],
        }),
      "OZ.balanceOf(swap after seed)"
    )) as bigint;

    console.log("✅ Seed complete. Swap OZ now:", fmt18(swapBalAfter));
  } else {
    console.log(`\n✅ Swap already has >= ${saleWholeOz} OZ. No seeding needed.`);
  }

  // 6) Lock-in: set buyPaused to known value
  try {
    console.log(`\n▶ Setting buyPaused = ${START_PAUSED ? "true" : "false"} ...`);
    const pauseHash = await walletClient.writeContract({
      address: SWAP,
      abi: BlockSwap.abi,
      functionName: "setBuyPaused",
      args: [START_PAUSED],
    });
    await mustConfirm(publicClient, pauseHash);
    console.log("✅ buyPaused set");
  } catch (e: any) {
    console.log(
      "⚠️ Could not set buyPaused (maybe owner mismatch?):",
      e?.shortMessage || e?.message || e
    );
  }

  // 7) Verify core config on-chain
  const onchainSell = (await readWithRetry(
    () =>
      publicClient.readContract({
        address: SWAP,
        abi: BlockSwap.abi,
        functionName: "sellPricePerBrick",
      }),
    "sellPricePerBrick"
  )) as bigint;

  const onchainFloor = (await readWithRetry(
    () =>
      publicClient.readContract({
        address: SWAP,
        abi: BlockSwap.abi,
        functionName: "buybackFloorPerBrick",
      }),
    "buybackFloorPerBrick"
  )) as bigint;

  const onchainPaused = (await readWithRetry(
    () =>
      publicClient.readContract({
        address: SWAP,
        abi: BlockSwap.abi,
        functionName: "buyPaused",
      }),
    "buyPaused"
  )) as boolean;

  console.log("\n✅ On-chain verification:");
  console.log(" - sell/brick :", fmt6(onchainSell), "USDC");
  console.log(" - floor/brick:", fmt6(onchainFloor), "USDC");
  console.log(" - buyPaused  :", onchainPaused);

  deployments.params.seeded = "true";
  writeJson(FILE, deployments);
  console.log("\n✅ Updated", FILE, "(post-seed, locked)");

  console.log("\n🔥 READY:");
  console.log(" - When you’re ready to go live, call setBuyPaused(false) from Admin Panel.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});