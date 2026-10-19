// Supabase Edge Function: fetch-results
//
// Fetches the organiser's public results page for the active tournament, parses it with the
// SAME parser the web page uses (js/engine.js, loaded from the live site), and upserts the
// scores into match_results. Called by the "Update from MyComLink" button; one fetch per tap,
// no schedule — a human asked for the page, the function just reads it for them.
//
// Deploy:  supabase functions deploy fetch-results --no-verify-jwt
// Needs no secrets: it uses the project's own service role key (injected automatically).
//
// Request:  POST { tournament: "saints-invitational-2026-junior-girls" }   (defaults to that)
// Response: { ok, found, written, changed, unchanged, errors:[...], fetchedAt }

import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_BASE") ?? "https://termark.github.io/tournament-companion/";
const ALLOWED = new Set(["saints-invitational-2026-junior-girls"]);
const REGISTRY: Record<string, string> = {
  "saints-invitational-2026-junior-girls": "tournaments/saints-invitational-2026-junior-girls.js",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// Load a browser-style script (sets window.X) from the live site and return its window object.
async function loadWindowScript(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(SITE + path + "?fn=" + Date.now());
  if (!res.ok) throw new Error(`cannot load ${path}: HTTP ${res.status}`);
  const src = await res.text();
  const win: Record<string, unknown> = {};
  // engine.js uses a UMD wrapper: in a plain function scope `this` is undefined, so give it `self`.
  new Function("window", "self", "module", src)(win, win, undefined);
  return win;
}

// MyComLink renders the results list as a table; innerText of a row is "Team<tab>n<tab>-<tab>n<tab>Team".
// Rebuild that tab-separated text from the HTML so the page's parser sees exactly what a paste gives it.
function htmlToRows(html: string): string {
  const cell = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const rows: string[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(cell).filter((c) => c !== "");
    if (cells.length >= 5) rows.push(cells.join("\t"));
    else if (cells.length) rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let tournament = "saints-invitational-2026-junior-girls";
  try { const b = await req.json(); if (b && typeof b.tournament === "string") tournament = b.tournament; } catch { /* no body */ }
  if (!ALLOWED.has(tournament)) return json({ ok: false, error: "unknown tournament" }, 400);

  try {
    const E = (await loadWindowScript("js/engine.js")).Engine as any;
    const T = (await loadWindowScript(REGISTRY[tournament])).TOURNAMENT as any;
    if (!T?.external?.results) return json({ ok: false, error: "tournament has no results feed" }, 400);

    const page = await fetch(T.external.results, {
      headers: { "user-agent": "Mozilla/5.0 (tournament-companion; one fetch per user tap)", accept: "text/html" },
    });
    if (!page.ok) return json({ ok: false, error: `results page HTTP ${page.status}` }, 502);
    const text = htmlToRows(await page.text());

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: existingRows, error: readErr } = await sb.from("match_results").select("fixture_id,score_a,score_b");
    if (readErr) return json({ ok: false, error: readErr.message }, 500);
    const scores: Record<string, { a: unknown; b: unknown }> = {};
    for (const r of existingRows ?? []) scores[r.fixture_id] = { a: r.score_a ?? "", b: r.score_b ?? "" };

    const parsed = E.parseBulk(T, scores, text);
    const feedRows = parsed.out.filter((x: any) => x.feedRow);

    // The results LIST omits penalty shoot-outs; only the per-fixture page shows them ("7 (1)" / "7 (2)").
    // For every level knockout game without pens, fetch that one fixture page and read the bracketed numbers.
    const penFetches: string[] = [];
    for (const x of feedRows) {
      if (x.game.stage === "group" || x.scoreA !== x.scoreB || x.pens) continue;
      if (!T.external?.game) break;
      try {
        const url = T.external.game(x.game.n);
        const fr = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (tournament-companion; one fetch per user tap)" } });
        if (!fr.ok) continue;
        const txt = (await fr.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        // "Blue: <team> 7 (1) White: <team> 7 (2)" — blue is side a in this tournament's data, white side b (T.caps)
        const m = txt.match(/Blue:\s*.*?(\d+)\s*\((\d+)\)\s*White:\s*.*?(\d+)\s*\((\d+)\)/);
        if (!m) continue;
        const blueFT = Number(m[1]), bluePen = Number(m[2]), whiteFT = Number(m[3]), whitePen = Number(m[4]);
        if (blueFT !== x.scoreA || whiteFT !== x.scoreB) continue; // sides must line up with the list row
        x.pens = { a: bluePen, b: whitePen };
        penFetches.push(x.game.id);
      } catch { /* leave it level; the page asks for the shoot-out by hand */ }
    }
    const toWrite: any[] = [];
    let unchanged = 0, changed = 0;
    for (const x of feedRows) {
      const ex = E.scoreOf(scores, x.game.id);
      const exp = x.pens ? E.scoreOf(scores, x.game.id + "_pen") : null;
      const same = ex.a === x.scoreA && ex.b === x.scoreB && (!x.pens || (exp.a === x.pens.a && exp.b === x.pens.b));
      if (same) { unchanged++; continue; }
      if (ex.a != null || ex.b != null) changed++;
      toWrite.push({ fixture_id: x.game.id, score_a: x.scoreA, score_b: x.scoreB, updated_at: new Date().toISOString() });
      if (x.pens) toWrite.push({ fixture_id: x.game.id + "_pen", score_a: x.pens.a, score_b: x.pens.b, updated_at: new Date().toISOString() });
    }
    if (toWrite.length) {
      const { error } = await sb.from("match_results").upsert(toWrite, { onConflict: "fixture_id" });
      if (error) return json({ ok: false, error: error.message }, 500);
    }
    return json({
      ok: true, found: feedRows.length, written: toWrite.length, changed, unchanged,
      games: toWrite.map((r) => r.fixture_id), penFetches, errors: parsed.errors.slice(0, 10), fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
