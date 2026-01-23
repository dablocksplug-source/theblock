// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import "./index.css";

import App from "./App.jsx";

import { WalletProvider } from "./context/WalletContext";
import NicknameProvider from "./context/NicknameContext";
import { SoundProvider } from "./context/SoundContext";

// ✅ Single gate for the whole app (driven by presale.config.js)
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
    element: <App />,
    children: [
      { index: true, element: <TheBlock /> },

      // Districts (will be gated by PresaleGate when PRESALE_MODE=true)
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

      // BlockSwap (allowed)
      { path: "blockswap", element: <BlockSwap /> },

      // Rules page (allowed if allowlisted)
      { path: "blockswap/early-bird-rules", element: <PresaleRules /> },

      // Old URL → redirect to new
      {
        path: "blockswap/presale-rules",
        element: <Navigate to="/blockswap/early-bird-rules" replace />,
      },

      // Old alias routes (will be gated too when PRESALE_MODE=true)
      { path: "dicelobby", element: <DiceLobby /> },

      // Read-only pages (we will allow these in allowlist)
      { path: "lore", element: <Lore /> },
      { path: "investor", element: <InvestorOverview /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WalletProvider>
      <NicknameProvider>
        <SoundProvider>
          <PresaleGate>
            <RouterProvider router={router} />
          </PresaleGate>
        </SoundProvider>
      </NicknameProvider>
    </WalletProvider>
  </React.StrictMode>
);
