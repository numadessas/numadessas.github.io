#!/usr/bin/env node
/**
 * Fetch Numa's on-chain artworks from the mallow API and bake them into
 * assets/data/mallow-artworks.json (read by art.html at runtime).
 *
 * The API key NEVER ships to the browser — it only lives here, at build time.
 *
 * Usage (PowerShell):
 *   $env:MALLOW_API_KEY="your_key"; $env:MALLOW_CREATOR="your_wallet"; node scripts/fetch-mallow.mjs
 *
 * Usage (bash):
 *   MALLOW_API_KEY=your_key MALLOW_CREATOR=your_wallet node scripts/fetch-mallow.mjs
 *
 * Optional env:
 *   MALLOW_SORT      default "recently-listed"
 *   MALLOW_PAGESIZE  default 30 (max 30 per mallow)
 *   MALLOW_MAXPAGES  default 5  (how many pages to walk, 30 each)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Numa's public Solana creator address (mallow runs on Solana). Override with MALLOW_CREATOR if needed.
const DEFAULT_CREATOR = 'FJ7qcPXNCX9atyFU6xz78G8VMUyKUdyNkRU9ACgxpydK';

const API_KEY  = process.env.MALLOW_API_KEY;
const CREATOR  = process.env.MALLOW_CREATOR || DEFAULT_CREATOR;
const SORT     = process.env.MALLOW_SORT || 'recently-listed';
const PAGESIZE = Math.min(Number(process.env.MALLOW_PAGESIZE || 30), 30);
const MAXPAGES = Number(process.env.MALLOW_MAXPAGES || 12);

// mallow's own image CDN (fast, resized) instead of raw ipfs.io (slow/unreliable).
function cdnImage(imageUrl) {
  const m = String(imageUrl).match(/(?:ipfs:\/\/|\/ipfs\/)([^/?#]+)(\/.*)?$/i);
  if (!m) return imageUrl;
  const path = m[1] + (m[2] || '');
  return 'https://images.mallow.art/600x600/inside/' + encodeURIComponent('ipfs://' + path) + '?still=true&quality=70';
}

const ENDPOINT = 'https://api.mallow.art/v1/artworks/byCreator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../assets/data/mallow-artworks.json');

if (!API_KEY) {
  console.error('\n  Missing MALLOW_API_KEY (get it from the mallow team via Discord/email).');
  console.error('  PowerShell: $env:MALLOW_API_KEY="..."; node scripts/fetch-mallow.mjs');
  console.error('  Creator wallet defaults to ' + DEFAULT_CREATOR + ' (override with MALLOW_CREATOR).\n');
  process.exit(1);
}

async function fetchPage(page) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      page,
      pageSize: PAGESIZE,
      sort: SORT,
      filter: { creator: CREATOR },
    }),
  });
  if (!res.ok) {
    throw new Error(`mallow API ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const json = await res.json();
  return Array.isArray(json.result) ? json.result : [];
}

async function main() {
  const all = [];
  for (let page = 0; page < MAXPAGES; page++) {
    const batch = await fetchPage(page);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGESIZE) break; // last page
  }

  // mallow's `creator` field is the shop/mint wallet — it reads as Numa for
  // everything she has listed, including pieces she only collected. The reliable
  // signal for authorship is the royalty split: her created works (and collabs
  // she's part of) pay royalties to her wallet; collected works pay the original
  // artist. Keep only artworks where she is a royalty recipient.
  const isAuthoredByNuma = a =>
    Array.isArray(a?.royalties?.shares) &&
    a.royalties.shares.some(s => s.address === CREATOR && s.verified);

  // Keep only the fields the page needs.
  const clean = all
    .filter(a => a && a.imageUrl && isAuthoredByNuma(a))
    .map(a => ({
      mintAccount: a.mintAccount || null,
      name: a.name || 'Untitled',
      image: cdnImage(a.imageUrl),
      url: a.url || (a.mintAccount ? 'https://mallow.art/artwork/' + a.mintAccount : 'https://mallow.art'),
    }));

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(clean, null, 2) + '\n', 'utf8');
  console.log(`  ✓ Wrote ${clean.length} artwork(s) → ${OUT}`);
}

main().catch(err => {
  console.error('\n  ✗ Failed:', err.message, '\n');
  process.exit(1);
});
