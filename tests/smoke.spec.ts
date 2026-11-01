import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { ALL_PAGES, NAV_LABELS, PRIMARY_ROUTES, REMOVED_CASE_STUDY_ROUTES, events, experience, hasPublicEvents, profile, publications, rel, site } from './helpers';

const WIDTHS = [320, 390, 768, 1024, 1440];

const headingTexts = (page: Page, level: 'h2' | 'h3') => page.locator(`main ${level}`).allTextContents();

test.describe('routes and utility endpoints', () => {
  for (const route of ALL_PAGES) {
    test(`${route} loads directly with one h1, a title and a canonical URL`, async ({ page }) => {
      const response = await page.goto(rel(route));
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).not.toBeEmpty();
      expect(await page.title()).toMatch(/Rahat/);
      const canonical = await page.locator('link[rel=canonical]').getAttribute('href');
      expect(canonical?.endsWith(route)).toBe(true);
    });
  }

  test('bibliography exports, robots and sitemap are served', async ({ request }) => {
    const all = await request.get(rel('/publications.bib'));
    expect(all.status()).toBe(200);
    const text = await all.text();
    for (const publication of publications) expect(text).toContain(`{${publication.citationKey},`);

    for (const publication of publications) {
      const single = await request.get(rel(`/citations/${publication.citationKey}.bib`));
      expect(single.status()).toBe(200);
      expect(await single.text()).toContain(publication.doi);
    }
    expect((await request.get(rel('/robots.txt'))).status()).toBe(200);
    expect((await request.get(rel('/sitemap-index.xml'))).status()).toBe(200);
    expect((await request.get(rel('/social/default.png'))).status()).toBe(200);
  });

  test('an unknown URL returns a real 404 with recovery links', async ({ page }) => {
    const response = await page.goto(rel('/does-not-exist/'));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /home page/i })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /research/i })).toBeVisible();
  });
});

