// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import "./index.css";

import App from "./App.jsx";

import { WalletProvider } from "./context/WalletContext";
import NicknameProvider from "./context/NicknameContext";
import { SoundProvider } from "./context/SoundContext";

// ✅ Gate (ONLY allow "/" + "/blockswap")
import ConstructionGate from "./components/ConstructionGate.jsx";

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
      // ✅ HOME is allowed
      { index: true, element: <TheBlock /> },

      // 🚧 EVERYTHING BELOW is gated (redirects to /blockswap)
      {
        path: "blockplay",
        element: (
          <ConstructionGate>
            <BlockPlay />
          </ConstructionGate>
        ),
      },
      {
        path: "blockplay/dice",
        element: (
          <ConstructionGate>
            <DiceLobby />
          </ConstructionGate>
        ),
      },
      {
        path: "blockplay/dice/:tableId",
        element: (
          <ConstructionGate>
            <DiceGame />
          </ConstructionGate>
        ),
      },
      {
        path: "blockplay/spades",
        element: (
          <ConstructionGate>
            <SpadesLobby />
          </ConstructionGate>
        ),
      },
      {
        path: "blockplay/spades/:tableId",
        element: (
          <ConstructionGate>
            <SpadesTable />
          </ConstructionGate>
        ),
      },

      {
        path: "nickname-test",
        element: (
          <ConstructionGate>
            <NicknameTestPage />
          </ConstructionGate>
        ),
      },

      {
        path: "blockbet",
        element: (
          <ConstructionGate>
            <BlockBet />
          </ConstructionGate>
        ),
      },
      {
        path: "blockpay",
        element: (
          <ConstructionGate>
            <BlockPay />
          </ConstructionGate>
        ),
      },
      {
        path: "blockproof",
        element: (
          <ConstructionGate>
            <BlockProof />
          </ConstructionGate>
        ),
      },
      {
        path: "blockshop",
        element: (
          <ConstructionGate>
            <BlockShop />
          </ConstructionGate>
        ),
      },

      // ✅ BLOCKSWAP is allowed (and its subroutes)
      { path: "blockswap", element: <BlockSwap /> },

      // ✅ BlockSwap subpage allowed (still under /blockswap)
      { path: "blockswap/early-bird-rules", element: <PresaleRules /> },

      // ✅ redirect old URL to new (still allowed)
      {
        path: "blockswap/presale-rules",
        element: <Navigate to="/blockswap/early-bird-rules" replace />,
      },

      // 🚧 older alias routes — gated
      {
        path: "dicelobby",
        element: (
          <ConstructionGate>
            <DiceLobby />
          </ConstructionGate>
        ),
      },
      {
        path: "lore",
        element: (
          <ConstructionGate>
            <Lore />
          </ConstructionGate>
        ),
      },
      {
        path: "investor",
        element: (
          <ConstructionGate>
            <InvestorOverview />
          </ConstructionGate>
        ),
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WalletProvider>
      <NicknameProvider>
        <SoundProvider>
          <RouterProvider router={router} />
        </SoundProvider>
      </NicknameProvider>
    </WalletProvider>
  </React.StrictMode>
);
