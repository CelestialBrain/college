import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { canvas } from '../src/canvas';

async function main() {
  const courseId = process.env.CANVAS_COURSE_ID;
  if (!courseId) throw new Error('CANVAS_COURSE_ID not set in .env');

  console.log(`Fetching DECSC 22 (course ${courseId}) from Canvas...`);

  async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      console.warn(`  [skip] ${label}: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  }

  const [course, modules, assignments, pages, announcements, files] = await Promise.all([
    safe('course', () => canvas.course(courseId)),
    safe('modules', () => canvas.modules(courseId)),
    safe('assignments', () => canvas.assignments(courseId)),
    safe('pages', () => canvas.pages(courseId)),
    safe('announcements', () => canvas.announcements(courseId)),
    safe('files', () => canvas.files(courseId)),
  ]);

  mkdirSync('output', { recursive: true });
  const snapshot = { course, modules, assignments, pages, announcements, files };
  writeFileSync('output/canvas-snapshot.json', JSON.stringify(snapshot, null, 2));

  const len = (x: unknown) => (Array.isArray(x) ? x.length : '—');
  console.log(`Modules:       ${len(modules)}`);
  console.log(`Assignments:   ${len(assignments)}`);
  console.log(`Pages:         ${len(pages)}`);
  console.log(`Announcements: ${len(announcements)}`);
  console.log(`Files:         ${len(files)}`);
  console.log('Wrote output/canvas-snapshot.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
