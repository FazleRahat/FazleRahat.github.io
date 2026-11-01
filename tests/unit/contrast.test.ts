import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// WCAG 2.x relative luminance and contrast ratio for the semantic color tokens.
const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}
// First :root block is light; the dark values live in the data-theme="dark" block.
const light = tokens(css.slice(css.indexOf(':root {'), css.indexOf('--font-sans')));
const dark = tokens(css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf(":root[data-theme='light']")));

const channel = (value: number) => {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

for (const [name, palette] of [['light', light], ['dark', dark]] as const) {
  describe(`${name} palette`, () => {
    it('defines every semantic token', () => {
      for (const key of ['bg', 'surface', 'text', 'muted', 'accent', 'accent-soft', 'border', 'on-accent', 'control']) {
        assert.ok(palette[key], `${name}: --color-${key}`);
      }
    });

    it('meets 4.5:1 for body, muted and link text on every surface it is used on', () => {
      for (const surface of ['bg', 'surface', 'accent-soft']) {
        assert.ok(ratio(palette.text!, palette[surface]!) >= 4.5, `text on ${surface}`);
        assert.ok(ratio(palette.muted!, palette[surface]!) >= 4.5, `muted on ${surface}: ${ratio(palette.muted!, palette[surface]!).toFixed(2)}`);
        assert.ok(ratio(palette.accent!, palette[surface]!) >= 4.5, `accent on ${surface}: ${ratio(palette.accent!, palette[surface]!).toFixed(2)}`);
      }
    });

    it('meets 4.5:1 for text on a filled accent action', () => {
      assert.ok(ratio(palette['on-accent']!, palette.accent!) >= 4.5, ratio(palette['on-accent']!, palette.accent!).toFixed(2));
    });

    it('meets 3:1 for control boundaries and focus indicators against the page', () => {
      assert.ok(ratio(palette.control!, palette.bg!) >= 3, `control ${ratio(palette.control!, palette.bg!).toFixed(2)}`);
      assert.ok(ratio(palette.accent!, palette.bg!) >= 3, 'focus ring (accent)');
    });
  });
}
