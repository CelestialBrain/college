CREATE TABLE IF NOT EXISTS sets (
  id    INTEGER PRIMARY KEY,
  code  TEXT UNIQUE,
  title TEXT
);

CREATE TABLE IF NOT EXISTS topics (
  id     INTEGER PRIMARY KEY,
  set_id INTEGER REFERENCES sets(id),
  slug   TEXT UNIQUE,
  title  TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  id             INTEGER PRIMARY KEY,
  topic_id       INTEGER REFERENCES topics(id),
  content_type   TEXT,
  content        TEXT,
  source_file    TEXT,
  source_type    TEXT,
  page_ref       TEXT,
  related_topics TEXT,
  flags          TEXT,
  content_hash   TEXT UNIQUE,
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS glossary (
  id              INTEGER PRIMARY KEY,
  term            TEXT UNIQUE,
  definition      TEXT,
  topic_id        INTEGER REFERENCES topics(id),
  source_entry_id INTEGER REFERENCES entries(id)
);
