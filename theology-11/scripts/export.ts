import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  getAllEntries,
  getAllGlossaryTerms,
  getAllSetsWithTopics,
} from '../src/db';
import type { Entry } from '../src/types';

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');
const MD_OUTPUT = path.join(OUTPUT_DIR, 'compiled-notes.md');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'theology-data.json');

// ─── Markdown generation ─────────────────────────────────────────────────────

function renderEntry(entry: Entry): string {
  const lines: string[] = [];

  switch (entry.content_type) {
    case 'chapter-heading':
      lines.push(`### ${entry.content}`);
      break;
    case 'term-definition':
      lines.push(`**Definition:** ${entry.content}`);
      break;
    case 'core-lesson':
      lines.push(entry.content);
      break;
    case 'distinction':
      lines.push(`> **Distinction:** ${entry.content}`);
      break;
    case 'example-illustration':
      lines.push(`*Example:* ${entry.content}`);
      break;
    case 'external-quote':
      lines.push(`> ${entry.content}`);
      break;
    case 'author-line':
      lines.push(`— ${entry.content}`);
      break;
    case 'insight-implication':
      lines.push(`💡 ${entry.content}`);
      break;
    case 'raw-text':
      lines.push(entry.content);
      break;
    default:
      lines.push(entry.content);
  }

  const meta: string[] = [];
  if (entry.page_ref) meta.push(`p. ${entry.page_ref}`);
  if (entry.source_file) meta.push(`*${entry.source_file}*`);
  if (entry.flags) meta.push(entry.flags);
  if (meta.length > 0) {
    lines.push(`<sub>${meta.join(' · ')}</sub>`);
  }

  return lines.join('\n');
}

function generateMarkdown(): string {
  const setsWithTopics = getAllSetsWithTopics();
  const allEntries = getAllEntries();
  const glossaryTerms = getAllGlossaryTerms();

  // Index entries by topic_id
  const entriesByTopic = new Map<number, Entry[]>();
  for (const entry of allEntries) {
    const list = entriesByTopic.get(entry.topic_id) ?? [];
    list.push(entry);
    entriesByTopic.set(entry.topic_id, list);
  }

  const sections: string[] = [];

  sections.push('# Theology 12 — Compiled Study Notes');
  sections.push(`*Generated: ${new Date().toISOString()}*`);
  sections.push('');

  for (const set of setsWithTopics) {
    const setHasContent = set.topics.some(
      (t) => (entriesByTopic.get(t.id) ?? []).length > 0,
    );
    if (!setHasContent) continue;

    sections.push(`## ${set.code}: ${set.title}`);
    sections.push('');

    for (const topic of set.topics) {
      const entries = entriesByTopic.get(topic.id) ?? [];
      if (entries.length === 0) continue;

      sections.push(`## ${topic.title}`);
      sections.push('');

      // Group by content_type for readability
      const byType = new Map<string, Entry[]>();
      for (const e of entries) {
        const list = byType.get(e.content_type) ?? [];
        list.push(e);
        byType.set(e.content_type, list);
      }

      // Render in a sensible order
      const typeOrder = [
        'chapter-heading',
        'term-definition',
        'core-lesson',
        'distinction',
        'example-illustration',
        'external-quote',
        'author-line',
        'insight-implication',
        'raw-text',
      ];

      for (const ct of typeOrder) {
        const typeEntries = byType.get(ct);
        if (!typeEntries || typeEntries.length === 0) continue;

        for (const entry of typeEntries) {
          sections.push(renderEntry(entry));
          sections.push('');
        }
      }
    }
  }

  // ── Glossary ──────────────────────────────────────────────────────────────
  if (glossaryTerms.length > 0) {
    sections.push('---');
    sections.push('');
    sections.push('## Glossary');
    sections.push('');

    for (const g of glossaryTerms) {
      sections.push(`**${g.term}**`);
      sections.push(g.definition);
      sections.push('');
    }
  }

  return sections.join('\n');
}

// ─── JSON generation ─────────────────────────────────────────────────────────

function generateJSON(): object {
  const setsWithTopics = getAllSetsWithTopics();
  const allEntries = getAllEntries();
  const glossaryTerms = getAllGlossaryTerms();

  return {
    generated_at: new Date().toISOString(),
    sets: setsWithTopics,
    entries: allEntries,
    glossary: glossaryTerms,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('[export] Starting…');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const allEntries = getAllEntries();
  const glossaryTerms = getAllGlossaryTerms();

  console.log(`[export] Found ${allEntries.length} entries and ${glossaryTerms.length} glossary terms.`);

  // OUTPUT A: Markdown
  console.log(`[export] Generating ${MD_OUTPUT}…`);
  const markdown = generateMarkdown();
  fs.writeFileSync(MD_OUTPUT, markdown, 'utf8');

  // OUTPUT B: JSON
  console.log(`[export] Generating ${JSON_OUTPUT}…`);
  const json = generateJSON();
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(json, null, 2), 'utf8');

  console.log('\n[export] ── Summary ─────────────────────────────────────────');
  console.log(`  Entries exported      : ${allEntries.length}`);
  console.log(`  Glossary terms        : ${glossaryTerms.length}`);
  console.log(`  Files written:`);
  console.log(`    ${MD_OUTPUT}`);
  console.log(`    ${JSON_OUTPUT}`);
  console.log('[export] Done.');
}

main();
