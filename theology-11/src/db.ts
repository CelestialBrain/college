import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { ContentType, Entry, GlossaryEntry, SetWithTopics, Topic } from './types';

const DB_PATH = path.resolve(__dirname, '..', 'theology.db');
const SCHEMA_PATH = path.resolve(__dirname, '..', 'schema.sql');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema initialisation ──────────────────────────────────────────────────

function initSchema(): void {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const SETS: Array<{ code: string; title: string; topics: Array<{ slug: string; title: string }> }> = [
  {
    code: 'SET1',
    title: 'The Human Starting Point',
    topics: [
      { slug: 'desire', title: 'Desire' },
      { slug: 'problem-vs-mystery', title: 'Problem vs. Mystery' },
      { slug: 'absolute-certainty', title: 'Absolute Certainty' },
      { slug: 'complementarities-and-paradoxes', title: 'Complementarities and Paradoxes' },
      { slug: 'wonder', title: 'Wonder' },
    ],
  },
  {
    code: 'SET2',
    title: 'Approaches to the Divine',
    topics: [
      { slug: 'the-six-paths', title: 'The Six Paths' },
      { slug: 'sacred', title: 'Sacred' },
      { slug: 'faith', title: 'Faith' },
      { slug: 'spirituality', title: 'Spirituality' },
      { slug: 'religion', title: 'Religion' },
    ],
  },
  {
    code: 'SET3',
    title: 'Images and Revelation',
    topics: [
      { slug: 'perfectionism', title: 'Perfectionism' },
      { slug: 'distorted-images-of-god', title: 'Distorted Images of God' },
      { slug: 'christian-atheism', title: 'Christian "Atheism"' },
      { slug: 'god-is-not-a-being', title: 'God Is Not a Being' },
      { slug: 'revelation', title: 'Revelation' },
    ],
  },
];

function seedData(): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM sets').get() as { cnt: number }).cnt;
  if (count > 0) return;

  const insertSet = db.prepare('INSERT OR IGNORE INTO sets (code, title) VALUES (?, ?)');
  const insertTopic = db.prepare('INSERT OR IGNORE INTO topics (set_id, slug, title) VALUES (?, ?, ?)');

  const seedAll = db.transaction(() => {
    for (const set of SETS) {
      insertSet.run(set.code, set.title);
      const row = db.prepare('SELECT id FROM sets WHERE code = ?').get(set.code) as { id: number };
      for (const topic of set.topics) {
        insertTopic.run(row.id, topic.slug, topic.title);
      }
    }
  });

  seedAll();
  console.log('[db] Seeded sets and topics.');
}

// Run on import
initSchema();
seedData();

// ─── Helper functions ────────────────────────────────────────────────────────

export function getTopicBySlug(slug: string): Topic | undefined {
  return db.prepare('SELECT * FROM topics WHERE slug = ?').get(slug) as Topic | undefined;
}

export function insertEntry(entry: {
  topic_id: number;
  content_type: ContentType;
  content: string;
  source_file: string;
  source_type: string;
  page_ref?: string | null;
  related_topics?: string | null;
  flags?: string | null;
  content_hash: string;
}): { inserted: boolean; id: number } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO entries
      (topic_id, content_type, content, source_file, source_type, page_ref, related_topics, flags, content_hash)
    VALUES
      (@topic_id, @content_type, @content, @source_file, @source_type, @page_ref, @related_topics, @flags, @content_hash)
  `);
  const result = stmt.run(entry);
  const inserted = result.changes > 0;
  let id: number;
  if (inserted) {
    id = Number(result.lastInsertRowid);
  } else {
    const existing = db.prepare('SELECT id FROM entries WHERE content_hash = ?').get(entry.content_hash) as { id: number };
    id = existing.id;
  }
  return { inserted, id };
}

export function insertGlossaryTerm(
  term: string,
  definition: string,
  topicId: number,
  entryId: number,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO glossary (term, definition, topic_id, source_entry_id)
    VALUES (?, ?, ?, ?)
  `).run(term, definition, topicId, entryId);
}

export function getAllEntries(filters?: {
  topicSlug?: string;
  contentType?: ContentType;
  sourceType?: string;
}): Entry[] {
  let sql = `
    SELECT e.*
    FROM entries e
    JOIN topics t ON e.topic_id = t.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters?.topicSlug) {
    sql += ' AND t.slug = ?';
    params.push(filters.topicSlug);
  }
  if (filters?.contentType) {
    sql += ' AND e.content_type = ?';
    params.push(filters.contentType);
  }
  if (filters?.sourceType) {
    sql += ' AND e.source_type = ?';
    params.push(filters.sourceType);
  }

  return db.prepare(sql).all(...params) as Entry[];
}

export function getAllGlossaryTerms(): GlossaryEntry[] {
  return db.prepare('SELECT * FROM glossary ORDER BY term ASC').all() as GlossaryEntry[];
}

export function getAllSetsWithTopics(): SetWithTopics[] {
  const sets = db.prepare('SELECT * FROM sets ORDER BY id ASC').all() as Array<{ id: number; code: string; title: string }>;
  return sets.map((s) => {
    const topics = db.prepare('SELECT * FROM topics WHERE set_id = ? ORDER BY id ASC').all(s.id) as Topic[];
    return { ...s, topics };
  });
}

export function isFileProcessed(sourceFile: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM entries WHERE source_file = ? LIMIT 1')
    .get(sourceFile) as { 1: number } | undefined;
  return row !== undefined;
}

export function getDb(): Database.Database {
  return db;
}
