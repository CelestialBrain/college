/**
 * Patch failed topics in reviewer-data.json by regenerating them.
 * Usage: ts-node scripts/patch-topics.ts Sacred Revelation
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { callGemini } from '../src/vertex';
import { getAllEntries, getAllGlossaryTerms, getAllSetsWithTopics } from '../src/db';
import type { Entry, GlossaryEntry } from '../src/types';

const OUTPUT_FILE = path.resolve(__dirname, '..', 'output', 'reviewer-data.json');
const topicsToRetry = process.argv.slice(2);

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateForTopic(
  topicTitle: string,
  setTitle: string,
  entries: Entry[],
  glossaryTerms: GlossaryEntry[],
  allTopicTitles: string[],
): Promise<any> {
  const allContent = entries.map((e) => e.content).join('\n');
  const otherTopics = allTopicTitles.filter((t) => t !== topicTitle);

  const prompt = `You are an expert theology professor helping a Filipino college student prepare for their Theology 11 final exam. The course is structured into 3 sets:
- SET1: The Human Starting Point (Desire, Problem vs. Mystery, Absolute Certainty, Complementarities and Paradoxes, Wonder)
- SET2: Approaches to the Divine (The Six Paths, Sacred, Faith, Spirituality, Religion)
- SET3: Images and Revelation (Perfectionism, Distorted Images of God, Christian "Atheism", God Is Not a Being, Revelation)

This topic "${topicTitle}" belongs to "${setTitle}".

Below is ALL extracted content from lecture notes, handwritten notes, and academic readings for this topic.

=== ALL SOURCE CONTENT FOR "${topicTitle.toUpperCase()}" ===
${allContent}

=== RAW GLOSSARY ===
${glossaryTerms.map((g) => `${g.term}: ${g.definition}`).join('\n') || 'None.'}

=== OTHER TOPICS ===
${otherTopics.join(', ')}

Generate a JSON object with these keys. Be THOROUGH:

{
  "review": "A COMPREHENSIVE 800-1200 word topic review. Structure like a chapter summary: big idea, all major concepts, specific examples from source material, key thinkers, how it fits in the course. Use paragraph breaks.",
  "keyTakeaways": ["7-8 essential, specific study points"],
  "glossary": [{"term": "Clean name", "definition": "Clear academic definition"}],
  "studyTips": ["5-6 SPECIFIC tips, not generic"],
  "connections": [{"topic": "Name", "relationship": "How they connect", "example": "Concrete example"}],
  "examPrepQuestions": [{"type": "short-answer", "question": "Realistic exam question", "modelAnswer": "Model answer"}],
  "quizQuestions": [{"question": "MCQ", "choices": ["A) ...", "B) ...", "C) ...", "D) ..."], "correctIndex": 0, "explanation": "Why"}]
}

Rules: 8-12 clean glossary entries, 10 quiz questions, 3-4 exam prep questions, 5-8 connections.
IMPORTANT: Do NOT use markdown formatting like ### or ** in the review field. Use plain text only.
Output ONLY valid JSON.`;

  const response = await callGemini(prompt);
  let raw = response.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(raw);
}

async function main(): Promise<void> {
  if (topicsToRetry.length === 0) {
    console.log('Usage: ts-node scripts/patch-topics.ts Sacred Revelation');
    return;
  }

  const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const sets = getAllSetsWithTopics();
  const allEntries = getAllEntries();
  const allGlossary = getAllGlossaryTerms();
  const allTopicTitles = sets.flatMap((s) => s.topics.map((t) => t.title));

  for (const topicName of topicsToRetry) {
    console.log(`[patch] Retrying ${topicName}…`);

    // Find in DB
    let dbTopic: any = null;
    let dbSet: any = null;
    for (const set of sets) {
      for (const t of set.topics) {
        if (t.title.toLowerCase() === topicName.toLowerCase()) {
          dbTopic = t;
          dbSet = set;
        }
      }
    }
    if (!dbTopic) {
      console.error(`  Topic "${topicName}" not found in DB.`);
      continue;
    }

    const topicEntries = allEntries.filter((e) => e.topic_id === dbTopic.id);
    const topicGlossary = allGlossary.filter((g) => g.topic_id === dbTopic.id);

    try {
      const generated = await generateForTopic(
        dbTopic.title,
        `${dbSet.code}: ${dbSet.title}`,
        topicEntries,
        topicGlossary,
        allTopicTitles,
      );

      // Patch in the data
      for (const set of data.sets) {
        for (const topic of set.topics) {
          if (topic.title.toLowerCase() === topicName.toLowerCase()) {
            Object.assign(topic, generated);
            // Also update glossaryTerms with cleaned glossary
            if (generated.glossary) {
              topic.glossaryTerms = generated.glossary;
            }
            console.log(`  [patched] ${topicName} ✅`);
          }
        }
      }
    } catch (err) {
      console.error(`  [error] Failed to patch ${topicName}: ${err}`);
    }

    await delay(5000);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[patch] Updated ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('[patch] Fatal error:', err);
  process.exit(1);
});
