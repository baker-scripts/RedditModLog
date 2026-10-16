"""Render the parity fixture with the legacy Python publisher.

Usage: python python_render.py <fixture.json> <repo root>

Runs the fixture through the same path the Python daemon uses each cycle
(store_processed_action -> get_recent_actions_from_db -> build_wiki_content)
against a throwaway SQLite file, with the module clock frozen at the fixture
base time, and writes the wiki markdown to stdout. golden.md is this output.
"""

import importlib
import json
import os
import sys
import tempfile
from datetime import datetime
from types import SimpleNamespace


def main() -> None:
    fixture_path, repo_root = sys.argv[1], sys.argv[2]
    with open(fixture_path, encoding="utf-8") as fh:
        fixture = json.load(fh)
    base = fixture["base"]
    subreddit = fixture["subreddit"]

    tmp = tempfile.mkdtemp(prefix="modlog-parity-")
    os.environ["DATABASE_PATH"] = os.path.join(tmp, "modlog.db")
    sys.path.insert(0, repo_root)
    mwp = importlib.import_module("modlog_wiki_publisher")

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromtimestamp(base, tz)

    setattr(mwp, "datetime", FrozenDatetime)
    mwp.setup_database()

    for entry in fixture["entries"]:
        target = entry.get("target") or {}
        action = SimpleNamespace(
            id=entry["id"],
            action=entry["type"],
            mod=entry["moderatorName"],
            created_utc=base - entry["ageSec"],
            description=entry.get("description"),
            details=entry.get("details"),
            mod_note=None,
            target_author=target.get("author"),
            target_permalink=target.get("permalink"),
            target_title=None,
            target_fullname=target.get("id"),
        )
        if not mwp.is_duplicate_action(action.id):
            mwp.store_processed_action(action, subreddit)

    config = {
        "source_subreddit": subreddit,
        "anonymize_moderators": True,
        "retention_days": 90,
        "max_wiki_entries_per_page": 1000,
        "wiki_actions": list(mwp.DEFAULT_WIKI_ACTIONS),
    }
    rows = mwp.get_recent_actions_from_db(config, force_all_actions=False, show_only_removals=True)
    sys.stdout.write(mwp.build_wiki_content(rows, config))


if __name__ == "__main__":
    main()
