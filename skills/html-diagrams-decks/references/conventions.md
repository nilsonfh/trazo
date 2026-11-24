# Conventions that made these pages work

## Single-file pages

- One HTML file is published. GSAP comes from cdnjs, and `scripts/inline.py` inlines the library, the sprite, the deck engine and the theme. Fonts come from Google Fonts. Nothing else is fetched. `inline.py` fails on a library file or theme it cannot find, and reports other local scripts and stylesheets, which a published page cannot load.
- In a claude.ai artifact, scripts load only from a few CDNs (cdnjs, jsdelivr, unpkg) and stylesheets only from Google Fonts. `window.print()`, `alert()` and downloads do nothing there. A deep link must be a bare `#n`.
- When the page is wrapped at publish time, as claude.ai artifacts are, start the file with `<title>` and `<style>`, with no `<html>`, `<head>` or `<body>`. When a standalone file is wanted, add them.
- The `<title>` is the page's name, two to four words, not a sentence. Keep the side gutter at 16 px or more, written `padding-left: max(16px, env(safe-area-inset-left, 0px))` and the same on the right, and then put `<meta name="claude:viewport-fit-sides" content="cover">` beside the title; the templates do both.

## Tokens and themes

- A theme is one file in `themes/`, linked from the page and inlined by `inline.py`. It starts with an `@import` of its Google Fonts, then defines the contract below on bare `:root` (light) and again in both dark blocks. Pages style themselves through these tokens only, so any theme fits any page.
  - Page: `--bg --card --ink --ink2 --muted --rule --accent --accent-soft`, status `--ok --warn --bad` each with `-soft`, faces `--display --sans --mono` (aliases `--f-display --f-body --f-mono`, and `--slide` for `--card`).
  - Library: the `--ed-*` tokens below, with `--ed-display --ed-sans --ed-mono` pointing at the faces.
- | Theme | Character | Faces |
  | --- | --- | --- |
  | `engineering` | Engineering blue on green-grey; sober, dense, technical | Archivo Narrow, IBM Plex Sans, IBM Plex Mono |
  | `indigo` | Indigo on lavender-grey; product and delivery, a little brighter | Space Grotesk, Inter, JetBrains Mono |
  | `drafting` | Deep teal on warm tracing paper, vermilion for what fails, olive for what is added; proposals and studies | Barlow Condensed, Source Sans 3, Red Hat Mono |
