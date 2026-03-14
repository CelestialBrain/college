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
import type { ExtractionItem } from '../src/types';

const READINGS_DIR = path.resolve(__dirname, '..', 'readings');
const FORCE = process.argv.includes('--force');

const EXTRACTION_PROMPT = `You are a theology note-taking assistant. Your task is to analyse the OCR text of a theology reading and extract every distinct piece of knowledge into a structured JSON array.

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

OCR TEXT:
`;

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processFile(pdfPath: string): Promise<void> {
  const filename = path.basename(pdfPath);
  console.log(`\n[extract] Processing: ${filename}`);

  // ── Phase 1: OCR ──────────────────────────────────────────────────────────
  console.log(`  [1/3] OCR pass via Gemini…`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const ocrPrompt = `Extract ALL text from this document with zero omissions.

Rules:
- Preserve the exact wording of every sentence
- Keep all paragraph breaks intact
- Preserve footnotes, label them [Footnote N]
- Preserve headings and subheadings with their hierarchy
- If text is in two columns, read left column then right column
- Do not summarize, rephrase, or skip any content
- If a word is unclear, append [unclear?] after it

Output only the raw extracted text. No commentary.`;

  const ocrText = await callGemini(ocrPrompt, pdfBase64, 'application/pdf');

  // Save raw OCR text for reference / re-runs
  const ocrOutputPath = pdfPath + '.ocr.txt';
  fs.writeFileSync(ocrOutputPath, ocrText, 'utf8');
  console.log(`  [1/3] OCR saved to ${path.basename(ocrOutputPath)}`);

  await delay(2000);

  // ── Phase 2: Extraction ───────────────────────────────────────────────────
  console.log(`  [2/3] Extraction pass via Gemini…`);
  const extractionResponse = await callGemini(EXTRACTION_PROMPT + ocrText);

  await delay(2000);

  // ── Phase 3: Parse and store ──────────────────────────────────────────────
  console.log(`  [3/3] Parsing and storing…`);

  let raw = extractionResponse.trim();
  // Strip markdown code fences if present
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  let items: ExtractionItem[];
  try {
    items = JSON.parse(raw) as ExtractionItem[];
  } catch (err) {
    console.error(`  [error] Failed to parse JSON from Gemini response: ${String(err)}`);
    console.error(`  Raw response snippet: ${raw.slice(0, 300)}`);
    return;
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
        source_type: 'reading',
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
}

async function main(): Promise<void> {
  console.log('[extract-readings] Starting…');
  console.log(`[extract-readings] Readings dir: ${READINGS_DIR}`);
  if (FORCE) console.log('[extract-readings] --force flag active — reprocessing all files');

  if (!fs.existsSync(READINGS_DIR)) {
    console.error(`[extract-readings] Directory not found: ${READINGS_DIR}`);
    process.exit(1);
  }

  // ── Step 1: Scan ──────────────────────────────────────────────────────────
  const allFiles = fs.readdirSync(READINGS_DIR);
  const pdfFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    console.log('[extract-readings] No PDF files found in readings/. Nothing to do.');
    return;
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(READINGS_DIR, pdfFile);
    if (!FORCE && isFileProcessed(pdfFile)) {
      console.log(`[extract-readings] Skipping already-processed file: ${pdfFile}`);
      filesSkipped++;
      continue;
    }

    try {
      await processFile(pdfPath);
      filesProcessed++;
    } catch (err) {
      console.error(`[extract-readings] Error processing ${pdfFile}: ${String(err)}`);
      totalErrors++;
    }
  }

  // ── Step 2: Report ────────────────────────────────────────────────────────
  console.log('\n[extract-readings] ── Summary ──────────────────────────────');
  console.log(`  Files processed : ${filesProcessed}`);
  console.log(`  Files skipped   : ${filesSkipped}`);
  console.log(`  Entries inserted: ${totalInserted}`);
  console.log(`  Entries skipped : ${totalSkipped}`);
  console.log(`  Errors          : ${totalErrors}`);
  console.log('[extract-readings] Done.');
}

main().catch((err) => {
  console.error('[extract-readings] Fatal error:', err);
  process.exit(1);
});
