export type ContentType =
  | 'term-definition'
  | 'core-lesson'
  | 'distinction'
  | 'example-illustration'
  | 'external-quote'
  | 'author-line'
  | 'insight-implication'
  | 'raw-text'
  | 'chapter-heading';

export type SourceType = 'reading' | 'notes' | 'granola' | 'handwritten';

export interface Entry {
  id: number;
  topic_id: number;
  content_type: ContentType;
  content: string;
  source_file: string;
  source_type: SourceType;
  page_ref: string | null;
  related_topics: string | null;
  flags: string | null;
  content_hash: string;
  created_at: string;
}

export interface Topic {
  id: number;
  set_id: number;
  slug: string;
  title: string;
}

export interface SetRecord {
  id: number;
  code: string;
  title: string;
}

export interface SetWithTopics extends SetRecord {
  topics: Topic[];
}

export interface GlossaryEntry {
  id: number;
  term: string;
  definition: string;
  topic_id: number;
  source_entry_id: number;
}

/**
 * Shape of each object Gemini returns in the JSON array
 * during the extraction / compilation pass.
 */
export interface ExtractionItem {
  topic_slug: string;
  content_type: ContentType;
  content: string;
  is_glossary_term: boolean;
  glossary_term_name?: string;
  page_ref?: string | null;
  related_topics?: string | null;
  flags?: string | null;
}
