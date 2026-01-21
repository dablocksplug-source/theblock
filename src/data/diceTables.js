// src/data/diceTables.js

// All dice tables for BlockPlay – 2–7 player game.
// IDs are used in routes: /blockplay/dice/:tableId

export const diceTables = [
  // -------- $1 CASUAL / LOW --------
  {
    id: "low-1",
    name: "Lucky Bayou",
    minBet: 1,
    maxPlayers: 7,
    tier: "Casual",
    stakeLabel: "$1",
    status: "Waiting for players",
  },
  {
    id: "low-2",
    name: "Snake Eyes",
    minBet: 1,
    maxPlayers: 7,
    tier: "Casual",
    stakeLabel: "$1",
    status: "Waiting for players",
  },
  {
    id: "low-3",
    name: "Gator Roll",
    minBet: 1,
    maxPlayers: 7,
    tier: "Low Stakes",
    stakeLabel: "$1",
    status: "Waiting for players",
  },
  {
    id: "low-4",
    name: "Bayou Bones",
    minBet: 1,
    maxPlayers: 7,
    tier: "Low Stakes",
    stakeLabel: "$1",
    status: "Waiting for players",
  },
  {
    id: "low-5",
    name: "River Runner",
    minBet: 1,
    maxPlayers: 7,
    tier: "Low Stakes",
    stakeLabel: "$1",
    status: "Waiting for players",
  },
  {
    id: "low-6",
    name: "Dice Den",
    minBet: 1,
    maxPlayers: 7,
    tier: "Low Stakes",
    stakeLabel: "$1",
    status: "Waiting for players",
  },
  {
    id: "low-7",
    name: "Roulette Rouge",
    minBet: 1,
    maxPlayers: 7,
    tier: "Low Stakes",
    stakeLabel: "$1",
    status: "Waiting for players",
  },

  // -------- $5 MID STAKES --------
  {
    id: "mid-1",
    name: "High Tide",
    minBet: 5,
    maxPlayers: 7,
    tier: "Mid Stakes",
    stakeLabel: "$5",
    status: "Waiting for players",
  },
  {
    id: "mid-2",
    name: "Shooter’s Alley",
    minBet: 5,
    maxPlayers: 7,
    tier: "Mid Stakes",
    stakeLabel: "$5",
    status: "Waiting for players",
  },
  {
    id: "mid-3",
    name: "Crescent Heat",
    minBet: 5,
    maxPlayers: 7,
    tier: "Mid Stakes",
    stakeLabel: "$5",
    status: "Waiting for players",
  },

  // -------- HIGH LIMIT --------
  {
    id: "hi-10",
    name: "French Quarter",
    minBet: 10,
    maxPlayers: 7,
    tier: "High Stakes",
    stakeLabel: "$10",
    status: "Waiting for players",
  },
  {
    id: "hi-20",
    name: "Voodoo Roll",
    minBet: 20,
    maxPlayers: 7,
    tier: "Elite",
    stakeLabel: "$20",
    status: "Waiting for players",
  },
];
