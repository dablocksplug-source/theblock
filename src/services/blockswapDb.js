import { supabase } from "../lib/supabaseClient";
import { BLOCKSWAP_CONFIG as C } from "../config/blockswap.config";

const CHAIN_ID = Number(C.CHAIN_ID);

export async function dbGetProfilesMap(addressesLower = []) {
  if (!addressesLower.length) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("address, nickname")
    .eq("chain_id", CHAIN_ID)
    .in("address", addressesLower);

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    map[String(row.address || "").toLowerCase()] = row.nickname || "";
  }
  return map;
}

export async function dbGetRecentSwapEvents(limit = 50) {
  const { data, error } = await supabase
    .from("swap_events")
    .select("*")
    .eq("chain_id", CHAIN_ID)
    .order("block_number", { ascending: false })
    .order("log_index", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function dbGetRewardsRounds(limit = 20) {
  const { data, error } = await supabase
    .from("rewards_rounds")
    .select("*")
    .eq("chain_id", CHAIN_ID)
    .order("round_id", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function dbGetMyRewardsProof(roundId, addressLower) {
  const { data, error } = await supabase
    .from("rewards_proofs")
    .select("*")
    .eq("chain_id", CHAIN_ID)
    .eq("round_id", Number(roundId))
    .eq("address", String(addressLower).toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
