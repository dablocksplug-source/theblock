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

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Badge({ children }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

export default function InvestorOverview() {
  // ✅ Token identity (UI language only)
  const TOKEN_SYMBOL = "OZ";
  const OUNCES_PER_BRICK = 36;

  // ✅ Brickonomics (aligned with OZToken mint math)
  // OZToken mints: reserveWholeOz + saleWholeOz
  // With your deployment notes: 18,000 OZ reserve + 54,000 OZ sale = 72,000 OZ total
  // 72,000 / 36 = 2,000 bricks total
  const TOTAL_BRICKS = 2000; // Fixed supply total (2,000 Bricks)
  const BLOCK_RESERVE_BRICKS = 500; // 500 bricks reserve = 18,000 OZ (adjust if you change OZToken inputs)

  const TOTAL_OUNCES = TOTAL_BRICKS * OUNCES_PER_BRICK; // 72,000 OZ
  const RESERVE_OUNCES = BLOCK_RESERVE_BRICKS * OUNCES_PER_BRICK; // 18,000 OZ
  const CIRCULATING_BRICKS = Math.max(0, TOTAL_BRICKS - BLOCK_RESERVE_BRICKS); // 1,500 bricks
  const CIRCULATING_OUNCES = Math.max(0, TOTAL_OUNCES - RESERVE_OUNCES); // 54,000 OZ

  const highlights = useMemo(
    () => [
      "Read the blueprint first — understand the structure before you move.",
      "BlockSwap settles in USDC on Base. Other districts may run on faster lanes later.",
      `Fixed supply: ${TOTAL_BRICKS.toLocaleString()} Bricks (${TOTAL_OUNCES.toLocaleString()} ${TOKEN_SYMBOL}). Weight is measured — not promised.`,
      "Transparency matters: prices, floor, vault levels, and activity are visible.",
    ],
    [TOTAL_BRICKS, TOTAL_OUNCES]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
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

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <section className="grid gap-6 lg:grid-cols-[1.25fr,0.75fr]">
          {/* =========================
              MAIN READ (BLUEPRINT)
              ========================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Inside the Hustle</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  This page is the blueprint. If you don’t have time to read, don’t move yet.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge>Settlement: USDC</Badge>
                <Badge>Unit: {TOKEN_SYMBOL}</Badge>
                <Badge>
                  1 Brick = {OUNCES_PER_BRICK} {TOKEN_SYMBOL}
                </Badge>
              </div>
            </div>

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

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Stat
                label="Total Supply"
                value={`${TOTAL_BRICKS.toLocaleString()} Bricks`}
                sub={`= ${TOTAL_OUNCES.toLocaleString()} ${TOKEN_SYMBOL}`}
              />
              <Stat
                label="Circulating Max"
                value={`${CIRCULATING_BRICKS.toLocaleString()} Bricks`}
                sub={`= ${CIRCULATING_OUNCES.toLocaleString()} ${TOKEN_SYMBOL}`}
              />
              <Stat
                label="Block Reserve"
                value={`${BLOCK_RESERVE_BRICKS.toLocaleString()} Bricks`}
                sub={`= ${RESERVE_OUNCES.toLocaleString()} ${TOKEN_SYMBOL}`}
              />
              <Stat
                label="How Weight Is Measured"
                value={`${TOKEN_SYMBOL} held`}
                sub={`Bricks are just a readable wrapper (1 brick = ${OUNCES_PER_BRICK} ${TOKEN_SYMBOL}).`}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                The Hustler’s Blueprint
              </div>

              <div className="mt-4 space-y-6 text-sm leading-relaxed text-slate-200">
                <div>
                  <div className="font-semibold text-slate-100">Bricks, Ounces, and Weight</div>
                  <p className="mt-2 text-slate-300">
                    The street talks in{" "}
                    <span className="font-semibold text-slate-100">Bricks</span> because it’s easy
                    to understand — but the actual unit is{" "}
                    <span className="font-semibold text-slate-100">{TOKEN_SYMBOL}</span> (ounces).
                    Your <span className="font-semibold text-slate-100">weight</span> is simply how
                    much {TOKEN_SYMBOL} you hold.
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
                    <li>
                      <span className="font-semibold text-slate-100">
                        1 Brick = {OUNCES_PER_BRICK} {TOKEN_SYMBOL}
                      </span>
                    </li>
                    <li>
                      More {TOKEN_SYMBOL} held = more{" "}
                      <span className="font-semibold text-slate-100">weight</span>.
                    </li>
                    <li>
                      Weight is <span className="font-semibold text-slate-100">position</span> — not
                      ownership of The Block, not voting power, and not special permissions.
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">What BlockSwap Actually Is</div>
                  <p className="mt-2 text-slate-300">
                    BlockSwap is the first live district. It’s a simple, transparent market: you buy{" "}
                    {TOKEN_SYMBOL} using{" "}
                    <span className="font-semibold text-slate-100">USDC</span>, and you can sell
                    back to the contract at the{" "}
                    <span className="font-semibold text-slate-100">floor</span> when available.
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
                    <li>Buys happen at the posted price (shown in the BlockSwap UI).</li>
                    <li>Sell back happens at the posted floor (shown in the BlockSwap UI).</li>
                    <li>The contract addresses are displayed so you know exactly what you’re interacting with.</li>
                  </ul>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">Two Lanes, On Purpose</div>
                  <p className="mt-2 text-slate-300">
                    Money inside The Block moves through two lanes so the foundation stays solid
                    while the ecosystem grows.
                  </p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
                    <li>
                      <span className="font-semibold text-slate-100">Buyback Vault</span> supports
                      the floor and protects exits.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-100">Block Capital</span> funds
                      districts, development, and expansion.
                    </li>
                    <li>
                      Major movement shows in the{" "}
                      <span className="font-semibold text-slate-100">activity feed</span>.
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">The Floor + The Drought</div>
                  <p className="mt-2 text-slate-300">
                    The floor exists to create a dependable exit lane. Sometimes, new sell pressure
                    may be paused to protect holders during “droughts” — times where the structure
                    focuses on stability and building value instead of flooding the street.
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">How the Floor Grows</div>
                  <p className="mt-2 text-slate-300">
                    As milestones are hit and systems start producing, The Block can inject into the
                    vault. When the floor moves, it moves one direction:{" "}
                    <span className="font-semibold text-slate-100">up</span>.
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">Claims (When the Structure Eats)</div>
                  <p className="mt-2 text-slate-300">
                    Sometimes the structure performs and rewards are shared. When that happens:
                    claims are announced, eligibility is snapshotted at announcement, and exact
                    amounts are shown at claim time.
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">The Districts</div>
                  <p className="mt-2 text-slate-300">
                    The Block isn’t one feature — it’s districts. Some will move fast. Some take time.
                    Foundations first.
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-100">Who This Is For</div>
                  <p className="mt-2 text-slate-300">
                    This isn’t built for rushed decisions. It’s for people who understand weight,
                    patience, and structure.
                    <span className="font-semibold text-slate-100">
                      {" "}
                      You position yourself — and let the structure do what it’s built to do.
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-200">
              <div className="font-semibold text-amber-100">Important</div>
              <p className="mt-2 text-amber-100/90 leading-relaxed">
                Nothing on this page is financial advice. Crypto is risky. Only move what you can
                afford to lose. If you don’t understand the structure, take your time.
              </p>
            </div>
          </div>

          {/* =========================
              SIDE BOXES (REFERENCE)
              ========================= */}
          <div className="space-y-4">
            <Section title="Brickonomics" defaultOpen>
              <div className="space-y-3">
                <p className="text-slate-300">
                  Bricks are the street language.{" "}
                  <span className="font-semibold text-slate-200">{TOKEN_SYMBOL}</span> is the unit.
                </p>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Supply</div>
                  <ul className="mt-2 space-y-2">
                    <li>
                      <span className="font-semibold text-slate-200">Fixed Total:</span>{" "}
                      {TOTAL_BRICKS.toLocaleString()} Bricks{" "}
                      <span className="text-slate-400">
                        (= {TOTAL_OUNCES.toLocaleString()} {TOKEN_SYMBOL})
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold text-slate-200">Conversion:</span>{" "}
                      1 Brick = {OUNCES_PER_BRICK} {TOKEN_SYMBOL}
                    </li>
                    <li>
                      <span className="font-semibold text-slate-200">Fixed Supply:</span>{" "}
                      no additional {TOKEN_SYMBOL} can be created later.
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Reserve</div>
                  <ul className="mt-2 space-y-2">
                    <li>
                      <span className="font-semibold text-slate-200">Block Reserve:</span>{" "}
                      {BLOCK_RESERVE_BRICKS.toLocaleString()} Bricks{" "}
                      <span className="text-slate-400">
                        (= {RESERVE_OUNCES.toLocaleString()} {TOKEN_SYMBOL})
                      </span>
                    </li>
                    <li>
                      <span className="font-semibold text-slate-200">Circulating (max):</span>{" "}
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
                    Final design does{" "}
                    <span className="font-semibold text-slate-200">not</span> lock transfers.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Weight & Position">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Weight is measured by{" "}
                  <span className="font-semibold text-slate-200">{TOKEN_SYMBOL}</span> held.
                </li>
                <li>Weight is not ownership, control, or special permissions.</li>
                <li>Weight can be used for buybacks + claim eligibility (when announced).</li>
              </ul>
            </Section>

            <Section title="Buys (price only moves up)">
              <ul className="list-disc space-y-2 pl-5">
                <li>Buys are made in USDC.</li>
                <li>Buy price is set by The Block and displayed in BlockSwap.</li>
                <li>Buy price only moves up, and increases are announced.</li>
              </ul>
            </Section>

            <Section title="Buybacks (floor only moves up)">
              <ul className="list-disc space-y-2 pl-5">
                <li>Sell backs remain available as an exit lane (when enabled).</li>
                <li>Floor starts at the posted floor (example: $500 / brick).</li>
                <li>Floor only moves up, and increases are announced.</li>
                <li>New sell pressure may be manually paused during droughts to protect Brick holders.</li>
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
                  BlockSwap lives on{" "}
                  <span className="font-semibold text-slate-200">Base</span> for reliable settlement.
                </li>
                <li>
                  Other districts can run on{" "}
                  <span className="font-semibold text-slate-200">B3</span> for speed and high activity.
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
                <li>Price changes</li>
                <li>Vault injections</li>
                <li>Floor changes</li>
                <li>Claim announcements</li>
                <li>Major actions appear in the activity feed</li>
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
