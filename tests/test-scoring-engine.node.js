// Run: node tests/test-scoring-engine.node.js
global.window = global;
const fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, "..");
require(path.join(root, "js/scoring-engine.js"));
const E = global.ScoringEngine;
const cfg = JSON.parse(fs.readFileSync(path.join(root, "data/dbaas-scoring-config.json"), "utf8"));
const copy = JSON.parse(fs.readFileSync(path.join(root, "data/question-copy.json"), "utf8"));
const personas = require("./personas.js");
const fams = E.getFamilies(cfg);
let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed++; console.log("  ok   " + name); } catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); } }
const opts = (k) => Object.keys(cfg.questionnaire[k].weights);

console.log("Config integrity");
t("every weighted option gives a number for all " + fams.length + " engines", () => {
  Object.entries(cfg.questionnaire).forEach(([k, q]) => q.weights && Object.entries(q.weights).forEach(([o, w]) =>
    fams.forEach((f) => assert.strictEqual(typeof w[f], "number", `${k}/${o} missing ${f}`))));
});
t("quiz copy (labels) exists for every option and nothing extra", () => {
  Object.entries(cfg.questionnaire).forEach(([k, q]) => {
    if (!q.weights) return;
    const a = opts(k).sort().join(), b = copy[k].options.map((o) => o.id).sort().join();
    assert.strictEqual(a, b, k);
  });
});
t("js/ui-meta.js shows exactly the wording in data/question-copy.json", () => {
  require(path.join(root, "js/ui-meta.js"));
  global.UIMeta.QUESTIONS.forEach((uq) => {
    const c = copy[uq.key];
    assert.ok(c, "no copy for " + uq.key);
    assert.strictEqual(uq.title, c.title, uq.key + " title");
    assert.deepStrictEqual(uq.options.map((o) => [o.id, o.label]), c.options.map((o) => [o.id, o.label]), uq.key + " options");
  });
});
t("every engine has at least one edition with a price", () => {
  fams.forEach((f) => assert.ok(Object.values(cfg.catalog[f].editions).every((e) => typeof e.list_price_inr === "number"), f));
});

console.log("Scenarios (36 plain-English stories, see tests/personas.js)");
personas.forEach((p) => t(`${p.name} -> one of [${p.expect.join(", ")}]`, () => {
  const r = E.recommendSingle(cfg, p.answers);
  assert.ok(p.expect.includes(r.top3[0].family), `got ${r.top3.map((c) => c.family + " " + c.pct + "%").join(", ")}`);
}));

console.log("Invariants over the whole answer space");
function* allAnswers(keys) {
  const lists = keys.map((k) => opts(k).map((o) => (k === "Q9_ecosystem_compatibility" ? [o] : o)));
  const idx = lists.map(() => 0);
  for (;;) {
    const a = {}; keys.forEach((k, i) => (a[k] = lists[i][idx[i]])); yield a;
    let i = keys.length - 1;
    while (i >= 0 && ++idx[i] === lists[i].length) idx[i--] = 0;
    if (i < 0) return;
  }
}
const KEYS = ["Q1_workload_shape", "Q2_data_structure", "Q4_consistency", "Q5_latency", "Q6_scale", "Q7_geo_availability", "Q8_vector_search", "Q9_ecosystem_compatibility", "Q14_operational_comfort"];
const EXTRA = [["standard", "cost_sensitive"], ["regulated_industry", "premium"], ["advanced_auditing", "balanced"]];
let rows = 0, batchBad = 0, rankPctBad = 0, gateBad = 0, nonBatch = 0, edBad = 0;
for (const a of allAnswers(KEYS)) {
  const [c, b] = EXTRA[rows % 3]; rows++;
  a.Q10_compliance_edition_modifier = c; a.Q13_budget_modifier = b;
  const r = E.recommendSingle(cfg, a);
  if (a.Q1_workload_shape === "batch_etl_data_lake") { if (r.top3[0].family !== "hadoop") batchBad++; continue; }
  nonBatch++;
  const p = r.top3.map((x) => x.pct);
  if (p.some((v, i) => i > 0 && v > p[i - 1])) rankPctBad++;
  const w = r.top3[0].family, q1w = cfg.questionnaire.Q1_workload_shape.weights[a.Q1_workload_shape][w];
  const waived = (cfg.questionnaire.Q9_ecosystem_compatibility.weights[a.Q9_ecosystem_compatibility[0]][w] || 0) >= 4;
  if (q1w <= 0 && !waived) gateBad++;
  if (a.Q10_compliance_edition_modifier === "regulated_industry" && Object.keys(cfg.catalog[w].editions).length > 1 &&
      r.top3[0].edition.primary !== Object.keys(cfg.catalog[w].editions).find((k) => /ent|prem/i.test(k)) && r.top3[0].edition.mode !== "required") edBad++;
}
console.log(`       (${rows} combinations checked)`);
t("batch/ETL workload always recommends the batch engine (hadoop)", () => assert.strictEqual(batchBad, 0));
t("ranking and match % always agree (top 3 never shows a lower % above a higher %)", () => assert.strictEqual(rankPctBad, 0));
t("regulated industry always gets the 'enterprise required' edition path where an enterprise tier exists", () => assert.strictEqual(edBad, 0));
t("an engine poor at the stated workload wins in under 0.5% of answer combinations (only contradictory ones)", () =>
  assert.ok(gateBad / nonBatch < 0.005, `${gateBad}/${nonBatch} = ${(100 * gateBad / nonBatch).toFixed(2)}%`));

