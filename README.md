# Md. Fazle Rabbi Rahat: academic website

Source for the academic website of Md. Fazle Rabbi Rahat: research, publications, teaching and CV. It is a static site built with [Astro](https://astro.build/), with no backend, forms, cookies, analytics or third-party scripts.

## Run it locally

You need Node.js 24 (see `.node-version`) and [pnpm](https://pnpm.io/) 12.

```bash
pnpm install
```

```bash
pnpm dev
```

The development server runs at `http://localhost:4321/`.

## Check it

The browser tests need Chromium, once:

```bash
pnpm exec playwright install chromium
```

```bash
pnpm verify
```

This validates the content, type-checks, runs the unit tests, builds the site, inspects the built output, and runs the browser and accessibility tests, at the root and under a sub-path.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/data/` | Profile, publications, experience, teaching, education, skills, events and site settings |
| `src/content/research/` | One file per research project |
| `src/pages/`, `src/components/` | Pages and shared components |
| `public/files/` | The CV. After replacing the PDF, run `pnpm cv:manifest -- --reviewed YYYY-MM-DD` |
| `scripts/`, `tests/` | Build helpers and tests |

## Deployment

The site deploys to GitHub Pages only when the **Deploy** workflow is run by hand; it never runs on push. It needs a `SITE_ORIGIN` repository variable, plus `SITE_BASE` for a project site.

## Copyright

© 2026 Md. Fazle Rabbi Rahat. All rights reserved. The biography, research descriptions, CV and portrait are personal material: please do not reuse them without permission. No open-source license is offered for this repository.

The Inter and Newsreader fonts remain under the SIL Open Font License. Their license texts are in `public/fonts/`.
