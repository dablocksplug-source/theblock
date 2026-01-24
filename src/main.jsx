// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import "./index.css";

import App from "./App.jsx";

import { WalletProvider } from "./context/WalletContext";
import NicknameProvider from "./context/NicknameContext";
import { SoundProvider } from "./context/SoundContext";
import { UIProvider } from "./context/UIContext.jsx";

// ✅ Wagmi + React Query (required for WalletConnect + wagmi hooks)
import { wagmiConfig } from "./wagmi.js";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";


const queryClient = new QueryClient();

// ✅ Gate must live INSIDE router context
import PresaleGate from "./components/PresaleGate.jsx";

// Pages
import TheBlock from "./pages/TheBlock.jsx";
import BlockPlay from "./pages/BlockPlay.jsx";
import BlockBet from "./pages/BlockBet.jsx";
import BlockPay from "./pages/BlockPay.jsx";
import BlockProof from "./pages/BlockProof.jsx";
import BlockShop from "./pages/BlockShop.jsx";
import BlockSwap from "./pages/BlockSwap.jsx";
import DiceLobby from "./pages/DiceLobby.jsx";
import SpadesLobby from "./pages/SpadesLobby.jsx";
import SpadesTable from "./pages/blockplay/spades/SpadesTable.jsx";
import Lore from "./pages/Lore.jsx";
import PresaleRules from "./pages/PresaleRules.jsx";
import InvestorOverview from "./pages/InvestorOverview.jsx";

// Components
import DiceGame from "./components/DiceGame.jsx";
import NicknameTestPage from "./pages/NicknameTestPage.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <PresaleGate>
        <App />
      </PresaleGate>
    ),
    children: [
      { index: true, element: <TheBlock /> },

      { path: "blockplay", element: <BlockPlay /> },
      { path: "blockplay/dice", element: <DiceLobby /> },
      { path: "blockplay/dice/:tableId", element: <DiceGame /> },
      { path: "blockplay/spades", element: <SpadesLobby /> },
      { path: "blockplay/spades/:tableId", element: <SpadesTable /> },

      { path: "nickname-test", element: <NicknameTestPage /> },

      { path: "blockbet", element: <BlockBet /> },
      { path: "blockpay", element: <BlockPay /> },
      { path: "blockproof", element: <BlockProof /> },
      { path: "blockshop", element: <BlockShop /> },

      { path: "blockswap", element: <BlockSwap /> },

      { path: "blockswap/early-bird-rules", element: <PresaleRules /> },
      {
        path: "blockswap/presale-rules",
        element: <Navigate to="/blockswap/early-bird-rules" replace />,
      },

      { path: "dicelobby", element: <DiceLobby /> },
      { path: "lore", element: <Lore /> },
      { path: "investor", element: <InvestorOverview /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <NicknameProvider>
            <SoundProvider>
              <UIProvider>
                <RouterProvider router={router} />
              </UIProvider>
            </SoundProvider>
          </NicknameProvider>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
