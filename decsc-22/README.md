# DECSC 22 — Management Science

Course tools for DECSC 22-F. Pulls course data from Canvas via the REST API and stores it locally for offline review and downstream tooling.

## Setup

```bash
cd college/decsc-22
npm install
cp .env.example .env
# Edit .env: paste your Canvas API token
```

Generate a Canvas token at: **Canvas → Account → Settings → "+ New Access Token"**.

The course ID `61375` (from `ateneo.instructure.com/courses/61375`) is preset in `.env.example`.

## Usage

```bash
npm run canvas:course   # snapshot course, modules, assignments, pages, announcements → output/canvas-snapshot.json
```

## Structure

| Path                          | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `src/canvas.ts`               | Canvas REST client (auth + pagination)        |
| `scripts/canvas-course.ts`    | Snapshot the full course into `output/`       |
| `output/canvas-snapshot.json` | Generated — full Canvas snapshot              |
