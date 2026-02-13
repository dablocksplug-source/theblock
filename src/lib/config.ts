import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().optional(),

  // Network
  CHAIN_ID: z.string().default("84532"),
  RPC_URL: z.string().min(1),

  // Relayer hot key (Fly secrets only in prod)
  RELAYER_PRIVATE_KEY: z.string().min(1),

  // Contracts
  BLOCKSWAP_ADDRESS: z.string().min(1),
  OZ_ADDRESS: z.string().min(1),
  USDC_ADDRESS: z.string().min(1),

  // Optional toggles
  LOG_LEVEL: z.string().optional()
});

export const ENV = EnvSchema.parse(process.env);

export const CHAIN_ID = Number(ENV.CHAIN_ID);
export const PORT = Number(ENV.PORT || "8080");
