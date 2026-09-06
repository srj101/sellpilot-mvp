/**
 * Load the price book from cost-rates.json into platform_cost_rate / fx_rate.
 *
 * Idempotent: a rate is identified by (service, sku, effectiveFrom), so re-running after
 * filling in a missing number inserts only what changed. Editing a price means setting a
 * new effectiveFrom in the JSON — never rewriting an existing row, because past cost events
 * carry their own frozen price and must stay reconcilable against the invoice we paid.
 *
 *   pnpm --filter @acme/api cost:seed -- --dry-run
 *   pnpm --filter @acme/api cost:seed
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "@acme/db/client";
import { fxRate, platformCostRate } from "@acme/db/schema";

interface RateEntry {
  service: string;
  sku: string;
  unit: string;
  unitSize: number;
  microUsdPerUnit: number | null;
  percentBps?: number | null;
  source?: string;
}

interface FxEntry {
  baseCurrency: string;
  quoteCurrency: string;
  microRate: number | null;
  source?: string;
}

interface RateFile {
  effectiveFrom: string;
  rates: RateEntry[];
  fx: FxEntry[];
}

const dryRun = process.argv.includes("--dry-run");

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, "cost-rates.json"), "utf8")) as RateFile;
const effectiveFrom = new Date(config.effectiveFrom);

if (Number.isNaN(effectiveFrom.getTime())) {
  console.error(`Invalid effectiveFrom: ${config.effectiveFrom}`);
  process.exit(1);
}

/** A percent-based rate is priced by percentBps; everything else by microUsdPerUnit. Either
 * one being null means the number has not been looked up yet. */
function isPriced(r: RateEntry): boolean {
  return r.unit === "percent_bps"
    ? r.percentBps !== null && r.percentBps !== undefined
    : r.microUsdPerUnit !== null;
}

async function main() {
  const priced = config.rates.filter(isPriced);
  const unpriced = config.rates.filter((r) => !isPriced(r));

  console.log(
    `Price book effective ${effectiveFrom.toISOString()}: ` +
      `${priced.length} priced, ${unpriced.length} awaiting a number.\n`,
  );

  for (const r of priced) {
    const label =
      r.unit === "percent_bps"
        ? `${(r.percentBps ?? 0) / 100}%`
        : `$${((r.microUsdPerUnit ?? 0) / 1_000_000).toFixed(6)} per ${r.unitSize.toLocaleString()} ${r.unit}`;
    console.log(`  ${r.service}:${r.sku}  ${label}`);

    if (dryRun) continue;

    await db
      .insert(platformCostRate)
      .values({
        service: r.service,
        sku: r.sku,
        unit: r.unit,
        unitSize: r.unitSize,
        microUsdPerUnit: r.microUsdPerUnit ?? 0,
        percentBps: r.percentBps ?? null,
        effectiveFrom,
        source: r.source,
      })
      // Same sku at the same instant is one fact. Re-running must not duplicate it, and a
      // corrected number for that same instant should land.
      .onConflictDoUpdate({
        target: [
          platformCostRate.service,
          platformCostRate.sku,
          platformCostRate.effectiveFrom,
        ],
        set: {
          microUsdPerUnit: r.microUsdPerUnit ?? 0,
          percentBps: r.percentBps ?? null,
          unit: r.unit,
          unitSize: r.unitSize,
          source: r.source,
        },
      });
  }

  for (const f of config.fx) {
    if (f.microRate === null) continue;
    console.log(
      `  fx ${f.baseCurrency}->${f.quoteCurrency}  ${(f.microRate / 1_000_000).toFixed(4)}`,
    );
    if (dryRun) continue;

    await db
      .insert(fxRate)
      .values({
        baseCurrency: f.baseCurrency,
        quoteCurrency: f.quoteCurrency,
        microRate: f.microRate,
        effectiveFrom,
        source: f.source,
      })
      .onConflictDoUpdate({
        target: [fxRate.baseCurrency, fxRate.quoteCurrency, fxRate.effectiveFrom],
        set: { microRate: f.microRate, source: f.source },
      });
  }

  if (unpriced.length > 0) {
    console.log(
      `\n${unpriced.length} rate(s) have no price yet. Usage against these is still\n` +
        `recorded — at $0, with a warning naming the sku — so nothing is lost while you\n` +
        `look the numbers up. Margin figures understate until they are filled in:\n`,
    );
    for (const r of unpriced) {
      console.log(`  ${r.service}:${r.sku}`.padEnd(46) + (r.source ?? ""));
    }
    console.log(`\nEdit packages/api/src/scripts/cost-rates.json and re-run.`);
  }

  const missingFx = config.fx.filter((f) => f.microRate === null);
  if (missingFx.length > 0) {
    console.log(
      `\nNo ${missingFx.map((f) => `${f.baseCurrency}->${f.quoteCurrency}`).join(", ")} ` +
        `rate: costs will report in USD only, taka figures stay unavailable.`,
    );
  }

  if (dryRun) console.log("\nDry run — nothing was written.");
}

await main();
