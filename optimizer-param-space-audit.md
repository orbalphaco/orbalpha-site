# Optimizer parameter space — source pull

**Branch:** `claude/optimizer-param-space-audit-ZvKXw`
**Repo state:** static site; no `param-space.ts` source present
**Source files audited:**
- `tools/optimizer-preview/assets/index-BpVsqdmU.js` (sweep-space `Pe`, sampler `Rt`, neighbor expander `At`, scorer `Ke/Bt`, default config `me`)
- `tools/optimizer-preview/assets/sweep-worker-tb_ahYjQ.js` (strategy simulator)

Default config baseline lives in `me` at `index.js:91`. Sweep universe lives in `Pe` at `index.js:133`. Phase 1 default sample count comes from the HTML input `#input-phase1` (default 2000, min 100, step 100).

---

## 1. Session window

| dim | values (NY clock) | step | count |
|---|---|---|---|
| `session.start_time` | `02:00, 06:00, 09:00, 09:30, 18:00` | non-uniform (4h / 3h / 30m / 8.5h) | 5 discrete |
| `session.end_time` | `03:00, 07:00, 10:00, 10:30, 20:00` | non-uniform (4h / 3h / 30m / 9.5h) | 5 discrete |
| `session.exit_time` | `13:00, 15:00, 16:00` | non-uniform | 3 discrete |
| `session.min_size` | `0, 2, 5` | irregular | 3 discrete |
| `session.max_size` | `50, 100, 200` | irregular | 3 discrete |

**Coupling: NONE.** `session.start_time` and `session.end_time` are independent draws in `Rt` (`index.js:425`). There is no `end > start` predicate, no minimum length, no maximum length, no NY-clock validation. Roughly half of all random draws produce a malformed (`end ≤ start`) pair. The simulator handles this by silently never entering session: `is_sess = i ≥ sess_start && i < sess_end` (`sweep-worker.js:54`), so malformed pairs become zero-trade configs and get filtered out by the min-trades threshold downstream — not rejected at sample time.

**On the 18:00–19:00 question:** `18:00` IS in the sessionStart set. `19:00` is NOT in the sessionEnd set (closest values: `10:30`, `20:00`). An 18:00–20:00 NY session is reachable. An exact 18:00–19:00 window cannot be returned. Note that of the 5 `sessionEnd` values, only `20:00` is `>` 18:00 in NY clock-minutes — so ~80% of draws with `sessionStart=18:00` are malformed.

---

## 2. Stretch

| dim | values | count |
|---|---|---|
| `orb.stretch_mult` | `0.5, 0.7, 0.9, 1.1, 1.3` | 5 floats, step 0.2 |
| `orb.stretch_lookback` | `5, 10, 15` | 3 ints, step 5 |
| `orf.stretch_mult` | `0.3, 0.5, 0.7, 0.9` | 4 floats, step 0.2 |
| `orf.stretch_lookback` | `5, 10, 15` | 3 ints, step 5 |
| `weekly_zone.stretch_mult` | `1.0, 1.5, 2.0` | 3 floats, step 0.5 |
| `weekly_zone.stretch_lookback` | `2, 4, 6` | 3 ints, step 2 |
| `weekly_zone.ext_mult` | `1.5, 2.0, 3.0` | 3 floats |

**Stretch formula is single-form (avgRange × multiplier).** Confirmed: `sweep-worker.js:446` computes `m = y * n.orb.stretch_mult` and `z = p * n.orf.stretch_mult` where `y, p` are precomputed avg-range values from `dailyStretch / dailyStretchOrf` maps (`ho(...)` over the lookback window). Weekly zone uses the same form (`index.js:304`: `i.stretch * n.weekly_zone.stretch_mult`). No ATR-based, percentile-based, median-based, or otherwise-alternative stretch formulation is swept. (ATR appears separately as a `tp_mode` option, not as a stretch alternative.)

---

## 3. ORB / ORF core dims

### ORB (10 dims + 5 day flags)

| dim | values |
|---|---|
| `orb.enabled` | true, false |
| `orb.sl_mode` | `Retracement`, `Opposite Level` |
| `orb.retrace_pct` | `35, 45, 55, 65, 75` (only when `sl_mode=Retracement` & `entry_mode≠Open+Stretch`) |
| `orb.tp_mode` | `Off, ORB Levels, Stretch Levels, ATR` |
| `orb.tp_mult` | `0.5, 1, 1.5, 2` (only when `tp_mode≠Off`) |
| `orb.confirm_bars` | `1, 2, 3` |
| `orb.reset_bars` | `1, 2, 3` |
| `orb.cutoff_time` | `13:00, 15:00, 16:00` |
| `orb.days.{Mon..Fri}` | `true, false` each (5 independent dims) |

