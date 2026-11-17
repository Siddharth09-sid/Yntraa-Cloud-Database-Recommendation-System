/**
 * Yntraa Cloud — MDBaaS Database Recommendation Engine
 * ui-meta.js
 *
 * Presentation-only metadata: question copy, option labels/emoji, and
 * per-family display info (icon, category color, one-line pitch).
 *
 * This is intentionally kept SEPARATE from dbaas-scoring-config.json.
 * That file is the algorithm's data — edited by whoever owns the scoring
 * logic. This file is cosmetic — edited by whoever owns UI copy. If a
 * new database is added to the catalog without an entry here yet, the
 * UI falls back to a prettified version of its key and a generic icon,
 * so the site never breaks waiting on copy — it just looks a little
 * plainer until someone fills this in.
 *
 * Exposed as window.UIMeta.
 */
(function (global) {
  "use strict";

  // Category -> validated categorical color (dark-navy-surface safe,
  // see /docs — worst-case CVD ΔE 8.4, normal-vision floor 19.3, all
  // >=3:1 contrast on surface #101936). Orange is deliberately withheld
  // from this set: it's the brand accent, reserved exclusively for
  // "this is the recommended pick" so it never doubles as a category
  // color and creates ambiguity.
  const CATEGORY_COLORS = {
    relational: "#3987e5", // blue
    document: "#199e70", // aqua
    in_memory_kv: "#c98500", // yellow
    wide_column: "#d55181", // magenta
    search_analytics: "#008300", // green
    batch_data_lake: "#9085e9", // violet
    multi_model: "#e66767", // red
  };

  const FAMILY_META = {
    mysql: { icon: "🐬", pitch: "The world's most popular open-source relational database — simple, fast, huge community." },
    postgresql: { icon: "🐘", pitch: "The extensible do-everything relational engine — JSON, geospatial, and the AI/RAG default via pgvector." },
    mssql: { icon: "🪟", pitch: "Microsoft's enterprise RDBMS — deep .NET/BI integration, mission-critical workloads." },
    mariadb: { icon: "🦭", pitch: "MySQL-compatible fork with its own engines — vendor-independent governance, built-in analytics." },
    mongodb: { icon: "🍃", pitch: "Document store for flexible, evolving schemas — agile development, catalogs, mobile backends." },
    redis: { icon: "⚡", pitch: "In-memory key-value store — sub-millisecond latency for caching, sessions, real-time features." },
    cassandra: { icon: "💍", pitch: "Masterless wide-column store — built for huge write volume across many regions." },
    scylladb: { icon: "🚀", pitch: "Cassandra's architecture rewritten in C++ for far lower latency at the same throughput." },
    opensearch: { icon: "🔍", pitch: "Open-source search & analytics — full-text search, log analytics, observability." },
    elasticsearch: { icon: "🔦", pitch: "The original search & analytics engine — commercial ML features and official support." },
    hadoop: { icon: "🐘", pitch: "Distributed storage & batch processing — petabyte-scale ETL and data lakes." },
    couchbase: { icon: "🛋️", pitch: "Multi-model key-value + document + SQL-like queries, with built-in offline mobile sync." },
  };

  function familyMeta(family) {
    return (
      FAMILY_META[family] || {
        icon: "🗄️",
        pitch: "A managed database engine on Yntraa Cloud.",
      }
    );
  }

  function familyColor(family, catalog) {
    const cat = catalog && catalog[family] ? catalog[family].category : null;
    return CATEGORY_COLORS[cat] || "#8594af";
  }

  // Question copy. Keys must match dbaas-scoring-config.json's
  // `questionnaire` keys exactly for the scored ones (Q1, Q2, Q4, Q5,
  // Q6, Q7, Q8, Q9, Q10, Q14) so the scoring engine can read the same
  // option ids straight out of the DOM. Q13 is not a "scored" question
  // in the config (it only drives the budget modifier) — its option ids
  // are defined here directly and decideEdition() in scoring-engine.js
  // expects exactly these values: Q13 in {cost_sensitive, balanced, premium}.
  // Q10 in {standard, advanced_auditing, regulated_industry} is now BOTH
  // scored (see its `weights` in the config) AND still drives
  // decideEdition()'s forces_enterprise_if flag — same option ids serve
  // both roles.
  // Question copy. TEXT (titles, helper lines, option labels and hints) comes from
  // data/question-copy.json, written in plain language for non-specialists.
  // If you reword something, edit that file and mirror the change here (the
  // test suite fails if the two drift apart). Option ids must match the
  // scoring config exactly. Q13 is not scored in the config, so its ids are
  // defined only here: cost_sensitive | balanced | premium.
  // Question copy. TEXT (titles, helper lines, option labels and hints) comes from
  // data/question-copy.json, written in plain language for non-specialists.
  // If you reword something, edit that file and mirror the change here (the
  // test suite fails if the two drift apart). Option ids must match the
  // scoring config exactly. Q13 is not scored in the config, so its ids are
  // defined only here: cost_sensitive | balanced | premium.
  // Question copy. TEXT (titles, helper lines, option labels and hints) comes from
  // data/question-copy.json, written in plain language for non-specialists.
  // If you reword something, edit that file and mirror the change here (the
  // test suite fails if the two drift apart). Option ids must match the
  // scoring config exactly. Q13 is not scored in the config, so its ids are
  // defined only here: cost_sensitive | balanced | premium.
  // Question copy. TEXT (titles, helper lines, option labels and hints) comes from
  // data/question-copy.json, written in plain language for non-specialists.
  // If you reword something, edit that file and mirror the change here (the
  // test suite fails if the two drift apart). Option ids must match the
  // scoring config exactly. Q13 is not scored in the config, so its ids are
  // defined only here: cost_sensitive | balanced | premium.
  // Question copy. TEXT (titles, helper lines, option labels and hints) comes from
  // data/question-copy.json, written in plain language for non-specialists.
  // If you reword something, edit that file and mirror the change here (the
  // test suite fails if the two drift apart). Option ids must match the
  // scoring config exactly. Q13 is not scored in the config, so its ids are
  // defined only here: cost_sensitive | balanced | premium.
  const QUESTIONS = [
    {
      "key": "Q1_workload_shape",
      "section": "Workload",
      "icon": "🎯",
      "title": "What is the primary workload?",
      "subtitle": "Choose the closest match.",
      "composite_title": "Which workloads does your application have?",
      "composite_subtitle": "Select all that apply. Each one is matched to its own database.",
      "type": "single_select",
      "composite_type": "multi_select",
      "options": [
        {
          "id": "oltp_transactional",
          "label": "Transactional (OLTP)",
          "emoji": "🛒",
          "hint": "Orders, payments, bookings, ERP"
        },
        {
          "id": "content_catalog_flexible",
          "label": "Content & catalogue",
          "emoji": "🗂️",
          "hint": "Products, profiles, CMS pages"
        },
        {
          "id": "cache_session_realtime",
          "label": "Caching & sessions",
          "emoji": "⚡",
          "hint": "Logins, carts, leaderboards"
        },
        {
          "id": "search_logging_observability",
          "label": "Search & log analytics",
          "emoji": "🔎",
          "hint": "Search box, logs, monitoring"
        },
        {
          "id": "time_series_iot_high_write",
          "label": "Time-series & IoT",
          "emoji": "📡",
          "hint": "Sensor, telemetry, event streams"
        },
        {
          "id": "analytics_bi_dw",
          "label": "Analytics & BI",
          "emoji": "📊",
          "hint": "Reports and dashboards"
        },
        {
          "id": "batch_etl_data_lake",
          "label": "Batch / data lake",
          "emoji": "🏞️",
          "hint": "Nightly ETL jobs, raw data"
        },
        {
          "id": "mobile_edge_offline_sync",
          "label": "Mobile & offline sync",
          "emoji": "📱",
          "hint": "Works offline, syncs later"
        },
        {
          "id": "ai_rag_vector_core",
          "label": "AI & vector search",
          "emoji": "🤖",
          "hint": "Chatbots (RAG), 'find similar'"
        },
        {
          "id": "htap_hybrid_oltp_olap",
          "label": "Hybrid (HTAP)",
          "emoji": "⚖️",
          "hint": "Transactions and reports together"
        }
      ]
    },
    {
      "key": "Q2_data_structure",
      "section": "Data Shape",
      "icon": "🧩",
      "title": "What does your data look like?",
      "subtitle": "Storing PDFs, images or other files? Choose Files & media.",
      "type": "single_select",
      "perComponent": true,
      "options": [
        {
          "id": "structured_relational_joins",
          "label": "Relational tables",
          "emoji": "🧮",
          "hint": "Rows and columns that link together"
        },
        {
          "id": "semi_structured_json",
          "label": "JSON documents",
          "emoji": "🧾",
          "hint": "Flexible records, fields can vary"
        },
        {
          "id": "key_value",
          "label": "Key-value",
          "emoji": "🔑",
          "hint": "Simple lookups by ID"
        },
        {
          "id": "wide_column_sparse",
          "label": "Wide-column",
          "emoji": "📚",
          "hint": "Huge tables: sensor rows, event history"
        },
        {
          "id": "unstructured_text_logs",
          "label": "Text & logs",
          "emoji": "📝",
          "hint": "Anything you search by words"
        },
        {
          "id": "documents_files_media",
          "label": "Files & media",
          "emoji": "📎",
          "hint": "PDFs, images, video (details and links)"
        }
      ]
    },
    {
      "key": "Q4_consistency",
      "section": "Consistency",
      "icon": "⚖️",
      "title": "How consistent must the data be?",
      "subtitle": null,
      "type": "single_select",
      "perComponent": true,
      "options": [
        {
          "id": "strict_acid",
          "label": "Strict consistency (ACID)",
          "emoji": "🎯",
          "hint": "Always exact: money, stock, bookings"
        },
        {
          "id": "eventual_ok",
          "label": "Eventual consistency",
          "emoji": "🌊",
          "hint": "Slightly behind is fine: likes, feeds, sensors"
        },
        {
          "id": "mixed",
          "label": "Mixed",
          "emoji": "🎚️",
          "hint": "Strict for some data, relaxed for the rest"
        }
      ]
    },
    {
      "key": "Q5_latency",
      "section": "Latency",
      "icon": "⏱️",
      "title": "What response time do you need?",
      "subtitle": null,
      "type": "single_select",
      "perComponent": true,
      "options": [
        {
          "id": "sub_millisecond",
          "label": "Sub-millisecond",
          "emoji": "🚀",
          "hint": "Instant: caches, real-time bidding"
        },
        {
          "id": "low_ms",
          "label": "Milliseconds",
          "emoji": "🏃",
          "hint": "Normal speed for apps and websites"
        },
        {
          "id": "seconds_batch_ok",
          "label": "Seconds or more",
          "emoji": "🐢",
          "hint": "Fine for reports and batch jobs"
        }
      ]
    },
    {
      "key": "Q6_scale",
      "section": "Scale",
      "icon": "📈",
      "title": "How much data do you expect?",
      "subtitle": "A rough estimate for the next two years.",
      "type": "single_select",
      "options": [
        {
          "id": "small_under_100gb",
          "label": "Small",
          "emoji": "🌱",
          "hint": "Up to 100 GB"
        },
        {
          "id": "medium_few_tb",
          "label": "Medium",
          "emoji": "🌿",
          "hint": "100 GB to a few TB"
        },
        {
          "id": "large_multi_tb",
          "label": "Large",
          "emoji": "🌳",
          "hint": "Tens of TB"
        },
        {
          "id": "massive_pb_scale",
          "label": "Massive",
          "emoji": "🏔️",
          "hint": "Hundreds of TB to petabytes"
        }
      ]
    },
    {
      "key": "Q7_geo_availability",
      "section": "Availability",
      "icon": "🌍",
      "title": "What availability do you need?",
      "subtitle": null,
      "type": "single_select",
      "options": [
        {
          "id": "single_region_ha",
          "label": "Single region (HA)",
          "emoji": "📍",
          "hint": "One site with automatic failover"
        },
        {
          "id": "multi_region_failover",
          "label": "Multi-region failover (DR)",
          "emoji": "🛟",
          "hint": "A standby site takes over"
        },
        {
          "id": "multi_region_active_active",
          "label": "Multi-region active-active",
          "emoji": "🌍",
          "hint": "Every region accepts writes"
        }
      ]
    },
    {
      "key": "Q8_vector_search",
      "section": "AI / Vector",
      "icon": "🧠",
      "title": "Do you need vector search?",
      "subtitle": "AI similarity search, used for chatbots (RAG) and recommendations.",
      "type": "single_select",
      "options": [
        {
          "id": "yes_core",
          "label": "Core requirement",
          "emoji": "🧠",
          "hint": "The app is built around it"
        },
        {
          "id": "yes_secondary",
          "label": "Nice to have",
          "emoji": "✨",
          "hint": "A secondary feature"
        },
        {
          "id": "no",
          "label": "Not needed",
          "emoji": "🙅",
          "hint": "Or not sure yet"
        }
      ]
    },
    {
      "key": "Q9_ecosystem_compatibility",
      "section": "Ecosystem",
      "icon": "🔌",
      "title": "Any existing technology to stay compatible with?",
      "subtitle": "Select all that apply.",
      "type": "multi_select",
      "options": [
        {
          "id": "oracle_pl_sql_compatibility_needed",
          "label": "Oracle (PL/SQL)",
          "emoji": "🏛️",
          "hint": "Existing Oracle code to migrate"
        },
        {
          "id": "mysql_wire_protocol_compatibility",
          "label": "MySQL",
          "emoji": "🐬",
          "hint": "WordPress, PHP, MySQL apps"
        },
        {
          "id": "microsoft_dotnet_ecosystem",
          "label": "Microsoft / .NET",
          "emoji": "🪟",
          "hint": "SQL Server tools and skills"
        },
        {
          "id": "cassandra_cql_compatibility",
          "label": "Apache Cassandra (CQL)",
          "emoji": "👁️",
          "hint": "Existing Cassandra apps"
        },
        {
          "id": "dynamodb_api_compatibility",
          "label": "Amazon DynamoDB",
          "emoji": "☁️",
          "hint": "Existing DynamoDB apps"
        },
        {
          "id": "prefer_vendor_independent_governance",
          "label": "Community-governed open source",
          "emoji": "🤝",
          "hint": "No single-vendor control"
        },
        {
          "id": "no_ecosystem_constraint",
          "label": "No constraint",
          "emoji": "🆕",
          "hint": "Starting fresh"
        }
      ]
    },
    {
      "key": "Q10_compliance_edition_modifier",
      "section": "Compliance",
      "icon": "🛡️",
      "title": "What are your security and compliance needs?",
      "subtitle": null,
      "type": "single_select",
      "options": [
        {
          "id": "standard",
          "label": "Standard security",
          "emoji": "🔒",
          "hint": "Encryption and access control"
        },
        {
          "id": "advanced_auditing",
          "label": "Advanced auditing",
          "emoji": "🧾",
          "hint": "Audit trails, finer access control"
        },
        {
          "id": "regulated_industry",
          "label": "Regulated industry",
          "emoji": "🏦",
          "hint": "Banking, healthcare, government"
        }
      ]
    },
    {
      "key": "Q13_budget_modifier",
      "section": "Budget",
      "icon": "💰",
      "title": "What is your budget approach?",
      "subtitle": null,
      "type": "single_select",
      "notScored": true,
      "options": [
        {
          "id": "cost_sensitive",
          "label": "Cost-sensitive",
          "emoji": "💰",
          "hint": "Prefer free open-source editions"
        },
        {
          "id": "balanced",
          "label": "Balanced",
          "emoji": "⚖️",
          "hint": "Pay only for features that matter"
        },
        {
          "id": "premium",
          "label": "Premium",
          "emoji": "💎",
          "hint": "Enterprise features and support"
        }
      ]
    },
    {
      "key": "Q14_operational_comfort",
      "section": "Team",
      "icon": "🛠️",
      "title": "What is your team's skill set?",
      "subtitle": null,
      "type": "single_select",
      "options": [
        {
          "id": "sql_only_minimal_new_tooling",
          "label": "SQL-focused",
          "emoji": "🧑‍💻",
          "hint": "Prefer familiar SQL tools"
        },
        {
          "id": "comfortable_nosql_new_query_model",
          "label": "Open to NoSQL",
          "emoji": "🧗",
          "hint": "Happy to learn new query models"
        },
        {
          "id": "want_max_managed_hand_holding",
          "label": "Fully managed preferred",
          "emoji": "🤲",
          "hint": "Minimal hands-on administration"
        }
      ]
    }
  ];

  function questionByKey(key) {
    return QUESTIONS.find((q) => q.key === key) || null;
  }

  global.UIMeta = {
    CATEGORY_COLORS,
    familyMeta,
    familyColor,
    QUESTIONS,
    questionByKey,
  };
})(window);