console.log("Regression: the reported 36% vs 61% case");
t("search workload + every 'extreme' box ticked: OpenSearch/Elasticsearch outrank ScyllaDB and % matches the order", () => {
  const p = personas.find((x) => x.name.startsWith("Search with every box"));
  const r = E.recommendSingle(cfg, p.answers);
  const order = r.top3.map((c) => c.family);
  assert.ok(["opensearch", "elasticsearch"].includes(order[0]), order.join());
  assert.ok(r.top3.every((c, i) => i === 0 || c.pct <= r.top3[i - 1].pct));
});
t("cost-sensitive + ScyllaDB on top surfaces the open-source Cassandra alternative", () => {
  const p = personas.find((x) => x.name === "IoT telemetry on a budget");
  const r = E.recommendSingle(cfg, p.answers);
  const top = r.top3[0];
  assert.ok(top.family === "cassandra" || (top.family === "scylladb" && top.substitute && top.substitute.sibling === "cassandra"), JSON.stringify(top.substitute));
});
t("DynamoDB compatibility need puts ScyllaDB first", () => {
  const p = personas.find((x) => x.name === "Moving from DynamoDB");
  assert.strictEqual(E.recommendSingle(cfg, p.answers).top3[0].family, "scylladb");
});

t("every normal (non-batch) result lists exactly 3 engines, in descending % order", () => {
  personas.forEach((p) => {
    const r = E.recommendSingle(cfg, p.answers);
    if (r.mode === "batch_branch") return;
    assert.strictEqual(r.top3.length, 3, p.name);
    assert.ok(r.top3.every((c, i) => i === 0 || c.pct <= r.top3[i - 1].pct), p.name);
  });
});

t("batch / data-lake: Hadoop first AND three results, whatever the other answers are", () => {
  let n = 0;
  for (const a of allAnswers(["Q2_data_structure", "Q4_consistency", "Q5_latency", "Q6_scale", "Q13_budget_modifier"])) {
    a.Q1_workload_shape = "batch_etl_data_lake"; n++;
    const r = E.recommendSingle(cfg, a);
    assert.strictEqual(r.top3[0].family, "hadoop");
    assert.strictEqual(r.top3.length, 3);
    assert.ok(r.top3[0].pct >= 50, "hadoop shown at " + r.top3[0].pct + "% for " + JSON.stringify(a));
  }
  assert.ok(n > 500);
});
t("quick round only (6 answers): the #1 pick is never shown at 0% and always has a reason", () => {
  for (const a of allAnswers(["Q1_workload_shape", "Q2_data_structure", "Q4_consistency", "Q5_latency", "Q6_scale", "Q13_budget_modifier"])) {
    const r = E.recommendSingle(cfg, a);
    assert.strictEqual(r.top3.length, 3);
    assert.ok(r.top3[0].pct >= 50, JSON.stringify(a) + " -> " + r.top3[0].family + " " + r.top3[0].pct);
    assert.ok(r.top3[0].reasons.pros.length > 0, JSON.stringify(a));
    assert.ok(r.top3[0].band && r.top3[0].band.label);
  }
});
t("the stated workload decides: the #1 pick is a good fit for it in over 97% of quick-round combinations", () => {
  let n = 0, bad = 0;
  for (const a of allAnswers(["Q1_workload_shape", "Q2_data_structure", "Q4_consistency", "Q5_latency", "Q6_scale", "Q13_budget_modifier"])) {
    n++; const w = E.recommendSingle(cfg, a).top3[0].family;
    if (cfg.questionnaire.Q1_workload_shape.weights[a.Q1_workload_shape][w] < 2) bad++;
  }
  assert.ok(bad / n < 0.03, bad + "/" + n);
});

console.log("Whole-application mode");
t("composite: each component gets its own best engine, scored on the same % scale", () => {
  const shared = { Q6_scale: "medium_few_tb", Q7_geo_availability: "single_region_ha", Q8_vector_search: "no", Q9_ecosystem_compatibility: ["no_ecosystem_constraint"], Q10_compliance_edition_modifier: "standard", Q13_budget_modifier: "balanced", Q14_operational_comfort: "comfortable_nosql_new_query_model" };
  const comps = ["oltp_transactional", "cache_session_realtime", "search_logging_observability"];
  const per = {
    oltp_transactional: { Q2_data_structure: "structured_relational_joins", Q4_consistency: "strict_acid", Q5_latency: "low_ms" },
    cache_session_realtime: { Q2_data_structure: "key_value", Q4_consistency: "eventual_ok", Q5_latency: "sub_millisecond" },
    search_logging_observability: { Q2_data_structure: "unstructured_text_logs", Q4_consistency: "eventual_ok", Q5_latency: "low_ms" },
  };
  const r = E.recommendComposite(cfg, comps, per, shared);
  assert.ok(["postgresql", "mysql", "mariadb", "mssql"].includes(r.specialists.oltp_transactional.family));
  assert.strictEqual(r.specialists.cache_session_realtime.family, "redis");
  assert.ok(["opensearch", "elasticsearch"].includes(r.specialists.search_logging_observability.family));
  comps.forEach((c) => { assert.ok(r.specialists[c].pct > 0 && r.specialists[c].pct <= 100); assert.strictEqual(r.specialists[c].alternatives.length, 2); });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