### ORF (15 dims + 5 day flags)

| dim | values |
|---|---|
| `orf.enabled` | true, false |
| `orf.sl_mode` | `Stretch Level, ORB Boundary, Stretch + Buffer` |
| `orf.sl_buffer` | `0.25, 0.5, 1` (only when `sl_mode=Stretch+Buffer`) |
| `orf.tp_mode` | `Off, Opposite ORB, Opposite Stretch, ORB Midpoint, ORB Levels, Stretch Levels` |
| `orf.tp_mult` | `0.5, 1, 1.5, 2` (only when `tp_mode ∈ {ORB Levels, Stretch Levels}`) |
| `orf.required_fails` | `1, 2, 3` |
| `orf.fade_confirm_bars` | `1, 2, 3` |
| `orf.earliest_entry` | `09:00, 09:30, 10:00, 20:00` |
| `orf.cutoff_time` | `13:00, 15:00, 16:00` |
| `orf.filter_mode` | `Off, Inverted, Aligned` (only when `ny_candle.enabled`) |
| `orf.enable_late_failure` | true, false |
| `orf.late_fail_retrace` | `0.25, 0.35, 0.5` (only when `enable_late_failure`) |
| `orf.late_fail_min_bars` | `0, 3, 6` (only when `enable_late_failure`) |
| `orf.late_fail_max_contracts` | `4, 10, 20` (only when `enable_late_failure`) |
| `orf.days.{Mon..Fri}` | `true, false` each (5 independent dims) |

**Flag:** `orf.confirm_bars` and `orf.reset_bars` are NOT swept. ORF reuses `n.orb.confirm_bars` / `n.orb.reset_bars` inside the worker (`sweep-worker.js:482`). ORB's confirmation cadence is implicitly imposed on ORF.

---

## 4. Filter menu + sub-parameters

The filter universe in the source maps to your 9 names as follows:

| your name | source dim | notes |
|---|---|---|
| ORB | `orb.enabled` | |
| ORF | `orf.enabled` | |
| NY Candle | `ny_candle.enabled` | **same filter** as Direction |
| Direction | `ny_candle.enabled` | UI label is "Direction Filter"; internal key is `ny_candle.*`. Not a separate filter. |
| MVWAP | `mvwap.enabled` | |
| Weekly Zone | `weekly_zone.enabled` | |
| Sweep | `sweep.enabled` | |
| Contraction | `strategy.nr_mode` | enum, no separate enabled bool |
| Redemption | `strategy.enable_redemption` | |

→ **8 distinct filter switches**, not 9. "NY Candle" and "Direction" are aliases for the same `ny_candle.*` block. No filter exists in the codebase that is NOT on your list.

### Sub-parameters per filter

**Direction / NY Candle** (gated by `ny_candle.enabled`):
- `ny_candle.start_time`: `02:00, 08:00, 13:00`
- `ny_candle.capture_time`: `07:00, 09:00, 15:00`

**Sweep** (gated by `sweep.enabled`):
- `sweep.range_start`: `09:30, 18:00, 20:00`
- `sweep.range_end`: `02:00, 10:30, 22:00`
- `sweep.cutoff`: `13:00, 16:00`

**Contraction** (`strategy.nr_mode`): enum `Off, NR4, NR7, ID/NR4`. No sub-params.

**Weekly Zone** (gated by `weekly_zone.enabled`):
- `weekly_zone.stretch_lookback`: `2, 4, 6`
- `weekly_zone.stretch_mult`: `1.0, 1.5, 2.0`
- `weekly_zone.ext_mult`: `1.5, 2.0, 3.0`
- `weekly_zone.toggles.{2,1,0,-1,-2}.{0,1}`: 10 independent bool dims (5 zones × 2 sides — orb_ok, orf_ok per zone)

**MVWAP** (gated by `mvwap.enabled`):
- `mvwap.mode`: `Directional, Zone`
- `mvwap.band_mult`: `0.5, 1, 1.5, 2`
- `mvwap.allow_counter_orb`: bool (only when `mode=Directional`)
- `mvwap.allow_counter_orf`: bool (only when `mode=Directional`)
- `mvwap.toggles.{2,1,0,-1,-2}.{0,1}`: 10 independent bool dims (only when `mode=Zone`)

