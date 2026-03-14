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

const HANDWRITTEN_DIR = path.resolve(__dirname, '..', 'notes', 'handwritten-jpeg');
const FORCE = process.argv.includes('--force');

const OCR_PROMPT = `You are looking at a photograph of handwritten class notes. Your task is to extract ALL text from these notes with zero omissions.

Rules:
- Transcribe every word exactly as written, preserving the original phrasing
- Preserve paragraph breaks and any visual structure (indentation, bullet points, numbered lists)
- If the handwriting includes arrows, connections, or diagram labels, describe them in [brackets]
- If there are drawings or diagrams, describe them briefly in [DIAGRAM: ...]
- If a word is unclear, write your best guess and append [unclear?]
- Preserve any underlined or emphasised words by wrapping them in *asterisks*
- If there are marginal notes or annotations, include them prefixed with [MARGIN:]
- Output only the raw transcribed text. No commentary.`;

const EXTRACTION_PROMPT = `You are a theology note-taking assistant. Your task is to analyse the following handwritten class notes (transcribed from photos) and extract every distinct piece of knowledge into a structured JSON array.

NOTE: This content was transcribed from handwritten notes which may contain abbreviations, incomplete sentences, shorthand, or informal notation. Apply extra care when classifying content types and infer the intended meaning where the handwriting transcription is unclear. Add "[inferred]" to the flags field for any item where you had to interpret ambiguous text.

Each item in the array must be a JSON object with these exact keys:
  - "topic_slug"        (string) — one of the known course topics (see list below)
  - "content_type"      (string) — one of: term-definition, core-lesson, distinction, example-illustration, external-quote, author-line, insight-implication, raw-text, chapter-heading
  - "content"           (string) — the exact or lightly cleaned text of this item
  - "is_glossary_term"  (boolean) — true only if this item defines a key term
  - "glossary_term_name" (string|null) — the term being defined, or null
  - "page_ref"          (string|null) — page number if determinable, else null
  - "related_topics"    (string|null) — comma-separated slugs of other relevant topics, or null
  - "flags"             (string|null) — e.g. "[inferred]", "[unclear?]", "[diagram]", or null

Known topic slugs:
  desire, problem-vs-mystery, absolute-certainty, complementarities-and-paradoxes, wonder,
  the-six-paths, sacred, faith, spirituality, religion,
  perfectionism, distorted-images-of-god, christian-atheism, god-is-not-a-being, revelation

Rules:
  - Every sentence of substance must appear in at least one item — do not skip anything
  - Definitions of terms must use content_type "term-definition" and is_glossary_term true
  - Direct quotes from other authors use content_type "external-quote"
  - Headings and subheadings use content_type "chapter-heading"
  - Diagram descriptions should use content_type "example-illustration" with "[diagram]" in flags
  - If you cannot confidently assign a topic slug, use the closest match and add "[inferred]" to flags
  - Output ONLY a valid JSON array — no commentary, no markdown fences, no preamble

TRANSCRIBED NOTES:
`;

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processImage(
  imagePath: string,
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const filename = path.basename(imagePath);
  console.log(`\n[handwritten] Processing: ${filename}`);

  // ── Phase 1: OCR ──────────────────────────────────────────────────────────
  console.log(`  [1/3] OCR pass via Gemini (image → text)…`);
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const ocrText = await callGemini(OCR_PROMPT, imageBase64, 'image/jpeg');

  // Save raw OCR text for reference
  const ocrOutputPath = imagePath + '.ocr.txt';
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
        source_type: 'handwritten',
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
  console.log('[extract-handwritten] Starting…');
  console.log(`[extract-handwritten] Images dir: ${HANDWRITTEN_DIR}`);
  if (FORCE) console.log('[extract-handwritten] --force flag active — reprocessing all files');

  if (!fs.existsSync(HANDWRITTEN_DIR)) {
    console.error(`[extract-handwritten] Directory not found: ${HANDWRITTEN_DIR}`);
    console.log('[extract-handwritten] Run HEIC → JPEG conversion first.');
    process.exit(1);
  }

  // ── Step 1: Scan ──────────────────────────────────────────────────────────
  const allFiles = fs.readdirSync(HANDWRITTEN_DIR);
  const imageFiles = allFiles.filter((f) => {
    const lower = f.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
  });

  if (imageFiles.length === 0) {
    console.log('[extract-handwritten] No image files found. Nothing to do.');
    return;
  }

  // Sort by filename for consistent ordering
  imageFiles.sort();

  console.log(`[extract-handwritten] Found ${imageFiles.length} images to process.`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const imageFile of imageFiles) {
    const imagePath = path.join(HANDWRITTEN_DIR, imageFile);

    if (!FORCE && isFileProcessed(imageFile)) {
      console.log(`[extract-handwritten] Skipping already-processed file: ${imageFile}`);
      filesSkipped++;
      continue;
    }

    try {
      const counts = await processImage(imagePath);
      totalInserted += counts.inserted;
      totalSkipped += counts.skipped;
      totalErrors += counts.errors;
      filesProcessed++;
    } catch (err) {
      console.error(`[extract-handwritten] Error processing ${imageFile}: ${String(err)}`);
      totalErrors++;
    }
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n[extract-handwritten] ── Summary ──────────────────────────');
  console.log(`  Images processed : ${filesProcessed}`);
  console.log(`  Images skipped   : ${filesSkipped}`);
  console.log(`  Entries inserted : ${totalInserted}`);
  console.log(`  Entries skipped  : ${totalSkipped}`);
  console.log(`  Errors           : ${totalErrors}`);
  console.log('[extract-handwritten] Done.');
}

main().catch((err) => {
  console.error('[extract-handwritten] Fatal error:', err);
  process.exit(1);
});
