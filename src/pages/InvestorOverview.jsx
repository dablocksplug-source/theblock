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
  // ✅ Token identity (UI language only)
  const TOKEN_SYMBOL = "OZ";
  const OUNCES_PER_BRICK = 36;

  // ✅ Brickonomics (keep aligned with contract)
  const TOTAL_BRICKS = 2000; // 1 Ton
  const BLOCK_RESERVE_BRICKS = 500; // adjust anytime

  const TOTAL_OUNCES = TOTAL_BRICKS * OUNCES_PER_BRICK; // 72,000 OZ
  const RESERVE_OUNCES = BLOCK_RESERVE_BRICKS * OUNCES_PER_BRICK;
  const CIRCULATING_BRICKS = Math.max(0, TOTAL_BRICKS - BLOCK_RESERVE_BRICKS);
  const CIRCULATING_OUNCES = Math.max(0, TOTAL_OUNCES - RESERVE_OUNCES);

  const highlights = useMemo(
    () => [
      "Blueprint first: understand the structure before you move.",
      "Base is settlement. B3 is speed. The Block uses both on purpose.",
      "Fixed supply: 1 Ton total — weight is measured, not promised.",
      "Activity stays visible: prices, vault moves, claims, and floors.",
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
              Inside the Hustle
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
        <section className="grid gap-6 lg:grid-cols-[1.25fr,0.75fr]">
          {/* =========================
              MAIN READ (BLUEPRINT)
              ========================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h1 className="text-3xl font-semibold tracking-tight">
              Inside the Hustle
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This is the blueprint — so you understand the structure and how The Block moves.
            </p>

            <div className="mt-5 grid gap-2">
              {highlights.map((b, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-200"
                >
                  {b}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                The Hustler’s Blueprint
              </div>

              <div className="mt-4 space-y-6 text-sm leading-relaxed text-slate-200">
                <div>
                  <div className="text-slate-100 font-semibold">Bricks, Ounces, and Weight</div>
                  <p className="mt-2 text-slate-300">
                    Inside The Block, weight matters. People talk in <span className="text-slate-100 font-semibold">Bricks</span>{" "}
                    because that’s the mindset — but the unit is <span className="text-slate-100 font-semibold">Ounces</span>.
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
                    <li>
                      <span className="text-slate-100 font-semibold">1 Brick = {OUNCES_PER_BRICK} {TOKEN_SYMBOL}</span>
                    </li>
                    <li>
                      The more Bricks you hold, the more <span className="text-slate-100 font-semibold">weight</span> you carry.
                    </li>
                    <li>
                      Weight is <span className="text-slate-100 font-semibold">position</span> — not ownership, not control, not special permissions.
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="text-slate-100 font-semibold">Two Lanes, On Purpose</div>
                  <p className="mt-2 text-slate-300">
                    Money inside The Block moves through two lanes — so the foundation stays solid while the ecosystem grows.
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
                    <li>
                      <span className="text-slate-100 font-semibold">The Vault</span> supports the floor and protects exits.
                    </li>
                    <li>
                      <span className="text-slate-100 font-semibold">Block Capital</span> funds districts, development, and expansion.
                    </li>
                    <li>
                      Major movement shows in the <span className="text-slate-100 font-semibold">activity feed</span>.
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="text-slate-100 font-semibold">The Floor + The Drought</div>
                  <p className="mt-2 text-slate-300">
                    There is a protected floor. Sellbacks remain available as an exit. To protect Brick holders, new sell pressure may be
                    stopped so we don’t flood the streets — and droughts let value build.
                  </p>
                </div>

                <div>
                  <div className="text-slate-100 font-semibold">How the Floor Grows</div>
                  <p className="mt-2 text-slate-300">
                    As milestones are hit and systems start producing, The Block injects into the Vault. When the floor moves, it moves one
                    direction: <span className="text-slate-100 font-semibold">up</span>.
                  </p>
                </div>

                <div>
                  <div className="text-slate-100 font-semibold">When The Block Eats</div>
                  <p className="mt-2 text-slate-300">
                    Sometimes the structure does well. When that happens, Brick holders are sitting at that table too. Claims are announced,
                    snapshotted at announcement, and shown at claim time.
                  </p>
                </div>

                <div>
                  <div className="text-slate-100 font-semibold">The Districts</div>
                  <p className="mt-2 text-slate-300">
                    The Block isn’t one thing — it’s districts. Some move fast. Some take time. Foundations first.
                  </p>
                </div>

                <div>
                  <div className="text-slate-100 font-semibold">Who This Is For</div>
                  <p className="mt-2 text-slate-300">
                    This isn’t for flippers. It’s for people who understand weight, patience, and structure.
                    <span className="text-slate-100 font-semibold"> You position yourself — and let the structure do what it’s built to do.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* =========================
              SIDE BOXES (REFERENCE)
              ========================= */}
          <div className="space-y-4">
            <Section title="Brickonomics" defaultOpen>
              <div className="space-y-3">
                <p className="text-slate-300">
                  Bricks are the street language. <span className="text-slate-200 font-semibold">{TOKEN_SYMBOL}</span> is the unit.
                </p>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Supply</div>
                  <ul className="mt-2 space-y-2">
                    <li>
                      <span className="text-slate-200 font-semibold">1 Ton Total:</span>{" "}
                      {TOTAL_BRICKS.toLocaleString()} Bricks{" "}
                      <span className="text-slate-400">
                        (= {TOTAL_OUNCES.toLocaleString()} {TOKEN_SYMBOL})
                      </span>
                    </li>
                    <li>
                      <span className="text-slate-200 font-semibold">Conversion:</span>{" "}
                      1 Brick = {OUNCES_PER_BRICK} {TOKEN_SYMBOL}
                    </li>
                    <li>
                      <span className="text-slate-200 font-semibold">Fixed Supply:</span> no additional {TOKEN_SYMBOL} can be created later.
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Reserve</div>
                  <ul className="mt-2 space-y-2">
                    <li>
                      <span className="text-slate-200 font-semibold">Block Reserve:</span>{" "}
                      {BLOCK_RESERVE_BRICKS.toLocaleString()} Bricks{" "}
                      <span className="text-slate-400">
                        (= {RESERVE_OUNCES.toLocaleString()} {TOKEN_SYMBOL})
                      </span>
                    </li>
                    <li>
                      <span className="text-slate-200 font-semibold">Circulating (max):</span>{" "}
                      {CIRCULATING_BRICKS.toLocaleString()} Bricks{" "}
                      <span className="text-slate-400">
                        (= {CIRCULATING_OUNCES.toLocaleString()} {TOKEN_SYMBOL})
                      </span>
                    </li>
                    <li className="text-slate-400">
                      Reserve exists for long-term stability of the structure.
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Transfers</div>
                  <p className="mt-2 text-slate-300">
                    Final design does <span className="text-slate-200 font-semibold">not</span> lock transfers.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Weight & Position">
              <ul className="list-disc space-y-2 pl-5">
                <li>Weight is measured by Bricks / {TOKEN_SYMBOL} held.</li>
                <li>Weight is not ownership, control, or special permissions.</li>
                <li>Weight is used for buybacks + claim eligibility.</li>
              </ul>
            </Section>

            <Section title="Buys (price only moves up)">
              <ul className="list-disc space-y-2 pl-5">
                <li>Buys are made in USDC.</li>
                <li>Buy-in price is set by The Block.</li>
                <li>Buy-in price only moves up, and increases are announced.</li>
              </ul>
            </Section>

            <Section title="Buybacks (floor only moves up)">
              <ul className="list-disc space-y-2 pl-5">
                <li>Sellbacks remain available as an exit.</li>
                <li>Floor starts at the posted price (example: $500).</li>
                <li>Floor only moves up, and increases are announced.</li>
                <li>New sell pressure may be manually stopped to protect Brick holders during droughts.</li>
              </ul>
            </Section>

            <Section title="Vault & Capital Structure">
              <ul className="list-disc space-y-2 pl-5">
                <li>Vault supports the floor and protects exits.</li>
                <li>Block Capital funds districts, development, and expansion.</li>
                <li>Major movements show in the activity feed.</li>
              </ul>
            </Section>

            <Section title="Infrastructure (Base + B3)">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  BlockSwap lives on <span className="text-slate-200 font-semibold">Base</span> for reliable settlement.
                </li>
                <li>
                  Other districts can run on <span className="text-slate-200 font-semibold">B3</span> for speed and high activity.
                </li>
                <li>Your weight stays consistent as the ecosystem expands.</li>
              </ul>
            </Section>

            <Section title="Claims (announced + snapshotted)">
              <ul className="list-disc space-y-2 pl-5">
                <li>Claims are announced clearly.</li>
                <li>Eligibility is snapshotted at announcement.</li>
                <li>Exact amounts are shown at claim time.</li>
                <li>Claim windows are limited (unclaimed funds remain with The Block).</li>
              </ul>
            </Section>

            <Section title="Transparency & Activity">
              <ul className="list-disc space-y-2 pl-5">
                <li>Price increases</li>
                <li>Vault injections</li>
                <li>Floor increases</li>
                <li>Claim announcements</li>
                <li>All major actions appear in the activity feed.</li>
              </ul>
            </Section>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-sm text-slate-300">
                If you don’t understand something here, take your time. The Block isn’t built for rushed decisions.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
