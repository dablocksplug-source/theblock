// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App.jsx";
import "./index.css";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./wagmi";

import { WalletProvider } from "./context/WalletContext.jsx";
import { NicknameProvider } from "./context/NicknameContext.jsx";
import { SoundProvider } from "./context/SoundContext.jsx";

// ✅ Pages
import TheBlock from "./pages/TheBlock.jsx";
import BlockSwap from "./pages/BlockSwap.jsx";
import Lore from "./pages/Lore.jsx";
import InvestorOverview from "./pages/InvestorOverview.jsx";

import BlockBet from "./pages/BlockBet.jsx";
import BlockPlay from "./pages/BlockPlay.jsx";
import BlockShop from "./pages/BlockShop.jsx";
import BlockPay from "./pages/BlockPay.jsx";
import BlockProof from "./pages/BlockProof.jsx";

// ✅ Keep query client OUTSIDE React render so it isn’t recreated on refresh
const queryClient = new QueryClient();

function Root() {
  return (
    <React.StrictMode>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <SoundProvider>
              <WalletProvider>
                <NicknameProvider>
                  {/* ✅ ROUTES ARE REQUIRED for <Outlet /> to work */}
                  <Routes>
                    <Route element={<App />}>
                      {/* ✅ Home */}
                      <Route index element={<TheBlock />} />

                      {/* ✅ District routes */}
                      <Route path="blockswap" element={<BlockSwap />} />
                      <Route path="blockbet" element={<BlockBet />} />
                      <Route path="blockplay" element={<BlockPlay />} />
                      <Route path="blockshop" element={<BlockShop />} />
                      <Route path="blockpay" element={<BlockPay />} />
                      <Route path="blockproof" element={<BlockProof />} />

                      {/* ✅ Info routes */}
                      <Route path="lore" element={<Lore />} />
                      <Route path="investor" element={<InvestorOverview />} />

                      {/* ✅ Catch-all */}
                      <Route path="*" element={<BlockSwap />} />
                    </Route>
                  </Routes>
                </NicknameProvider>
              </WalletProvider>
            </SoundProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </React.StrictMode>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

const root = createRoot(container);
root.render(<Root />);

// ✅ CRITICAL: prevents “createRoot already called” + removeChild NotFoundError in Vite dev refresh
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
  });
}
