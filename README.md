# ecotoken

**The environmental receipt for your AI coding.**

`ecotoken` is a small Rust CLI that scans the on-disk session logs written by
your AI coding assistants — Claude Code, OpenAI Codex, and (best-effort)
GitHub Copilot — converts raw token counts into estimated energy, water, and
CO₂ footprints using the methodology from published research, and serves a
single-binary, animated local dashboard that shows you the numbers in both
technical units and tangible real-life equivalents (glasses of drinking
water, kilometres driven in a gasoline car, smartphone charges,
tree-days to offset).

The project started from the observation that no AI provider publishes
per-token environmental figures, but enough peer-reviewed modelling and
datacenter-infrastructure disclosure exists to build a defensible estimate
on top of the data every developer already has locally. If you use Claude
Code or Codex, the raw telemetry is sitting in your home directory right
now — `ecotoken` just reads it and does the math.

---

## Contents

- [What it does](#what-it-does)
- [Install](#install)
- [Quick start](#quick-start)
- [CLI reference](#cli-reference)
- [Data sources](#data-sources)
- [HTTP API](#http-api)
- [Dashboard](#dashboard)
- [How the numbers are calculated](#how-the-numbers-are-calculated)
- [Development](#development)
- [Releases](#releases)
- [Methodology & disclaimer](#methodology--disclaimer)

---

## What it does

- **Scans** `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`,
  and the GitHub Copilot usage dump if present, and normalizes every
  assistant turn into a unified `TokenRecord`.
- **Dedupes** Claude Code streaming entries globally by
  `(session, request, message)`, keeping the entry with the highest
  `output_tokens` so repeated stream fragments don't double-count.
- **Calculates** per-record energy (Wh) via piecewise-linear interpolation
  between per-model short/medium/long query anchors, then multiplies by
  provider-specific PUE, WUE (on-site + off-site water), and CIF
  (carbon intensity) constants to derive water (mL) and CO₂ (g).
- **Serves** a local dashboard at `http://localhost:51824` with timeline
  chart, per-model breakdown, per-provider comparison, animated SVG
  visualizations (filling glasses, a car on a bezier road, growing trees,
  charging batteries), an XP/rank system with milestone achievement
  toasts, and a dark/light theme switcher. All HTML/CSS/JS is
  embedded into the binary via `rust-embed`, so the release build is a
  single executable with zero external files.
- **Exports** raw summary JSON via `--json` for scripting.

## Install

### Prebuilt binaries

Release binaries are attached to every tagged release. Downloads:

- macOS Apple Silicon (`aarch64-apple-darwin`)
- macOS Intel (`x86_64-apple-darwin`)
- Linux x86_64 glibc (`x86_64-unknown-linux-gnu`)
- Linux ARM64 glibc (`aarch64-unknown-linux-gnu`)
- Windows x86_64 (`x86_64-pc-windows-msvc`)

Grab the archive matching your platform from the
[Releases page](https://github.com/akhil-gautam/ecotoken/releases),
extract, and run the binary.

### From source

Requires Rust 1.80+ (stable):

```bash
git clone git@github.com:akhil-gautam/ecotoken.git
cd ecotoken
cargo build --release
./target/release/ecotoken
```

Or install from the repo directly:

```bash
cargo install --git https://github.com/akhil-gautam/ecotoken
```

## Quick start

```bash
# Scan everything under ~/.claude and ~/.codex, start the dashboard,
# auto-open http://localhost:51824 in your default browser:
ecotoken

# Only this week, only Claude Code, don't auto-open:
ecotoken --source claude-code --since 2026-04-10 --no-open

# Print a JSON summary to stdout and exit (no HTTP server):
ecotoken --json | jq .

# Pin a specific port (e.g. if 51824 is taken):
ecotoken --port 48242
```

## CLI reference

```
ecotoken [OPTIONS]
```

| Flag          | Values                                      | Default     | Meaning |
|---------------|---------------------------------------------|-------------|---------|
| `--source`    | `all` \| `claude-code` \| `codex` \| `copilot` | `all`      | Which log source(s) to scan. |
| `--since`     | `YYYY-MM-DD`                                | _(none)_    | Include only records on or after this date (inclusive). |
| `--until`     | `YYYY-MM-DD`                                | _(none)_    | Include only records on or before this date (inclusive). |
| `--project`   | string                                      | _(none)_    | Case-insensitive substring filter applied to each record's project/cwd path. |
| `--port`      | u16                                         | `51824`     | TCP port for the dashboard. 51824 sits in the IANA dynamic range (49152–65535) so it won't collide with 3000/5173/8080 and friends. |
| `--json`      | _(flag)_                                    | `false`     | Emit `/api/summary` JSON to stdout and exit without starting the HTTP server. Good for scripting / CI. |
| `--no-open`   | _(flag)_                                    | `false`     | Skip the "auto-open the dashboard in a browser" step on startup. |
| `--help`      |                                             |             | Show the CLI usage. |
| `--version`   |                                             |             | Show the binary version. |

Logging verbosity is controlled via the standard `RUST_LOG` env var (default
`ecotoken=info`). Set `RUST_LOG=ecotoken=debug` to see each scanned file.

## Data sources

ecotoken reads **only** local files written by the assistants themselves —
nothing is fetched over the network.

| Assistant     | Path                                                                                      | Format                                                                                       |
|---------------|-------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Claude Code   | `~/.claude/projects/<project-slug>/<session-uuid>.jsonl`                                  | JSONL; looks at `type: "assistant"` lines and reads `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`. |
| Claude Code (Xcode) | `~/Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/projects/...`          | Same format as above.                                                                        |
| OpenAI Codex  | `~/.codex/sessions/**/*.jsonl`                                                            | JSONL; reads `turn_context` events for model/cwd metadata and `event_msg` → `token_count` events for per-turn usage. |
| GitHub Copilot | `~/.config/github-copilot/usage.json[l]`, `~/Library/Application Support/github-copilot/usage.json` | JSON or JSONL array of `{ timestamp, model, prompt_tokens, completion_tokens }`. Falls back to estimating from `completions` count (80 prompt + 40 completion tokens per completion) if only the count is available. |

Parse failures on individual lines are skipped with a debug-level warning
rather than aborting the run — streaming session files can contain partial
or malformed JSON.

## HTTP API

All endpoints are read-only and return JSON. CORS is wide-open
(`Access-Control-Allow-Origin: *`) so the embedded static UI works when
served from any origin.

| Endpoint          | Response shape (abbreviated) |
|-------------------|------------------------------|
| `GET /api/summary`     | `{ total_tokens, total_energy_wh, total_water_ml, total_co2_g, record_count, period_start, period_end, providers[], models_used[] }` |
| `GET /api/daily`       | `[{ date, tokens, energy_wh, water_ml, co2_g }, …]` |
| `GET /api/models`      | `[{ model, provider, tokens, energy_wh, water_ml, co2_g, queries, eco_efficiency_score }, …]` |
| `GET /api/providers`   | `[{ provider, tokens, energy_wh, water_ml, co2_g, pue, wue_onsite_l_per_kwh, wue_offsite_l_per_kwh, cif_kgco2e_per_kwh }, …]` |
| `GET /api/equivalents` | `{ water_glasses, showers, toilet_flushes, car_km, google_searches, netflix_hours, phone_charges, led_hours, trees_per_day }` |
| `GET /api/records`     | Record count (integer). |

The dashboard auto-refreshes all of these every 60 seconds.

## Dashboard

The embedded UI is deliberately more playful than a typical corporate
dashboard. Headline features:

- **Bento hero grid** — Tokens is a 2×2 feature card, CO₂ is a wide 2×1,
  Energy and Water are 1×1 stat cards, all with animated accent-tinted
  radial-gradient backgrounds.
- **Daily footprint timeline** — Chart.js line chart with toggleable
  Energy / Water / CO₂ datasets on a dual y-axis.
- **Per-model + per-provider bar charts** — ranked by energy draw.
- **Visualized equivalents** — anime.js v4 SVG animations:
  - `svg.createDrawable` traces the `ɛ` monogram logo and the tree-crown outlines.
  - `svg.morphTo` morphs the rank emblem through six shapes (Sapling → Seedling → Apprentice → Adept → Master → Legendary) and the theme toggle between sun and crescent moon.
  - `svg.createMotionPath` drives the car along a cubic-bezier road and spawns water drops along four curved paths into the row of glasses.
- **XP / rank HUD** — total tokens map to a rank tier; a shining XP bar tracks progress to the next one.
- **Achievement toasts** — 11 milestones (1M / 10M / 100M / 1B tokens, first shower of water, 10km / 100km road trip, first tree-day, 100 tree-days…). Persisted in `localStorage` so they don't re-fire between sessions.
- **Eco-efficiency leaderboard** — models ranked by tokens-per-joule, normalized to a 0-100 score. Medal badges for the top three, animated score bars.
- **Theme switcher** — full design-token system flips between dark
  ("eco-digital brutalism" with neon accents) and light (warm off-white,
  muted accents, softened drop-shadows) on click. Persisted in
  `localStorage`.
- **Sound feedback** — once per 60-second refresh tick, a brief chord
  plays: water ping, energy pitch-bend, CO₂ thud, tokens bell. Achievement
  unlocks get an ascending C major arpeggio. Mute toggle in the top-left
  toolbar, also persisted in `localStorage`. Web Audio unlocks on the
  first user interaction per browser policy.
- **Reduced-motion** — animations and transitions respect
  `prefers-reduced-motion: reduce`.

## How the numbers are calculated

Pipeline per assistant turn:

```
tokens → effective_tokens → energy (Wh) → water (mL)
                                         → CO₂ (g)
                                         → real-life equivalents
```

1. **Effective tokens** for each record weight cache reads at 10%:
   `input + output + cache_creation + 0.1 × cache_read`.
2. **Energy** is a piecewise-linear interpolation between per-model Wh
   anchors at short (≈400 tokens), medium (≈2 000 tokens), and long
   (≈11 500 tokens) query sizes. Requests larger than 11 500 tokens scale
   linearly from the long anchor. The per-model anchors are drawn from
   Jegham et al. (2025), with the closest architectural analogue used
   for anything outside their table (Claude 4.x / GPT-5.x / o3 lineage).
3. **Water** uses the provider's on-site and off-site Water Usage
   Effectiveness:
   `water_L = energy_kWh × (WUE_onsite / PUE + WUE_offsite)`.
4. **CO₂** uses the provider's datacenter Carbon Intensity Factor:
   `co2_g = energy_kWh × PUE × CIF_kgCO2e_per_kWh × 1 000`.
5. **Equivalents** are simple lookup divisions against published
   averages — a glass of drinking water = 250 mL, a typical 8-minute
   shower = 65 L, a gasoline car ≈ 170 gCO₂/km, one Google search ≈
   0.2 g CO₂, Netflix streaming ≈ 36 g CO₂/hr, a smartphone charge ≈
   18.5 Wh, a mature tree sequesters ~60 g CO₂/day.

Provider constants currently embedded (from Jegham et al. and provider
sustainability reports):

| Provider   | PUE  | WUE on-site (L/kWh) | WUE off-site (L/kWh) | CIF (kgCO₂e/kWh) |
|------------|------|---------------------|----------------------|------------------|
| Anthropic  | 1.14 | 0.18                | 5.11                 | 0.287            |
| OpenAI     | 1.12 | 0.30                | 4.35                 | 0.350            |
| Google     | 1.10 | 0.95                | 3.20                 | 0.130            |
| Meta       | 1.12 | 0.26                | 3.80                 | 0.300            |
| DeepSeek   | 1.27 | 1.20                | 6.016                | 0.600            |
| GitHub     | 1.18 | 0.30                | 4.35                 | 0.350            |
| _unknown_  | 1.15 | 0.40                | 4.50                 | 0.350            |

Models that don't match any known prefix fall back to the median
energy anchor for their size class and are logged as unknown.

## Development

```bash
# Run the dashboard in debug mode against your local logs:
cargo run

# Unit tests for the energy/water/CO₂ math:
cargo test

# Lint + format gate (what CI enforces):
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

Static assets in `static/` (index.html, style.css, app.js) are embedded
into the binary at compile time by `rust-embed`, so any change to them
requires a rebuild before the dashboard picks it up.

## Releases

Pushing a tag matching `v*` triggers `.github/workflows/release.yml`, which
cross-builds on five runners in parallel and uploads archives to a
GitHub Release with auto-generated release notes:

- `x86_64-unknown-linux-gnu`  (tar.gz, ubuntu-latest)
- `aarch64-unknown-linux-gnu` (tar.gz, cross-compiled on ubuntu-latest)
- `x86_64-apple-darwin`       (tar.gz, macos-13)
- `aarch64-apple-darwin`      (tar.gz, macos-14 — Apple Silicon)
- `x86_64-pc-windows-msvc`    (zip,    windows-latest)

To cut a release:

```bash
git tag v0.1.1
git push --tags
```

## Methodology & disclaimer

> Environmental estimates based on Jegham et al. (2025) — "How Hungry is
> AI?" (arXiv:[2505.09598v5](https://arxiv.org/abs/2505.09598)) and
> provider-reported infrastructure data.
>
> Actual impact varies by datacenter location, time of day, and cooling
> method. No AI company publishes per-token environmental figures.

Treat every number in the dashboard as a reasoned ballpark, not a
measurement. In particular:

- Carbon intensity varies by hour depending on the local grid mix;
  the CIF values above are published annual averages.
- Off-site water usage depends heavily on electricity source (nuclear /
  hydro / solar vs. thermoelectric) and dominates on-site cooling water
  for most providers.
- Inference energy scales non-linearly with context length and changes
  with every model revision; the short/medium/long anchors capture
  the published 2025 behaviour, not whatever the current model is
  doing today.
- The "real-life equivalents" are rhetorical tools for making kWh and
  grams comprehensible — a mature tree does not in fact absorb exactly
  60g of CO₂ on any given day.

Use ecotoken to spot trends and rough orders of magnitude, not to
produce an auditable footprint report.
