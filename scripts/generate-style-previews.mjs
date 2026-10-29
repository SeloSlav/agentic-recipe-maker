#!/usr/bin/env node
/**
 * Generates sarma preview images for recipe image styles using the app's API.
 *
 * Usage:
 *   node scripts/generate-style-previews.mjs              # generate all 10 styles
 *   node scripts/generate-style-previews.mjs instagram-flatlay   # redo one style
 *   node scripts/generate-style-previews.mjs dark-moody vintage-retro   # redo multiple
 *
 * Prerequisites:
 * - Dev server must be running: npm run dev
 * - OPENAI_API_KEY must be set in .env.local
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const OUTPUT_DIR = join(__dirname, '..', 'public', 'style-previews');

const ALL_STYLES = [
  'photorealistic-recipe',
  'instagram-flatlay',
  'bright-viral',
  'dark-moody',
  'pinterest-cozy',
  'minimalist-white',
  'golden-hour',
  'street-food',
  'vintage-retro',
  'whimsical-cartoon',
];

const SARMA_PROMPT = 'sarma, traditional stuffed cabbage rolls with rice and meat';

async function generateStylePreview(style) {
  const recipeId = `style-preview-sarma-${style}`;
  const res = await fetch(`${API_BASE}/api/generateImage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: SARMA_PROMPT,
      recipeId,
      styleOverride: style,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error || err.message || res.statusText}`);
  }

  const { imageUrl } = await res.json();
  if (!imageUrl) throw new Error('No imageUrl in response');

  const imgRes = await fetch(new URL(imageUrl, API_BASE));
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return buffer;
}

function parseStyles() {
  const args = process.argv.slice(2).map((s) => s.toLowerCase());
  if (args.length === 0) return ALL_STYLES;
  const invalid = args.filter((s) => !ALL_STYLES.includes(s));
  if (invalid.length) {
    console.error(`Unknown style(s): ${invalid.join(', ')}`);
    console.error('Valid styles:', ALL_STYLES.join(', '));
    process.exit(1);
  }
  return args;
}

async function main() {
  const styles = parseStyles();
  console.log('Generating style preview images for sarma...');
  console.log(`API: ${API_BASE}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Styles: ${styles.join(', ')}\n`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created ${OUTPUT_DIR}`);
  }

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const outPath = join(OUTPUT_DIR, `${style}.png`);
    try {
      console.log(`[${i + 1}/${styles.length}] Generating ${style}...`);
      const buffer = await generateStylePreview(style);
      writeFileSync(outPath, buffer);
      console.log(`  ✓ Saved ${outPath}`);
    } catch (err) {
      console.error(`  ✗ ${style}: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
