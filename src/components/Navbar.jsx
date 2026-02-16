import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import ConnectMenu from "./ConnectMenu";
import { useWallet } from "../context/WalletContext";
import { useNicknameContext, getDisplayName } from "../context/NicknameContext";

const shortAddr = (a) =>
  a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—";

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 84532);

const Navbar = () => {
  const links = [
    { name: "BlockSwap", path: "/blockswap" },
    { name: "BlockBet", path: "/blockbet" },
    { name: "BlockPlay", path: "/blockplay" },
    { name: "BlockShop", path: "/blockshop" },
    { name: "BlockPay", path: "/blockpay" },
    { name: "BlockProof", path: "/blockproof" },
  ];

  const { walletAddress, isConnected, chainId } = useWallet();
  const { nickname, useNickname } = useNicknameContext();

  const displayName = getDisplayName({ walletAddress, nickname, useNickname });
  const [toast, setToast] = useState("");

  const wrongChain =
    isConnected &&
    Number(TARGET_CHAIN_ID) > 0 &&
    Number(chainId || 0) > 0 &&
    Number(chainId) !== Number(TARGET_CHAIN_ID);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-black/70 backdrop-blur-md border-b border-cyan-500/20">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3 gap-4">
        {/* Brand */}
        <NavLink
          to="/"
          className="text-cyan-400 font-semibold text-lg tracking-wide hover:text-cyan-300 transition-colors whitespace-nowrap"
        >
          The Block
        </NavLink>

        {/* Navigation Links */}
        <div className="hidden md:flex gap-6 text-sm font-medium">
          {links.map((link) => (
            <NavLink
              key={link.name}
              to={link.path}
              className={({ isActive }) =>
                `transition-colors hover:text-cyan-300 ${
                  isActive ? "text-cyan-400" : "text-gray-300"
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </div>

        {/* Right side: wallet + status */}
        <div className="flex items-center gap-3">
          {toast ? (
            <div className="hidden sm:block text-[11px] text-emerald-200/90 border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 rounded-lg">
              {toast}
            </div>
          ) : null}

          {wrongChain ? (
            <div className="hidden sm:block text-[11px] text-rose-200/90 border border-rose-500/20 bg-rose-500/10 px-2 py-1 rounded-lg">
              Wrong network
            </div>
          ) : null}

          <ConnectMenu
            targetChainId={TARGET_CHAIN_ID}
            displayName={displayName || shortAddr(walletAddress)}
            onToast={(m) => {
              setToast(String(m || ""));
              setTimeout(() => setToast(""), 1200);
            }}
          />

          {/* Optional tiny status text */}
          <div className="hidden lg:block text-xs text-cyan-400/80 select-none">
            {isConnected ? `Wallet: ${shortAddr(walletAddress)}` : "Wallet: Disconnected"}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
