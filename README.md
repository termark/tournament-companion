# Herschel water polo tournament companion

A lightweight, mobile-friendly companion page that turns a tournament's fixtures PDF into something parents can actually use at the pool: the team's games, live group standings, and the knockout route — including games whose opponents are not known yet because they depend on results still to be played.

It started as a one-off single-file page for the 2026 Mackenzie Cup ([termark/mackenzie-cup-2026](https://github.com/termark/mackenzie-cup-2026), still live as the archive of that tournament) and now runs any tournament described by a data file:

| Tournament | Dates | Data file | Official PDF |
|---|---|---|---|
| **Saints Invitational 2026 – Junior Girls** (default) | 16–18 Oct 2026, St Stithians College, Sandton | `tournaments/saints-invitational-2026-junior-girls.js` | `Saints-Invitational-2026-Junior-Girls.pdf` |
| Mackenzie Cup 2026 – U13 Girls (not shown; kept as a regression case for the validator) | 11–13 Sep 2026, Reddam House Constantia | `tournaments/mackenzie-cup-2026.js` | `Mackenzie-Cup-2026.pdf` |

## Live site

- https://termark.github.io/tournament-companion/ — current tournament (first entry in `tournaments/registry.js`)
- `?t=<id>` selects any other tournament listed in the registry (a switcher appears in the page header when there is more than one)
- https://termark.github.io/mackenzie-cup-2026/ — the original single-file Mackenzie Cup page, in its own repo, unchanged

## How to use

Open the live site on any phone or computer. Tabs:

- **Herschel** (one tab per tracked team) – group games, live group standings, and the knockout route. While group games are still being played the route is a projection from the current table; once the group is complete and the tie-break is unambiguous it is marked **Confirmed**. Each knockout game shows the opponent as a team name when it is known, or as the bracket placeholder (for example *Winner of G#27 — Cross-over play-off 3: 3rd Group A vs 2nd Group B*) when it is not. After the next unplayed game the page shows the **If WIN / If LOSS** follow-ups with day, time and pool.
- **Bracket** – wall-chart view: the four group panels, the championship bracket drawn World-Cup style (final in the middle, bronze game underneath) and a tree for every placing bracket. Drawn from the data file, so it is right for any tournament the validator accepts; teams fill in as results come in and the tracked team's path is highlighted. Scrolls sideways on a phone.
- **All Herschel** (only when more than one team is tracked) – combined timeline.
- **Results** – every game in the tournament with score entry, a bulk importer, and all live group tables. Knockout games fill in their participants automatically as the group tables settle and earlier knockout results come in.
- **Simple** – offline planner: pick the final group position, then select Win/Loss after each knockout game to reveal the next one. Stored locally in the browser; needs no sign-in.

Public visitors are read-only for the shared results. To update scores:

1. Tap **Editor sign in** and sign in with an authorised Supabase user
2. Enter the score on any game (team tab or Results tab)
3. Standings, projections and knockout participants update for everyone within ~20 seconds

### Knockout games that end level

Progression and placing games cannot end in a draw — the tournament goes to a penalty shoot-out. Enter the full-time score as normal; the page then shows a second **shoot-out** row for the penalty score, and uses it to decide the winner and advance the bracket.

### Update from MyComLink (anyone, no sign-in)

The Results tab opens with an **Update from MyComLink** box. Any parent can: tap *Open MyComLink results* → on that page *Select all* and *Copy* → come back and paste. The page shows what it found (new / changes / already in) and *Update shared results* writes it for everyone. Only rows copied verbatim from the results page are accepted there; hand-typed lines are ignored, so a public update can never invent a score — editors still have Quick import for corrections.

This needs anonymous writes enabled once in Supabase: run `supabase/public-results-updates.sql` in the dashboard's SQL Editor. Until then the box explains that public updates are not switched on and points to the editor route.

### Results from MyComLink

The organisers publish this tournament on MyComLink (event 12099): [fixtures](https://www.mycomlink.co.za/fixture_list.php?eid=12099&dlim=~), [results](https://www.mycomlink.co.za/result_list.php?eid=12099&dlim=~), [Herschel's games](https://www.mycomlink.co.za/fixture_list.php?eid=12099&org=261&agrp=34&dlim=~). Every game on the page links to its MyComLink fixture page (`fixture.php?i=83377 + game number`, verified for all 52), and the Resources card links the event's results and the venue.

MyComLink forbids automated fetching, so results are not polled. The route is: open the results page, select all, copy, paste into **Quick import**. The importer recognises their row shape (`Herschel 13A	9	-	15	St Mary's Waverley 13A`), their short school names, the `13A` age-group suffix and `Win - Forfeit`, and ignores the rest of the page.

### Quick result import

The **Results** tab accepts one result per line, in either direction:

```text
Herschel 5-3 St Dominic's
Kingsmead 2 2 Roedean
Chelsea Prep 4-1 Falcon
```

Short names, full school names from the PDF and a few common abbreviations are recognised (see `aliases` in the data file). The preview is editable before submission; existing scores that would be overwritten are highlighted. Knockout games are matched once their participants are known.

## What the page calculates

For each group: played, won, drawn, lost, goals for/against, goal difference, points and position, using the tournament's own points scheme and tie-break rule (both come from the data file):

- **Saints Invitational**: 2/1/0 points; ties broken *in isolation* under the World Aquatics group rules — points, goal difference and goals scored in the games between the tied teams (re-applied to any sub-group that stays tied), then overall goal difference and goals scored. When a position is settled by anything beyond head-to-head points the table carries a note to confirm with the tournament desk; when the entered scores cannot settle it at all the table is marked **provisional**.
- **Mackenzie Cup**: 3/1/0 points; head-to-head settles a two-way tie, anything else is provisional (the original behaviour).

From the standings it resolves every knockout slot (`1st Group D`, `Winner of G#27`, …) recursively through the bracket, walks the tracked team's path, and reports the final placing once the last game is in.

## Architecture

```text
GitHub Pages
    ↓
index.html                 markup + CSS
js/engine.js               standings, slot resolution, bracket walk, bulk parser (no DOM; also runs in Node)
js/bracket.js              draws the championship and placing brackets as SVG from the data (no DOM)
js/app.js                  rendering, Supabase sync, editor sign-in, local cache
tournaments/registry.js    which tournaments the page shows; first one is the default (unlisted data files stay as validator regression cases)
tournaments/<id>.js        one data file per tournament (groups, games, bracket, rules text)
    ↓
Supabase                   match_results table (fixture_id, score_a, score_b, updated_at)
```

No build step, package manager or framework. Supabase Free provides the shared `match_results` table, editor authentication and row-level security (public read, authenticated write); the page only embeds the publishable key. All tournaments share the one table — every game id is prefixed with the tournament's short id, and a penalty shoot-out is stored as `<game id>_pen`.

## Before each tournament

1. **Restore the Supabase project.** The free tier pauses a project after about a week without traffic, and a paused project refuses every call: no shared results, no editor sign-in. Open the Supabase dashboard, click the project and choose *Restore project* (a few minutes for this database). The page polls every 20 seconds, so it stays awake while parents are using it.
2. Check **Authentication → Users** in the same dashboard: that is where editor logins live. Create one per person who will enter scores (*Add user → Create new user*, tick *Auto Confirm User*); any authenticated user can write.
3. Open the live page, sign in, confirm the score fields unlock.

## Adding the next tournament PDF

1. Copy the official PDF into the repo root (`Something-2026.pdf`).
2. Create `tournaments/<id>.js` from the Saints file as a template. Everything the page knows about the tournament lives there:
   - `external` (optional) – links to the organiser's results site: per-game URL function, results/fixtures/venue pages
   - `pools` / `venueMap` (optional) – a lat/lng per pool and for the venue; every game then gets a Google Maps link, and the Programme card lists the pools
   - `tracked` – the team(s) to follow, `points`, `tiebreak` (`"wa"` or `"simple"`), `caps` (which fixture column wears which cap colour), `arriveMinutes`, optional `poolShort` (short pool names for the bracket boxes)
   - `groups`, `teams` (full names/origin, for the importer), `aliases`
   - `games` – every game once, in PDF order, numbered `n` = 1…N. Group games carry `{team:"…"}` slots; knockout games reference `{group:"D",rank:1}`, `{winner:27}` or `{loser:27}`, and placing games carry `places:[5,6]`.
   - `events` and `notes` – the programme and the rules worth repeating on the page; an event can carry `highlight:true`, a `detail` line and a `map:{lat,lng,label}` for a Google Maps link (team dinners, meeting points)
3. Add it to `tournaments/registry.js` (first entry = default).
4. Run the validator (below). It refuses anything structurally impossible — a group position that enters the bracket twice, a winner that is never used, a placing game missing — and simulates hundreds of complete tournaments through the real engine.
5. Commit and push; GitHub Pages redeploys.

Game ids become Supabase keys, so never renumber a tournament once results have been entered.

## Validation

```bash
node tools/validate.js                      # every tournament in the registry
node tools/validate.js mackenzie-cup-2026   # one tournament

npm i --no-save jsdom                        # once, for the UI smoke test
node tools/smoke.js                          # drives every view with a stubbed Supabase
```

`tools/validate.js` also carries a second, hand-transcribed copy of Herschel's routes from each PDF and checks the data file against it for every win/loss sequence from every group position.

## Repository layout

```text
tournament-companion/
├── index.html
├── js/
│   ├── engine.js
│   ├── bracket.js
│   └── app.js
├── tournaments/
│   ├── registry.js
│   ├── saints-invitational-2026-junior-girls.js
│   └── mackenzie-cup-2026.js
├── tools/
│   ├── validate.js
│   └── smoke.js
├── supabase/
│   └── public-results-updates.sql   one-off: let visitors write pasted results
├── Saints-Invitational-2026-Junior-Girls.pdf
├── Mackenzie-Cup-2026.pdf
└── README.md
```

## Current version

**Page version: 1.4.0** (multi-tournament engine, bracket view, public results updates). The original Mackenzie Cup page (0.8.5) lives on in [termark/mackenzie-cup-2026](https://github.com/termark/mackenzie-cup-2026).

## Notes

This is an unofficial parent-built companion page. Always treat the official tournament communication as the authoritative source if there is any discrepancy — the Saints rules give the Tournament Directors the final say on group ties and any rescheduling.