test.describe('home page: compact profile header', () => {
  test('shows identity, role, affiliation and contact links', async ({ page }) => {
    await page.goto('');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText(profile.displayName);
    await expect(page.locator('.profile .native-name')).toHaveText(profile.nativeName);
    await expect(page.getByText(`Call me ${profile.preferredName}`)).toBeVisible();
    await expect(page.getByText('MS student · Graduate Research Assistant')).toBeVisible();
    await expect(page.getByText(`${profile.institution} · ${profile.lab}`).first()).toBeVisible();

    // The header holds an icon row (under the picture when there is one), not the addresses:
    // the envelope jumps to the footer's "Get in touch" section, where both emails are.
    const contact = page.locator('section.profile');
    await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(contact.getByRole('link', { name: 'Email', exact: true })).toHaveAttribute('href', '#contact');
    await expect(page.locator('footer #contact').getByRole('link', { name: profile.email })).toHaveAttribute('href', `mailto:${profile.email}`);
    await expect(contact.getByRole('link', { name: 'Google Scholar' })).toHaveAttribute('href', profile.links.scholar);
    await expect(contact.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', profile.links.linkedin);
    // The CV has no icon here; it stays in the main navigation.
    await expect(contact.getByRole('link', { name: 'CV' })).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Primary"] .nav-inline').getByRole('link', { name: 'CV' })).toHaveAttribute('href', /\/cv\/$/);
    // Unverified profiles are omitted rather than guessed.
    await expect(page.getByRole('link', { name: /github|orcid/i })).toHaveCount(0);
  });

  test('offers the pronunciation audio only when the file is published, and always the written guide', async ({ page, request }) => {
    const published = (await request.get('audio/fazle.wav')).ok();
    await page.goto('');
    await expect(page.locator('.pronunciation')).toContainText(profile.pronunciation);
    const expected = published ? 1 : 0;
    await expect(page.locator('[data-pronunciation-play]')).toHaveCount(expected);
    await expect(page.locator('[data-pronunciation-audio]')).toHaveCount(expected);
    if (published) await expect(page.locator('[data-pronunciation-play]')).toBeVisible();
  });

  test('shows that I am based in Marietta: a pin line under the affiliation on Home, and under the title on About', async ({ page }) => {
    await page.goto('');
    const where = page.locator('.profile .location');
    await expect(where).toHaveText(`Location: ${profile.location}`);
    await expect(where.locator('svg')).toBeVisible();
    const affiliation = (await page.locator('.profile .affiliation').boundingBox())!;
    const line = (await where.boundingBox())!;
    expect(line.y).toBeGreaterThanOrEqual(affiliation.y + affiliation.height - 1);
    // The same place is in the structured data, so search results can show it.
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const person = JSON.parse(blocks[0]!)['@graph'].find((node: { '@type': string }) => node['@type'] === 'Person');
    expect(person.homeLocation.name).toBe(profile.location);

    await page.goto(rel('/about/'));
    const aboutLine = page.locator('main .location');
    await expect(aboutLine).toHaveText(`Based in ${profile.location}`);
    const heading = (await page.getByRole('heading', { level: 1, name: 'About' }).boundingBox())!;
    expect((await aboutLine.boundingBox())!.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1);
    expect(profile.location).toContain('Marietta');
  });

  test('profile icons are solid marks with no frame, in 44px tap targets', async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('');
      const links = page.locator('.profile .icon-link');
      expect(await links.count()).toBeGreaterThanOrEqual(3);
      for (const link of await links.all()) {
        const box = (await link.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        // No border and no outlined frame: the mark is filled, not stroked.
        const style = await link.evaluate((element) => {
          const mark = element.querySelector('svg *')!;
          return { border: getComputedStyle(element).borderTopWidth, stroke: getComputedStyle(mark).stroke };
        });
        expect(style.border).toBe('0px');
        expect(style.stroke).toBe('none');
      }
    }
  });

  test('without a configured portrait it is a text-only block: no image, no empty column', async ({ page }) => {
    test.skip(Boolean(profile.portrait), 'A portrait is configured; see the portrait layout test below.');
    await page.goto('');
    await expect(page.locator('.profile img')).toHaveCount(0);
    // The profile icons stay with the identity block when there is no portrait to sit under.
    await expect(page.locator('.profile .identity .icon-link')).toHaveCount(3);
    const box = await page.locator('.profile').boundingBox();
    const heading = await page.locator('.profile h1').boundingBox();
    expect(Math.abs((heading?.x ?? 0) - (box?.x ?? 1))).toBeLessThan(2);
  });

  test.describe('with a configured portrait', () => {
    test.skip(!profile.portrait, 'No portrait is configured, so the text-only layout is shown.');

    test('sits on the right of the identity on desktop, above it on mobile, and is a rounded square with alt text', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('');
      const image = page.locator('.profile .portrait img');
      await expect(image).toHaveAttribute('alt', /.+/);
      await expect(image).toHaveAttribute('width', /\d+/);
      const photo = (await image.boundingBox())!;
      const identity = (await page.locator('.profile .identity').boundingBox())!;
      const profileBox = (await page.locator('.profile').boundingBox())!;
      expect(Math.round(photo.width)).toBe(160);
      // Right side: starts after the identity block and ends at the content's right edge.
      expect(photo.x).toBeGreaterThanOrEqual(identity.x + identity.width - 1);
      expect(Math.abs(photo.x + photo.width - (profileBox.x + profileBox.width))).toBeLessThan(2);
      // A square frame with smoothly rounded corners: rounded, but not a full circle.
      const radius = await image.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
      expect(parseFloat(radius)).toBeGreaterThan(0);
      expect(radius).not.toBe('50%');
      expect(Math.abs(photo.width - photo.height)).toBeLessThan(1);

      await page.setViewportSize({ width: 390, height: 900 });
      const small = (await image.boundingBox())!;
      const stackedName = (await page.locator('.profile h1').boundingBox())!;
      expect(Math.round(small.width)).toBeGreaterThanOrEqual(104);
      expect(Math.round(small.width)).toBeLessThanOrEqual(120);
      expect(stackedName.y).toBeGreaterThan(small.y + small.height);
      // Centred in the content column on mobile (equal space left and right).
      const column = (await page.locator('.profile').boundingBox())!;
      const leftGap = small.x - column.x;
      const rightGap = column.x + column.width - (small.x + small.width);
      expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);
    });

    test('puts the Email, Scholar and LinkedIn icons under the portrait, centred on it, and no addresses in the header', async ({ page }) => {
      for (const width of [1440, 640, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('');
        const photo = (await page.locator('.profile .portrait img').boundingBox())!;
        const profileBox = (await page.locator('.profile').boundingBox())!;
        const links = page.locator('.profile .portrait-links .icon-link');
        await expect(links).toHaveText(['', '', '']);
        expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))).toEqual([
          'Email',
          'Google Scholar',
          'LinkedIn',
        ]);
        const marks = page.locator('.profile .portrait-links .icon-link svg');
        const first = (await marks.first().boundingBox())!;
        const last = (await marks.last().boundingBox())!;
        // Below the picture, and centred on it.
        expect(first.y, `${width}px`).toBeGreaterThanOrEqual(photo.y + photo.height);
        expect(Math.abs((first.x + last.x + last.width) / 2 - (photo.x + photo.width / 2)), `${width}px`).toBeLessThan(2);
        // From 640px the photo stays flush with the content's right edge, and nothing is wider than the page.
        if (width >= 640) expect(Math.abs(photo.x + photo.width - (profileBox.x + profileBox.width)), `${width}px`).toBeLessThan(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`).toBe(true);
        // The identity block no longer holds icons or addresses.
        await expect(page.locator('.profile .identity .icon-link')).toHaveCount(0);
        await expect(page.locator('.profile a[href^="mailto:"]')).toHaveCount(0);
      }
    });

    test('the envelope icon jumps to the footer, where a person icon marks the personal address', async ({ page }) => {
      await page.goto('');
      await page.locator('.profile').getByRole('link', { name: 'Email', exact: true }).click();
      await expect(page).toHaveURL(/#contact$/);
      await expect(page.locator('footer #contact')).toBeInViewport();
      const personal = page.locator('footer #contact [data-email-kind="personal"] a svg');
      const school = page.locator('footer #contact [data-email-kind="school"] a svg');
      // Person glyph (circle + body) for the personal address, not an envelope; the school address keeps its own icon.
      expect(await personal.evaluate((svg) => [...svg.children].map((child) => child.tagName.toLowerCase()))).toEqual(['circle', 'path']);
      expect(await school.evaluate((svg) => [...svg.children].map((child) => child.tagName.toLowerCase()))).toEqual(['path']);
    });
  });

  test('puts the biography below the identity block, then follows the specified section order', async ({ page }) => {
    await page.goto('');
    const identity = await page.locator('.profile').boundingBox();
    const bio = await page.locator('.bio').boundingBox();
    expect((bio?.y ?? 0)).toBeGreaterThan((identity?.y ?? 0) + (identity?.height ?? 0) - 1);
    await expect(page.getByRole('link', { name: /All research/ })).toHaveAttribute('href', /\/research\/$/);

    expect(await headingTexts(page, 'h2')).toEqual([
      'Featured Research',
      'Publications',
      'Experience',
    ]);
    await expect(page.locator('footer h2')).toHaveText('Get in touch');
  });

  test('shows the PhD-availability statement as an announcement under the biography, and nowhere else', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    const shown = Boolean(site.showPhdAvailability && site.availabilityText && !(site.availabilityExpiresOn && site.availabilityExpiresOn < today));
    await page.goto('');
    const announcement = page.locator('.announcement');
    if (!shown) {
      await expect(announcement).toHaveCount(0);
      return;
    }
    await expect(announcement).toHaveCount(1);
    await expect(announcement).toContainText('Announcement');
    await expect(announcement).toContainText(site.availabilityText!);
    // Directly under the biography and above the first section.
    const bio = (await page.locator('.bio').boundingBox())!;
    const note = (await announcement.boundingBox())!;
    const research = (await page.locator('section[aria-labelledby="research"]').boundingBox())!;
    expect(note.y).toBeGreaterThanOrEqual(bio.y + bio.height);
    expect(note.y + note.height).toBeLessThanOrEqual(research.y);
    // Not repeated in the footer or on other pages.
    await expect(page.locator('footer')).not.toContainText(site.availabilityText!);
    await page.goto(rel('/about/'));
    await expect(page.locator('body')).not.toContainText(site.availabilityText!);
  });

  test('keeps the research status honest', async ({ page }) => {
    await page.goto('');
    const current = page.locator('section[aria-labelledby="research"] article').filter({ hasText: 'Multimodal agentic AI for hydroponic decision support' });
    await expect(current).toContainText('Multimodal agentic AI for hydroponic decision support');
    await expect(current).toContainText('Ongoing · Proposed MS thesis');
    await expect(current).toContainText('plant images, sensor readings, and relevant retrieved knowledge');
    await expect(page.locator('main')).not.toContainText(/PhD candidate|Dr\. Md/);
  });

  test('shows a Paper link on each featured project that has one, and none on the others', async ({ page }) => {
    await page.goto('');
    const rows = page.locator('section[aria-labelledby="research"] article');
    await expect(rows).toHaveCount(3);
    const found = await rows.evaluateAll((items) =>
      items.map((item) => ({
        title: item.querySelector('.row-title')?.textContent?.trim(),
        papers: [...item.querySelectorAll('a')].map((link) => link.getAttribute('href')),
      })),
    );
    const doi = (id: string) => `https://doi.org/${publications.find((publication) => publication.id === id)!.doi}`;
    expect(found).toEqual([
      { title: 'Multimodal agentic AI for hydroponic decision support', papers: [] },
      { title: 'DigiMindReady: AI-supported readiness and wellness', papers: [doi('digimindready-2026')] },
      { title: 'Machine learning for IoMT security', papers: ['https://ieeexplore.ieee.org/abstract/document/11120893'] },
    ]);
    await expect(rows.nth(1).getByRole('link', { name: /^Paper/ })).toBeVisible();
  });

  test('lists all three papers newest first with DOI links and no per-project links', async ({ page }) => {
    await page.goto('');
    const entries = page.locator('section[aria-labelledby="publications"] li.pub');
    await expect(entries).toHaveCount(3);
    expect(await entries.evaluateAll((items) => items.map((item) => item.id))).toEqual([
      'digimindready-2026',
      'vaccination-uptake-2026',
      'iomt-security-2025',
    ]);
    for (const publication of publications) {
      await expect(page.locator(`#${publication.id} h4 a`)).toHaveAttribute('href', `https://doi.org/${publication.doi}`);
      await expect(page.locator(`#${publication.id}`).getByRole('link', { name: /Research context/ })).toHaveCount(0);
    }
  });

  test('exposes Person JSON-LD with only verified profile links', async ({ page }) => {
    await page.goto('');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graph = JSON.parse(blocks[0]!)['@graph'];
    const person = graph.find((node: { '@type': string }) => node['@type'] === 'Person');
    expect(person.sameAs).toEqual([profile.links.scholar, profile.links.linkedin]);
    expect(person.name).toBe(profile.displayName);
    expect(person.jobTitle).toBe(experience.find((role) => role.kind === 'research' && role.end === null)?.title);
  });
});

