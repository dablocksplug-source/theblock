// src/pages/InvestorOverview.jsx
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="text-sm font-semibold uppercase tracking-wide text-slate-200">
          {title}
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
          {open ? "Hide" : "Read"}
        </span>
      </button>

      {open ? (
        <div className="px-5 pb-5 pt-1 text-sm leading-relaxed text-slate-300">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function InvestorOverview() {
  const bullets = useMemo(
    () => [
      "A connected ecosystem (games + tools) built to run clean and scale fast.",
      "Base + B3 are the execution layer: reliable settlement + gaming-native speed.",
      "BlockSwap sets the foundation: fixed supply, clear rules, and ownership weight (Bricks & Ounces).",
      "Early Bird Special stays simple on purpose — clean foundation now, expansion after.",
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-wide">The Block</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
              For the Hustlers
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Back to Home
            </Link>
            <Link
              to="/blockswap"
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
            >
              Go to BlockSwap
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h1 className="text-3xl font-semibold tracking-tight">
              The foundation behind The Block
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              The Block is building a connected ecosystem — games, utilities, and commerce-style
              features — designed to launch and scale on{" "}
              <span className="font-semibold text-slate-100">Base</span> and{" "}
              <span className="font-semibold text-slate-100">B3</span>. The goal is real usage and clean
              mechanics: rules people can understand, verify, and live with.
            </p>

            <div className="mt-5 grid gap-2">
              {bullets.map((b, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-200"
                >
                  {b}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Why the Early Bird Special stays “clean”
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Early Bird is intentionally simple: fixed supply, straightforward mechanics, and transfer
                restrictions to reduce games and manipulation while the initial distribution is formed.
                Once the foundation is set, transfers can open and features can expand safely.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Section title="The mission" defaultOpen>
              <p>
                Build products people actually use — starting with games — and route that activity
                through simple, auditable mechanics. Growth comes from utility + engagement, not noise.
              </p>
            </Section>

            <Section title="If you're aligned, this is what matters">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="text-slate-200">Fixed supply ownership weight</span> (Bricks &amp; Ounces).
                </li>
                <li>
                  <span className="text-slate-200">Buyback floor</span> funded into a dedicated{" "}
                  <span className="text-slate-200">Buyback Vault</span>.
                </li>
                <li>
                  <span className="text-slate-200">Clear phases</span> that define how policy evolves as the system hardens.
                </li>
                <li>
                  <span className="text-slate-200">Admin actions</span> are explicit, logged, and wallet-restricted.
                </li>
              </ul>
            </Section>

            <Section title="How BlockSwap fits in">
              <p>
                BlockSwap is the gateway to the foundation. It tracks ounces held per wallet and enforces
                Early Bird rules. In demo mode, data can persist locally; in live mode, it will be backed by
                on-chain and indexer data.
              </p>
            </Section>

            <Section title="Read this before you move">
              <p className="text-slate-300">
                This is early-stage. Nothing here is financial advice, a guarantee, or a promise of future
                performance. Participation is voluntary. Rules and UI can evolve as features are tested
                and hardened — the foundation stays the focus.
              </p>
            </Section>
          </div>
        </section>
      </main>
    </div>
  );
}
