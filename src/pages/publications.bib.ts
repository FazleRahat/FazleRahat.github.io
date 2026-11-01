import type { APIRoute } from 'astro';
import { toBibtexFile } from '../lib/citations';
import { getPublications } from '../lib/content';

// The complete bibliography, generated from the same records as the page.
export const GET: APIRoute = async () => {
  const publications = await getPublications();
  return new Response(toBibtexFile(publications), {
    headers: { 'Content-Type': 'application/x-bibtex; charset=utf-8' },
  });
};