test.describe('navigation', () => {
  test('marks the current page in the primary navigation', async ({ page }) => {
    for (const [route, label] of [
      ['/research/', 'Research'],
      ['/publications/', 'Publications'],
      ...(hasPublicEvents ? [['/events/', 'Talks & Events']] : []),
      ['/teaching/', 'Teaching'],
      ['/about/', 'About'],
      ['/cv/', 'CV'],
    ] as [string, string][]) {
      await page.goto(rel(route));
      const nav = page.locator('nav[aria-label="Primary"] .nav-inline');
      await expect(nav.getByRole('link')).toHaveText(NAV_LABELS);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    }
  });

  test('every header, breadcrumb and footer link resolves', async ({ page, request }) => {
    for (const route of ALL_PAGES) {
      await page.goto(rel(route));
      const hrefs = await page.locator('header a[href], footer a[href], nav[aria-label="Breadcrumb"] a[href]').evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      );
      for (const href of new Set(hrefs)) {
        if (!href.startsWith(new URL(page.url()).origin)) continue;
        const response = await request.get(href);
        expect(response.status(), `${route} → ${href}`).toBeLessThan(400);
      }
    }
  });

  test('skip link is the first tab stop and moves focus to main content', async ({ page }) => {
    await page.goto('');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('keyboard focus is always visible on links and controls', async ({ page }) => {
    await page.goto('publications/');
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(outline.style, `tab stop ${i}`).not.toBe('none');
      expect(outline.width).toBeGreaterThanOrEqual(2);
    }
  });

  test('mobile menu opens, closes with Escape, returns focus and closes after navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('');
    const menu = page.locator('details.nav-menu');
    const summary = menu.locator('summary');
    await expect(page.locator('.nav-inline')).toBeHidden();
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(menu).toHaveAttribute('open', '');
    await expect(menu.getByRole('link', { name: 'Publications' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();

    await summary.click();
    await menu.getByRole('link', { name: 'Teaching' }).click();
    await expect(page).toHaveURL(/\/teaching\/$/);
    await expect(page.locator('details.nav-menu')).not.toHaveAttribute('open', '');
    await expect(page.locator('details.nav-menu [aria-current="page"]')).toHaveText('Teaching');
  });
});

test.describe('publications and citations', () => {
  // Compared with the record, not a copy of its wording, so rewording a note does not break the test.
  const contribution = (id: string) => publications.find((record) => record.id === id)!.contribution;

  test('render the specified records with year groups, author emphasis and contribution notes', async ({ page }) => {
    await page.goto(rel('/publications/'));
    expect(await headingTexts(page, 'h2')).toEqual(['2026', '2025']);

    const military = page.locator('#digimindready-2026');
    await expect(military).toContainText('DigiMindReady: Enhancing Military Readiness');
    await expect(military.locator('.authors')).toHaveText(
      'M. M. Hasan, M. F. R. Rahat, N. Anjum, N. Sakib, and B. A. Moore',
    );
    await expect(military.locator('.authors strong')).toHaveText('M. F. R. Rahat');
    await expect(military.locator('.venue')).toContainText('Military Medicine, 191(9–10), e2039–e2048. 2026.');
    await expect(military.locator('.note')).toContainText(contribution('digimindready-2026'));

    const smart = page.locator('#vaccination-uptake-2026 .venue');
    await expect(smart).toContainText('Smart Health, 41, article 100665. 2026.');
    await expect(smart).not.toContainText('100665–');

    const chase = page.locator('#iomt-security-2025');
    await expect(chase.locator('.authors')).toHaveText('M. F. R. Rahat, M. M. Hasan, Z. Xie, and N. Sakib');
    await expect(chase.locator('.venue')).toContainText('(CHASE), 371–376. 2025. Conference paper');
    await expect(chase.locator('.note')).toContainText(contribution('iomt-security-2025'));
  });

  test('stable anchors scroll to the record', async ({ page }) => {
    await page.goto(rel('/publications/#iomt-security-2025'));
    await expect(page.locator('#iomt-security-2025')).toBeInViewport();
  });

  test('the Cite disclosure shows matching BibTeX with a download link', async ({ page }) => {
    await page.goto(rel('/publications/'));
    const entry = page.locator('#vaccination-uptake-2026');
    const details = entry.locator('details.cite');
    await expect(details).not.toHaveAttribute('open', '');
    await details.locator('summary').click();
    const bibtex = entry.locator('pre.bibtex');
    await expect(bibtex).toBeVisible();
    await expect(bibtex).toContainText('@article{hasan2026vaccination,');
    await expect(bibtex).toContainText('eid     = {100665}');
    await expect(bibtex).toContainText('doi     = {10.1016/j.smhl.2026.100665}');
    await expect(bibtex).not.toContainText('pages');
    await expect(entry.getByRole('link', { name: 'Download .bib' })).toHaveAttribute('href', /\/citations\/hasan2026vaccination\.bib$/);
  });

  test('the whole-bibliography download is offered', async ({ page }) => {
    await page.goto(rel('/publications/'));
    await expect(page.getByRole('link', { name: 'Download bibliography (.bib)' })).toHaveAttribute('href', /\/publications\.bib$/);
  });

  test('publication entries link only to the paper, the PDF and the citation', async ({ page }) => {
    await page.goto(rel('/publications/'));
    for (const publication of publications) {
      const entry = page.locator(`#${publication.id}`);
      await expect(entry.getByRole('link', { name: /Research context|case study/i })).toHaveCount(0);
      await expect(entry.getByRole('link', { name: /^\[?\s*Paper/ }).first()).toHaveAttribute('href', publication.publisherUrl ?? `https://doi.org/${publication.doi}`);
      await expect(entry.locator('.doi a')).toHaveAttribute('href', `https://doi.org/${publication.doi}`);
    }
  });
});

test.describe('clipboard enhancement', () => {
  test('copies BibTeX and announces success only after the write succeeds', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(rel('/publications/'));
    const entry = page.locator('#iomt-security-2025');
    await entry.locator('summary').click();
    const copy = entry.getByRole('button', { name: 'Copy BibTeX' });
    await expect(copy).toBeVisible();
    await expect(entry.getByRole('status')).toHaveText('');
    await copy.click();
    await expect(entry.getByRole('status')).toHaveText('BibTeX copied.');
    // The same message also appears as a visible bubble.
    await expect(page.locator('.copy-toast')).toHaveText('BibTeX copied.');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('@inproceedings{rahat2025iomt,');
    expect(clipboard).toContain('10.1145/3721201.3724412');
  });

  test('a denied clipboard says so, never claims success, and leaves the text selected', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
    await page.goto(rel('/publications/'));
    const entry = page.locator('#iomt-security-2025');
    await entry.locator('summary').click();
    await entry.getByRole('button', { name: 'Copy BibTeX' }).click();
    await expect(entry.getByRole('status')).toHaveText('Select and copy the citation below.');
    await expect(entry.getByRole('status')).not.toContainText(/copied/i);
    // The visible bubble is honest too: it never says "copied" when the write failed.
    await expect(page.locator('.copy-toast')).toHaveText('Select and copy the citation below.');
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toContain('@inproceedings{rahat2025iomt,');
    await expect(entry.locator('pre.bibtex')).toBeVisible();
  });

  test('an unavailable clipboard API leaves no copy button, only selectable text and a download', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await page.goto(rel('/publications/'));
    const entry = page.locator('#iomt-security-2025');
    await entry.locator('summary').click();
    await expect(entry.getByRole('button', { name: 'Copy BibTeX' })).toBeHidden();
    await expect(entry.locator('pre.bibtex')).toContainText('@inproceedings');
    await expect(entry.getByRole('link', { name: 'Download .bib' })).toBeVisible();
  });

  test('the email copy button follows the same rules', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('');
    await page.locator('#contact').getByRole('button', { name: 'Copy personal email' }).click();
    await expect(page.locator('#contact [data-email-kind="personal"]').getByRole('status')).toHaveText('Personal email address copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(profile.email);
  });

  test('a visible pop-up confirms a copy next to the button, hidden from screen readers, then goes away', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('');
      await expect(page.locator('.copy-toast')).toHaveCount(0);
      const button = page.locator('#contact').getByRole('button', { name: 'Copy personal email' });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      const toast = page.locator('.copy-toast');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveText('Personal email address copied.');
      await expect(toast).toHaveAttribute('aria-hidden', 'true');
      // Anchored to the button (not floating elsewhere) and fully inside the viewport.
      const anchor = (await button.boundingBox())!;
      const bubble = (await toast.boundingBox())!;
      expect(bubble.x, `${width}px`).toBeGreaterThanOrEqual(0);
      expect(bubble.x + bubble.width, `${width}px`).toBeLessThanOrEqual(width);
      expect(Math.abs(bubble.y + bubble.height - anchor.y), `${width}px`).toBeLessThan(40);
      // Clicking again replaces it rather than stacking a second bubble.
      await button.click();
      await expect(toast).toHaveCount(1);
      await expect(toast).toHaveCount(0, { timeout: 5000 });
    }
  });
});

