#!/usr/bin/env node
/**
 * Bake Numa's Tezos (objkt) artworks into local WebP thumbnails + a JSON index,
 * so the Art page's Tezos gallery never depends on objkt's CDN at runtime
 * (which rate-limits bursts of hotlinked thumbnails).
 *
 * Public objkt GraphQL — no API key needed.
 *
 * Usage:  node scripts/fetch-tezos.mjs
 * Optional env: TEZOS_LIMIT (default 40)
 *
 * Requires `sharp` (install once in a temp dir and point NODE_PATH at it,
 * or run from a folder where it's installed). Writes:
 *   assets/img/art/tezos/tz-<n>.webp
 *   assets/data/tezos-artworks.json
 */
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch { console.error('\n  Missing "sharp". Install it and re-run (e.g. `npm i sharp`).\n'); process.exit(1); }

const TZ = 'tz1fLdyJqakB3v9CQN8mLCFRxNfFThmYHGmo';
const LIMIT = Number(process.env.TEZOS_LIMIT || 40);
const __dirname = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = resolve(__dirname, '../assets/img/art/tezos');
const OUT_JSON = resolve(__dirname, '../assets/data/tezos-artworks.json');

const query = `query($addr:String!,$lim:Int!){
  token(where:{creators:{creator_address:{_eq:$addr}}, supply:{_gt:0}}, order_by:{timestamp:desc}, limit:$lim){
    name fa_contract token_id
  }
}`;

async function main() {
  const res = await fetch('https://data.objkt.com/v3/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { addr: TZ, lim: LIMIT } }),
  });
  const json = await res.json();
  const toks = (json && json.data && json.data.token) || [];
  if (toks.length === 0) { console.error('  No tokens returned.'); process.exit(1); }

  await mkdir(IMG_DIR, { recursive: true });
  // clear old baked thumbnails
  for (const f of await readdir(IMG_DIR)) {
    if (f.startsWith('tz-') && f.endsWith('.webp')) await unlink(resolve(IMG_DIR, f));
  }

  const out = [];
  let i = 0;
  for (const tk of toks) {
    const cdn = 'https://assets.objkt.media/file/assets-003/' + tk.fa_contract + '/' + tk.token_id + '/thumb400';
    try {
      const r = await fetch(cdn); // sequential — no burst, no rate-limit
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const name = 'tz-' + i + '.webp';
      await sharp(buf).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(resolve(IMG_DIR, name));
      out.push({
        name: tk.name || 'Untitled',
        image: 'assets/img/art/tezos/' + name,
        link: 'https://objkt.com/tokens/' + tk.fa_contract + '/' + tk.token_id,
      });
      i++;
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('\n  ✓ Baked ' + out.length + ' Tezos artworks → ' + OUT_JSON);
}

main().catch(e => { console.error('\n  ✗ Failed:', e.message, '\n'); process.exit(1); });
