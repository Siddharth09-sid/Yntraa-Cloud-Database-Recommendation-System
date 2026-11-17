# Yntraa Cloud — Database Finder

An interactive, gamified questionnaire that recommends a database engine (and
the right edition — open-source vs. enterprise) from Yntraa Cloud's 12-engine
MDBaaS catalog, based on the visitor's answers. Built in plain HTML/CSS/JS —
no build step, no framework, no external dependency other than a Google Fonts
stylesheet import (site works fine without it too — the font stack falls back
to system fonts).

## Running it

**Just double-click `index.html`.** It works straight off the filesystem —
no server, no install, nothing to run. Handy for previewing on a locked-down
laptop with no admin rights.

Under the hood: `app.js` normally loads `data/dbaas-scoring-config.json`
with `fetch()`, which is how a real deployment can add database #13 by
editing that one file and refreshing. But browsers block `fetch()` of a
local file when the page is opened directly (`file://`), so `index.html`
also carries an identical copy of that JSON inline (in a
`<script id="scoring-config">` tag), and `app.js` falls back to it
automatically the moment the external fetch fails. Either way works; you
don't need to think about which one is happening.

**When actually hosting it** (nginx, an S3/object-storage bucket, a folder
on the existing WordPress site, etc.), the site behaves the same way —
serving it over http(s) just means the external file wins over the inline
fallback, which matters once you start editing
`data/dbaas-scoring-config.json` to add or tune databases (see below).

### Keeping the inline fallback in sync

