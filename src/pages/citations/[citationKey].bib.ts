import type { APIRoute, GetStaticPaths } from 'astro';
import { toBibtex } from '../../lib/citations';
import { getPublications } from '../../lib/content';

export const getStaticPaths = (async () => {
  const publications = await getPublications();
  return publications.map((publication) => ({
    params: { citationKey: publication.citationKey },
    props: { publication },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { publication } = props as { publication: Parameters<typeof toBibtex>[0] };
  return new Response(toBibtex(publication), {
    headers: { 'Content-Type': 'application/x-bibtex; charset=utf-8' },
  });
};
