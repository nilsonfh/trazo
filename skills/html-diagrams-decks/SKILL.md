---
name: html-diagrams-decks
description: Build animated, interactive SVG diagrams, hand-drawn architecture figures and 16:9 slide decks as single self-contained HTML files (light and dark themes, stepped builds with captions, packets flowing along connectors, hover details, a layout check, a 50-icon sprite including grid/energy symbols). Use when asked for an architecture or flow diagram, a layered or platform view, an explainer figure, a stepped walkthrough, or a presentation/deck as an HTML page or claude.ai artifact.
license: MIT
compatibility: The libraries run in any browser. The tools need Python 3, bash, and a headless Chromium for screenshots and checks (npx playwright install chromium-headless-shell, or set CHROME).
---

# HTML diagrams and decks

This skill (an [Agent Skill](https://agentskills.io): Claude Code, GitHub Copilot and other agents read it) provides two small figure libraries, a deck engine, three themes and three templates. Each result is one HTML file that works offline once GSAP is cached, follows the viewer's light or dark theme, and can be published as a claude.ai artifact.

| Path | What it is |
| --- | --- |
| `lib/edgediagram.js` | Declarative SVG graphs: `zone`, `node`, `text`, `link` (orthogonal by default, arrows, labels, packet flows), `fan` (one point feeding several nodes), `bindFocus`, `steps`, and a layout check at every step |
| `lib/edgesketch.js` | Hand-drawn figures on a grid: `zone`, `box` (fits its text; vertical columns and centred bars), `arrow` (right angles, two heads), `connect` (box to box), `fan`, `text`; and `EdgeSketch.check`, a layout check for any SVG, slanted and curved wires included |
| `lib/edgesequence.js` | Sequence diagrams: actors in columns, numbered messages, replies, self calls, notes, `alt`/`opt`/`loop`/`par` frames, activation bars, a step per message with a packet on it, and its own layout check |
| `lib/icons.js` | `window.EDGE_ICONS`: 50 line icons on a 24-unit grid (grid equipment, compute, trust, operations) |
| `lib/edgedeck.js` | `EdgeDeck.run`: a 1600×900 slide stage with per-slide steps, captions, keyboard, clicker, swipe and `#n` links; speaker's notes and a presenter view in a second window (N); prints one 16:9 page per slide |
| `themes/*.css` | Colour and type themes, light and dark, on one token contract: `engineering` (blue on green-grey, Archivo Narrow and IBM Plex), `indigo` (indigo on lavender-grey, Space Grotesk and Inter), `drafting` (teal on warm paper, Barlow Condensed and Source Sans 3) |
| `templates/diagram.html` | A stepped EdgeDiagram figure with captions, Previous/Next and dots |
| `templates/sketch.html` | A hand-drawn EdgeSketch figure: zones left to right, columns, services, two-headed arrows, a legend |
| `templates/sequence.html` | A stepped EdgeSequence figure: who talks to whom, one message per step |
| `templates/deck.html` | A title slide plus a content slide whose diagram builds step by step, with speaker's notes |
| `templates/icons.html` | The icon gallery: every icon with its name, filter and click to copy, light and dark |
| `scripts/inline.py` | Inlines the library files and the theme into a page so it publishes as one file; fails on anything it cannot find |
| `scripts/shot.sh` | Headless screenshots (light or dark, any width, after given clicks, `--only` one element, `--full` page) and `--check`, the layout check of every figure on a page |
| `scripts/topdf.sh` | Prints a page to PDF with headless Chrome: a deck one 16:9 page per slide at its last step (`--steps`: per step), light (`--dark`) |
| `scripts/todrawio.sh` | Exports one figure of a built page to a draw.io file, to be edited there: EdgeDiagram figures with their links attached, hand-drawn SVG figures, HTML figures |
| `scripts/check_theme.py` | Checks a theme's WCAG contrast in light and dark, and that its two dark blocks agree |
| `scripts/theme_from_design.py` | Makes a theme from a DESIGN.md file (a brand's colours and faces), light and dark, every pair at its contrast |
| `scripts/test.sh` | Runs the tests in `tests/`; run it after changing `lib/`, `scripts/` or `themes/` |
| `scripts/vendor.sh` | Copies the library into another project, and `--check` shows whether that copy is behind |
| `references/api.md` | Every option of both libraries and the deck engine |
| `references/conventions.md` | Tokens, the meaning of each tone, layout rules, publishing, and the checks to run |
| `examples/ci-canary-deck.html` | A complete two-slide deck on a neutral workflow (CI/CD, then a canary rollout) |
| `examples/isometric/` | An isometric layered-figure generator (the SGAM cube), with lessons learned |
| `examples/design-md/DESIGN.md` | A sample DESIGN.md (Harbor) to make a theme from |

## Workflow

1. **Decide what the figure must show.** Name the mechanism, the parts it depends on, and the sequence in which to reveal it. A sentence that says it faster beats a figure.
2. **Pick the library.** Who calls whom, in what order (a request path, a handshake, a boot or attestation chain, anything with replies): EdgeSequence (`templates/sequence.html`). A graph of parts joined by meaningful wires, revealed step by step: EdgeDiagram (`templates/diagram.html`). A grid of boxes, a layered stack or a left-to-right platform view, where the arrangement carries the meaning: EdgeSketch (`templates/sketch.html`). A presentation: `templates/deck.html`, with any of the libraries on its slides (an EdgeSequence build returns `q.steps().timeline`); put what the speaker says in each slide's `<aside class="notes">`, which N shows in the presenter view.
3. **Copy the template** into the working directory, for example `cp <skill>/templates/sketch.html ./my-figure.html`. Fix the `<script src>` and theme paths so they point at `<skill>/lib/` and `<skill>/themes/`, or run `inline.py` with `--lib` and `--themes` at the end.
4. **Lay out on a grid.** Pick the viewBox, then the zones, then the boxes (equal sizes, even gaps), then the wires (see **Connectors** below). Put boxes that talk to each other in the same row or column, so their wire is one straight run. Give links that carry meaning an `info`. Read `references/api.md` for the options.
5. **Write the steps** (EdgeDiagram). Step 0 is the resting state. Each later step adds one idea and has a short caption. Use `flows` for the data that moves, and `dim` or `hide` for what the step moves past.
6. **Theme.** Pages link one theme, `<link rel="stylesheet" href="../themes/engineering.css">`; swap the name to change it. `engineering` for dense technical material, `indigo` for product and software delivery, `drafting` for proposals and studies read like documents. Keep each tone's meaning (`references/conventions.md`). For a brand's look, make a theme from its DESIGN.md: `python3 <skill>/scripts/theme_from_design.py DESIGN.md -o themes/<name>.css` (`examples/design-md/DESIGN.md` is a sample). By hand, copy a theme, keep every token name, change the values, and run `scripts/check_theme.py themes/<name>.css` until it passes.
7. **Build, check and look:**
   ```bash
   python3 <skill>/scripts/inline.py my-figure.html > build/my-figure.html
   <skill>/scripts/shot.sh --check build/my-figure.html          # every figure; exit 1 on any issue
   <skill>/scripts/shot.sh --only '#my-fig' build/my-figure.html /tmp/f-light.png light 1280
   <skill>/scripts/shot.sh --only '#my-fig' build/my-figure.html /tmp/f-dark.png dark 1280
   <skill>/scripts/shot.sh build/my-figure.html /tmp/sN.png dark 1280 'for(var i=0;i<5;i++)document.getElementById("next").click()'
   ```
   Fix everything `--check` reports. Then open the PNGs and fix what it cannot see, such as off-grid boxes, arrowheads that collide or crowded labels, and look again at width 420. Screenshots freeze packets near the start of their wires, so judge motion in a real browser.
8. **Hand over an editable copy when asked.** `<skill>/scripts/todrawio.sh build/my-figure.html <svg id or selector> out.drawio "Name"` writes a draw.io file of one figure, in the light theme and at its last step. Say what it does not carry: motion, steps, tooltips, and filled shapes other than rects and ellipses (it prints how many it left out).
9. **Publish.** The inlined file is the page: share it as a file, commit it, or, in Claude, give it to the Artifact tool (republish the same path or URL to update it). For a PDF (a deck to hand out, a figure for a document): `<skill>/scripts/topdf.sh build/my-deck.html my-deck.pdf`, with `--steps` for a page per step.

## Connectors

Wires are what a reader follows, so they must look deliberate:

- **Horizontal and vertical only.** Never a diagonal and never a curve. EdgeDiagram links are `ortho` by default: leave `route` out. `'straight'` is only for two ends already in line, and `'curve'` only when the user asks for one. In EdgeSketch use `s.arrow`, `s.connect` and `s.fan`, which turn at right angles. In SVG written by hand, draw wires with `H` and `V` path commands and round only the corners.
- **One straight run when the boxes face each other.** Leave out the position (`t`) and EdgeDiagram, or `s.connect`, puts both ends in line when the two boxes share a span. If the check reports a jog of a few pixels, move a box so the ends line up; don't nudge `t`.
- **One source feeding several boxes is a fan, not a bundle of separate wires.** `d.fan(id, {from: [src, 'bottom'], to: ['a', 'b', 'c']})`, or `s.fan(src, 'bottom', [a, b, c])`, draws a trunk, a bus at right angles and a branch into each box, with a dot at every junction. Several boxes feeding one is the same fan with the lists swapped (`{from: [[...], ...], to: [...]}` or `{into: true}`).
- **Few bends, no crossings.** Choose the sides so that each wire turns at most twice. Spread the wires that share a side (`'auto'`). Route around boxes, never through them.
- `shot.sh --check` reports slanted, curved and jogging wires. Fix them like any other issue. Mark a deliberate exception, such as an isometric figure, with `data-route="free"`.

## Rules

- Do not use other libraries. GSAP 3 from cdnjs is optional: without it, every step shows its final state.
- Every colour comes from a token, so components never contain literal colours.
- Every node, box or link that has `info` is keyboard-focusable. The SVG has `role="img"` and an `aria-label` that states what the figure claims.
- A figure wider than a phone scrolls inside its own `overflow-x: auto` container, never the page.
- Keep internal names, customer names and addresses out of pages that will be shared.
