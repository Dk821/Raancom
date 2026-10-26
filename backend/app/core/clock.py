"""Single source of 'now'. Tests monkeypatch `now_utc`; always call `clock.now_utc()`."""
from datetime import datetime, timezone


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
