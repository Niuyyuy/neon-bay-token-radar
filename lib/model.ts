// Neon Bay Token Radar — the model. One snapshot of the protocol universe in,
// one ranked board out. Written for token-radar-01; nothing here is copied from
// the kit's starter, whose model is a flat multiple of TVL.
//
// The idea: a pre-token protocol's implied value is what the market already pays
// for the same kind of business. The snapshot itself carries that price — the
// live-token protocols' market-cap-to-TVL ratios, category by category — so the
// model learns its multiples from the snapshot's own figures and applies them to
// the protocols that record no token:
//
//   implied = tvl_usd x categoryMultiple x growthMult x maturityMult x chainMult
//
//   categoryMultiple  median mcap/TVL of the live-token protocols in the same
//                     category (at least 3 live samples, else the global live
//                     median), clamped to [0.03, 1.5]
//   growthMult        1 + clamp(change_7d, -50, 150) / 100 x 0.6
//   maturityMult      0.7 + min(age_days, 1095) / 1095 x 0.5; unknown age -> 0.85
//   chainMult         1 + min(chains - 1, 5) x 0.03
//
// Selection: the watchlist is the floor (all 40, always), plus every other
// rankable pre-token protocol in the snapshot, by implied value, up to 200 of
// them. A protocol is rankable only when it records no token and is not an
// liquid-staking product, a wrapped or staked product, or a versioned pool — the
// same exclusions the snapshot's own watchlist rule uses, because an exchange or
// a wrapped token is not something a reader can farm for a launch. Live-token
// protocols are never ranked: they are shown apart with their market cap, the
// market's own number, never a model's.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_multiplier: number;
  chain_step: number;
  chain_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  min_live_samples: number;
  fallback_multiple: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1095,
  unknown_age_multiplier: 0.85,
  chain_step: 0.03,
  chain_cap: 5,
  multiple_floor: 0.03,
  multiple_cap: 1.5,
  min_live_samples: 3,
  fallback_multiple: 0.15,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's learned multiple, for the dashboard's methodology section. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  live_samples: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  category_multiples: CategoryMultiple[];
  watchlist_slugs: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of numbers; null when the list is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Clamp a multiple into the model's band. */
function clampMultiple(x: number, model: ModelConstants): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, x));
}

/**
 * The category multiples the snapshot itself teaches: for every category, the
 * median market-cap-to-TVL ratio of its live-token protocols. Categories with
 * too few live samples fall back to the global live median, so no category is
 * ever priced from nothing.
 */
export function learnMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, number>; global: number; table: CategoryMultiple[] } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const global = clampMultiple(median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? model.fallback_multiple, model);
  const byCategory = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  const categories = [...new Set(snapshot.protocols.map((p) => p.category ?? 'Other'))].sort();
  for (const category of categories) {
    const ratios = live
      .filter((p) => (p.category ?? 'Other') === category)
      .map((p) => p.mcap_usd! / p.tvl_usd);
    const m = ratios.length >= model.min_live_samples ? clampMultiple(median(ratios)!, model) : global;
    byCategory.set(category, m);
    table.push({ category, multiple: Math.round(m * 1000) / 1000, live_samples: ratios.length });
  }
  return { byCategory, global, table };
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: Map<string, number>,
  model: ModelConstants = MODEL,
): { implied: number; categoryMultiple: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const categoryMultiple = multiples.get(protocol.category ?? 'Other') ?? model.fallback_multiple;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = age === null ? model.unknown_age_multiplier : model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap) * model.chain_step;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * chainMult));
  return { implied, categoryMultiple, growthPct, growthMult, maturityMult, chainMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The snapshot's own watchlist rule, reused for the early rows: an exchange, a bridge, a liquid-staking product, a wrapped or staked product, or a versioned pool is not something a reader farms for a launch. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAMES = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_NAMES.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { byCategory } = learnMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug in it is ranked, whatever its category.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols beyond the watchlist, by
  // implied value — the radar exists to find these, not to re-list the
  // biggest TVL. The watchlist is the floor, never the ceiling: a protocol
  // the list leaves out is no worse a subject. Never a replacement for a
  // watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, byCategory, model).implied }))
    .sort((a, b) => b.v - a.v || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS)
    .map((e) => e.p);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, byCategory, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Full precision: the dashboard recomputes the implied value from
      // these multipliers and must land on exactly the same number the
      // board carries, so nothing is rounded here. Display rounds.
      category_multiple: s.categoryMultiple,
      growth_pct: Math.round(s.growthPct * 100) / 100,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      chain_multiplier: s.chainMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas token a chain settles in, for cost estimates. */
function gasToken(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('solana')) return 'SOL';
  if (c.includes('bitcoin')) return 'BTC';
  if (c.includes('tron')) return 'TRX';
  if (c.includes('ton')) return 'TON';
  if (c.includes('sui')) return 'SUI';
  if (c.includes('aptos')) return 'APT';
  if (c.includes('near')) return 'NEAR';
  if (c.includes('cosmos') || c.includes('osmosis') || c.includes('injective')) return 'the chain token';
  return 'ETH';
}