- A theme can be made from a DESIGN.md file, the open format of Google Labs (YAML front matter with `colors` and `typography`, then prose) that collections such as awesome-design-md use for many brands: `scripts/theme_from_design.py DESIGN.md -o themes/<name>.css`. It finds the roles by name (surfaces, ink, rule, primary, success, warning, error, a violet or tertiary), reads files without front matter from their colour bullets, takes the file's own mode from its background and derives the other (from inverse-* colours where there are any), replaces a tone that has the accent's hue so the two never read as one, imports the faces Google Fonts has, and brings every pair to its ratio. Its header lists what it found, derived and adjusted; `--explain` prints it. Look at the result in light and dark before using it: a role found by name can be the wrong one.
- A theme made from a brand's DESIGN.md takes that brand's look. Keep it for pages about or for that brand, and do not ship it as a theme of this library.
- `scripts/check_theme.py` checks every theme in light and dark: text pairs at 4.5:1 (ink, ink2 and muted on the grounds, status on its soft fill, node text on every tone's soft fill, the tooltip), strokes at 3:1 (each tone on the surface, the layer and its soft fill). A new theme passes before it is used.

- Define every colour as a token. Put the light values on bare `:root`. Redefine the dark values twice: under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and again under `:root[data-theme="dark"]`, both with `color-scheme: dark`. Give `body` an explicit background.
- The library reads `--ed-ink --ed-ink2 --ed-muted --ed-surface --ed-layer --ed-rule --ed-accent --ed-accent-soft --ed-gap --ed-gap-soft --ed-add --ed-add-soft --ed-tip-bg --ed-tip-ink`, plus optional `--ed-sans --ed-display --ed-mono --ed-pad`. Map them onto the page's own tokens.
- Each tone has one meaning, and it should keep that meaning for the whole page or deck:
  - **accent (blue):** the subject, the data going up;
  - **gap (amber):** a gap, a risk, decisions coming down;
  - **add (green):** what the proposal adds;
  - **p3 (violet, dashed):** a further phase or option, what is potential;
  - **muted dashed:** today, legacy, outside.
- `--p3` and `--p3-soft` (page) and `--ed-p3` and `--ed-p3-soft` (library) are in every theme; both libraries have the tone `p3`. A fourth phase gets its own token the same way, dashed.

## Drawing

- Draw the mechanism, not a box per noun. Label the wires (`POST`, `batch`, `every 30 s`).
- Put a zone's label where no wire crosses the zone's edge: wires usually enter a zone from above, so a band crossed at its top-left takes `labelPos: 'bottom-left'`, or a shorter label.
- A node whose chips are joined by wires is fine: those wires draw above it. A box whose chips have wires and whose own title would sit in their way puts its title under them with `textY`.
- Keep to a grid. Give sibling boxes the same width and the same gaps. Choose the viewBox for the content (for example 1000×560 for a page figure and 900×420 inside a deck slide). Keep text at 11–13 px or more at the drawn scale.
- Let the library place connectors: `'auto'` sides, or `t: 'auto'` on a fixed side, so links sharing a side spread themselves. Give a number only when a wire must hit an exact point. Give links that carry meaning an `info` too.
- Wires run horizontally and vertically, with rounded corners: `ortho` is the default route, and EdgeSketch's arrows turn at right angles. A diagonal or a curve reads as a mistake, so use `'straight'` only for ends already in line, and `'curve'` only when asked. Boxes that talk to each other share a row or a column, so their wire is one run with no jog. An end with no `t` that is alone on its side lines itself up with the other end when the two boxes share a span.
- One source feeding several boxes, or several feeding one, is a fan (`d.fan`, `s.fan`): a trunk, a bus at right angles, a branch to each box, and a dot at each junction. Don't draw it as separate wires that leave the source side by side. The trunk lines up with a branch when one is in reach. The bus runs halfway across the gap unless `at` places it.
- Wrap the SVG in a container with `overflow-x: auto` and `min-width` about 640 px, so a phone scrolls the figure and not the page. Give it `role="img"` and an `aria-label` that states the claim.
- When the order of the calls is the point (a request and its replies, a handshake, an attestation chain), draw a sequence (`lib/edgesequence.js`, `templates/sequence.html`), not a graph with numbered links. Put the actors left to right in the order they first act, so most arrows point right; keep labels short enough to fit between the lifelines they join (the check reports those that don't); use `with: true` to show a reply in the same step as its request; box alternatives and repetitions in frames rather than repeating messages.
- When a figure is a grid of boxes rather than a graph of links (a layered stack, a left-to-right platform view), draw it with `lib/edgesketch.js` (`templates/sketch.html`): zones, boxes that fit their text, columns, bars and two-headed arrows, on the same tokens. A figure with its own state (a phase toggle, a detail panel filled on click) draws its parts with the same helpers and adds its classes in its own `<script>`.
- Every figure, drawn with a library or by hand, is checked the same way (below). In a hand-drawn figure, mark a box with `data-box` (or draw it with EdgeSketch) so the check knows which text belongs to it, and mark what overlaps on purpose with `data-check="false"`. Give wires drawn by hand a marker or a `wire` class so the check sees them, and mark a deliberate diagonal or curve (an isometric figure, a sketch of a cable) with `data-route="free"`.

## Steps and motion

- Start a walked-through figure at its last step (`start: STEPS.length - 1`), so it reads whole at rest, with a "Walk through" button that goes to step 0.
- To fade a part for one step and bring it back (a link cut, a node quarantined), `dim` it in that step and `show` it in the next. For a fade that several steps toggle, a class with `filter: opacity(.22)` set in `onStep` also works and never touches the timeline.

- Step 0 must make sense on its own. Every later step adds one idea and has a caption of one or two sentences.
- Go forward with animation and back without it. Honour `prefers-reduced-motion`, which the library already does.
- In a deck, a slide whose motion is its own (boxes merging, a chip bouncing) builds its elements with the library, animates `d.items[id].el` on its own timeline, and adds `s0..sN` labels.

## Checking before publishing

- `scripts/shot.sh --check page.html` runs the layout check over every figure: EdgeDiagram's at every step and slide (overlaps, overflowing text, links through nodes, covered labels, slanted and jogging links), EdgeSequence's (labels on labels, labels wider than their gap, text out of its actor or note, frame heads under labels), and EdgeSketch's on every other `svg[role="img"]` in its resting state (text out of its box, text on text, icons on text, slanted and curved wires). Fix everything it reports, or mark a deliberate case with `check: false` (EdgeDiagram) or `data-check="false"` (anything else).
- `scripts/shot.sh page.html out.png [light|dark] [width] [js]` takes a screenshot. Pass JS that clicks Next N times to see step N. `--only '#fig-2'` crops to one element, at the page's width and the element's height; `--full` takes the whole page instead of the first 1600 px. The script switches off CSS transitions and GSAP lag smoothing; otherwise virtual time freezes both at their first frames.
- Look at light and dark, step 0 and the last step, and a 400 px width. Labels must not collide, and no text may be clipped.
- When a page is meant to be shared, keep internal names, customers and addresses out of it.

## Printing and PDF

- A deck prints one 16:9 page per slide at its last step, in the light theme, from the browser's print and from `scripts/topdf.sh page.html out.pdf` alike; `--steps` gives a page per step, `--dark` the dark theme. Notes and controls never print.
- Any other page prints as the browser lays it out. Each theme ends with a print block that keeps a figure, a table or a `pre` on one page and a heading with what follows it, and fits a figure that scrolls on screen into the page's width. Keep figures in `svg[role="img"]`, `figure`, `.fig` or `.pane` so it finds them.
- Figures print at their resting state, without motion: a step that matters on paper belongs in a deck slide or a figure of its own.
- Look at the PDF (`pdftoppm -png out.pdf /tmp/p`) as at a screenshot.

## Exporting to draw.io

- `scripts/todrawio.sh page.html TARGET out.drawio [name]` writes one figure of a built page (after `inline.py`) to a draw.io file. TARGET is an svg's id, or a CSS selector when it starts with `.` or `#`.
- What it keeps depends on the figure. An EdgeDiagram svg keeps zones, nodes, icons, labels and links attached to their nodes, with the route's corners as waypoints, so moving a node in draw.io drags its wires. Any other svg (EdgeSketch or hand-drawn) keeps rects, ellipses, text (rotated text too), sprite icons and wires with their arrowheads, in the page's order; its wires are not attached to anything. Any other element is read as an HTML figure: its boxes, sprite icons and lines of text.
- It renders the page in its light theme. Icons become draw.io stencils coloured from the cell's style, so draw.io's dark mode recolours them with the text. Each text names its face and, unless it is a system face, its Google Fonts address.
- It does not carry motion, steps, tooltips, or filled shapes other than rects and ellipses; it prints what it left out. A target that matches nothing, or a figure that comes out empty, is an error (exit 1).
- An export is a copy to edit, not the source: the page stays the source, and an export made again overwrites any edits made in draw.io.

## Keeping a copy in another project

- A project that builds pages with this library can keep a copy of it: `scripts/vendor.sh DEST` copies the library, the themes, `inline.py`, `shot.sh` and the draw.io exporter flat into DEST with a `VERSION` file, and `inline.py` and `shot.sh` find the library beside themselves there.
- `scripts/vendor.sh --check DEST` lists what differs, so the project sees when it is behind. Fixes belong in the skill and come back with the next copy; a fix made only in the copy is lost then.
