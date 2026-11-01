import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ALL_PAGES, rel } from './helpers';

// Automated axe checks cover the rule set below. They support, but do not replace,
// a manual keyboard / zoom / screen-reader review.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function expandDisclosures(page: Page) {
  // Check the disclosed content too: citations, the on-page TOC and the mobile menu.
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) details.open = true;
  });
}

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
  }));
}

for (const scheme of ['light', 'dark'] as const) {
  for (const viewport of viewports) {
    test.describe(`${scheme} / ${viewport.name}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: viewport.width, height: viewport.height } });

      for (const route of [...ALL_PAGES, '/does-not-exist/']) {
        test(`${route} has no axe violations`, async ({ page }) => {
          await page.goto(rel(route));
          await expandDisclosures(page);
          expect(await audit(page)).toEqual([]);
        });
      }
    });
  }
}

// The research-area states only exist after interaction or with a query string, so the page loop above never sees them.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`research areas / ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('an open term popup on Home has no axe violations', async ({ page }) => {
      await page.goto('');
      await page.locator('[data-interest-trigger]').first().hover();
      await expect(page.locator('.interest-popup').first()).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    test('highlighted projects and the note on the research page have no axe violations', async ({ page }) => {
      await page.goto(rel('/research/?area=ai-security-and-reliability'));
      await expect(page.locator('[data-area-note]')).toBeVisible();
      await expect(page.locator('.research-row.is-highlighted')).toHaveCount(4);
      expect(await audit(page)).toEqual([]);
    });
  });
}

test.describe('explicit theme choice', () => {
  for (const choice of ['light', 'dark'] as const) {
    test(`${choice} chosen against the opposite system appearance has no violations`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: choice === 'dark' ? 'light' : 'dark' });
      await context.addInitScript((value) => localStorage.setItem('theme', value), choice);
      const page = await context.newPage();
      for (const route of ['/', '/publications/', '/research/']) {
        await page.goto(rel(route));
        await expect(page.locator('html')).toHaveAttribute('data-theme', choice);
        await expandDisclosures(page);
        expect(await audit(page), route).toEqual([]);
      }
      await context.close();
    });
  }
});

test.describe('structure', () => {
  test('headings never skip a level and landmarks are unique', async ({ page }) => {
    for (const route of ALL_PAGES) {
      await page.goto(rel(route));
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
          .filter((heading) => (heading as HTMLElement).offsetParent !== null || heading.closest('details'))
          .map((heading) => Number(heading.tagName[1])),
      );
      for (let i = 1; i < levels.length; i += 1) {
        expect(levels[i]! - levels[i - 1]!, `${route}: h${levels[i - 1]} → h${levels[i]}`).toBeLessThanOrEqual(1);
      }
      expect(levels[0]).toBe(1);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('header.site-header')).toHaveCount(1);
      await expect(page.locator('footer.site-footer')).toHaveCount(1);
    }
  });

  test('every link has a discernible, non-generic name', async ({ page }) => {
    for (const route of ALL_PAGES) {
      await page.goto(rel(route));
      const names = await page.getByRole('link').evaluateAll((anchors) =>
        // The accessible name: aria-label for icon-only links, otherwise the visible text.
        anchors.map((anchor) => (anchor.getAttribute('aria-label') ?? anchor.textContent ?? '').replace(/\s+/g, ' ').trim()),
      );
      expect(names.filter((name) => name === '' || /^(click here|here|more|read more)$/i.test(name)), route).toEqual([]);
    }
  });

  test('interactive targets are at least 24px and primary controls reach 44px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/', '/publications/']) {
      await page.goto(rel(route));
      await page.locator('details.nav-menu summary').click();
      const small = await page.evaluate(() => {
        const bad: string[] = [];
        for (const element of document.querySelectorAll('summary, button, select, nav a, .link-arrow, .button')) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          // The "Md." fun-fact trigger is inline text inside the heading, so it only has to meet the 24px minimum (WCAG 2.5.8 inline exception).
          const minimum = element.matches('.name-fact-trigger') ? 24 : 43.5;
          if (box.height < minimum) bad.push(`${element.tagName} "${(element.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.height)}px`);
        }
        return bad;
      });
      expect(small, route).toEqual([]);
    }
  });
});
