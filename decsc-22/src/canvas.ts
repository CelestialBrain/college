import 'dotenv/config';

const BASE_URL = process.env.CANVAS_BASE_URL ?? 'https://ateneo.instructure.com';
const TOKEN = process.env.CANVAS_API_TOKEN;

if (!TOKEN) {
  throw new Error('CANVAS_API_TOKEN is not set. Create a token in Canvas → Account → Settings → "+ New Access Token" and add it to .env');
}

type Json = Record<string, unknown> | unknown[];

async function request<T extends Json>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`/api/v1${path}`, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Canvas ${res.status} ${res.statusText} for ${url.pathname}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function paginate<T>(path: string, params?: Record<string, string | number>): Promise<T[]> {
  const url = new URL(`/api/v1${path}`, BASE_URL);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('per_page', '100');

  const all: T[] = [];
  let next: string | null = url.toString();
  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Canvas ${res.status} ${res.statusText}: ${await res.text()}`);
    all.push(...((await res.json()) as T[]));
    const link = res.headers.get('link');
    next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return all;
}

export const canvas = {
  course: (id: string | number) => request(`/courses/${id}`, { 'include[]': 'syllabus_body' }),
  modules: (id: string | number) => paginate(`/courses/${id}/modules`, { 'include[]': 'items' }),
  assignments: (id: string | number) => paginate(`/courses/${id}/assignments`),
  pages: (id: string | number) => paginate(`/courses/${id}/pages`),
  page: (id: string | number, url: string) => request(`/courses/${id}/pages/${url}`),
  files: (id: string | number) => paginate(`/courses/${id}/files`),
  announcements: (id: string | number) =>
    paginate(`/announcements`, { 'context_codes[]': `course_${id}` }),
};