/** What one transaction costs on the protocol's chain, as a sentence. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 'about $6 of ETH gas';
  if (c.includes('solana')) return 'under $0.05 of SOL in fees';
  if (c.includes('bitcoin')) return 'about $2 of BTC in fees';
  if (c.includes('arbitrum') || c.includes('optimism') || c.includes('base') || c.includes('polygon') || c.includes('zksync') || c.includes('linea') || c.includes('blast') || c.includes('scroll')) return 'under $0.50 of gas';
  return 'about $2 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow $${Math.round(capital / 3)} against it, keeping the loan healthy.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s top vault on ${chain} and keep the shares.`;
  if (c.includes('yield') || c.includes('allocator') || c.includes('curator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares earning.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset on ${name} on ${chain} and hold it.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s shielded pool on ${chain} and withdraw it later.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once.`;
}

/** The category's second, weekly action — the one that keeps the wallet active. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Each week, repay a little of the loan and top up the supply so the position stays active on ${name}.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Each week, swap $${Math.round(capital / 5)} through ${name}'s pool on ${chain} and re-balance the range.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Each week, close the hedge and open a fresh one on ${name} so the account shows regular trading.`;
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('allocator') || c.includes('curator')) return `Each week, claim the vault's yield on ${name} and redeposit it instead of withdrawing.`;
  if (c.includes('bridge')) return `Each week, bridge a small amount back and forth through ${name} so both directions are used.`;
  if (c.includes('staking') || c.includes('restak')) return `Each week, restake the staking rewards ${name} pays instead of claiming them out.`;
  if (c.includes('rwa')) return `Each week, check the asset's yield on ${name} and add $${Math.round(capital / 10)} while it pays.`;
  if (c.includes('stable')) return `Each week, mint a little more of the stable asset on ${name} and use it in one swap.`;
  if (c.includes('prediction')) return `Each week, place one small market position on ${name} and let it settle.`;
  if (c.includes('insurance')) return `Each week, check the cover's terms on ${name} and renew it before it lapses.`;
  if (c.includes('privacy')) return `Each week, make one shielded transfer through ${name} so the wallet stays active.`;
  if (c.includes('basis')) return `Each week, check the funding rate on ${name} and keep the vault position open.`;
  if (c.includes('index')) return `Each week, add $${Math.round(capital / 10)} to the index position on ${name}.`;
  return `Each week, use ${name}'s main feature once more so the wallet shows repeat activity.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`,
      cost: gas,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, capital, chain),
      cost: gas + ' a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `If ${p.name} runs a points program, check its points page once a week and confirm the wallet is earning; never connect the wallet to a link from a chat or an ad.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Before you withdraw, open the protocol's own site from its official listing and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind in two halves a week apart so the position closes cleanly.`,
      cost: gas + ' to unwind',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { table } = learnMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    category_multiples: table,
    watchlist_slugs: snapshot.watchlist,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