**Redemption** (gated by `strategy.enable_redemption`):
- `strategy.max_trades_per_day`: `1, 2, 3` (only when `enable_redemption`)

**Coupling rules — yes, they exist.** Every conditional dim has a predicate function (`condition: F`, `condition: ee`, etc.) that's evaluated against the current sampled config. If the predicate is false, the sampler writes `null` for that key instead of drawing a value (sampler `Rt`, `index.js:431`). So "MVWAP sub-dims only sample when MVWAP is on" is confirmed — that's exactly the mechanism. Same for ORB sub-dims gated on `orb.enabled`, ORF sub-dims on `orf.enabled`, late-failure sub-dims on `orf.enable_late_failure`, etc.

---

## 5. Sampling / phase structure

### Phase 1 sampler
- **Type:** uniform random per dim, independent draws. NOT Sobol, NOT Latin hypercube, NOT quasi-random. For each dim: `Math.floor(rand() * values.length)` (`index.js:435`).
- **PRNG:** Mulberry32-style seeded integer hash (`Pt`, `index.js:378`). Default seed = `42`. "NEW SAMPLE" button reseeds.
- **Sample count:** user-controlled via `#input-phase1`, default **2000**, min 100, step 100.
- **Conditional dims:** if the predicate is false for the current partial config, the dim is set to `null` and not counted in the sample's variation (`index.js:431`).

### Phase 2 sampler
- **Type:** ±1 neighbor expansion on the discrete grid (`At`, `index.js:463`).
- **Logic:** for each top-K Phase-1 seed, for each dim, find the seed's value in the dim's `values` array, then emit two children — `index-1` and `index+1` (skipping out-of-range and re-evaluating predicates). Deduplicated against Phase 1 set and against itself.
- **Jitter step per dim:** always exactly one index in the dim's `values` array. For ordinal dims (int/float/time) that's the next discrete value (e.g. `confirm_bars 2 → 1 or 3`); for enums/bools it's the next enum entry (which may not be ordinally meaningful — e.g. `tp_mode: Off ↔ ORB Levels` is a categorical flip, not a refinement).
- **Top-N seed count:** `refinementTopK = 5` (hardcoded, `index.js:65`). The displayed final output is `topN = 10` (also hardcoded), drawn from the combined Phase 1 + Phase 2 results.
- **Min-trades filter:** before Phase 2 seed selection (`Ke` at `index.js:504`), configs with `totalTrades < minTrades` (UI default 25, code default 5) are dropped. So Phase 2 seeds are always above the trade-count floor.
- **Sample count (Phase 2):** not a fixed number. Upper bound ≈ `refinementTopK × 2 × dims_applicable_to_seed` ≈ 5 × 2 × ~50–80 ≈ 500–800 configs, minus dedup against Phase 1.

### Total budget breakdown
- **Total budget is NOT a fixed 20K.** With UI defaults: Phase 1 = 2000, Phase 2 ≈ 500–800 after dedup. Typical total ≈ **2500–2800 configs per run**.
- The "20K" framing is consistent with a user setting Phase 1 to ~19200 (rare in practice given the default of 2000 and the cost-per-config in a JS worker pool).

### On CHI's "structural ratchet (~95–98%) toward low-trade-count configs"

Source-level partial confirmation, with caveat on the specific number:

1. **The ratchet exists, but it isn't in Phase 2 — it's in Phase 1's independent uniform sampling.** With 8 filter switches each at 50/50 independent, the joint probability of ≤2 filters on is `Σ C(8,k)/256 for k=0..2 = (1+8+28)/256 ≈ 14%`. So ~86% of Phase 1 configs have ≥3 filters on. Each filter tends to cut trade count, so the modal Phase 1 config is heavily filtered and low-trade.
2. **The min-trades gate (default 25) censors very-low-trade configs from Phase 2 seeding**, which actually pushes the SEED set AWAY from zero-trade. But the seeds still come from a filter-on-biased basin.
3. **Phase 2 ±1 expansion stays in the seed's filter-on basin.** Toggling one of 8 filters at a time can't escape a 4-filter-on region in a single step; it just moves to a 3- or 5-filter-on neighbor.
4. **Score function weights `tradeCount` POSITIVELY (+0.1)** alongside PnL (+0.4), PF (+0.15), winRate (+0.1), drawdown penalty (+0.15), expectancy (+0.1). So the scorer rewards more trades — it's not actively biasing toward low-trade. (`ft` at `index.js:62`, `Bt` at `index.js:498`.)
5. **The exact "95–98%" figure isn't derivable from source** — it would have to come from empirical observation of a real run's seed pool. The source confirms the structural bias toward filter-heavy seeds; the specific percentage is plausible but unverified at the code level.

