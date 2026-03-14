import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { callGemini } from '../src/vertex';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve(__dirname, '..', 'theology.db');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'readings-data.json');
const FORCE = process.argv.includes('--force');

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ReadingEntry {
  content: string;
  content_type: string;
  topic_title: string;
}

async function generateForReading(
  filename: string,
  entries: ReadingEntry[],
  ocrText: string,
): Promise<any> {
  // Extract a clean title from the filename
  const cleanTitle = filename
    .replace('.pdf', '')
    .replace(/\s*\(\d+\)\s*/g, '')
    .replace(/^R\d+\s*-\s*/, '');

  console.log(`  [generate] ${cleanTitle} (${entries.length} entries)…`);

  const prompt = `You are an expert theology professor helping a Filipino college student prepare for their Theology 11 final exam. The student's professor asks SHORT ANSWER and ESSAY questions drawn directly from assigned readings.

Below is the FULL OCR text of the academic reading "${cleanTitle}" along with extracted entries categorized by topic.

=== FULL TEXT OF THE READING ===
${ocrText.substring(0, 30000)}

=== EXTRACTED ENTRIES BY TOPIC ===
${entries.map((e) => `[${e.topic_title} / ${e.content_type}] ${e.content}`).join('\n')}

Generate a JSON object with these exact keys. Think like a student who needs to REMEMBER and APPLY everything from this reading:

{
  "title": "${cleanTitle}",
  "author": "Author name extracted from the text",
  "overview": "A 200-300 word overview of the entire reading. What is the author's main thesis? What are they arguing? What key ideas do they develop? Write this clearly so a student who didn't read it could understand its main points.",

  "keyTerms": [
    {
      "term": "Name of the specific term, concept, or figure",
      "definition": "Clear academic definition",
      "significance": "Why this matters in the reading's argument — why would a professor ask about this?"
    }
  ],

  "keyIdeas": [
    {
      "idea": "Name/title of the key idea or argument",
      "explanation": "2-3 sentence explanation of what this idea means",
      "example": "A specific example, illustration, or quote from the reading that demonstrates this idea"
    }
  ],

  "connections": [
    {
      "courseTopic": "Which of the 15 course topics this connects to",
      "howItConnects": "How this reading's content specifically relates to lectures on that topic"
    }
  ],

  "examQuestions": [
    {
      "question": "A realistic exam question a professor might ask about this reading. Use formats like: 'What is X and why does the author argue it matters?' or 'Explain the concept of X. How does it relate to Y?'",
      "modelAnswer": "A model answer that demonstrates good exam technique — specific, cites the reading, connects to course concepts"
    }
  ],

  "quizQuestions": [
    {
      "question": "Multiple choice question specific to this reading",
      "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctIndex": 0,
      "explanation": "Why the correct answer is right, referencing the reading"
    }
  ]
}

CRITICAL RULES:
- keyTerms: Extract 10-15 specific terms, names, and concepts. Include things like "Sheilaism", "Dark Night of the Soul", "experiential atheism", character examples, author references — the kinds of things professors quiz on.
- keyIdeas: 5-8 major arguments or ideas from the reading
- connections: Link to 3-5 of the 15 course topics: (Desire, Problem vs. Mystery, Absolute Certainty, Complementarities and Paradoxes, Wonder, The Six Paths, Sacred, Faith, Spirituality, Religion, Perfectionism, Distorted Images of God, Christian "Atheism", God Is Not a Being, Revelation)
- examQuestions: 5-6 short-answer questions that mirror real professor exam style
- quizQuestions: 8 multiple choice questions
- Output ONLY valid JSON — no commentary, no markdown fences`;

  const response = await callGemini(prompt);

  let raw = response.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`  [error] Failed to parse JSON for ${cleanTitle}: ${String(err)}`);
    console.error(`  Raw snippet: ${raw.slice(0, 300)}`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log('[generate-readings] Starting…');

  if (fs.existsSync(OUTPUT_FILE) && !FORCE) {
    console.log(`[generate-readings] ${OUTPUT_FILE} already exists. Use --force to regenerate.`);
    return;
  }

  const db = new Database(DB_PATH);

  // Get distinct reading source files
  const readingFiles = db.prepare(`
    SELECT DISTINCT source_file FROM entries WHERE source_type = 'reading' ORDER BY source_file
  `).all() as any[];

  console.log(`[generate-readings] Found ${readingFiles.length} readings.`);

  const readingsData: any = {
    generatedAt: new Date().toISOString(),
    model: 'gemini-2.5-pro',
    readings: [],
  };

  for (const row of readingFiles) {
    const filename = row.source_file;

    // Get entries for this reading
    const entries = db.prepare(`
      SELECT e.content, e.content_type, t.title as topic_title
      FROM entries e
      JOIN topics t ON e.topic_id = t.id
      WHERE e.source_file = ?
      ORDER BY e.id
    `).all(filename) as ReadingEntry[];

    // Get OCR text
    const ocrPath = path.resolve(__dirname, '..', 'readings', `${filename}.ocr.txt`);
    let ocrText = '';
    if (fs.existsSync(ocrPath)) {
      ocrText = fs.readFileSync(ocrPath, 'utf8');
    }

    const generated = await generateForReading(filename, entries, ocrText);

    await delay(5000);

    readingsData.readings.push({
      filename,
      entryCount: entries.length,
      ...(generated || {}),
    });

    console.log(`  [done] ${filename}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(readingsData, null, 2), 'utf8');
  console.log(`\n[generate-readings] Written to ${OUTPUT_FILE}`);
  console.log(`[generate-readings] File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
  console.log('[generate-readings] Done.');

  db.close();
}

main().catch((err) => {
  console.error('[generate-readings] Fatal error:', err);
  process.exit(1);
});
