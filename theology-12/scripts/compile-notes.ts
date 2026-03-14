import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { callGemini } from '../src/vertex';
import {
  getTopicBySlug,
  insertEntry,
  insertGlossaryTerm,
  isFileProcessed,
} from '../src/db';
import type { ExtractionItem, SourceType } from '../src/types';

const NOTES_DIR = path.resolve(__dirname, '..', 'notes');
const FORCE = process.argv.includes('--force');

const GRANOLA_NOTICE = `NOTE: This content was transcribed by Granola.ai from a live lecture. It may contain transcription artefacts, incomplete sentences, or informal speech patterns. Apply extra care when classifying content types and infer the intended meaning where the transcription is unclear. Add "[inferred]" to the flags field for any item where you had to interpret ambiguous text.`;

function buildCompilePrompt(sourceType: SourceType): string {
  const granolaSection =
    sourceType === 'granola'
      ? `\n${GRANOLA_NOTICE}\n`
      : '';

  return `You are a theology note-taking assistant. Your task is to analyse the following class notes and extract every distinct piece of knowledge into a structured JSON array.
${granolaSection}
Each item in the array must be a JSON object with these exact keys:
  - "topic_slug"        (string) — one of the known course topics (see list below)
  - "content_type"      (string) — one of: term-definition, core-lesson, distinction, example-illustration, external-quote, author-line, insight-implication, raw-text, chapter-heading
  - "content"           (string) — the exact or lightly cleaned text of this item
  - "is_glossary_term"  (boolean) — true only if this item defines a key term
  - "glossary_term_name" (string|null) — the term being defined, or null
  - "page_ref"          (string|null) — page number if determinable, else null
  - "related_topics"    (string|null) — comma-separated slugs of other relevant topics, or null
  - "flags"             (string|null) — e.g. "[inferred]", "[unclear?]", or null

Known topic slugs:
  desire, problem-vs-mystery, absolute-certainty, complementarities-and-paradoxes, wonder,
  the-six-paths, sacred, faith, spirituality, religion,
  perfectionism, distorted-images-of-god, christian-atheism, god-is-not-a-being, revelation

Rules:
  - Every sentence of substance must appear in at least one item — do not skip anything
  - Definitions of terms must use content_type "term-definition" and is_glossary_term true
  - Direct quotes from other authors use content_type "external-quote"
  - Headings and subheadings use content_type "chapter-heading"
  - If you cannot confidently assign a topic slug, use the closest match and add "[inferred]" to flags
  - Output ONLY a valid JSON array — no commentary, no markdown fences, no preamble

NOTES TEXT:
`;
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processFile(
  filePath: string,
  sourceType: SourceType,
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const filename = path.basename(filePath);
  console.log(`\n[compile] Processing: ${filename} (source_type: ${sourceType})`);

  // ── Phase 1: Compile ──────────────────────────────────────────────────────
  console.log(`  [1/2] Sending to Gemini for compilation…`);
  const notesText = fs.readFileSync(filePath, 'utf8');
  const prompt = buildCompilePrompt(sourceType) + notesText;
  const response = await callGemini(prompt);

  await delay(2000);

  // ── Phase 2: Parse and store ──────────────────────────────────────────────
  console.log(`  [2/2] Parsing and storing…`);

  let raw = response.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  let items: ExtractionItem[];
  try {
    items = JSON.parse(raw) as ExtractionItem[];
  } catch (err) {
    console.error(`  [error] Failed to parse JSON from Gemini response: ${String(err)}`);
    console.error(`  Raw response snippet: ${raw.slice(0, 300)}`);
    return { inserted: 0, skipped: 0, errors: 1 };
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const topic = getTopicBySlug(item.topic_slug);
      if (!topic) {
        console.warn(`  [warn] Unknown topic slug "${item.topic_slug}" — skipping item.`);
        errors++;
        continue;
      }

      const contentHash = crypto.createHash('sha256').update(item.content).digest('hex');

      const result = insertEntry({
        topic_id: topic.id,
        content_type: item.content_type,
        content: item.content,
        source_file: filename,
        source_type: sourceType,
        page_ref: item.page_ref ?? null,
        related_topics: item.related_topics ?? null,
        flags: item.flags ?? null,
        content_hash: contentHash,
      });

      if (result.inserted) {
        inserted++;
        if (item.is_glossary_term && item.glossary_term_name) {
          insertGlossaryTerm(item.glossary_term_name, item.content, topic.id, result.id);
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  [error] Item error: ${String(err)}`);
      errors++;
    }
  }

  console.log(
    `  [done] ${filename}: ${inserted} inserted, ${skipped} skipped (duplicate), ${errors} errors`,
  );
  return { inserted, skipped, errors };
}

async function main(): Promise<void> {
  console.log('[compile-notes] Starting…');
  console.log(`[compile-notes] Notes dir: ${NOTES_DIR}`);
  if (FORCE) console.log('[compile-notes] --force flag active — reprocessing all files');

  if (!fs.existsSync(NOTES_DIR)) {
    console.error(`[compile-notes] Directory not found: ${NOTES_DIR}`);
    process.exit(1);
  }

  // ── Step 1: Scan ──────────────────────────────────────────────────────────
  const allFiles = fs.readdirSync(NOTES_DIR);
  const noteFiles = allFiles.filter((f) => {
    const lower = f.toLowerCase();
    return lower.endsWith('.txt') || lower.endsWith('.md');
  });

  if (noteFiles.length === 0) {
    console.log('[compile-notes] No .txt or .md files found in notes/. Nothing to do.');
    return;
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const noteFile of noteFiles) {
    const filePath = path.join(NOTES_DIR, noteFile);

    // Detect source_type
    const sourceType: SourceType = noteFile.toLowerCase().includes('granola')
      ? 'granola'
      : 'notes';

    if (!FORCE && isFileProcessed(noteFile)) {
      console.log(`[compile-notes] Skipping already-processed file: ${noteFile}`);
      filesSkipped++;
      continue;
    }

    try {
      const counts = await processFile(filePath, sourceType);
      totalInserted += counts.inserted;
      totalSkipped += counts.skipped;
      totalErrors += counts.errors;
      filesProcessed++;
    } catch (err) {
      console.error(`[compile-notes] Error processing ${noteFile}: ${String(err)}`);
      totalErrors++;
    }
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n[compile-notes] ── Summary ─────────────────────────────────');
  console.log(`  Files processed : ${filesProcessed}`);
  console.log(`  Files skipped   : ${filesSkipped}`);
  console.log(`  Entries inserted: ${totalInserted}`);
  console.log(`  Entries skipped : ${totalSkipped}`);
  console.log(`  Errors          : ${totalErrors}`);
  console.log('[compile-notes] Done.');
}

main().catch((err) => {
  console.error('[compile-notes] Fatal error:', err);
  process.exit(1);
});
