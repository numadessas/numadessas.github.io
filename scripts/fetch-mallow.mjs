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
const DETAIL_ENDPOINT = 'https://api.mallow.art/v1/artworks/'; // + mintAccount

// The "Gate Nu" collection has 60+ pieces — showing them all floods the gallery
// and buries the other collections. Keep just one representative on the site.
const GATENU_COLLECTION = 'Gate Nu';   // collection name (from detail endpoint)
const GATENU_SYMBOL = 'GTN';           // metadata symbol (works for unlisted pieces too)
const GATENU_KEEP = 1;

// Known collection-cover mints to always drop, in case a collection has no
// currently-listed member to reveal it automatically (see coverMints below).
const COVER_MINTS_SEED = [
  '4NprtT79D4keNXEE7AVRaCSbmEWTN6SDu1QGirCD5Q8m', // "Eventos Científicos" cover
];

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

// mallow's `creator` field is the shop/mint wallet — it reads as Numa for
// everything she has listed, including pieces she only collected. The reliable
// signal for authorship is the royalty split: her created works (and collabs
// she's part of) pay royalties to her wallet; collected works pay the original
// artist. Keep only artworks where she is a royalty recipient.
const isAuthoredByNuma = a =>
  Array.isArray(a?.royalties?.shares) &&
  a.royalties.shares.some(s => s.address === CREATOR && s.verified);

// Fetch a single artwork's detail → its collection { name, mint }. mallow 404s
// for pieces that aren't currently listed (that's NOT a cover signal — real
// unlisted works 404 too), so a 404 just means "no collection info from here".
async function fetchDetail(mint) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(DETAIL_ENDPOINT + mint, {
        headers: { 'x-api-key': API_KEY },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 404) return { name: null, mint: null };
      if (!res.ok) throw new Error('detail ' + res.status);
      const col = (await res.json())?.result?.collection || {};
      return { name: col.name || null, mint: col.mintAccount || null };
    } catch (e) {
      if (attempt === 2) return { name: null, mint: null };
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

// Fetch a piece's off-chain metadata symbol (static on IPFS, so available even
// when the piece is unlisted). Used to group the "Gate Nu" pieces (symbol GTN).
async function fetchSymbol(metadataUrl) {
  const url = String(metadataUrl).replace('ipfs://', 'https://ipfs.io/ipfs/');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('meta ' + res.status);
      return ((await res.json()).symbol || '').trim();
    } catch (e) {
      if (attempt === 1) return '';
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// Run an async mapper over items with limited concurrency.
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function main() {
  // Walk the byCreator pages a few times and dedup — mallow's "recently-listed"
  // order shifts between page reads, so a single walk drops items.
  const seen = new Map();
  for (let pass = 0; pass < 3; pass++) {
    for (let page = 0; page < MAXPAGES; page++) {
      const batch = await fetchPage(page);
      if (batch.length === 0) break;
      batch.forEach(a => { if (a && a.mintAccount) seen.set(a.mintAccount, a); });
      if (batch.length < PAGESIZE) break; // last page
    }
  }

  const authored = [...seen.values()].filter(a => a.imageUrl && isAuthoredByNuma(a));

  // For each piece resolve (a) its collection name/mint via the detail endpoint
  // and (b) its metadata symbol. Collection covers are exactly the mints that
  // pieces point to as their `collection.mintAccount` — collect those and drop
  // any item that *is* one (plus the seed list, for collections with no listed
  // member to reveal them).
  const meta = await pool(authored, 12, async a => ({
    detail: await fetchDetail(a.mintAccount),
    symbol: await fetchSymbol(a.metadataUrl),
  }));

  const coverMints = new Set(COVER_MINTS_SEED);
  meta.forEach(m => { if (m.detail.mint) coverMints.add(m.detail.mint); });

  const isGateNu = (a, m) => m.symbol === GATENU_SYMBOL || m.detail.name === GATENU_COLLECTION;

  const covers = [];
  const seenNames = new Set();   // collapse editions — same artwork minted many times
  let gatenuKept = 0, gatenuDropped = 0, editionDupes = 0;
  const kept = [];
  authored.forEach((a, idx) => {
    const m = meta[idx];
    if (coverMints.has(a.mintAccount)) { covers.push(a.name); return; } // a collection cover, not a piece
    if (isGateNu(a, m)) {
      if (gatenuKept >= GATENU_KEEP) { gatenuDropped++; return; }
      gatenuKept++;
    }
    const key = (a.name || '').trim().toLowerCase();
    if (key && seenNames.has(key)) { editionDupes++; return; } // keep one per artwork
    seenNames.add(key);
    kept.push(a);
  });

  const clean = kept.map(a => ({
    mintAccount: a.mintAccount || null,
    name: a.name || 'Untitled',
    image: cdnImage(a.imageUrl),
    url: a.url || (a.mintAccount ? 'https://mallow.art/artwork/' + a.mintAccount : 'https://mallow.art'),
  }));

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(clean, null, 2) + '\n', 'utf8');
  console.log(`  ✓ Wrote ${clean.length} artwork(s) → ${OUT}`);
  console.log(`    (dropped ${covers.length} collection cover(s), ${gatenuDropped} extra "${GATENU_COLLECTION}" piece(s), ${editionDupes} edition duplicate(s))`);
  if (covers.length) console.log('    covers:', covers.join(', '));
}

main().catch(err => {
  console.error('\n  ✗ Failed:', err.message, '\n');
  process.exit(1);
});