---

## 6. Notable findings / flags

### Constraints / predicates that materially shape results

- **No ordering constraint on `session.start_time` vs `session.end_time`.** ~50% of random draws produce malformed windows (end ≤ start). These zero-trade out silently.
- **`session.min_size` and `session.max_size` are independent**, but their value sets don't overlap (`min ∈ {0,2,5}`, `max ∈ {50,100,200}`), so `min ≤ max` is naturally guaranteed.
- **`sweep.range_start`, `sweep.range_end`, `sweep.cutoff` are all independent times** with no enforced ordering. The simulator handles wraparound (`p = c > a ? i >= c || i < a : i >= c && i < a` at `sweep-worker.js:54`), so weird orderings produce overnight-spanning windows rather than empty ones — but the semantics may be unintended.
- **`orf.confirm_bars` and `orf.reset_bars` are not swept**. ORF reuses `n.orb.confirm_bars` / `n.orb.reset_bars` (`sweep-worker.js:482`). ORB's confirmation cadence is implicitly imposed on ORF.

### Hardcoded constants that limit the search space (look swept, aren't)

- **Score weights** (`ft` at `index.js:62`): pnl 0.4, profitFactor 0.15, winRate 0.1, drawdownPenalty 0.15, tradeCount 0.1, expectancy 0.1. Not exposed, not swept.
- **`refinementTopK = 5`** (Phase 2 seed count) and **`topN = 10`** (final reported count) — hardcoded (`index.js:65`).
- **PRNG seed = 42** by default; reseeds only via "NEW SAMPLE" button (random int).
- **`sizing.commission_per_contract = 0.5`** — hardcoded default in `me.sizing`, not swept.
- **Entry mode "ORB + Stretch" vs "Open + Stretch"** is swept, but several downstream behaviors (e.g. `is_open_stretch` branches) silently dominate other dims' meaning when `entry_mode=Open+Stretch`. For example, `orb.sl_mode`, `orb.retrace_pct` are gated to NOT apply when `entry_mode=Open+Stretch` (predicate at `index.js:158-167`). This is correct but worth noting: ~half the `entry_mode` draws disable a chunk of ORB sub-space.
- **`ext_mult`** for MVWAP is hardcoded baseline = 2 but only `weekly_zone.ext_mult` is exposed in the sweep; MVWAP has no `ext_mult` equivalent.
- **Tick size / contract specs / asset selection / trade window dates** — not part of the sweep.

### Sampling design risks

- **82-dim independent uniform draw at 2000 samples is sparse.** Average ~24 draws per dim value (2000 / 82 ≈ 24), but joint coverage is much sparser — many specific (filter-on, session-window, ORB-config) combinations will never be sampled in a single run.
- **No coverage guarantee.** Sobol or Latin hypercube would give much better marginal coverage per-dim at the same N; the current sampler doesn't.
- **Phase 2's ±1 neighbor walk on enums/bools is semantically arbitrary.** For `orf.tp_mode` (6-entry enum), neighboring `Off ↔ Opposite ORB` is treated as a "refinement" but is actually a categorical regime change.
- **No constraint on (`session.start`, `session.end`) ordering** means ~50% of Phase 1 budget is structurally wasted on malformed windows. At 2000 samples, ~1000 are dead on arrival.

---

## Bottom line

The "box" has roughly 82 discrete dimensions with hand-picked value grids. Outer walls on session time = `{02, 06, 09, 09:30, 18}` NY × `{03, 07, 10, 10:30, 20}` NY independent (so an evening 18:00 entry IS reachable, but only ending at 20:00). Inner sampler is independent uniform per-dim with 2000 random draws + a small ±1 refinement pass; not space-filling. The biggest staleness lever isn't the sampler but the literal value sets baked into `Pe` — every grid value is a hardcoded constant in `index-BpVsqdmU.js`, last touched at build time.
