/**
 * Yntraa Cloud — MDBaaS Database Recommendation Engine
 * scoring-engine.js
 *
 * Pure scoring logic. This file must NEVER contain a database/family name
 * (mysql, postgresql, redis, etc.) anywhere in its code. It only ever reads
 * whatever families exist in the loaded config's `catalog` object and loops
 * over them. That is the whole point of the architecture: adding database
 * #13 later is a data change in dbaas-scoring-config.json, never a code
 * change here.
 *
 * Exposed as window.ScoringEngine.
 */
(function (global) {
  "use strict";

  function getFamilies(config) {
    return Object.keys(config.catalog);
  }

  function isScoredQuestion(q) {
    return !!(q && q.weights && typeof q.weights === "object");
  }

  /**
   * How much a question matters, set in the config as `importance`
   * (default 1). The workload question counts double because it states
   * what the database is FOR; the other answers refine it.
   */
  function importanceOf(q) {
    return typeof q.importance === "number" ? q.importance : 1;
  }

  /**
   * Score one set of answers. Returns each family's raw score plus the two
   * ends of the yardstick for THESE answers:
   *   best  = the highest score any family could have earned
   *   worst = the lowest score any family could have earned
   * Match % = where a family sits between worst and best. One shared scale
   * for every family, so ranking and the displayed % can never disagree,
   * and a family only shows 0% if it is the worst choice on every answer.
   * answers: { [questionKey]: optionId | optionId[] }
   */
  function scoreWithBest(config, answers) {
    const families = getFamilies(config);
    const raw = {};
    families.forEach((f) => (raw[f] = 0));
    let best = 0;
    let worst = 0;

    Object.keys(config.questionnaire).forEach((qKey) => {
      const q = config.questionnaire[qKey];
      if (!isScoredQuestion(q)) return;
      const ans = answers[qKey];
      if (ans == null) return;
      const imp = importanceOf(q);
      (Array.isArray(ans) ? ans : [ans]).forEach((optId) => {
        const w = q.weights[optId];
        if (!w) return;
        let top = -Infinity;
        let low = Infinity;
        families.forEach((f) => {
          const v = typeof w[f] === "number" ? w[f] : 0;
          raw[f] += v * imp;
          if (v > top) top = v;
          if (v < low) low = v;
        });
        best += Math.max(top, 0) * imp;
        worst += Math.min(low, 0) * imp;
      });
    });

    worst -= applyWorkloadGate(config, answers, raw);
    return { raw, best, worst };
  }

  /** Penalty that the workload gate applies for the chosen workload option. */
  function gatePenaltyFor(gate, optId) {
    const hard = gate.hard_options || {};
    return typeof hard[optId] === "number" ? hard[optId] : gate.penalty;
  }

  /**
   * Workload gate (config.workload_gate): an engine that is a poor fit for
   * the workload the person described cannot win on side features alone.
   * Engines whose weight for the chosen workload is <= poor_fit_max_weight
   * lose `penalty` points, unless the person asked for a specific
   * compatibility (e.g. DynamoDB API, Oracle PL/SQL) that this engine
   * provides, which counts as a hard requirement and waives the penalty.
   * `hard_options` lists workloads that are a category of their own (batch /
   * data lake): there the penalty is much larger and is never waived, so the
   * specialist always ranks first without any special-case code.
   * Returns the penalty applied (0 if none), so the % scale can include it.
   */
  function applyWorkloadGate(config, answers, raw) {
    const gate = config.workload_gate;
    if (!gate) return 0;
    const q = config.questionnaire[gate.question];
    const optId = answers[gate.question];
    if (!q || !q.weights || optId == null || Array.isArray(optId)) return 0;
    const w = q.weights[optId] || {};
    const isHard = !!(gate.hard_options && typeof gate.hard_options[optId] === "number");
    const penalty = gatePenaltyFor(gate, optId);
    const waivers = isHard ? [] : gate.waived_by || [];
    let applied = 0;
    Object.keys(raw).forEach((f) => {
      if ((typeof w[f] === "number" ? w[f] : 0) > gate.poor_fit_max_weight) return;
      const waived = waivers.some((wv) => {
        const wq = config.questionnaire[wv.question];
        const picked = answers[wv.question];
        if (!wq || !wq.weights || picked == null) return false;
        return (Array.isArray(picked) ? picked : [picked]).some((o) => {
          const ow = wq.weights[o];
          return ow && typeof ow[f] === "number" && ow[f] >= wv.min_weight;
        });
      });
      if (!waived) {
        raw[f] -= penalty;
        applied = penalty;
      }
    });
    return applied;
  }

  /**
   * Why did this family score what it scored? Returns the answers that
   * helped it most and the ones that counted against it, so the result
   * screen can say "because you told us X" instead of just showing a number.
   */
  function explain(config, answers, family) {
    const items = [];
    Object.keys(config.questionnaire).forEach((qKey) => {
      const q = config.questionnaire[qKey];
      if (!isScoredQuestion(q)) return;
      const ans = answers[qKey];
      if (ans == null) return;
      const imp = importanceOf(q);
      (Array.isArray(ans) ? ans : [ans]).forEach((optId) => {
        const w = q.weights[optId];
        if (!w) return;
        const v = typeof w[family] === "number" ? w[family] : 0;
        let top = -Infinity;
        Object.keys(w).forEach((f) => { if (typeof w[f] === "number" && w[f] > top) top = w[f]; });
        items.push({ question: qKey, option: optId, weight: v, points: v * imp, isTopForAnswer: v > 0 && v === top });
      });
    });
    const pros = items.filter((i) => i.weight >= 2).sort((a, b) => b.points - a.points);
    const cons = items.filter((i) => i.weight < 0).sort((a, b) => a.points - b.points);
    return { pros, cons };
  }

  function scoreSingle(config, answers) {
    return scoreWithBest(config, answers).raw;
  }

  /**
   * Match % for every family, 0-100.
   * normalize(raw, best, worst): position between the worst and the best
   * score any family could get on these answers (preferred).
   * normalize(raw, best): raw / best. A per-family object for `best` is still
   * accepted so older UI code that passed computeCeiling() keeps working.
   */
  function normalize(rawScores, best, worst) {
    const pct = {};
    Object.keys(rawScores).forEach((f) => {
      let v = 0;
      if (typeof worst === "number" && typeof best === "number") {
        const span = best - worst;
        v = span > 0 ? Math.round(((rawScores[f] - worst) / span) * 100) : 0;
      } else {
        const denom = typeof best === "object" && best !== null ? best[f] || 0 : best;
        v = denom > 0 ? Math.round((rawScores[f] / denom) * 100) : 0;
      }
      pct[f] = Math.max(0, Math.min(100, v));
    });
    return pct;
  }

  /** "Great fit" / "Good fit" / ... label for a match %, from config.result_settings.bands. */
  function fitBand(config, pct) {
    const bands = (config.result_settings && config.result_settings.bands) || [];
    for (let i = 0; i < bands.length; i++) if (pct >= bands[i].min_pct) return bands[i];
    return bands.length ? bands[bands.length - 1] : { id: "fit", label: "Match" };
  }

  /** @deprecated Kept only so older callers don't break. Not used for ranking or display. */
  function computeCeiling(config) {
    const families = getFamilies(config);
    const ceiling = {};
    families.forEach((f) => (ceiling[f] = 0));
    Object.keys(config.questionnaire).forEach((qKey) => {
      const q = config.questionnaire[qKey];
      if (!isScoredQuestion(q)) return;
      families.forEach((f) => {
        let best = 0, sumPos = 0;
        Object.keys(q.weights).forEach((o) => {
          const w = q.weights[o][f];
          if (typeof w === "number") { if (w > best) best = w; if (w > 0) sumPos += w; }
        });
        ceiling[f] += (q.type === "multi_select" ? Math.max(best, sumPos) : best) * importanceOf(q);
      });
    });
    return ceiling;
  }

  function rankFamilies(scores) {
    return Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  }

  /**
   * Decide which edition(s) of a family to recommend, and how to frame
   * the OSS/Enterprise trade-off, per the budget/compliance answers.
   * Generic over any number of editions a catalog entry defines (not
   * hardcoded to "opensource" / "enterprise" spellings).
   */
  function decideEdition(config, family, answers) {
    const editions = config.catalog[family].editions;
    const editionKeys = Object.keys(editions);

    if (editionKeys.length === 1) {
      return { mode: "single", primary: editionKeys[0], alternative: null };
    }

    const cheap = editionKeys.reduce((a, b) =>
      editions[a].list_price_inr <= editions[b].list_price_inr ? a : b
    );
    const premium = editionKeys.find((k) => k !== cheap) || cheap;

    const q10 = answers.Q10_compliance_edition_modifier;
    const q13 = answers.Q13_budget_modifier;
    const q7 = answers.Q7_geo_availability;
    const ecosystem = answers.Q9_ecosystem_compatibility || [];

    const activeActive = q7 === "multi_region_active_active";
    const oracleNeed = ecosystem.indexOf("oracle_pl_sql_compatibility_needed") !== -1;
    const forcesEnterprise = q10 === "regulated_industry";
    const enterpriseHelps =
      q10 === "advanced_auditing" || q10 === "regulated_industry" || activeActive || oracleNeed;

    if (forcesEnterprise) {
      return {
        mode: "required",
        primary: premium,
        alternative: cheap,
        reason: "regulated_industry",
      };
    }
    if (enterpriseHelps && q13 === "premium") {
      return { mode: "premium_preferred", primary: premium, alternative: cheap };
    }
    if (enterpriseHelps && q13 === "cost_sensitive") {
      return { mode: "cost_tradeoff", primary: cheap, alternative: premium };
    }
    if (enterpriseHelps && q13 === "balanced") {
      return { mode: "both", primary: null, alternative: null, both: [cheap, premium] };
    }
    if (q13 === "premium") {
      return { mode: "premium_default", primary: premium, alternative: cheap };
    }
    return { mode: "cost_default", primary: cheap, alternative: premium };
  }

  /**
   * If the top family is enterprise-only (no cheaper tier at all) and the
   * user is cost-sensitive, look for a same-job sibling (from
   * substitution_groups) that does have an open-source tier.
   */
  function findBudgetSubstitute(config, family, answers) {
    const editions = config.catalog[family].editions;
    const hasCheapTier = Object.keys(editions).some(
      (k) => editions[k].list_price_inr <= (config._cheapThreshold || Infinity) || true
    );
    // "enterprise-only" = every edition key is not literally called
    // out as the family's cheapest historical tier. We detect this
    // generically: if there's only one edition and its price is the
    // higher of the two typical tiers, OR simplest — just check if any
    // edition key contains "opensource"/"standard" style low-cost naming.
    const lowCostLike = Object.keys(editions).some((k) => /open|standard|community/i.test(k));
    if (lowCostLike) return null;
    if (answers.Q13_budget_modifier !== "cost_sensitive") return null;

    const group = (config.substitution_groups || []).find((g) => g.members.indexOf(family) !== -1);
    if (!group) return null;
    const sibling = group.members.find((m) => m !== family);
    if (!sibling) return null;
    const siblingHasCheap = Object.keys(config.catalog[sibling].editions).some((k) =>
      /open|standard|community/i.test(k)
    );
    if (!siblingHasCheap) return null;

    return { sibling, note: group.note };
  }

  function detectConflicts(config, answers) {
    const fires = [];
    (config.conflict_rules || []).forEach((rule) => {
      const whenKey = Object.keys(rule.when)[0];
      const whenVal = rule.when[whenKey];
      const tensionKey = Object.keys(rule.tension_with)[0];
      const tensionVal = rule.tension_with[tensionKey];

      const a1 = answers[whenKey];
      const a2 = answers[tensionKey];
      const m1 = Array.isArray(a1) ? a1.indexOf(whenVal) !== -1 : a1 === whenVal;
      const m2 = Array.isArray(a2) ? a2.indexOf(tensionVal) !== -1 : a2 === tensionVal;
      if (m1 && m2) fires.push(rule);
    });
    return fires;
  }

  /**
   * Full single-workload recommendation: top 3 + edition framing +
   * conflicts + budget substitution, all derived from config data only.
   */
  function recommendSingle(config, answers) {
    const workload = answers.Q1_workload_shape;
    const gate = config.workload_gate || {};
    // Batch / data-lake style workloads are a category of their own (listed
    // under workload_gate.hard_options): the gate makes the specialist rank
    // first on score alone, and the other two results are the nearest
    // alternatives if live queries are needed too.
    const isCategoryBranch = !!(gate.hard_options && typeof gate.hard_options[workload] === "number");

    const scored = scoreWithBest(config, answers);
    const raw = scored.raw;
    const pct = normalize(raw, scored.best, scored.worst);
    // Ties go to the engine that fits the stated workload best, then to
    // catalog order, so "search" never lists a general-purpose engine above
    // a search engine on an equal score.
    const families = getFamilies(config);
    const wlWeights = ((config.questionnaire.Q1_workload_shape || {}).weights || {})[workload] || {};
    const ranked = families.slice().sort(
      (a, b) => raw[b] - raw[a] || (wlWeights[b] || 0) - (wlWeights[a] || 0) || families.indexOf(a) - families.indexOf(b)
    );
    const conflicts = detectConflicts(config, answers);

    const rs = config.result_settings || {};
    const topN = rs.top_n || 3;
    const minPct = typeof rs.min_pct === "number" ? rs.min_pct : 0;
    const shown = ranked.filter((f, i) => i === 0 || pct[f] >= minPct).slice(0, topN);
    const top3 = shown.map((f) => buildResultCard(config, f, raw, pct, answers));

    const out = { mode: isCategoryBranch ? "batch_branch" : "single", raw, pct, ranked, top3, conflicts };
    if (isCategoryBranch) {
      out.note =
        "This is a batch / data-lake job rather than a live database, so the batch specialist comes first. The other two are the closest options only if you also need to query this data live.";
    }
    return out;
  }

  // `answers` drives the edition/budget logic; `scoringAnswers` (defaults to
  // the same) is what the family was actually scored on, used for the "why".
  function buildResultCard(config, family, raw, pct, answers, scoringAnswers) {
    const edition = decideEdition(config, family, answers);
    const substitute = findBudgetSubstitute(config, family, answers);
    return {
      family,
      score: raw[family],
      pct: pct[family],
      band: fitBand(config, pct[family]),
      reasons: explain(config, scoringAnswers || answers, family),
      edition,
      substitute,
      catalog: config.catalog[family],
    };
  }

  // Questions that legitimately vary PER COMPONENT of a composite
  // application (a checkout component and a caching component of the
  // same app can have completely different data-structure and
  // consistency needs) — these are asked once per selected component,
  // not once for the whole application. Everything else in the
  // questionnaire (scale, geo posture, compliance, budget, ecosystem,
  // ops comfort) is a genuinely application-wide answer and stays
  // shared. This list is deliberately small and stable; it does not
  // need to change when a new database is added to the catalog.
  const PER_COMPONENT_QUESTION_KEYS = ["Q2_data_structure", "Q4_consistency", "Q5_latency"];

  /**
   * Composite / whole-application scoring.
   *
   * components: array of Q1_workload_shape option ids the user selected.
   * perComponentAnswers: { [component]: { Q2_data_structure, Q4_consistency, Q5_latency } }
   *   — the "which shape of data / how strict / how fast" answers,
   *   collected separately for each selected component.
   * sharedAnswers: every other scored question (Q6, Q7, Q8, Q9, Q10,
   *   Q13, Q14), answered once for the application as a whole.
   */
  function recommendComposite(config, components, perComponentAnswers, sharedAnswers) {
    const families = getFamilies(config);
    const q1 = config.questionnaire.Q1_workload_shape;
    const threshold =
      (config.multi_app_settings && config.multi_app_settings.consolidation_min_weight_per_component) || 2;

    // Each component is scored like a single workload: the app-wide shared
    // answers, plus that component's own data-shape / consistency / latency
    // answers, plus the component itself as the Q1 workload. This way a
    // caching component and a transactional component of the same
    // application pull toward genuinely different engines.
    const sharedOnly = Object.assign({}, sharedAnswers);
    PER_COMPONENT_QUESTION_KEYS.forEach((k) => delete sharedOnly[k]);
    delete sharedOnly.Q1_workload_shape;

    const perComponent = {};
    const perComponentPct = {};
    const perComponentMerged = {};
    components.forEach((comp) => {
      const merged = Object.assign({}, sharedOnly, (perComponentAnswers && perComponentAnswers[comp]) || {}, {
        Q1_workload_shape: comp,
      });
      const scored = scoreWithBest(config, merged);
      perComponent[comp] = scored.raw;
      perComponentPct[comp] = normalize(scored.raw, scored.best, scored.worst);
      perComponentMerged[comp] = merged;
    });

    const specialists = {};
    components.forEach((comp) => {
      const cw = (q1.weights && q1.weights[comp]) || {};
      const ranked = families.slice().sort(
        (a, b) => perComponent[comp][b] - perComponent[comp][a] || (cw[b] || 0) - (cw[a] || 0) || families.indexOf(a) - families.indexOf(b)
      );
      specialists[comp] = buildResultCard(config, ranked[0], perComponent[comp], perComponentPct[comp], sharedAnswers, perComponentMerged[comp]);
      // two runner-ups per component, so every need still shows three options
      specialists[comp].alternatives = ranked.slice(1, 3).map((f) => ({
        family: f,
        pct: perComponentPct[comp][f],
        catalog: config.catalog[f],
      }));
    });

    const consolidationCandidates = families
      .filter((f) =>
        components.every((comp) => {
          const w = (q1.weights && q1.weights[comp]) || {};
          return (typeof w[f] === "number" ? w[f] : 0) >= threshold;
        })
      )
      .sort((a, b) => {
        const sa = components.reduce((s, c) => s + perComponent[c][a], 0);
        const sb = components.reduce((s, c) => s + perComponent[c][b], 0);
        return sb - sa;
      })
      .map((f) => {
        const totalScore = components.reduce((s, c) => s + perComponent[c][f], 0);
        return {
          family: f,
          catalog: config.catalog[f],
          totalScore,
          edition: decideEdition(config, f, sharedAnswers),
        };
      });

    // Conflict rules reference a mix of per-component keys (Q1, Q4, Q5)
    // and shared keys (Q6, Q7) — so each component's own answers are
    // merged with the shared ones before checking, and any hits are
    // tagged with the component they came from.
    const conflicts = [];
    components.forEach((comp) => {
      const merged = Object.assign(
        {},
        sharedAnswers,
        (perComponentAnswers && perComponentAnswers[comp]) || {},
        { Q1_workload_shape: comp }
      );
      detectConflicts(config, merged).forEach((rule) => {
        conflicts.push(Object.assign({ component: comp }, rule));
      });
    });

    return { perComponent, specialists, consolidationCandidates, conflicts };
  }

  global.ScoringEngine = {
    getFamilies,
    scoreSingle,
    scoreWithBest,
    explain,
    fitBand,
    computeCeiling,
    normalize,
    rankFamilies,
    decideEdition,
    findBudgetSubstitute,
    detectConflicts,
    recommendSingle,
    recommendComposite,
    buildResultCard,
  };
})(window);