test.describe('theme', () => {
  test('offers System, Light and Dark; persists across reloads; System clears the choice', async ({ page }) => {
    await page.goto('');
    const select = page.getByLabel('Theme');
    await expect(select).toBeVisible();
    expect(await select.locator('option').allTextContents()).toEqual(['System', 'Light', 'Dark']);

    await select.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe('rgb(28, 29, 32)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Theme')).toHaveValue('dark');

    await page.getByLabel('Theme').selectOption('light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(252, 252, 252)');

    await page.getByLabel('Theme').selectOption('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('applies the stored theme before first paint', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    await context.addInitScript(() => localStorage.setItem('theme', 'dark'));
    const page = await context.newPage();
    await page.goto('');
    const earlyTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(earlyTheme).toBe('dark');
    await context.close();
  });

  test('follows the system appearance by default', async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: 'dark' });
    const page = await dark.newPage();
    await page.goto('');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(28, 29, 32)');
    await dark.close();
  });

  test('blocked storage is harmless', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('');
    await expect(page.getByLabel('Theme')).toBeVisible();
    await page.getByLabel('Theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(errors).toEqual([]);
    await context.close();
  });
});

test('reduced motion removes transitions', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('');
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('a, button, summary')].map((element) => getComputedStyle(element).transitionDuration),
  );
  expect(new Set(durations)).toEqual(new Set(['0s']));
  await context.close();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('navigation, email, papers, citations, bibliography and CV remain usable', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('nav[aria-label="Primary"] .nav-inline').getByRole('link', { name: 'Research' })).toBeVisible();
    await expect(page.getByRole('link', { name: profile.email }).first()).toBeVisible();
    await expect(page.getByLabel('Theme')).toBeHidden();
    await expect(page.locator('#contact').getByRole('button', { name: 'Copy personal email' })).toBeHidden();

    await page.goto(rel('/publications/'));
    const entry = page.locator('#iomt-security-2025');
    await expect(entry.getByRole('link', { name: /^Paper/ })).toHaveAttribute('href', 'https://ieeexplore.ieee.org/abstract/document/11120893');
    await entry.locator('summary').click();
    await expect(entry.locator('pre.bibtex')).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Copy BibTeX' })).toBeHidden();
    await expect(entry.getByRole('link', { name: 'Download .bib' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download bibliography (.bib)' })).toBeVisible();

    await page.goto(rel('/cv/'));
    await expect(page.getByRole('link', { name: 'Open CV (PDF)' })).toBeVisible();
  });

  test('the mobile menu works as a native disclosure', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('');
    await page.locator('details.nav-menu summary').click();
    await page.locator('details.nav-menu').getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/about\/$/);
  });
});

