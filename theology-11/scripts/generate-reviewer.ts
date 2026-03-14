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
 * Generate comprehensive review + study materials for a single topic.
 */
async function generateForTopic(
  topicTitle: string,
  topicSlug: string,
  setTitle: string,
  entries: Entry[],
  glossaryTerms: GlossaryEntry[],
  allTopicTitles: string[],
): Promise<any> {
  console.log(`  [generate] ${topicTitle} (${entries.length} entries, ${glossaryTerms.length} glossary terms)…`);

  // Build all content as context
  const allContent = entries.map((e) => e.content).join('\n');

  const otherTopics = allTopicTitles.filter((t) => t !== topicTitle);

  const prompt = `You are an expert theology professor helping a Filipino college student prepare for their Theology 11 final exam. The course is structured into 3 sets:
- SET1: The Human Starting Point (Desire, Problem vs. Mystery, Absolute Certainty, Complementarities and Paradoxes, Wonder)
- SET2: Approaches to the Divine (The Six Paths, Sacred, Faith, Spirituality, Religion)
- SET3: Images and Revelation (Perfectionism, Distorted Images of God, Christian "Atheism", God Is Not a Being, Revelation)

This topic "${topicTitle}" belongs to "${setTitle}".

Below is ALL extracted content from lecture notes, handwritten notes, and academic readings for this topic. Some content may be raw transcripts with informal language — your job is to clean it up, verify accuracy, and produce a comprehensive study review.

=== ALL SOURCE CONTENT FOR "${topicTitle.toUpperCase()}" ===
${allContent}

=== RAW GLOSSARY (may contain duplicates or raw transcript text — clean these up) ===
${glossaryTerms.map((g) => `${g.term}: ${g.definition}`).join('\n') || 'No glossary terms extracted.'}

=== OTHER TOPICS IN THIS COURSE (for connections) ===
${otherTopics.join(', ')}

Generate a JSON object with these exact keys. Be THOROUGH — this is the student's primary study material:

{
  "review": "A COMPREHENSIVE topic review of 800-1200 words. Structure it like a textbook chapter summary:\n\n1. Start with the BIG IDEA — what is this topic fundamentally about and why it matters\n2. Cover ALL major concepts, arguments, and frameworks taught\n3. Include specific examples, illustrations, and analogies FROM the source material\n4. Reference specific authors/thinkers (e.g., Tillich, Marcel, Martin, Savant) and their key contributions\n5. End with how this topic fits into the bigger picture of the course\n\nUse clear academic language but make it accessible. Use paragraph breaks. This should be detailed enough that a student could study ONLY this review and understand the topic.",

  "keyTakeaways": ["array of 7-8 essential points. These should be specific and content-rich, not vague. Each should be a complete thought that stands alone as a study point"],

  "glossary": [
    {
      "term": "Clean, properly formatted term name",
      "definition": "Clear, academic definition written in complete sentences. Remove any transcript artifacts like 'So...' or 'Right?' etc. Deduplicate — if the same concept appears multiple times, merge into one clean entry."
    }
  ],

  "studyTips": ["array of 5-6 SPECIFIC study tips. NOT generic advice like 'study hard'. Instead: 'Pay attention to the distinction between X and Y — this is a common exam trap' or 'Remember the acronym I.D.E.A.S. by...'"],

  "connections": [
    {
      "topic": "Name of related topic",
      "relationship": "How they connect — be specific about what concepts bridge them",
      "example": "A concrete example of how understanding both enriches your grasp of the material"
    }
  ],

  "examPrepQuestions": [
    {
      "type": "short-answer",
      "question": "A question that could appear on the exam requiring 2-3 sentence answers",
      "modelAnswer": "A model short answer demonstrating good exam technique"
    }
  ],

  "quizQuestions": [
    {
      "question": "Clear, exam-style multiple choice question",
      "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctIndex": 0,
      "explanation": "Why the correct answer is right, referencing specific course content. Explain why the wrong answers are wrong."
    }
  ]
}

CRITICAL RULES:
- The "review" must be 800-1200 words — this is the MAIN study document
- Generate 8-12 CLEAN glossary entries — remove duplicates, fix raw transcript text, write proper definitions
- Generate exactly 10 quiz questions — vary between factual recall, conceptual understanding, and application
- Generate 3-4 short-answer exam prep questions with model answers
- Connections should reference 5-8 other topics — show how this topic WEAVES through the whole course
- Remove ALL transcript artifacts ("So...", "Right?", "like", informal speech patterns) from every field
- Output ONLY valid JSON — no commentary, no markdown fences`;

  const response = await callGemini(prompt);

  let raw = response.trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  try {
    const data = JSON.parse(raw);
    return data;
  } catch (err) {
    console.error(`  [error] Failed to parse JSON for ${topicTitle}: ${String(err)}`);
    console.error(`  Raw snippet: ${raw.slice(0, 300)}`);
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
        `${set.code}: ${set.title}`,
        topicEntries,
        topicGlossary,
        allTopicTitles,
      );

      await delay(5000); // Longer buffer for Pro

      setData.topics.push({
        slug: topic.slug,
        title: topic.title,
        entryCount: topicEntries.length,
        // Use AI-cleaned glossary instead of raw
        glossaryTerms: generated?.glossary || topicGlossary.map((g) => ({
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
