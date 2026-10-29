#!/usr/bin/env node
/**
 * Generates a hero image for a specific blog post using the app's generateImage API.
 * Builds the prompt from the post's title + excerpt.
 * Saves to public/blog-images/{slug}.png
 *
 * Usage:
 *   node scripts/generate-blog-images.mjs <slug>
 *
 * Example:
 *   node scripts/generate-blog-images.mjs how-to-use-ai-recipe-generators-guide
 *
 * Prerequisites:
 * - Dev server must be running: npm run dev
 * - OPENAI_API_KEY must be set in .env.local
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE || "http://localhost:3001";
const OUTPUT_DIR = join(__dirname, "..", "public", "blog-images");
const POSTS_DATA_PATH = join(__dirname, "..", "app", "blog", "posts-data.json");

function buildImagePrompt(title, excerpt) {
  return `Photorealistic food photography for a blog article. Article title: "${title}". Article summary: ${excerpt}. Create an appetizing, professional food image that visually represents this topic. Warm natural lighting, clean composition, shareable food blog aesthetic. No text in the image.`;
}

async function generateBlogImage(slug, prompt) {
  const recipeId = `blog-${slug}`;
  const res = await fetch(`${API_BASE}/api/generateImage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      recipeId,
      styleOverride: "photorealistic-recipe",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`API error ${res.status}: ${err.error || err.message || res.statusText}`);
  }

  const { imageUrl } = await res.json();
  if (!imageUrl) throw new Error("No imageUrl in response");

  const imgRes = await fetch(new URL(imageUrl, API_BASE));
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return buffer;
}

async function generateOne(slug, posts) {
  const post = posts.find((p) => p.slug === slug);
  if (!post) return;
  const prompt = buildImagePrompt(post.title, post.excerpt);
  const buffer = await generateBlogImage(slug, prompt);
  const outPath = join(OUTPUT_DIR, `${slug}.png`);
  writeFileSync(outPath, buffer);
  console.log(`✓ ${slug}`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/generate-blog-images.mjs <slug>");
    console.error("       node scripts/generate-blog-images.mjs --all");
    console.error("Example: node scripts/generate-blog-images.mjs ai-recipe-generator-comparison");
    process.exit(1);
  }

  let posts;
  try {
    const raw = readFileSync(POSTS_DATA_PATH, "utf-8");
    posts = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read posts data from ${POSTS_DATA_PATH}:`, err.message);
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created ${OUTPUT_DIR}`);
  }

  if (arg === "--all") {
    console.log(`Generating images for ${posts.length} posts...\n`);
    for (let i = 0; i < posts.length; i++) {
      const slug = posts[i].slug;
      try {
        await generateOne(slug, posts);
      } catch (err) {
        console.error(`✗ ${slug}: ${err.message}`);
      }
      if (i < posts.length - 1) await new Promise((r) => setTimeout(r, 2000));
    }
    console.log("\nDone.");
    return;
  }

  const slug = arg;
  const post = posts.find((p) => p.slug === slug);
  if (!post) {
    console.error(`Post not found: ${slug}`);
    console.error("Valid slugs:", posts.map((p) => p.slug).join(", "));
    process.exit(1);
  }

  const prompt = buildImagePrompt(post.title, post.excerpt);
  console.log("Generating blog post image...");
  console.log(`Slug: ${slug}`);
  console.log(`Title: ${post.title}`);
  console.log(`Prompt: ${prompt.slice(0, 120)}...`);
  console.log(`Output: ${OUTPUT_DIR}/${slug}.png\n`);

  try {
    await generateOne(slug, posts);
    console.log(`✓ Saved ${join(OUTPUT_DIR, `${slug}.png`)}`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
