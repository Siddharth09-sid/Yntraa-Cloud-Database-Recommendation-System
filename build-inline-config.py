#!/usr/bin/env python3
"""
Regenerates the inline <script id="scoring-config"> fallback in index.html
from data/dbaas-scoring-config.json.

Why this exists: app.js prefers fetch()-ing the external JSON file (so
hosted deployments can add database #13 by editing one file and refreshing),
but fetch() of a local file is blocked by the browser when index.html is
opened directly (file://) instead of served over http(s) — which is exactly
what happens on a locked-down machine with no way to run a local server.
The inline copy is the fallback for that case.

Run this after editing data/dbaas-scoring-config.json by hand, so the
double-click-to-open copy doesn't drift out of sync with the real one:

    python3 build-inline-config.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "data" / "dbaas-scoring-config.json"
INDEX_PATH = ROOT / "index.html"

MARKER_START = '<script type="application/json" id="scoring-config">'
MARKER_END = "</script>"


def main():
    config_text = CONFIG_PATH.read_text(encoding="utf-8")
    # Validate it's real JSON before embedding a broken copy.
    json.loads(config_text)

    # Guard against a literal "</script" inside any string value, which
    # would truncate the inline block early (HTML's raw-text parsing
    # rule for <script> ignores the type="..." attribute). \/ is a
    # legal JSON escape for a plain /, so this keeps the embedded text
    # valid JSON while making it byte-for-byte impossible to close the
    # tag early.
    safe_text = config_text.replace("</script", '<\\/script')

    html = INDEX_PATH.read_text(encoding="utf-8")

    block = MARKER_START + "\n" + safe_text + "\n" + MARKER_END

    if MARKER_START in html:
        pattern = re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END)
        new_html = re.sub(pattern, lambda _: block, html, count=1, flags=re.S)
    else:
        # First run: insert right after the scoring-engine.js script tag.
        anchor = '<script src="js/scoring-engine.js"></script>'
        if anchor not in html:
            print("Could not find an anchor point in index.html to insert the inline config.", file=sys.stderr)
            sys.exit(1)
        new_html = html.replace(anchor, anchor + "\n" + block, 1)

    INDEX_PATH.write_text(new_html, encoding="utf-8")
    print("index.html inline config refreshed from data/dbaas-scoring-config.json.")


if __name__ == "__main__":
    main()
