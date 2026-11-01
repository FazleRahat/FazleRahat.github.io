// schema.org JSON-LD built from the same records the visible pages use.
// Only verified profile URLs reach `sameAs`; missing ORCID/GitHub are omitted.
import { doiUrl } from './citations.ts';
import type { Profile, Publication } from './schemas.ts';

type Absolute = (path: string) => string;
type Json = Record<string, unknown>;

/** Serialize for embedding in a <script> element: `<` can never close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
}

export function personId(absolute: Absolute): string {
  return `${absolute('/')}#person`;
}

export function homeJsonLd(
  profile: Profile,
  site: { siteName: string; defaultDescription: string },
  absolute: Absolute,
  /** Title of the current appointment; omitted when there is none. */
  jobTitle?: string,
): Json {
  const sameAs = Object.values(profile.links).filter((url): url is string => Boolean(url));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${absolute('/')}#website`,
        url: absolute('/'),
        name: site.siteName,
        description: site.defaultDescription,
        inLanguage: 'en',
        publisher: { '@id': personId(absolute) },
      },
      {
        '@type': 'Person',
        '@id': personId(absolute),
        name: profile.displayName,
        url: absolute('/'),
        email: `mailto:${profile.email}`,
        ...(jobTitle ? { jobTitle } : {}),
        description: site.defaultDescription,
        affiliation: { '@type': 'Organization', name: profile.institution },
        knowsAbout: profile.researchInterests,
        homeLocation: { '@type': 'Place', name: profile.location },
        ...(sameAs.length > 0 ? { sameAs } : {}),
      },
    ],
  };
}

export function publicationsJsonLd(publications: readonly Publication[], absolute: Absolute): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: publications.map((publication, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'ScholarlyArticle',
        '@id': `${absolute('/publications/')}#${publication.id}`,
        name: publication.title,
        datePublished: String(publication.year),
        author: publication.authors.map((author) =>
          author.personId ? { '@id': personId(absolute) } : { '@type': 'Person', name: author.display },
        ),
        ...(publication.doi
          ? { sameAs: doiUrl(publication.doi), identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: publication.doi } }
          : {}),
        ...(publication.pages ? { pagination: publication.pages } : {}),
        isPartOf: {
          '@type': publication.type === 'journal-article' ? 'Periodical' : 'CreativeWork',
          name: publication.venue,
          ...(publication.volume ? { volumeNumber: publication.volume } : {}),
        },
      },
    })),
  };
}
