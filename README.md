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

Each draft is a self-contained `index.html` with no build step (v2a loads its solver from `drafts/v2a/js/`:
`wave-models.js` velocity models, `wave-engine.js` finite-difference solvers on the CPU and on the GPU via WebGL2,
`hero.js` the homepage wavefield, `lab.js` + `lab-chapters.js` the Wave Lab). Drafts carry
`<meta name="robots" content="noindex">` and `/drafts/` is disallowed in `robots.txt`.
Once a design is chosen, it replaces the root `index.html` and `/drafts/` is deleted.

`.nojekyll` makes GitHub Pages serve the files as they are.
