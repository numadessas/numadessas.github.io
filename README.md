<div align="center">

# ✦ Numa · Creative Tech

### *Digital Matter, Human Touch*

**Art · Design · Education in Emerging Technologies**

[![Live Site](https://img.shields.io/badge/live-numadessas.com.br-00e676?style=for-the-badge)](https://numadessas.com.br)
[![GitHub Pages](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-121013?style=for-the-badge&logo=github)](https://numadessas.github.io)
![Static Site](https://img.shields.io/badge/build-static%20HTML/CSS/JS-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)
![i18n](https://img.shields.io/badge/i18n-EN%20·%20PT%20·%20ES%20·%20DE-blueviolet?style=for-the-badge)

</div>

---

## 🌐 What is this

Personal website of **Numa (Manuella Godoy)** — designer, artist, researcher and educator from São Paulo. 13+ years in design, 5+ years in Web3. This repo is the **deployed source** of [numadessas.com.br](https://numadessas.com.br), a static site living on GitHub Pages.

The site spans four practices:

| Area | What lives there |
|------|------------------|
| 🎨 **Art** | Crypto-art universe — BR fauna/flora, hybrid dream creatures. Drawing, graffiti, sculpture, 3D, VR. On-chain galleries (Tezos + Solana). |
| 🖌️ **Design** | Visual branding, digital products, 3D illustration, UI/UX. |
| 🎵 **Music** | Beatmaking, audiovisual, releases (SoundCloud / Spotify). |
| 🎓 **Education** | Web3 & emerging-tech teaching and research. |

---

## ✨ Highlights

- **Interactive 3D hero** — compressed `.glb` model (`EuWebsite2026compressed.glb`) rendered in the browser.
- **4 languages** — EN (default), PT, ES, DE, via a globe-dropdown switch. Content driven by JSON dictionaries + `data-i18n` attributes.
- **Live on-chain art galleries** — artworks pulled from **Tezos** (objkt GraphQL) and **Solana** (mallow API), baked to local WebP + JSON at build time for speed.
- **Performance-first** — every image optimized to WebP (via `sharp`), video backgrounds compressed with `ffmpeg`.
- **Exhibitions CV** — 28 shows across 7 countries (🇧🇷 🇫🇷 🇩🇪 🇳🇱 🇦🇹 🇹🇭 🇨🇦) + metaverse.

---

## 🗂️ Structure

```
.
├── index.html              # Homepage — 3D hero
├── art.html                # Crypto-art + on-chain galleries
├── design.html
├── music.html
├── education.html
├── EuWebsite2026compressed.glb
├── assets/
│   ├── img/**              # favicons, logo, project covers, art thumbs
│   ├── lang/{en,pt,es,de}.json   # i18n dictionaries
│   └── data/*.json         # baked Tezos / Solana artwork data
├── scripts/
│   ├── fetch-tezos.mjs     # objkt GraphQL → local WebP + JSON
│   └── fetch-mallow.mjs    # mallow API → local WebP + JSON
└── CNAME                   # numadessas.com.br
```

---

## 🛠️ Stack

`HTML5` · `CSS3` · `Vanilla JS` · `Three.js` (GLB / 3D) · `GitHub Pages` · build helpers: `Node`, `sharp`, `ffmpeg`

No framework, no build step to deploy — push to `main`, GitHub Pages serves it.

---

## 🔗 Links

- 🌍 **Site** — [numadessas.com.br](https://numadessas.com.br)
- 🎨 **Tezos** — [objkt.com](https://objkt.com)
- 🟣 **Solana** — [mallow.art](https://mallow.art)

---

<div align="center">

*Made with digital matter and a human touch.* ✦

</div>
