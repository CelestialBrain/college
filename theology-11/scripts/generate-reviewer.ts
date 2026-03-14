import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { callGemini } from '../src/vertex';
import { getAllEntries, getAllGlossaryTerms, getAllSetsWithTopics } from '../src/db';
import type { Entry, GlossaryEntry } from '../src/types';

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'reviewer-data.json');
const FORCE = process.argv.includes('--force');

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generate study materials for a single topic.
 */
async function generateForTopic(
  topicTitle: string,
  topicSlug: string,
  entries: Entry[],
  glossaryTerms: GlossaryEntry[],
  allTopicTitles: string[],
): Promise<any> {
  console.log(`  [generate] ${topicTitle} (${entries.length} entries, ${glossaryTerms.length} glossary terms)…`);

  // Build context from entries
  const coreLesson = entries
    .filter((e) => e.content_type === 'core-lesson')
    .map((e) => e.content)
    .join('\n');
  const definitions = entries
    .filter((e) => e.content_type === 'term-definition')
    .map((e) => e.content)
    .join('\n');
  const distinctions = entries
    .filter((e) => e.content_type === 'distinction')
    .map((e) => e.content)
    .join('\n');
  const examples = entries
    .filter((e) => e.content_type === 'example-illustration')
    .map((e) => e.content)
    .join('\n');
  const quotes = entries
    .filter((e) => e.content_type === 'external-quote')
    .map((e) => e.content)
    .join('\n');

  const otherTopics = allTopicTitles.filter((t) => t !== topicTitle);

  const prompt = `You are a theology study assistant helping a college student prepare for their Theology 11 course exam.

Based on the following extracted course content for the topic "${topicTitle}", generate comprehensive study materials.

=== CORE LESSONS ===
${coreLesson}

=== DEFINITIONS ===
${definitions}

=== DISTINCTIONS ===
${distinctions}

=== EXAMPLES & ILLUSTRATIONS ===
${examples}

=== QUOTES ===
${quotes}

=== GLOSSARY TERMS ===
${glossaryTerms.map((g) => `${g.term}: ${g.definition}`).join('\n')}

=== OTHER TOPICS IN THIS COURSE ===
${otherTopics.join(', ')}

Generate a JSON object with these exact keys:

{
  "summary": "A clear, well-structured 3-4 paragraph summary of this topic. Cover the main ideas, key arguments, and practical takeaways. Write as if explaining to a student who missed class. Use simple but academic language.",

  "keyTakeaways": ["array of the 5 most important points a student MUST remember for the exam"],

  "studyTips": ["array of 4-5 specific, actionable study tips for mastering this topic. Include what to focus on, common exam question patterns, and how to remember key concepts"],

  "connections": [
    {
      "topic": "Name of related topic from the course",
      "explanation": "1-2 sentences explaining how these topics connect and why understanding both matters"
    }
  ],

  "quizQuestions": [
    {
      "question": "Clear, exam-style question",
      "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctIndex": 0,
      "explanation": "Brief explanation of why the correct answer is right and key distractors are wrong"
    }
  ]
}

Rules:
- Generate exactly 10 quiz questions per topic — mix definition recall, application, and critical thinking questions
- Connections should reference 3-5 other topics from the course list above
- Study tips should be practical and specific, not generic
- The summary should synthesize across all sources (readings, lecture notes, handwritten notes)
- Output ONLY valid JSON — no commentary, no markdown fences`;

  const response = await callGemini(prompt);

  let raw = response.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  try {
    const data = JSON.parse(raw);
    return data;
  } catch (err) {
    console.error(`  [error] Failed to parse JSON for ${topicTitle}: ${String(err)}`);
    console.error(`  Raw snippet: ${raw.slice(0, 200)}`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log('[generate-reviewer] Starting…');

  if (fs.existsSync(OUTPUT_FILE) && !FORCE) {
    console.log(`[generate-reviewer] ${OUTPUT_FILE} already exists. Use --force to regenerate.`);
    return;
  }

  const sets = getAllSetsWithTopics();
  const allEntries = getAllEntries();
  const allGlossary = getAllGlossaryTerms();
  const allTopicTitles = sets.flatMap((s) => s.topics.map((t) => t.title));

  console.log(`[generate-reviewer] Found ${allEntries.length} entries, ${allGlossary.length} glossary terms across ${allTopicTitles.length} topics.`);

  const reviewerData: any = {
    generatedAt: new Date().toISOString(),
    model: 'gemini-2.5-pro',
    stats: {
      totalEntries: allEntries.length,
      totalGlossary: allGlossary.length,
      totalTopics: allTopicTitles.length,
    },
    sets: [],
  };

  for (const set of sets) {
    const setData: any = {
      code: set.code,
      title: set.title,
      topics: [],
    };

    for (const topic of set.topics) {
      const topicEntries = allEntries.filter((e) => e.topic_id === topic.id);
      const topicGlossary = allGlossary.filter((g) => g.topic_id === topic.id);

      const generated = await generateForTopic(
        topic.title,
        topic.slug,
        topicEntries,
        topicGlossary,
        allTopicTitles,
      );

      await delay(3000); // Rate limit buffer for Pro

      setData.topics.push({
        slug: topic.slug,
        title: topic.title,
        entryCount: topicEntries.length,
        glossaryTerms: topicGlossary.map((g) => ({
          term: g.term,
          definition: g.definition,
        })),
        entries: topicEntries.map((e) => ({
          contentType: e.content_type,
          content: e.content,
          sourceFile: e.source_file,
          sourceType: e.source_type,
          flags: e.flags,
        })),
        ...(generated || {}),
      });

      console.log(`  [done] ${topic.title}`);
    }

    reviewerData.sets.push(setData);
  }

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(reviewerData, null, 2), 'utf8');
  console.log(`\n[generate-reviewer] Written to ${OUTPUT_FILE}`);
  console.log(`[generate-reviewer] File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
  console.log('[generate-reviewer] Done.');
}

main().catch((err) => {
  console.error('[generate-reviewer] Fatal error:', err);
  process.exit(1);
});
