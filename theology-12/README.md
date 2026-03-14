# Theology 12 — Notes Pipeline

A fully automated TypeScript pipeline that OCRs theology reading PDFs, compiles lecture notes, stores everything in a local SQLite database, and exports structured study documents.

---

## What It Does

The pipeline has three stages:

| Script | Command | Purpose |
|---|---|---|
| `scripts/extract-readings.ts` | `npm run extract` | Two-pass: OCR PDFs via Vertex AI → parse structured entries → store in SQLite |
| `scripts/compile-notes.ts` | `npm run compile` | Compile typed notes and Granola.ai lecture transcripts → parse structured entries → store in SQLite |
| `scripts/export.ts` | `npm run export` | Query DB → generate `output/compiled-notes.md` and `output/theology-data.json` |

All data is stored in `theology.db` (SQLite, local) as the single source of truth.

---

## Course Outline

### SET 1 — The Human Starting Point
- Desire
- Problem vs. Mystery
- Absolute Certainty
- Complementarities and Paradoxes
- Wonder

### SET 2 — Approaches to the Divine
- The Six Paths
- Sacred
- Faith
- Spirituality
- Religion

### SET 3 — Images and Revelation
- Perfectionism
- Distorted Images of God
- Christian "Atheism"
- God Is Not a Being
- Revelation

---

## Prerequisites

- **Node.js 18+**
- A **Google Cloud Platform project** with the **Vertex AI API** enabled
- A **GCP service account** with the `roles/aiplatform.user` role, with a downloaded JSON key

---

## Setup

```bash
# 1. Clone the repo and enter the theology-12 directory
git clone https://github.com/CelestialBrain/college.git
cd college/theology-12

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and set GCP_PROJECT_ID (and optionally GCP_LOCATION)

# 4. Place your GCP service account JSON key at theology-12/service-account.json
#    (or adjust GOOGLE_APPLICATION_CREDENTIALS in .env to point to your key)
```

Your `.env` should look like:

```
GCP_PROJECT_ID=my-gcp-project-id
GCP_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

---

## Usage

### 1. Add readings

Drop PDF files into the `readings/` folder:

```
theology-12/
└── readings/
    ├── week-01-desire.pdf
    └── week-02-mystery.pdf
```

### 2. Add notes

Drop `.txt` or `.md` files into the `notes/` folder:

```
theology-12/
└── notes/
    ├── lecture-01-typed.md          ← source_type: notes
    └── granola-lecture-02.txt       ← source_type: granola (filename contains "granola")
```

> **Tip:** Name files with "granola" (case-insensitive) in the filename to flag them as Granola.ai transcriptions. The pipeline will apply extra care when classifying these items.

### 3. Run the pipeline

```bash
# Run all three stages in sequence
npm run all

# Or run stages individually
npm run extract   # OCR and extract PDFs
npm run compile   # Process notes files
npm run export    # Generate output files
```

### 4. Find output

After running, find your study documents in `output/`:

```
theology-12/
└── output/
    ├── compiled-notes.md      ← structured study notes (Markdown)
    └── theology-data.json     ← full DB dump as JSON
```

---

## Scripts Reference

| Script | Command | Description |
|---|---|---|
| `extract` | `npm run extract` | OCR PDFs → extract structured entries → store in DB |
| `compile` | `npm run compile` | Process notes/Granola files → store in DB |
| `export` | `npm run export` | Query DB → generate `compiled-notes.md` + `theology-data.json` |
| `all` | `npm run all` | Run `extract`, then `compile`, then `export` |
| `reset-db` | `npm run reset-db` | Delete `theology.db` (for a clean start) |

---

## Database

The pipeline uses a local SQLite database (`theology.db`) with four tables:

| Table | Purpose |
|---|---|
| `sets` | Course sets (SET1, SET2, SET3) |
| `topics` | Course topics linked to sets |
| `entries` | All extracted knowledge items, deduplicated by content hash |
| `glossary` | Key term definitions, linked to entries |

The schema is idempotent — safe to run on an existing database (`CREATE TABLE IF NOT EXISTS`). The sets and topics are seeded automatically on first run.

---

## Flags

Both ingestion scripts support a `--force` flag to reprocess already-processed files:

```bash
npm run extract -- --force
npm run compile -- --force
npm run export          # export has no --force (always regenerates)
```

Without `--force`, files that already have entries in the DB are skipped to avoid duplicates.

---

## Architecture

### Two-pass approach for PDF readings

The `extract-readings.ts` script uses a deliberate two-pass design:

1. **OCR Pass** — Send the raw PDF to Gemini with instructions to extract all text verbatim, with zero omissions. Save the result as `readings/<filename>.pdf.ocr.txt`.
2. **Extraction Pass** — Send the raw OCR text (not the PDF) to Gemini with instructions to parse it into structured JSON entries.

**Why two passes?**
- The raw OCR text is saved to disk. If you need to tune the extraction prompt, you can re-run only the cheap extraction pass against the saved text — without making another expensive PDF OCR call.
- It also provides a useful audit trail: you can inspect exactly what the OCR captured before the structured extraction step.

### Deduplication

Every entry is hashed (SHA-256 of its `content` field). The DB uses `INSERT OR IGNORE` on the `content_hash` column, so running the pipeline multiple times is safe — duplicates are silently skipped.