test.describe('talks and events', () => {
  const publicEvents = events.filter((item) => !item.draft);
  const key = (date: string) => {
    const [year = '0', month = '0', day = '0'] = date.split('-');
    return Number(year) * 10000 + Number(month) * 100 + Number(day);
  };

  test('the page has its own route, heading and navigation entry once an event exists', async ({ page }) => {
    test.skip(publicEvents.length === 0, 'No events yet, so the hidden state is tested instead.');
    await page.goto(rel('/events/'));
    await expect(page.getByRole('heading', { level: 1, name: 'Talks and events' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"] .nav-inline [aria-current="page"]')).toHaveText('Talks & Events');
  });

  test('is hidden everywhere while there are no public events: no nav link, no page, no home section, no sitemap entry', async ({ page, request }) => {
    test.skip(publicEvents.length > 0, 'Events exist, so the populated layout is tested instead.');
    for (const route of ALL_PAGES) {
      await page.goto(rel(route));
      await expect(page.getByRole('link', { name: /talks/i }), route).toHaveCount(0);
      await expect(page.locator('a[href$="/events/"]'), route).toHaveCount(0);
    }
    await page.goto('');
    await expect(page.locator('#events')).toHaveCount(0);
    const response = await page.goto(rel('/events/'));
    expect(response?.status()).toBe(404);
    const sitemap = await request.get(rel('/sitemap-0.xml'));
    if (sitemap.ok()) expect(await sitemap.text()).not.toContain('/events/');
  });

  test('lists public events newest first, grouped by year, with the three newest on the home page', async ({ page }) => {
    test.skip(publicEvents.length === 0, 'No events yet, so the empty state is tested instead.');
    const ordered = [...publicEvents].sort((a, b) => key(b.start) - key(a.start));
    await page.goto(rel('/events/'));
    expect(await page.locator('li.event').evaluateAll((items) => items.map((item) => item.id))).toEqual(ordered.map((item) => item.id));
    for (const item of ordered) await expect(page.locator(`#${item.id}`)).toContainText(item.title);
    const years = [...new Set(ordered.map((item) => item.start.slice(0, 4)))];
    expect(await page.locator('main h2').allTextContents()).toEqual(years);

    await page.goto('');
    await expect(page.locator('#events')).toHaveText('Talks & events');
    await expect(page.locator('section[aria-labelledby="events"] li.event')).toHaveCount(Math.min(3, ordered.length));
  });
});

test.describe('academic pages', () => {
  test('About keeps expected graduation, proposed thesis and overlapping roles accurate', async ({ page }) => {
    await page.goto(rel('/about/'));
    const education = page.locator('section[aria-labelledby="education"]');
    await expect(education).toContainText('Master of Science in Information Technology');
    await expect(education).toContainText('January 2026 – Expected July 2027');
    await expect(education).toContainText('Proposed thesis: Agentic multimodal AI and retrieval-augmented decision support for hydroponic production systems');
    await expect(education).toContainText('Bachelor of Science in Computer Science & Engineering');
    await expect(education).toContainText('February 2020 – August 2025');
    await expect(education).not.toContainText(/GPA|honors|award/i);

    const research = page.locator('section[aria-labelledby="research-experience"]');
    await expect(research).toContainText('Graduate Research Assistant');
    await expect(research).toContainText('January 2026 – Present');
    await expect(research).toContainText('Advisor: Dr. Xu Tao');
    await expect(research).toContainText('January 2024 – July 2025');
    await expect(research).toContainText('Advisor: Dr. Mostofa Kamal Nasir');
    await expect(research).toContainText('October 2023 – November 2025');
    await expect(research).toContainText('Supervisor: Dr. Nazmus Sakib');
    // The About timeline is a short list of roles; the detailed bullets live on the CV and case-study pages.
    await expect(research.locator('ul.highlights')).toHaveCount(0);
    await expect(research.locator('p.note')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Natura Language');
  });

  test('Teaching lists the appointment and three courses in reverse term order', async ({ page }) => {
    await page.goto(rel('/teaching/'));
    await expect(page.locator('section[aria-labelledby="appointment"]')).toContainText('Department of Information Technology, Kennesaw State University · January 2026 – present');
    expect(await headingTexts(page, 'h3')).toEqual(['Fall 2026', 'Summer 2026']);
    const items = await page.locator('.courses li').allTextContents();
    expect(items.map((text) => text.split('·')[0]!.trim())).toEqual([
      'Ethical Hacking Defense',
      'OS Concepts & Administration',
      'Advanced Application Development',
    ]);
  });

  test('the CV page offers open/download links and file size without duplicate CV sections', async ({ page, request }) => {
    await page.goto(rel('/cv/'));
    const open = page.getByRole('link', { name: 'Open CV (PDF)' });
    const download = page.getByRole('link', { name: 'Download CV (PDF)' });
    await expect(open).toHaveAttribute('href', /\/files\/md-fazle-rabbi-rahat-cv\.pdf$/);
    await expect(download).toHaveAttribute('download', '');
    await expect(page.locator('.pdf .meta')).toContainText(`${Math.round(profile.cv.bytes / 1024)} KB`);
    await expect(page.locator('main')).not.toContainText('Reviewed');

    const response = await request.get((await open.getAttribute('href'))!);
    expect(response.status()).toBe(200);
    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBe(profile.cv.bytes);

    await expect(page.locator('main section, main nav')).toHaveCount(0);
    // Only the title and the PDF actions: the name, location and contact links live in the header and footer.
    await expect(page.locator('main a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(profile.displayName);
    await expect(page.locator('main')).not.toContainText('Marietta');
  });

  test('the printed CV drops site chrome and uses dark ink on white', async ({ page }) => {
    await page.goto(rel('/cv/'));
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(page.locator('header.site-header')).toBeHidden();
    await expect(page.locator('.pdf')).toBeVisible();
    const colors = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      fg: getComputedStyle(document.body).color,
    }));
    expect(colors.bg).toBe('rgb(255, 255, 255)');
    expect(colors.fg).toBe('rgb(17, 17, 17)');
  });
});

test.describe('research without case-study pages', () => {
  test('the per-project routes return 404 and no page links below /research/', async ({ page }) => {
    for (const route of REMOVED_CASE_STUDY_ROUTES) {
      const response = await page.goto(rel(route));
      expect(response?.status(), route).toBe(404);
    }

    for (const route of ALL_PAGES) {
      await page.goto(rel(route));
      const paths = await page.locator('a[href]').evaluateAll((anchors) =>
        anchors.map((anchor) => new URL((anchor as HTMLAnchorElement).href).pathname),
      );
      expect(paths.filter((path) => /\/research\/[^/]+/.test(path)), route).toEqual([]);
      await expect(page.getByRole('link', { name: /case study|research context/i }), route).toHaveCount(0);
    }
  });

  test('the research overview lists all five projects, with the ongoing one first', async ({ page }) => {
    await page.goto(rel('/research/'));
    // Titles are plain headings, not links; the only links on a row are papers.
    await expect(page.locator('main article .row-title a')).toHaveCount(0);
    await expect(page.locator('main')).toContainText('Ongoing · Proposed MS thesis');
    const titles = await page.locator('main article .row-title').allTextContents();
    expect(titles).toEqual([
      'Multimodal agentic AI for hydroponic decision support',
      'Medical language models under resource constraints',
      'Machine learning for IoMT security',
      'DigiMindReady: AI-supported readiness and wellness',
      'Context-aware mHealth for vaccination uptake',
    ]);
    expect(await headingTexts(page, 'h2')).toEqual(['Current research', 'Earlier research and collaborations']);
  });
});

test.describe('research areas', () => {
  const H = 'Multimodal agentic AI for hydroponic decision support';
  const M = 'Medical language models under resource constraints';
  const I = 'Machine learning for IoMT security';
  const D = 'DigiMindReady: AI-supported readiness and wellness';
  const G = 'Context-aware mHealth for vaccination uptake';
  // The owner's taxonomy: which projects belong to each highlighted term in the biography.
  const AREAS: [slug: string, label: string, titles: string[]][] = [
    ['natural-language-processing', 'natural language processing', [H, M, D]],
    ['large-language-models', 'large language models', [H, M, D]],
    ['multimodal-agentic-ai', 'multimodal agentic AI', [H, G]],
    ['ai-security-and-reliability', 'AI security and reliability', [H, I, D, G]],
    ['smart-healthcare', 'smart healthcare', [M, G]],
    ['medical-device-security', 'medical device security', [I, G]],
  ];

  const highlighted = (page: Page) =>
    page.locator('main .research-row.is-highlighted .row-title').allTextContents().then((titles) => titles.sort());

  test('every research term in the biography opens a link to its research on hover, and closes again', async ({ page }) => {
    await page.goto('');
    const terms = page.locator('.bio [data-interest-term]');
    expect(await terms.locator('[data-interest-trigger]').allTextContents()).toEqual(AREAS.map(([, label]) => label));
    for (const [index, [slug, label]] of AREAS.entries()) {
      const term = terms.nth(index);
      const popup = term.locator('.interest-popup');
      await expect(popup).toBeHidden();
      await term.locator('[data-interest-trigger]').hover();
      await expect(popup).toBeVisible();
      const link = popup.getByRole('link', { name: /See my research in this domain/ });
      await expect(link).toHaveAttribute('href', new RegExp(`/research/\\?area=${slug}$`));
      await expect(link).toContainText(label);
      // The pointer can travel from the term onto the link without the popup closing.
      await link.hover();
      await expect(popup).toBeVisible();
      await page.mouse.move(2, 2);
      await expect(popup).toBeHidden();
    }
  });

  test('the term is a keyboard button: focus opens it, Tab reaches the link, Escape closes it', async ({ page }) => {
    await page.goto('');
    const term = page.locator('.bio [data-interest-term]').first();
    const trigger = term.locator('[data-interest-trigger]');
    await expect(trigger).toHaveAttribute('role', 'button');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.focus();
    await expect(term.locator('.interest-popup')).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(term.getByRole('link', { name: /See my research in this domain/ })).toBeFocused();
    await expect(term.locator('.interest-popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(term.locator('.interest-popup')).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('a click or tap keeps the popup open until the next click, and every popup fits a phone screen', async ({ page }) => {
    // Where a term wraps depends on the font rendering, so a run of widths covers the terms near each edge.
    for (const width of [320, 340, 360, 375, 390, 412, 430, 480, 540, 600]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('');
      const terms = page.locator('.bio [data-interest-term]');
      for (let index = 0; index < (await terms.count()); index += 1) {
        const trigger = terms.nth(index).locator('[data-interest-trigger]');
        const popup = terms.nth(index).locator('.interest-popup');
        await trigger.click();
        await expect(popup).toBeVisible();
        const box = (await popup.boundingBox())!;
        expect(box.x, `popup ${index} at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `popup ${index} at ${width}px`).toBeLessThanOrEqual(width);
        await page.mouse.move(2, 2);
        await expect(popup).toBeVisible();
        await trigger.click();
        await expect(popup).toBeHidden();
      }
    }
  });

  test('following the link lands on the research page with that domain’s projects highlighted', async ({ page }) => {
    await page.goto('');
    const term = page.locator('.bio [data-interest-term]').nth(3);
    await term.locator('[data-interest-trigger]').hover();
    await term.getByRole('link', { name: /See my research in this domain/ }).click();
    await expect(page).toHaveURL(/\/research\/\?area=ai-security-and-reliability$/);
    await expect(page.locator('[data-area-note]')).toContainText('Highlighting 4 projects on AI security and reliability');
    expect(await highlighted(page)).toEqual([D, G, I, H].sort());
  });

  for (const [slug, label, titles] of AREAS) {
    test(`/research/?area=${slug} highlights exactly the projects in that area`, async ({ page }) => {
      await page.goto(rel(`/research/?area=${slug}`));
      expect(await highlighted(page)).toEqual([...titles].sort());
      const note = page.locator('[data-area-note]');
      await expect(note).toBeVisible();
      await expect(note).toContainText(`${titles.length} projects on ${label}`);
      // Highlighting never hides anything: all five projects stay on the page.
      await expect(page.locator('main article .row-title')).toHaveCount(5);
      await note.getByRole('link', { name: 'Show all research' }).click();
      await expect(page).toHaveURL(/\/research\/$/);
      expect(await highlighted(page)).toEqual([]);
    });
  }

  test('no area, or an unknown one, highlights nothing and shows no note', async ({ page }) => {
    for (const route of ['/research/', '/research/?area=', '/research/?area=cooking']) {
      await page.goto(rel(route));
      await expect(page.locator('main article .row-title')).toHaveCount(5);
      expect(await highlighted(page), route).toEqual([]);
      await expect(page.locator('[data-area-note]'), route).toBeHidden();
    }
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the terms stay plain highlighted text and the research page lists everything', async ({ page }) => {
      await page.goto('');
      await expect(page.locator('.bio [data-interest-trigger]')).toHaveCount(6);
      await expect(page.locator('.bio [role="button"]')).toHaveCount(0);
      await expect(page.locator('.bio .interest-popup').first()).toBeHidden();
      await page.goto(rel('/research/?area=smart-healthcare'));
      await expect(page.locator('main article .row-title')).toHaveCount(5);
      await expect(page.locator('[data-area-note]')).toBeHidden();
    });
  });
});

test.describe('responsive layout', () => {
  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [...ALL_PAGES, '/does-not-exist/']) {
        await page.goto(rel(route));
        for (const summary of await page.locator('details.cite summary').all()) await summary.click();
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `${route} at ${width}px`).toBeLessThanOrEqual(clientWidth);
      }
    });
  }

  test('long BibTeX and DOI strings stay inside the viewport at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(rel('/publications/'));
    for (const summary of await page.locator('details.cite summary').all()) await summary.click();
    for (const pre of await page.locator('pre.bibtex').all()) {
      const box = await pre.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    }
  });

  test('the home identity switches from inline to stacked navigation at the documented breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('');
    await expect(page.locator('.nav-inline')).toBeVisible();
    await expect(page.locator('details.nav-menu')).toBeHidden();
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.locator('.nav-inline')).toBeHidden();
    await expect(page.locator('details.nav-menu')).toBeVisible();
  });

  test('text is at least 13px everywhere it is visible', async ({ page }) => {
    for (const route of ['/', '/publications/', '/research/', '/cv/']) {
      await page.goto(rel(route));
      const tooSmall = await page.evaluate(() => {
        const small: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const element = node.parentElement;
          if (!element || !node.textContent?.trim() || element.closest('script,style,noscript,[hidden],.sr-only')) continue;
          if (element.closest('svg')) continue;
          if (!(element.offsetWidth || element.offsetHeight)) continue;
          const size = parseFloat(getComputedStyle(element).fontSize);
          if (size < 12.99) small.push(`${element.tagName} ${size}px "${node.textContent.trim().slice(0, 30)}"`);
        }
        return small;
      });
      expect(tooSmall, route).toEqual([]);
    }
  });
});

test.describe('tab icons', () => {
  test('are declared on every page, resolve, and have the documented sizes', async ({ page, request }) => {
    for (const route of ['/', '/research/', '/does-not-exist/']) {
      await page.goto(rel(route));
      const icons = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
        links.map((link) => (link as HTMLLinkElement).href),
      );
      expect(icons.map((href) => new URL(href).pathname.replace(/^.*\//, '')), route).toEqual(['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']);
    }

    await page.goto('');
    const fetchIcon = async (selector: string, type: RegExp) => {
      const href = await page.locator(selector).first().evaluate((link) => (link as HTMLLinkElement).href);
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      expect(response.headers()['content-type'] ?? '', href).toMatch(type);
      return response.body();
    };
    const svg = await fetchIcon('link[rel~="icon"][href$="favicon.svg"]', /svg/);
    const ico = await fetchIcon('link[rel~="icon"][href$="favicon.ico"]', /^image\//);
    const touch = await fetchIcon('link[rel="apple-touch-icon"]', /^image\//);

    expect(svg.toString()).toContain('<svg');
    // ICO: one real 32 px PNG image.
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico.readUInt8(6)).toBe(32);
    const offset = ico.readUInt32LE(6 + 12);
    expect(ico.subarray(offset, offset + 8).toString('hex')).toBe('89504e470d0a1a0a');
    const { width, height } = await sharp(touch).metadata();
    expect([width, height]).toEqual([180, 180]);
  });

  test('stay the simple monogram, not a photograph', async ({ request }) => {
    // A photo is unreadable at 16 px and is not good favicon practice, so the tab icon is a flat graphic.
    // A photograph has an entropy above 5; the two-colour monogram is far below.
    const response = await request.get(rel('/apple-touch-icon.png'));
    const { entropy } = await sharp(await response.body()).stats();
    expect(entropy).toBeLessThan(3);
  });
});

test.describe('metadata', () => {
  test('every page has a unique title and description', async ({ page }) => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const route of ALL_PAGES) {
      await page.goto(rel(route));
      titles.add(await page.title());
      descriptions.add((await page.locator('meta[name=description]').getAttribute('content')) ?? '');
    }
    expect(titles.size).toBe(ALL_PAGES.length);
    expect(descriptions.size).toBe(ALL_PAGES.length);
  });

  test('the publications page publishes an ItemList that matches the visible records', async ({ page }) => {
    await page.goto(rel('/publications/'));
    const json = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    expect(json['@type']).toBe('ItemList');
    expect(json.itemListElement.map((item: { item: { name: string } }) => item.item.name)).toEqual(
      await page.locator('.pub-title').allTextContents(),
    );
  });
});

test.describe('content security policy', () => {
  test('every page declares it, the site never violates it, and it blocks an injected script', async ({ page }) => {
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as unknown as { __violations: string[] }).__violations = log;
      addEventListener('securitypolicyviolation', (event) => {
        // WebKit reports this for any <select> under a policy, even on a page with no site code. Rendering is unaffected.
        if (event.target instanceof HTMLSelectElement && event.violatedDirective === 'style-src-attr') return;
        log.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    const violations = () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

    for (const route of ALL_PAGES) {
      await page.goto(rel(route), { waitUntil: 'networkidle' });
      await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveAttribute('content', /default-src 'none'/);
      expect(await violations(), route).toEqual([]);
    }

    await page.goto('', { waitUntil: 'networkidle' });
    const play = page.locator('[data-pronunciation-play]');
    if (await play.count()) {
      const audio = page.waitForResponse(/fazle\.wav/);
      await play.click();
      await audio;
    }
    await page.locator('.copy-email').first().click();
    await expect(page.locator('.copy-toast')).toBeVisible();
    await page.getByLabel('Theme').selectOption('dark');
    await page.locator('[data-interest-trigger]').first().click();
    expect(await violations()).toEqual([]);

    const executed = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true';
      document.head.append(script);
      return (window as unknown as { __injected?: boolean }).__injected === true;
    });
    expect(executed).toBe(false);
    await expect.poll(violations).toHaveLength(1);
  });
});

test.describe('layout stability', () => {
  // On a slow connection the page paints before its scripts run, so anything a script reveals near
  // the top must already have its space. Without JavaScript is exactly that first state.
  for (const width of [390, 412, 430, 640]) {
    test(`script enhancements do not move the home page at ${width}px`, async ({ browser, baseURL }) => {
      const tops = async (javaScriptEnabled: boolean) => {
        const context = await browser.newContext({ baseURL, javaScriptEnabled, viewport: { width, height: 844 } });
        const page = await context.newPage();
        await page.goto('', { waitUntil: 'networkidle' });
        const positions = await Promise.all(
          ['.preferred-name', '.role', '.affiliation', '.bio'].map(async (selector) => Math.round((await page.locator(selector).boundingBox())?.y ?? -1)),
        );
        await context.close();
        return positions;
      };
      expect(await tops(true)).toEqual(await tops(false));
    });
  }
});

// Keep the route list honest: every primary page appears in the header navigation.
test('primary routes match the header navigation', async ({ page }) => {
  await page.goto('');
  const hrefs = await page.locator('nav[aria-label="Primary"] .nav-inline a').evaluateAll((anchors) => anchors.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  const expected = PRIMARY_ROUTES.filter((route) => route !== '/');
  expect(hrefs.map((href) => href.replace(/^.*?(\/[a-z]+\/)$/, '$1'))).toEqual(expected);
});
