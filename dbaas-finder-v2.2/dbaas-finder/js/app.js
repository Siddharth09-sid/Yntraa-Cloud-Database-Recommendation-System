/**
 * Yntraa Cloud — Database Finder
 * app.js — UI controller. Depends on ScoringEngine (scoring-engine.js) and
 * UIMeta (ui-meta.js) being loaded first. No database name is hardcoded
 * here; everything is read from the config and ui-meta.
 *
 * v2 flow (built for "few clicks, no scrolling"):
 *   landing -> 6 quick questions (one tap each, auto-advance) -> reveal ->
 *   podium of 3 -> optional 5-question bonus round for a sharper match.
 * Whole-application mode: pick the jobs -> 3 taps per job -> 2 shared
 * questions -> a stack with three options per job.
 */
(function () {
  "use strict";

  const root = document.getElementById("app-root");
  const quizEl = document.getElementById("quiz-app");
  const heroEl = document.querySelector(".hero");

  // Quick round: the answers that decide most of the match.
  const CORE_ORDER = [
    "Q1_workload_shape",
    "Q2_data_structure",
    "Q4_consistency",
    "Q5_latency",
    "Q6_scale",
    "Q13_budget_modifier",
  ];
  // Optional bonus round: sharpens the match, never required.
  const BONUS_ORDER = [
    "Q7_geo_availability",
    "Q8_vector_search",
    "Q9_ecosystem_compatibility",
    "Q10_compliance_edition_modifier",
    "Q14_operational_comfort",
  ];
  const PER_COMPONENT_ORDER = ["Q2_data_structure", "Q4_consistency", "Q5_latency"];
  const SHARED_CORE_ORDER = ["Q6_scale", "Q13_budget_modifier"];
  const NONE_OPTION = "no_ecosystem_constraint"; // "none of these" in the multi-select
  const ADVANCE_DELAY_MS = 380;
  const LEADERBOARD_ROWS = 6;

  let CONFIG = null;

  const state = freshState();

  function freshState() {
    return {
      screen: "landing",
      mode: null, // 'single' | 'composite' | 'existing'
      stepIndex: 0,
      bonus: false, // currently playing the bonus round
      bonusDone: false,
      answers: {}, // single mode
      components: [], // composite mode: chosen Q1 options
      componentRoundIndex: 0,
      perComponentAnswers: {},
      sharedAnswers: {},
      focusFamily: null, // which podium engine the detail card shows
      celebrate: false, // fire confetti on the next results render
      locked: false, // ignore taps while auto-advancing
    };
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  // Prefer the external data file when hosted over http(s). A double-clicked
  // index.html (file://) has fetch() blocked for local files, so this falls
  // back to the identical copy embedded inline in index.html's
  // <script id="scoring-config"> tag (see README: build-inline-config.py).
  loadConfig()
    .then((cfg) => {
      CONFIG = cfg;
      probeLogos(cfg);
      render();
    })
    .catch((err) => {
      root.innerHTML =
        '<div class="container" style="padding:60px 20px;text-align:center;">' +
        "<h2>Couldn't load the recommendation data</h2>" +
        '<p style="color:var(--ink-muted)">Both the data file and the inline fallback copy failed to load. Check the browser console for details.</p>' +
        '<p style="color:var(--ink-faint);font-size:0.8rem">(' + escapeHtml(err.message) + ")</p>" +
        "</div>";
    });

  // Database logos live in assets/db-logos/ as one-colour marks so all 12
  // look like one set: <key>.png (navy, for the light theme) and
  // <key>-light.png (white, for the dark theme). <key>.svg also works for the
  // first one. Any engine without a file keeps its emoji, so the site never
  // shows a broken image. (tools/make-logos.py builds both files from a source image.)
  const LOGOS = {};
  function probeImage(urls, done) {
    if (!urls.length) return done(null);
    const img = new Image();
    img.onload = () => done(urls[0]);
    img.onerror = () => probeImage(urls.slice(1), done);
    img.src = urls[0];
  }
  function probeLogos(cfg) {
    const base = "assets/db-logos/";
    Object.keys(cfg.catalog).forEach((f) => {
      probeImage([base + f + ".png", base + f + ".svg"], (main) => {
        if (!main) return;
        probeImage([base + f + "-light.png", base + f + "-light.svg"], (light) => {
          LOGOS[f] = { onLight: main, onDark: light || main };
          if (state.screen !== "landing" && !state.locked) render();
        });
      });
    });
  }
  function dbIcon(family) {
    const l = LOGOS[family];
    if (!l) return UIMeta.familyMeta(family).icon;
    return (
      '<img class="db-logo db-logo--on-light" src="' + l.onLight + '" alt="" />' +
      '<img class="db-logo db-logo--on-dark" src="' + l.onDark + '" alt="" />'
    );
  }

  function loadConfig() {
    return fetch("data/dbaas-scoring-config.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(() => {
        const el = document.getElementById("scoring-config");
        if (!el) throw new Error("No inline fallback config found either.");
        return JSON.parse(el.textContent);
      });
  }

  function goTo(screen) {
    state.screen = screen;
    state.locked = false;
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function resetAll() {
    Object.assign(state, freshState());
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function start(mode) {
    Object.assign(state, freshState());
    state.mode = mode || "single";
    goTo(state.mode === "composite" ? "composite-select" : state.mode === "existing" ? "existing-sizer" : "quiz");
  }

  // ---------------------------------------------------------------------
  // Render dispatch
  // ---------------------------------------------------------------------

  function render() {
    if (!CONFIG) return;
    const onLanding = state.screen === "landing";
    quizEl.hidden = onLanding;
    // The hero only belongs on the landing screen. Hiding it during the quiz
    // puts every question at the top of the page: no scrolling to find it.
    if (heroEl) heroEl.hidden = !onLanding;

    switch (state.screen) {
      case "quiz":
        renderSingleQuiz();
        break;
      case "composite-select":
        renderCompositeSelect();
        break;
      case "composite-round":
        renderCompositeRound();
        break;
      case "composite-shared":
        renderCompositeShared();
        break;
      case "reveal":
        renderReveal();
        break;
      case "results-single":
        renderResultsSingle();
        break;
      case "results-composite":
        renderResultsComposite();
        break;
      case "existing-sizer":
        renderExistingSizer();
        break;
      default:
        break;
    }
    // Question screens always start at the top so nothing needs scrolling to.
    // (Results keep their position when you tap between the three picks.)
    if (state.screen.indexOf("results") !== 0 && window.scrollY > 0) window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------------
  // Shared chrome: progress, live ranking
  // ---------------------------------------------------------------------

  function progressChrome(current, total, label) {
    const pct = Math.round(((current - 1) / total) * 100);
    return (
      '<div class="quiz-progress">' +
      '<span class="quiz-progress__label">' + escapeHtml(label) + "</span>" +
      '<div class="quiz-progress__bar"><div class="quiz-progress__fill" style="width:' + pct + '%"></div></div>' +
      '<span class="quiz-progress__label">' + current + "/" + total + "</span>" +
      "</div>"
    );
  }

  function rankFromScored(scored) {
    const families = ScoringEngine.getFamilies(CONFIG);
    const pct = ScoringEngine.normalize(scored.raw, scored.best, scored.worst);
    const started = scored.best > 0 || scored.worst < 0;
    const ranked = families.slice().sort((a, b) => scored.raw[b] - scored.raw[a] || families.indexOf(a) - families.indexOf(b));
    return { families, pct, ranked, started };
  }

  // Sidebar "live ranking": every engine has a row, CSS `order` sorts them
  // and only the top few are visible. Rows are updated in place after each
  // answer so the bars slide instead of the whole panel redrawing.
  function leaderboardHtml(scored, title) {
    const r = rankFromScored(scored);
    const rows = r.families
      .map((f) => {
        const meta = UIMeta.familyMeta(f);
        const color = UIMeta.familyColor(f, CONFIG.catalog);
        const name = (CONFIG.catalog[f] && CONFIG.catalog[f].display_name) || f;
        return (
          '<div class="lb-row" data-family="' + f + '" data-color="' + color + '">' +
          '<div class="lb-row__rank"></div>' +
          '<div class="lb-row__name">' + dbIcon(f) + " " + escapeHtml(name) + "</div>" +
          '<div class="lb-row__pct"></div>' +
          '<div class="lb-row__track"><div class="lb-row__fill"></div></div>' +
          "</div>"
        );
      })
      .join("");
    return (
      '<aside class="panel leaderboard">' +
      '<p class="leaderboard__title">📊 ' + escapeHtml(title || "Live ranking") + "</p>" +
      '<p class="leaderboard__sub" id="lb-sub"></p>' +
      '<div class="lb-rows">' + rows + "</div>" +
      "</aside>"
    );
  }

  // Compact one-line version of the ranking, shown inside the question card
  // on small screens where the sidebar is hidden.
  function leaderStripHtml() {
    return '<div class="leader-strip" id="leader-strip"></div>';
  }

  function updateLiveRanking(scored) {
    const r = rankFromScored(scored);
    const leader = r.ranked[0];
    root.querySelectorAll(".lb-row").forEach((row) => {
      const f = row.getAttribute("data-family");
      const rank = r.ranked.indexOf(f);
      const isLeader = r.started && rank === 0;
      row.style.order = String(rank);
      row.classList.toggle("is-hidden", rank >= LEADERBOARD_ROWS);
      row.classList.toggle("is-leader", isLeader);
      row.querySelector(".lb-row__rank").textContent = String(rank + 1);
      row.querySelector(".lb-row__pct").textContent = r.started ? r.pct[f] + "%" : "";
      const fill = row.querySelector(".lb-row__fill");
      fill.style.width = (r.started ? Math.max(4, r.pct[f]) : 4) + "%";
      fill.style.background = isLeader ? "var(--orange)" : row.getAttribute("data-color");
    });
    const sub = document.getElementById("lb-sub");
    if (sub) sub.textContent = r.started ? "Top " + LEADERBOARD_ROWS + " right now. It changes as you answer." : "Answer to start the race.";

    const strip = document.getElementById("leader-strip");
    if (strip) {
      if (!r.started) {
        strip.innerHTML = "🏁 Pick an answer to start the race";
      } else {
        const meta = UIMeta.familyMeta(leader);
        const changed = updateLiveRanking._last && updateLiveRanking._last !== leader;
        strip.innerHTML =
          "🏆 " + dbIcon(leader) + " <b>" + escapeHtml(CONFIG.catalog[leader].display_name) + "</b> " +
          (changed ? "takes the lead!" : "is in the lead") +
          ' <span class="leader-strip__pct">' + r.pct[leader] + "%</span>";
        strip.classList.remove("is-new");
        if (changed) {
          void strip.offsetWidth; // restart the pulse animation
          strip.classList.add("is-new");
        }
      }
    }
    updateLiveRanking._last = r.started ? leader : null;
  }

  // ---------------------------------------------------------------------
  // Question screen (shared by the quick round, bonus round and shared
  // whole-application questions)
  // ---------------------------------------------------------------------

  function optionTileHtml(o, isSelected, qKey) {
    return (
      '<button type="button" class="option-card' + (isSelected ? " is-selected" : "") + '" data-opt="' + o.id + '"' +
      (qKey ? ' data-qkey="' + qKey + '"' : "") + ">" +
      '<span class="option-card__emoji">' + o.emoji + "</span>" +
      '<span class="option-card__text"><span class="option-card__label">' + escapeHtml(o.label) + "</span>" +
      (o.hint ? '<span class="option-card__hint">' + escapeHtml(o.hint) + "</span>" : "") +
      "</span>" +
      "</button>"
    );
  }

  function questionBody(q, currentAns, titleOverride, subtitleOverride) {
    const selected = Array.isArray(currentAns) ? currentAns : currentAns ? [currentAns] : [];
    const subtitle = subtitleOverride !== undefined ? subtitleOverride : q.subtitle;
    return (
      "<h2>" + escapeHtml(titleOverride || q.title) + "</h2>" +
      (subtitle ? '<p class="question-card__subtitle">' + escapeHtml(subtitle) + "</p>" : '<p class="question-card__subtitle question-card__subtitle--empty"></p>') +
      '<div class="option-grid option-grid--n' + q.options.length + '" id="opt-grid">' +
      q.options.map((o) => optionTileHtml(o, selected.indexOf(o.id) !== -1)).join("") +
      "</div>"
    );
  }

  function navRow(showNext, canNext, nextLabel) {
    return (
      '<div class="quiz-nav">' +
      '<button class="btn btn-ghost btn-sm" id="nav-back">← Back</button>' +
      (showNext
        ? '<button class="btn btn-primary btn-sm" id="nav-next"' + (canNext ? "" : " disabled") + ">" + escapeHtml(nextLabel || "Next") + " →</button>"
        : '<span class="quiz-nav__hint">Tap an answer to continue</span>') +
      "</div>"
    );
  }

  function wireNav(onBack, onNext) {
    const backBtn = document.getElementById("nav-back");
    const nextBtn = document.getElementById("nav-next");
    if (backBtn) backBtn.addEventListener("click", onBack);
    if (nextBtn && !nextBtn.disabled) nextBtn.addEventListener("click", onNext);
  }

  function hasAnswer(q, ans) {
    return q.type === "multi_select" ? Array.isArray(ans) && ans.length > 0 : !!ans;
  }

  /**
   * One question, one screen. Single-select: a tap records the answer,
   * updates the live ranking and moves on by itself. Multi-select: taps
   * toggle, "none of these" clears the rest and moves on, otherwise Next.
   */
  function renderQuestionScreen(opts) {
    const q = opts.q;
    const bag = opts.bag;
    const isMulti = q.type === "multi_select";
    const answered = hasAnswer(q, bag[q.key]);
    const showBoard = !!opts.scoreFn;

    quizEl.innerHTML =
      '<div class="container"><div class="quiz-layout' + (showBoard ? "" : " quiz-layout--solo") + '">' +
      '<div class="panel question-card">' +
      progressChrome(opts.index + 1, opts.total, opts.label) +
      (showBoard ? leaderStripHtml() : "") +
      questionBody(q, bag[q.key]) +
      (opts.switchLink ? '<p class="mode-switch"><button type="button" class="mode-switch__btn" id="mode-switch">' + escapeHtml(opts.switchLink.label) + "</button></p>" : "") +
      navRow(isMulti || answered, answered, opts.isLast ? opts.lastLabel || "See my match" : "Next") +
      "</div>" +
      (showBoard ? leaderboardHtml(opts.scoreFn(), opts.boardTitle) : "") +
      "</div></div>";

    if (showBoard) updateLiveRanking(opts.scoreFn());

    root.querySelectorAll("#opt-grid [data-opt]").forEach((el) =>
      el.addEventListener("click", () => {
        if (state.locked) return;
        const optId = el.getAttribute("data-opt");
        if (isMulti) {
          let cur = Array.isArray(bag[q.key]) ? bag[q.key].slice() : [];
          if (optId === NONE_OPTION) {
            cur = [NONE_OPTION];
          } else {
            cur = cur.filter((x) => x !== NONE_OPTION);
            const i = cur.indexOf(optId);
            if (i === -1) cur.push(optId);
            else cur.splice(i, 1);
          }
          bag[q.key] = cur;
          if (optId === NONE_OPTION) {
            autoAdvance(el, opts);
          } else {
            render();
          }
          return;
        }
        bag[q.key] = optId;
        autoAdvance(el, opts);
      })
    );
    wireNav(opts.onBack, opts.onNext);
    const sw = document.getElementById("mode-switch");
    if (sw && opts.switchLink) sw.addEventListener("click", opts.switchLink.go);
  }

  function autoAdvance(el, opts) {
    state.locked = true;
    root.querySelectorAll("#opt-grid .option-card").forEach((c) => c.classList.toggle("is-selected", c === el));
    if (opts.scoreFn) updateLiveRanking(opts.scoreFn());
    setTimeout(() => {
      state.locked = false;
      opts.onNext();
    }, ADVANCE_DELAY_MS);
  }

  // Number keys pick an answer (1 = first tile) on desktop.
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!/^[0-9]$/.test(e.key)) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const tiles = quizEl.hidden ? [] : quizEl.querySelectorAll("#opt-grid .option-card");
    const idx = e.key === "0" ? 9 : Number(e.key) - 1;
    if (tiles[idx]) tiles[idx].click();
  });

  // ---------------------------------------------------------------------
  // Single-workload quiz: quick round, then optional bonus round
  // ---------------------------------------------------------------------

  function renderSingleQuiz() {
    const order = state.bonus ? BONUS_ORDER : CORE_ORDER;
    const qKey = order[state.stepIndex];
    const q = UIMeta.questionByKey(qKey);
    const isLast = state.stepIndex === order.length - 1;

    renderQuestionScreen({
      q,
      bag: state.answers,
      index: state.stepIndex,
      total: order.length,
      label: state.bonus ? "🎯 Bonus round" : "🏁 Quick round",
      isLast,
      lastLabel: state.bonus ? "Update my match" : "See my match",
      boardTitle: "Live ranking",
      // Only on the very first question: an application with more than one
      // workload switches to whole-application mode right here, where the
      // choice makes sense, instead of being asked up front on the landing page.
      switchLink:
        !state.bonus && state.stepIndex === 0
          ? { label: "🧩 My application has several of these workloads", go: () => start("composite") }
          : null,
      scoreFn: () => ScoringEngine.scoreWithBest(CONFIG, state.answers),
      onBack: () => {
        if (state.stepIndex > 0) {
          state.stepIndex--;
          render();
        } else if (state.bonus) {
          state.bonus = false;
          goTo("results-single");
        } else {
          resetAll();
        }
      },
      onNext: () => {
        if (!isLast) {
          state.stepIndex++;
          render();
          return;
        }
        if (state.bonus) {
          state.bonus = false;
          state.bonusDone = true;
        }
        state.focusFamily = null;
        state.celebrate = true;
        goTo("reveal");
      },
    });
  }

  // ---------------------------------------------------------------------
  // Whole-application mode: pick the jobs
  // ---------------------------------------------------------------------

  function renderCompositeSelect() {
    const q = UIMeta.questionByKey("Q1_workload_shape");
    const selected = state.components;

    quizEl.innerHTML =
      '<div class="container"><div class="quiz-layout quiz-layout--solo"><div class="panel question-card">' +
      progressChrome(1, 3, "🧩 Whole application") +
      "<h2>" + escapeHtml(q.composite_title) + "</h2>" +
      '<p class="question-card__subtitle">' + escapeHtml(q.composite_subtitle) + "</p>" +
      '<div class="option-grid option-grid--n' + q.options.length + '" id="opt-grid">' +
      q.options.map((o) => optionTileHtml(o, selected.indexOf(o.id) !== -1)).join("") +
      "</div>" +
      '<p class="mode-switch"><button type="button" class="mode-switch__btn" id="mode-switch">🎯 I only have one workload</button></p>' +
      navRow(true, selected.length > 0, selected.length ? "Continue with " + selected.length : "Continue") +
      "</div></div></div>";

    root.querySelectorAll("#opt-grid [data-opt]").forEach((el) =>
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-opt");
        const idx = state.components.indexOf(id);
        if (idx === -1) state.components.push(id);
        else state.components.splice(idx, 1);
        render();
      })
    );
    document.getElementById("mode-switch").addEventListener("click", () => start("single"));
    wireNav(resetAll, () => {
      state.componentRoundIndex = 0;
      goTo("composite-round");
    });
  }

  // ---------------------------------------------------------------------
  // Whole-application mode: three taps per job, one screen per job
  // ---------------------------------------------------------------------

  function workloadMeta(comp) {
    const q1 = UIMeta.questionByKey("Q1_workload_shape");
    const o = q1.options.find((x) => x.id === comp) || { emoji: "🧩", label: comp };
    return { emoji: o.emoji, name: o.short || o.label };
  }

  function componentChipsHtml(currentIdx) {
    if (state.components.length < 2) return "";
    const chips = state.components
      .map((comp, i) => {
        const meta = workloadMeta(comp);
        const answers = state.perComponentAnswers[comp] || {};
        const done = PER_COMPONENT_ORDER.every((k) => !!answers[k]);
        const status = i === currentIdx ? "current" : done ? "done" : "pending";
        return (
          '<span class="component-chip component-chip--' + status + '">' +
          '<span class="component-chip__glyph">' + (status === "done" ? "✓" : meta.emoji) + "</span> " +
          escapeHtml(meta.name) +
          "</span>"
        );
      })
      .join("");
    return '<div class="component-chips">' + chips + "</div>";
  }

  function renderCompositeRound() {
    const comp = state.components[state.componentRoundIndex];
    const meta = workloadMeta(comp);
    if (!state.perComponentAnswers[comp]) state.perComponentAnswers[comp] = {};
    const compAnswers = state.perComponentAnswers[comp];
    const total = state.components.length;
    const allAnswered = () => PER_COMPONENT_ORDER.every((k) => !!compAnswers[k]);
    const scoreFn = () =>
      ScoringEngine.scoreWithBest(CONFIG, Object.assign({}, state.sharedAnswers, { Q1_workload_shape: comp }, compAnswers));

    const blocks = PER_COMPONENT_ORDER.map((qKey) => {
      const q = UIMeta.questionByKey(qKey);
      return (
        '<div class="composite-qblock">' +
        '<h3 class="composite-qblock__title">' + escapeHtml(q.title) + "</h3>" +
        '<div class="option-grid option-grid--mini">' +
        q.options.map((o) => optionTileHtml(o, compAnswers[qKey] === o.id, qKey)).join("") +
        "</div></div>"
      );
    }).join("");

    quizEl.innerHTML =
      '<div class="container"><div class="quiz-layout">' +
      '<div class="panel question-card">' +
      progressChrome(state.componentRoundIndex + 1, total, "🧩 Job " + (state.componentRoundIndex + 1)) +
      componentChipsHtml(state.componentRoundIndex) +
      leaderStripHtml() +
      "<h2>" + meta.emoji + " " + escapeHtml(meta.name) + "</h2>" +
      '<p class="question-card__subtitle">Three quick taps for this part of your app.</p>' +
      blocks +
      navRow(true, allAnswered(), "Next") +
      "</div>" +
      leaderboardHtml(scoreFn(), "Best for: " + meta.name) +
      "</div></div>";
    updateLiveRanking._last = null; // a new job starts a new race
    updateLiveRanking(scoreFn());

    const goNext = () => {
      if (state.componentRoundIndex < total - 1) {
        state.componentRoundIndex++;
        goTo("composite-round");
      } else {
        state.stepIndex = 0;
        goTo("composite-shared");
      }
    };

    root.querySelectorAll(".composite-qblock [data-opt]").forEach((el) =>
      el.addEventListener("click", () => {
        if (state.locked) return;
        const qKey = el.getAttribute("data-qkey");
        const wasComplete = allAnswered();
        compAnswers[qKey] = el.getAttribute("data-opt");
        el.parentNode.querySelectorAll(".option-card").forEach((c) => c.classList.toggle("is-selected", c === el));
        updateLiveRanking(scoreFn());
        const nextBtn = document.getElementById("nav-next");
        if (allAnswered()) {
          if (!wasComplete) {
            // the third answer just landed: move on without another click
            state.locked = true;
            setTimeout(() => {
              state.locked = false;
              goNext();
            }, ADVANCE_DELAY_MS);
          } else if (nextBtn && nextBtn.disabled) {
            render();
          }
        }
      })
    );
    wireNav(() => {
      if (state.componentRoundIndex > 0) {
        state.componentRoundIndex--;
        goTo("composite-round");
      } else {
        goTo("composite-select");
      }
    }, goNext);
  }

  // ---------------------------------------------------------------------
  // Whole-application mode: shared questions (and its bonus round)
  // ---------------------------------------------------------------------

  function renderCompositeShared() {
    const order = state.bonus ? BONUS_ORDER : SHARED_CORE_ORDER;
    const qKey = order[state.stepIndex];
    const q = UIMeta.questionByKey(qKey);
    const isLast = state.stepIndex === order.length - 1;

    renderQuestionScreen({
      q,
      bag: state.sharedAnswers,
      index: state.stepIndex,
      total: order.length,
      label: state.bonus ? "🎯 Bonus round" : "🏢 Whole app",
      isLast,
      lastLabel: state.bonus ? "Update my stack" : "See my stack",
      onBack: () => {
        if (state.stepIndex > 0) {
          state.stepIndex--;
          render();
        } else if (state.bonus) {
          state.bonus = false;
          goTo("results-composite");
        } else {
          state.componentRoundIndex = state.components.length - 1;
          goTo("composite-round");
        }
      },
      onNext: () => {
        if (!isLast) {
          state.stepIndex++;
          render();
          return;
        }
        if (state.bonus) {
          state.bonus = false;
          state.bonusDone = true;
        }
        state.celebrate = true;
        goTo("reveal");
      },
    });
  }

  // ---------------------------------------------------------------------
  // Reveal: a short drumroll before the result
  // ---------------------------------------------------------------------

  function renderReveal() {
    const families = ScoringEngine.getFamilies(CONFIG);
    quizEl.innerHTML =
      '<div class="container"><div class="panel reveal">' +
      '<p class="reveal__title">Matching your answers against ' + families.length + " databases…</p>" +
      '<div class="reveal__icons">' +
      families.map((f, i) => '<span class="reveal__icon" style="animation-delay:' + i * 70 + 'ms">' + dbIcon(f) + "</span>").join("") +
      "</div>" +
      '<div class="reveal__bar"><div class="reveal__fill"></div></div>' +
      "</div></div>";
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = state.mode === "composite" ? "results-composite" : "results-single";
    setTimeout(() => {
      if (state.screen === "reveal") goTo(target);
    }, reduce ? 200 : 1300);
  }

  // ---------------------------------------------------------------------
  // Results: single workload
  // ---------------------------------------------------------------------

  const MEDALS = ["🥇", "🥈", "🥉"];

  function renderResultsSingle() {
    const result = ScoringEngine.recommendSingle(CONFIG, state.answers);
    const top = result.top3[0];
    const focus = result.top3.find((c) => c.family === state.focusFamily) || top;
    const celebrate = state.celebrate;
    state.celebrate = false;
    if (celebrate) fireConfetti();

    let html = '<div class="container results-wrap' + (celebrate ? " results-wrap--animate" : "") + '">';
    html += badgeBanner(pickBadge(state.answers, top.family));
    if (result.mode === "batch_branch") {
      html += '<div class="conflict-box"><span class="conflict-box__icon">🏗️</span><div><b>A different kind of job.</b> ' + escapeHtml(result.note) + "</div></div>";
    }
    html += conflictsHtml(result.conflicts);
    html += '<h2 class="results-title">Your top 3 databases</h2>';
    html += '<p class="results-sub">Tap any of the three to see why it fits.</p>';
    html += podiumHtml(result.top3, focus.family);
    html += detailCardHtml(focus, result.top3.indexOf(focus));
    html += bonusCtaHtml();
    html += actionsHtml();
    html += ctaStripHtml();
    html += "</div>";
    quizEl.innerHTML = html;

    root.querySelectorAll("[data-podium]").forEach((el) =>
      el.addEventListener("click", () => {
        state.focusFamily = el.getAttribute("data-podium");
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
      })
    );
    wireBonus(() => goTo("quiz"));
    wireResultActions(() => buildShareTextSingle(result));
    if (celebrate) countUp();
  }

  function podiumHtml(cards, focusFamily) {
    return (
      '<div class="podium">' +
      cards
        .map((c, i) => {
          const meta = UIMeta.familyMeta(c.family);
          return (
            '<button type="button" class="podium__slot podium__slot--' + (i + 1) + (c.family === focusFamily ? " is-focus" : "") + '" data-podium="' + c.family + '">' +
            '<span class="podium__medal">' + (MEDALS[i] || "") + "</span>" +
            '<span class="podium__icon">' + dbIcon(c.family) + "</span>" +
            '<span class="podium__name">' + escapeHtml(c.catalog.display_name) + "</span>" +
            '<span class="podium__pct"><b data-count="' + c.pct + '">' + c.pct + "</b>% match</span>" +
            '<span class="fit-band fit-band--' + escapeHtml(c.band.id) + '">' + escapeHtml(c.band.label) + "</span>" +
            '<span class="podium__step"></span>' +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  // Animate the three match numbers from 0 up to their value.
  function countUp() {
    const els = root.querySelectorAll("[data-count]");
    const t0 = performance.now();
    const dur = 900;
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      els.forEach((el) => (el.textContent = String(Math.round(Number(el.getAttribute("data-count")) * eased))));
      if (k < 1) requestAnimationFrame(tick);
    }
    els.forEach((el) => (el.textContent = "0"));
    requestAnimationFrame(tick);
  }

  function optionLabel(qKey, optId) {
    const q = UIMeta.questionByKey(qKey);
    const o = q && q.options.find((x) => x.id === optId);
    return o ? o.emoji + " " + o.label : optId;
  }

  function reasonsHtml(card) {
    const pros = (card.reasons.pros || []).slice(0, 4);
    const cons = (card.reasons.cons || []).slice(0, 2);
    if (!pros.length && !cons.length) return "";
    return (
      '<div class="reasons">' +
      (pros.length
        ? '<div class="reasons__row"><span class="reasons__lead">Fits because you chose</span>' +
          pros.map((p) => '<span class="reason-chip reason-chip--pro">' + escapeHtml(optionLabel(p.question, p.option)) + "</span>").join("") +
          "</div>"
        : "") +
      (cons.length
        ? '<div class="reasons__row"><span class="reasons__lead">Less ideal for</span>' +
          cons.map((p) => '<span class="reason-chip reason-chip--con">' + escapeHtml(optionLabel(p.question, p.option)) + "</span>").join("") +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function editionLabel(catalog, editionKey) {
    if (!editionKey || !catalog.editions[editionKey]) return "";
    return catalog.editions[editionKey].label;
  }

  function primaryEditionLabel(card) {
    return editionLabel(card.catalog, card.edition.primary || (card.edition.both && card.edition.both[0]));
  }

  function detailCardHtml(card, rankIdx) {
    const meta = UIMeta.familyMeta(card.family);
    const name = card.catalog.display_name;
    const edition = card.edition;
    let editionLine = primaryEditionLabel(card);
    if (edition.mode === "required") editionLine += " (needed for your compliance answer)";
    if (edition.mode === "both") editionLine = "Open Source or Enterprise";

    const tradeoff = editionTradeoffHtml(card);
    let substituteHtml = "";
    if (card.substitute) {
      const sib = card.substitute.sibling;
      substituteHtml =
        '<div class="tradeoff-box"><b>💡 On a budget?</b> ' + escapeHtml(name) +
        " only comes as an Enterprise edition here. " + dbIcon(sib) + " <b>" +
        escapeHtml(CONFIG.catalog[sib].display_name) + "</b> does a similar job and has a free open-source edition.</div>";
    }

    return (
      '<div class="panel result-hero">' +
      '<div class="result-hero__top">' +
      '<div class="result-hero__icon">' + dbIcon(card.family) + "</div>" +
      "<div>" +
      '<span class="result-hero__tag">' + (MEDALS[rankIdx] || "") + " " + (rankIdx === 0 ? "Your best match" : "Option " + (rankIdx + 1)) + "</span>" +
      '<p class="result-hero__name">' + escapeHtml(name) + "</p>" +
      '<p class="result-hero__edition">' + escapeHtml(editionLine) + "</p>" +
      "</div>" +
      '<div class="result-hero__score"><b>' + card.pct + "%</b><span>" + escapeHtml(card.band.label) + "</span></div>" +
      "</div>" +
      '<p class="result-hero__pitch">' + escapeHtml(meta.pitch) + "</p>" +
      reasonsHtml(card) +
      (tradeoff ? '<details class="edition-details"><summary>Which edition, and what you get</summary>' + tradeoff + "</details>" : "") +
      substituteHtml +
      "</div>"
    );
  }

  function editionTradeoffHtml(card) {
    const editions = card.catalog.editions;
    const edition = card.edition;
    const list = (arr) => "<ul>" + arr.map((f) => "<li>" + escapeHtml(f) + "</li>").join("") + "</ul>";
    if (edition.mode === "single") {
      const only = editions[edition.primary];
      return '<div class="tradeoff-box"><b>' + escapeHtml(only.label) + "</b> is the edition offered on Yntraa Cloud. Includes:" + list(only.features) + "</div>";
    }
    if (edition.mode === "required") {
      return '<div class="tradeoff-box"><b>🛡️ Enterprise needed.</b> For a regulated industry, ' + escapeHtml(editions[edition.primary].label) + " is the safe choice. It includes:" + list(editions[edition.primary].features) + "</div>";
    }
    if (edition.mode === "both") {
      const a = editions[edition.both[0]];
      const b = editions[edition.both[1]];
      return '<div class="tradeoff-box"><b>⚖️ Two good options:</b><ul><li><b>' + escapeHtml(a.label) + "</b>: " + a.features.map(escapeHtml).join(", ") + "</li><li><b>" + escapeHtml(b.label) + "</b> adds: " + b.features.map(escapeHtml).join(", ") + "</li></ul></div>";
    }
    if (edition.mode === "premium_preferred" || edition.mode === "premium_default") {
      const premium = editions[edition.primary];
      return '<div class="tradeoff-box"><b>💎 ' + escapeHtml(premium.label) + "</b> matches your budget answer. Includes:" + list(premium.features) + "</div>";
    }
    // cost_tradeoff / cost_default: cheaper edition first, show what the upgrade adds
    const cheap = editions[edition.primary];
    const premium = editions[edition.alternative];
    return (
      '<div class="tradeoff-box"><b>🪙 Start with ' + escapeHtml(cheap.label) + ".</b> Includes:" + list(cheap.features) +
      (premium ? "Upgrading to <b>" + escapeHtml(premium.label) + "</b> later adds:" + list(premium.features) : "") +
      "</div>"
    );
  }

  function bonusCtaHtml() {
    if (state.bonusDone) {
      return '<div class="bonus-cta bonus-cta--done">🎯 Bonus round complete. This is your sharpest match.</div>';
    }
    return (
      '<div class="bonus-cta">' +
      "<div><b>🎯 Want a sharper match?</b><span>" + BONUS_ORDER.length + " more quick taps: regions, AI search, existing tools, compliance, team.</span></div>" +
      '<button class="btn btn-primary btn-sm" id="btn-bonus">Play bonus round</button>' +
      "</div>"
    );
  }

  function wireBonus(go) {
    const b = document.getElementById("btn-bonus");
    if (!b) return;
    b.addEventListener("click", () => {
      state.bonus = true;
      state.stepIndex = 0;
      go();
    });
  }

  function conflictsHtml(conflicts) {
    if (!conflicts || !conflicts.length) return "";
    return conflicts
      .map(
        (c) =>
          '<div class="conflict-box"><span class="conflict-box__icon">⚠️</span><div><b>Heads up' +
          (c.component ? " (" + escapeHtml(workloadMeta(c.component).name) + ")" : "") +
          ":</b> " + escapeHtml(c.message) + "</div></div>"
      )
      .join("");
  }

  function actionsHtml() {
    return (
      '<div class="results-actions">' +
      '<button class="btn btn-secondary btn-sm" id="btn-copy">📋 Copy result</button>' +
      '<button class="btn btn-ghost btn-sm" id="btn-restart">🔄 Play again</button>' +
      "</div>"
    );
  }

  function ctaStripHtml() {
    return (
      '<div class="panel cta-strip">' +
      "<p><b>Indicative recommendation.</b> Based only on the answers you selected; it is not a sizing or architecture proposal. For a validated recommendation, please consult a Yntraa solution architect.</p>" +
      '<a class="btn btn-primary" href="https://yntraacloud.ai/contact/" target="_blank" rel="noopener">Talk to a Solution Architect →</a>' +
      "</div>"
    );
  }

  function badgeBanner(badge) {
    return (
      '<div class="badge-banner"><span class="badge-banner__emoji">' + badge.emoji + "</span>" +
      "<div><h3>" + escapeHtml(badge.title) + "</h3><p>" + escapeHtml(badge.desc) + "</p></div></div>"
    );
  }

  function wireResultActions(buildShareText) {
    const copyBtn = document.getElementById("btn-copy");
    const restartBtn = document.getElementById("btn-restart");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyToClipboard(buildShareText());
        showToast("Copied! Paste it into an email or chat.");
      });
    }
    if (restartBtn) restartBtn.addEventListener("click", resetAll);
  }

  function buildShareTextSingle(result) {
    const lines = ["🎯 My Yntraa Cloud Database Finder result:"];
    result.top3.forEach((c, i) =>
      lines.push((MEDALS[i] || "-") + " " + c.catalog.display_name + " (" + primaryEditionLabel(c) + "): " + c.pct + "% match, " + c.band.label.toLowerCase())
    );
    lines.push("", "Indicative recommendation only. Please consult a Yntraa solution architect for a validated design.");
    lines.push("", "yntraacloud.ai/public-cloud/managed-database-as-a-service/");
    return lines.join("\n");
  }

  // ---------------------------------------------------------------------
  // Results: whole application
  // ---------------------------------------------------------------------

  function renderResultsComposite() {
    const result = ScoringEngine.recommendComposite(CONFIG, state.components, state.perComponentAnswers, state.sharedAnswers);
    const celebrate = state.celebrate;
    state.celebrate = false;
    if (celebrate) fireConfetti();

    let html = '<div class="container results-wrap' + (celebrate ? " results-wrap--animate" : "") + '">';
    html += badgeBanner({ emoji: "🧩", title: "Application Architect", desc: "One best-fit database per job, plus two alternatives each." });
    html += conflictsHtml(result.conflicts);
    html += '<h2 class="results-title">Your database stack</h2>';
    html += '<p class="results-sub">Each job gets its own top pick, scored separately.</p>';

    html += '<div class="stack-grid">';
    state.components.forEach((comp) => {
      const wl = workloadMeta(comp);
      const card = result.specialists[comp];
      const meta = UIMeta.familyMeta(card.family);
      html +=
        '<div class="panel stack-card">' +
        '<p class="stack-card__job">' + wl.emoji + " " + escapeHtml(wl.name) + "</p>" +
        '<p class="stack-card__pick">' + dbIcon(card.family) + " " + escapeHtml(card.catalog.display_name) + "</p>" +
        '<p class="stack-card__meta">' + escapeHtml(primaryEditionLabel(card)) + "</p>" +
        '<p class="stack-card__score"><b>' + card.pct + '%</b> match <span class="fit-band fit-band--' + escapeHtml(card.band.id) + '">' + escapeHtml(card.band.label) + "</span></p>" +
        '<p class="stack-card__alts">Also good: ' +
        (card.alternatives || [])
          .map((a) => dbIcon(a.family) + " " + escapeHtml(a.catalog.display_name) + " " + a.pct + "%")
          .join(" · ") +
        "</p>" +
        "</div>";
    });
    html += "</div>";

    if (result.consolidationCandidates.length) {
      const best = result.consolidationCandidates[0];
      html +=
        '<div class="consolidation-card"><p style="margin:0;"><b>💡 Prefer fewer databases?</b> ' + dbIcon(best.family) + " <b>" +
        escapeHtml(best.catalog.display_name) + "</b> is a reasonable fit for every job you picked, so one engine could replace the " +
        state.components.length + "-engine stack. You trade some specialist performance for simpler operations.</p></div>";
    } else if (state.components.length > 1) {
      html += '<div class="tradeoff-box" style="margin-top:18px;"><b>No single database covers all of these well.</b> The jobs are different enough that the stack above is the honest answer.</div>';
    }

    html += bonusCtaHtml();
    html += actionsHtml();
    html += ctaStripHtml();
    html += "</div>";
    quizEl.innerHTML = html;

    wireBonus(() => goTo("composite-shared"));
    wireResultActions(() => buildShareTextComposite(result));
  }

  function buildShareTextComposite(result) {
    const lines = ["🧩 My Yntraa Cloud Database Finder stack:", ""];
    state.components.forEach((comp) => {
      const card = result.specialists[comp];
      lines.push(workloadMeta(comp).name + " → " + card.catalog.display_name + " (" + card.pct + "% match)");
    });
    if (result.consolidationCandidates.length) {
      lines.push("", "One-engine option: " + result.consolidationCandidates[0].catalog.display_name);
    }
    lines.push("", "Indicative recommendation only. Please consult a Yntraa solution architect for a validated design.");
    lines.push("", "yntraacloud.ai/public-cloud/managed-database-as-a-service/");
    return lines.join("\n");
  }

  // ---------------------------------------------------------------------
  // Existing environment: edition lookup (deliberately no pricing maths;
  // Yntraa Cloud's own cost calculator covers the full cost)
  // ---------------------------------------------------------------------

  function renderExistingSizer() {
    const families = ScoringEngine.getFamilies(CONFIG);
    const familyOptions = families.map((f) => '<option value="' + f + '">' + escapeHtml(CONFIG.catalog[f].display_name) + "</option>").join("");

    quizEl.innerHTML =
      '<div class="container"><div class="quiz-layout quiz-layout--solo"><div class="panel question-card">' +
      "<h2>What are you running today?</h2>" +
      '<p class="question-card__subtitle">Pick your database to see its editions. For a full cost estimate, use the <a href="https://yntraacloud.ai/public-cloud/managed-database-as-a-service/#tabid5" target="_blank" rel="noopener">cost calculator</a>.</p>' +
      '<div><label class="field-label" for="sizer-family">Database</label><select class="field-select" id="sizer-family">' + familyOptions + "</select></div>" +
      '<div id="sizer-output" style="margin-top:18px;"></div>' +
      '<div class="quiz-nav" style="margin-top:20px;">' +
      '<button class="btn btn-ghost btn-sm" id="nav-back">← Back</button>' +
      '<a class="btn btn-secondary btn-sm" href="https://yntraacloud.ai/public-cloud/managed-database-as-a-service/#tabid5" target="_blank" rel="noopener">Open cost calculator ↗</a>' +
      "</div></div></div></div>";

    const familySel = document.getElementById("sizer-family");
    function updateOutput() {
      const editions = CONFIG.catalog[familySel.value].editions;
      const keys = Object.keys(editions);
      document.getElementById("sizer-output").innerHTML =
        '<div style="display:flex;gap:14px;flex-wrap:wrap;">' +
        keys
          .map((k) => {
            const ed = editions[k];
            return (
              '<div class="panel" style="padding:18px 20px;flex:1;min-width:220px;">' +
              '<p style="font-weight:700;font-size:0.98rem;margin:0 0 2px;">' + escapeHtml(ed.label) + "</p>" +
              '<p style="color:var(--ink-faint);font-size:0.78rem;margin:0 0 12px;">Billed ' + escapeHtml(ed.unit) + (keys.length === 1 ? " · only edition offered" : "") + "</p>" +
              '<ul style="margin:0;padding-left:20px;font-size:0.86rem;color:var(--ink-secondary);">' +
              ed.features.map((feat) => "<li>" + escapeHtml(feat) + "</li>").join("") +
              "</ul></div>"
            );
          })
          .join("") +
        "</div>";
    }
    familySel.addEventListener("change", updateOutput);
    updateOutput();
    document.getElementById("nav-back").addEventListener("click", resetAll);
  }

  // ---------------------------------------------------------------------
  // Fun layer: badges, confetti, share, toast
  // ---------------------------------------------------------------------

  function pickBadge(answers, topFamily) {
    const cat = CONFIG.catalog[topFamily] && CONFIG.catalog[topFamily].category;
    if (answers.Q5_latency === "sub_millisecond") return { emoji: "🏎️", title: "Speed Demon", desc: "Speed came first, and it shows in the pick." };
    if (answers.Q8_vector_search === "yes_core" || answers.Q1_workload_shape === "ai_rag_vector_core") return { emoji: "🧠", title: "AI Pioneer", desc: "You're building for the AI era." };
    if (answers.Q7_geo_availability === "multi_region_active_active") return { emoji: "🌍", title: "Globe Trotter", desc: "Live in many regions is a serious bar to clear." };
    if (answers.Q6_scale === "massive_pb_scale") return { emoji: "🏔️", title: "Data Mountaineer", desc: "Massive data needs engines built to scale out." };
    if (answers.Q13_budget_modifier === "cost_sensitive") return { emoji: "🪙", title: "Budget Master", desc: "A strong fit without paying for extras you don't need." };
    if (cat === "relational") return { emoji: "🏛️", title: "Steady & Reliable", desc: "You value proven, exact, dependable foundations." };
    return { emoji: "🎯", title: "Match Found", desc: "Here's what fits your answers best." };
  }

  function fireConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ff8b0d", "#f29f43", "#3987e5", "#199e70", "#d55181", "#9085e9"];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement("div");
      el.className = "confetti-piece";
      el.style.left = Math.random() * 100 + "vw";
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
      el.style.animationDelay = Math.random() * 0.4 + "s";
      el.style.opacity = String(0.7 + Math.random() * 0.3);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function showToast(msg) {
    let t = document.getElementById("app-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "app-toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove("is-visible"), 2600);
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------
  // Entry points wired from index.html's hero buttons
  // ---------------------------------------------------------------------

  window.DBFinderApp = {
    start: start, // start("single" | "composite" | "existing")
  };
})();
