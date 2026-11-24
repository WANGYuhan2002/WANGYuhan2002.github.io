# wangyuhan2002.github.io

Personal homepage of Yuhan Wang (Seismology & Wave Physics group, ETH Zürich).

**Live:** https://wangyuhan2002.github.io/

## Status: choosing a design

The site root is a temporary picker that links to the design drafts:

| Path | Draft |
|------|-------|
| `/drafts/v2a/` | Dark & interactive: a live 2-D wave simulation, click anywhere to make an earthquake |
| `/drafts/v2a/lab/` | Wave Lab for v2a: six experiments (playground, arrays & DAS, time reversal, tomography, ambient noise, elastic P-SV) on one solver |
| `/drafts/v2b/` | Warm scrapbook: paper, polaroids, sticky notes, a ticket stub and a postcard |
| `/drafts/v2c/` | Clean blog layout modelled on kaichu.io (Hugo LoveIt): posts archive, tag cloud, about page, post page with TOC, search, light/dark |
| `/drafts/v3a/` | FIBRE: the page is the cable. The Kefalonia–Ithaca route in 3-D, click to make an earthquake, a live 1872-channel DAS waterfall |
| `/drafts/v3b/` | PLAKAT: Swiss poster. The real seismogram of the 2025 M 8.8 Kamchatka earthquake (station CH.SULZ) moves the letters of the name |
| `/drafts/v3c/` | 地听: a horizontal ink handscroll painted in code; ridgelines follow the real seismogram, a vermilion fibre runs under the water |
| `/drafts/v3d/` | LIVE EARTH: bento observatory with a live globe of the past week's earthquakes (USGS feed) and their travel times to Zürich |
| `/drafts/v3e/` | INVISIBLE: a live star-trail sky that descends under the ground, then the photographs |
| `/drafts/v3f/` | WIGGLE: the name as a variable-area wiggle plot; click to fire a shot; the right edge records the scroll |

The v3 drafts share `drafts/v3-shared/`: portrait, seal, photographs, figures from the public repositories, and three
data files (`data/seismogram.js` real waveform, `data/geo.js` coastlines, travel times and an earthquake snapshot,
`data/cable.js` the Kefalonia–Ithaca cable). The chosen draft takes the files it uses with it.

Each draft is a self-contained `index.html` with no build step (v2a loads its solver from `drafts/v2a/js/`:
`wave-models.js` velocity models, `wave-engine.js` finite-difference solvers on the CPU and on the GPU via WebGL2,
`hero.js` the homepage wavefield, `lab.js` + `lab-chapters.js` the Wave Lab). Drafts carry
`<meta name="robots" content="noindex">` and `/drafts/` is disallowed in `robots.txt`.
Once a design is chosen, it replaces the root `index.html` and `/drafts/` is deleted.

`.nojekyll` makes GitHub Pages serve the files as they are.
