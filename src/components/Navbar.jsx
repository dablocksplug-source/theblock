import React from "react";
import { NavLink } from "react-router-dom";

const Navbar = () => {
  const links = [
    { name: "BlockSwap", path: "/blockswap" },
    { name: "BlockBet", path: "/blockbet" },
    { name: "BlockPlay", path: "/blockplay" },
    { name: "BlockShop", path: "/blockshop" },
    { name: "BlockPay", path: "/blockpay" },
    { name: "BlockProof", path: "/blockproof" },
  ];

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-black/70 backdrop-blur-md border-b border-cyan-500/20">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Brand */}
        <NavLink
          to="/"
          className="text-cyan-400 font-semibold text-lg tracking-wide hover:text-cyan-300 transition-colors"
        >
          The Block
        </NavLink>

        {/* Navigation Links */}
        <div className="flex gap-6 text-sm font-medium">
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

        {/* Wallet Status */}
        <div className="text-xs text-cyan-400/80 select-none">
          Wallet: Disconnected
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
