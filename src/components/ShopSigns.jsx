import React from "react";
import { Link } from "react-router-dom";

const shopLinks = [
  { name: "BlockSwap Exchange", path: "/blockswap", color: "from-cyan-500 to-blue-600" },
  { name: "BlockPlay Arcade", path: "/blockplay", color: "from-purple-500 to-pink-600" },
  { name: "BlockShop Bazaar", path: "/blockshop", color: "from-amber-400 to-yellow-500" },
  { name: "BlockBet Lounge", path: "/blockbet", color: "from-rose-500 to-red-700" },
  { name: "BlockProof Vault", path: "/blockproof", color: "from-yellow-400 to-orange-600" },
];

export default function ShopSigns() {
  return (
    <div className="flex flex-wrap justify-center gap-6 mt-10 z-10">
      {shopLinks.map((shop, i) => (
        <Link
          key={i}
          to={shop.path}
          className={`px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r ${shop.color} shadow-[0_0_20px_rgba(0,0,0,0.3)] text-white hover:scale-105 transition-transform duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]`}
        >
          {shop.name}
        </Link>
      ))}
    </div>
  );
}
