// Resolves image paths named in content records (relative to src/assets) to
// Astro-processed image metadata. A missing file yields undefined so callers can
// apply their documented fallback; validate-content reports the mismatch.
import type { ImageMetadata } from 'astro';

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/**/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
});

export function resolveImage(src: string | undefined): ImageMetadata | undefined {
  if (!src) return undefined;
  return images[`/src/assets/${src}`]?.default;
}