If you hand-edit `data/dbaas-scoring-config.json` (e.g. adding database
#13), the double-click copy will silently keep using its old inline data
until you regenerate it. Run this from the project folder after any edit:

```
python3 build-inline-config.py
```

That rewrites the inline `<script id="scoring-config">` block in
`index.html` from the current JSON file. If you only ever host this over
http(s) and never rely on the double-click fallback, you can skip this —
the external file is always read first.

## How it's put together

```
index.html                        page shell — header/hero/footer match the
                                   yntraacloud.ai theme (navy + orange, "Plus
                                   Jakarta Sans" font, same nav/footer link
                                   structure)
css/styles.css                    all styling, incl. the live-leaderboard
                                   category color palette
data/dbaas-scoring-config.json     THE ALGORITHM'S DATA — catalog of all 12
                                   engines/editions/prices/features, the
                                   full weighted questionnaire, substitution
                                   groups, conflict rules. Edit this file to
                                   change how the engine scores or to add a
                                   13th database. Nothing else needs to change.
js/scoring-engine.js               pure scoring logic. Contains ZERO database
                                   names — it only ever loops over whatever
                                   families exist in the config above. This
                                   is what makes adding a new database safe.
js/ui-meta.js                      cosmetic-only: question copy, option
                                   labels/emoji, per-family icon/pitch/color.
                                   Separate from the scoring config on
                                   purpose — this is presentation, that's
                                   algorithm.
js/app.js                          UI controller: renders every screen,
                                   wires up clicks, drives the live
                                   leaderboard/confetti/badges.
build-inline-config.py             regenerates index.html's inline JSON
                                   fallback from data/dbaas-scoring-config.json
                                   (run after hand-editing the config — see
                                   "Keeping the inline fallback in sync" above)
tests/test-scoring-engine.node.js  a Node harness that exercises the scoring
                                   engine against real scenarios (run with
                                   `node tests/test-scoring-engine.node.js`
                                   from the project root). Re-run this after
                                   any weight change or new database — it's
                                   what caught the composite-mode bug during
                                   development (see "Known limitations"
                                   below) and it'll catch the next one too.
```

## Adding database #13

Two edits, no code changes:

1. **`data/dbaas-scoring-config.json`** — add a new key under `"catalog"`
   with the same shape as the existing entries (`display_name`, `category`,
   `editions` with prices/features, `tags`). Then add that same key to every
   `weights` object under `"questionnaire"` (a `-3` to `+5` score for how
   well that database fits each answer option — `0` is a safe default
   anywhere you're not sure yet). If it doesn't neatly compete with the
   existing 11 (like Hadoop doesn't), consider whether it needs its own
   category branch — see the `routing_note` on Hadoop's catalog entry for
   the pattern.
2. **`js/ui-meta.js`** (optional but recommended) — add an entry to
   `FAMILY_META` with an icon and one-line pitch, so the new database shows
   up with proper copy instead of the generic 🗄️ fallback.

Then run `node tests/test-scoring-engine.node.js` to sanity-check nothing
broke, and spot-check a scenario where the new database should plausibly win.

## Adjusting weights / question wording

- Score values live only in `data/dbaas-scoring-config.json` under
  `questionnaire.<QuestionKey>.weights.<optionId>.<family>`.
- Question titles, option labels, hints, and emoji live only in
  `js/ui-meta.js` under `QUESTIONS`. The `key` and each option's `id` must
  match the scoring config exactly, or that option won't score.

## Adding your real logo and hero video

The hero video is optional and fails gracefully if missing (a plain dark/
light gradient covers it). The logo now ships with real files:

- **Logo:** two files in `assets/` — `yntraa-logo-on-dark.png` (light
  wordmark, shown on the dark theme) and `yntraa-logo-on-light.png` (navy
  wordmark, shown on the light theme). Both were cropped from the brand
  files you provided — the originals had a lot of transparent padding
  around the actual mark (a 6250×6250px canvas with the wordmark only
  filling a ~4450×1650px region in the middle), which is exactly why it
  showed up "very small and not visible" at a fixed 34px-tall container:
  the browser was scaling the *whole* mostly-empty canvas down to fit,
  not just the visible glyph. Cropped tight (with a small margin) and
  resized to a sane web resolution, then the header's `.brand__logo`
  height was bumped from 34px to 40px to match the mark's actual (wide,
  ~2.7:1) proportions. To swap in a different logo later, replace either
  file (same filenames) — no code change needed either way.
- **Hero video:** save your file as `assets/hero-banner.mp4`. It'll play
  automatically behind the hero text, looping and muted, same treatment as
  the real MDBaaS page. Keep the file reasonably small (a few MB, ideally
  under ~8MB) since it's the first thing that loads on the page — an
  oversized file will make the hero feel slow even though the fallback
  gradient covers it while it loads.

Both are deliberately **not** hotlinked to the live yntraacloud.ai site.
That would work today, but ties this tool's appearance to files on a
separate WordPress site that can be renamed, moved, or replaced without
notice (their upload paths are already date-stamped, e.g.
`/wp-content/uploads/2026/05/...`, which is exactly the kind of path that
changes on a re-upload) — safer for this project to own its own copy.

## Light theme

The site now has a full light theme alongside the original dark one, both
built from the same Yntraa brand tokens (orange accent pair, navy family,
same fonts) — only the *surface* colors flip, sourced from yntraacloud.ai's
own light-section washes (`#eef5ff` / `#f6f7fb`). A toggle button (🌙/☀️)
sits in the header nav. It remembers the visitor's choice in
`localStorage` and otherwise follows the OS's own light/dark preference on
first visit — set once, before the page paints, by a small inline script
in `index.html`'s `<head>`, so there's no flash of the wrong theme.

Everything routes through CSS custom properties in `css/styles.css` — a
`:root` block for dark (the original values, unchanged) and a
`:root[data-theme="light"]` block for light. There's no third place that
needs updating if a color changes: every component reads the same
semantic tokens (`--surface-page-1`, `--ink-primary`, `--border-hairline`,
etc.) in both themes. Two of the 7 categorical leaderboard colors
(`--cat-in-memory`, `--cat-batch`) are nudged slightly darker in the light
theme only, because at their original (dark-surface-validated) values
they dropped just under the 3:1 contrast floor against a light card
background — verified back above 4:1, same hue.

If you were getting an error trying to add the logo before this fix: the
header previously had no image slot at all (just an emoji), so anything
you tried to wire in there had nowhere valid to attach. That's now fixed —
drop a file in and it should just work.

## Composite ("whole application") mode — how the rounds work

Each selected component gets **one screen** with all three of its
per-component questions (data shape, consistency, latency) together,
not three separate screens — with 5-6 components selected that used to
balloon into 15-18 near-identical screens with no clear sense of
progress. A persistent chip strip stays visible across every round
(`componentChipsHtml()` in `js/app.js`) showing every selected component
with its status — done (✓, green), current (highlighted orange), or
pending (dim) — so it's always obvious how many parts are left, even
scrolled past the "Round X of Y" text at the top.

## Back navigation

Every screen in the flow now has a way back, including the two
new-vs-existing / single-vs-whole-app router screens at the very start
(`renderRouter0()` / `renderRouter0b()` in `js/app.js`), which previously
had no back button at all.

## How the quiz flows (v2.0)

- **Quick round, 6 taps:** main job, data shape, exactness, speed, size, budget. One question per screen, short tiles, a tap moves on by itself (number keys work too). The hero is hidden during the quiz so nothing needs scrolling.
- **Reveal + podium:** a short drumroll, then the top 3 on a podium. Tap any of the three to see why it fits ("Fits because you chose ...") and its edition advice.
- **Bonus round, optional, 5 taps:** regions, AI search, existing tools, compliance, team. Sharpens the match.
- **Whole application:** pick the jobs, three taps per job on one screen, two shared questions, then a stack with a top pick and two alternatives per job.
- The question order lives at the top of `js/app.js` (`CORE_ORDER`, `BONUS_ORDER`, `SHARED_CORE_ORDER`).

## Database logos (v2.2)

All 12 logos are one-colour marks so they read as one set: `assets/db-logos/<key>.png` (navy, light theme) and `<key>-light.png` (white, dark theme). Engines without files keep their emoji. To add or replace one: `python3 tools/make-logos.py <key> <source image> [dark|light]`. These are vendor trademarks; check each vendor's brand guidelines before going live.

## Entry points (v2.1)

The landing page has one button. On the first question, a link ("My application has several of these workloads") switches to whole-application mode, and that screen has a link back. "Already running a database? Compare its editions" stays as a small link on the landing page.

## How scoring works (v2.0)

- **Score** = sum of `weight x question importance`. Importance (config `importance`): main job Q1 x3, data shape Q2 x2, compatibility Q9 x4, others x1.
- **Match %** = where the engine sits between the worst and best score any engine could get on the same answers (`scoreWithBest` returns `raw`, `best`, `worst`). One shared scale, so ranking and % always agree, and 0% only happens if an engine is the worst choice on every answer.
- **Workload gate** (`workload_gate`): an engine with weight <= 0 for the chosen job loses 12 points unless a named compatibility need (Q9 weight >= 4) is met. `hard_options` (batch / data lake) use a 40-point penalty that is never waived, so Hadoop always ranks first there with no special-case code.
- **Ties** go to the engine with the higher weight for the chosen job, then catalog order.
- **Always three results** (`result_settings.top_n`), each with a fit label from `result_settings.bands` (Great fit / Good fit / Possible / Long shot).
- **Budget** (Q13) now nudges the ranking when cost-sensitive (free open-source edition +1, paid-only engines -2) as well as choosing the edition.
- **Reasons:** `ScoringEngine.explain()` returns the answers that helped or hurt an engine; the result card shows them as chips.

## Question wording

Plain-language titles, helper text and option labels for every question live in `data/question-copy.json` (id -> emoji, label, hint). `js/ui-meta.js` carries the same wording (Q1 options also have a `short` label used in component chips and result headings). If you reword something, edit the JSON and mirror it in ui-meta.js; `tests/test-scoring-engine.node.js` fails if the copy, ui-meta.js and the config options drift apart. The live leaderboard now uses the same shared yardstick as the final result (`ScoringEngine.scoreWithBest`). `tests/legacy-scenarios.node.js` is the earlier print-style scenario script, kept for reference. Q2 has a "Documents, images, videos or other files" option (`documents_files_media`).

## Validation (replaces the 48,600-row workbook)

- `tests/personas.js`: 36 plain-English scenarios (story, answers, which engines an architect would accept as #1).
- `tests/e2e-browser.js`: Playwright walkthrough (desktop + phone, both modes, bonus round, batch case) that also checks every question fits on one screen.
- `node tests/test-scoring-engine.node.js`: config integrity, all scenarios, plus 408,240 answer combinations checked for ranking/% agreement, batch routing, edition rules and workload-fit, plus regressions (the 36% vs 61% case, DynamoDB, budget substitute) and whole-application mode.
- `outputs/dbaas-finder-review.xlsx`: three readable sheets: Weights (every option x 12 engines, colour-coded), Scenarios (pass/fail), Rules. Regenerate after weight changes by re-running the personas dump and the build script.

## Disclaimer and footer

A disclaimer strip (`#dbf-disclaimer`) sits above the footer on every screen, with a short note in the hero. The footer address is Yotta's registered address as listed on yotta.com; the other footer columns still need to be compared against the live yntraacloud.ai page.

## Known limitations / things worth doing next

- **The existing-environment sizer is a simple calculator**, not a true
  capacity planner — it multiplies list price × quantity and shows that
  edition's feature list. Good enough for a ballpark, not a replacement for
  a real sizing conversation.
- **No persistence.** Refreshing mid-quiz loses progress. Fine for a
  2–5 minute quiz; if visitor drop-off turns out to be a problem, the state
  object in `app.js` is a single plain object and would be easy to mirror
  into `sessionStorage`.
- **Composite mode asks data-structure/consistency/latency per component**
  (a deliberate fix — see below) but scale/geo/compliance/budget/ecosystem/
  ops-comfort stay app-wide. That split is encoded as
  `PER_COMPONENT_QUESTION_KEYS` in `scoring-engine.js` if it ever needs
  revisiting.
- **No analytics/lead-capture wired up.** The "Talk to a Solutions
  Architect" CTA just links to the existing contact page. If you want to
  capture quiz answers as a qualified lead (recommended — this doc's
  design phase flagged "data residency" and "team size" as good
  lead-qualification questions that aren't in this build yet), that needs
  a backend endpoint to POST the answers/result to.
- **Multi-file architecture was a deliberate choice** per the brief (plain
  HTML/CSS/JS, portable to a framework later). If this moves to React/Vue,
  `scoring-engine.js` and `data/dbaas-scoring-config.json` should port over
  almost unchanged — that logic has no DOM dependency at all.

### Bugs this design caught, worth knowing about

- **Composite mode swept every component toward PostgreSQL.** Asking
  "consistency" and "data structure" once for the *whole application*
  caused strongly relational answers (strict ACID, structured joins) to
  outweigh a caching component's own signal. Fixed by asking those three
  questions **per selected component** instead of once app-wide (see
  `PER_COMPONENT_QUESTION_KEYS` in `scoring-engine.js`).
- **Batch/ETL workloads could recommend MongoDB instead of Hadoop.**
  `recommendSingle()` detected the batch/ETL branch correctly but then
  ranked Hadoop against the other 11 engines using the FULL cross-question
  score, so unrelated answers (data structure, latency) could outvote the
  one question that actually identified the workload. Fixed — the batch
  branch now picks its family from Q1's own weights alone, matching the
  catalog's `routing_note` that Hadoop was never meant to compete in the
  general pool. Confirmed via exhaustive audit: all 4,860 batch/ETL rows
  in the QA workbook now recommend Hadoop, 100% of the time.
- **MySQL could never be the #1 recommendation, under any answer.**
  MariaDB tied-or-beat MySQL on literally every scored question, so
  MySQL's score was mathematically never higher (0 wins across 48,600
  audited combinations). Fixed by giving MySQL back its genuine edge in
  its classic real-world scenario — plain OLTP, team wants zero new
  tooling.
- **The compliance question (Q10) had zero effect on which database got
  picked** — only on which edition. Fixed: it now also carries modest,
  catalog-feature-grounded per-family weights (native auditing, RBAC,
  LDAP/Kerberos, TDE), while keeping its original edition-forcing role
  unchanged.

The Node test harness (`tests/test-scoring-engine.node.js`, 11 scenarios)
locks in a regression check for every one of these — if a future weight
change reintroduces any of them, the test will catch it (it now uses real
`assert` calls, not just "did it throw," for exactly this reason).
