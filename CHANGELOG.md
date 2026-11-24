# Changelog

## Unreleased

- **Accessible figures.** Every figure library writes a text description of its figure, made from the model and not from the pixels, and wires it for screen readers:
  - `describe()` on EdgeDiagram (zones and what they hold, parts with sub and info, links as sentences such as `Gateway sends to Buffer (publish)`, a fan as one sentence, a state machine's transitions as `From Trusted, on quote fails, to Untrusted`, lanes as who does what in order), EdgeSequence (actors, numbered messages in order, frames with what they hold: `loop every 200 ms: ...`), EdgeTimeline (span and today, phases, lanes with bars, dates, progress and milestones, dependencies), EdgeMatrix (cells per state, then the rows and columns with gaps, and a visually hidden `<table>` with every cell) and EdgeSketch (read from the drawing: zones in reading order with their boxes, arrows between boxes; `EdgeSketch.describe(svg)` for any hand-drawn figure); each adds the steps' captions. A figure held for EdgeLayout is described from its calls without being laid out. The description is written once the page's script is done and again after later changes.
  - The SVG keeps its `aria-label` (else its `<title>`, `create(svg, {title})` or its figcaption), gets `aria-describedby` on a visually hidden `div.trazo-desc` after it (or the page's `[data-describe="<svg id>"]`), and role `img`, or `group` with an `aria-roledescription` when it holds focusable items; the themes' print rules, and `theme_from_design.py`'s, cover `svg[role="group"]` too.
  - A figure with steps reads each step in an `aria-live="polite"` region: `Step 3 of 5: <caption>`, or what the step brings in when it has no caption; `live: false` leaves it out. EdgeDeck names each slide as a group and reads `Slide 2 of 5: <name>. <caption>` and each step's caption in a live region of its own; the figures on a slide leave their steps to it.
  - Focusable items all have a name; an EdgeDiagram link's is its sentence, an EdgeSequence message's its number and sentence, an EdgeTimeline dependency's `B starts after A ends`.
  - `create(svg, {describe: false})` opts out.
  - EdgeDiagram turns off its CSS transitions under `prefers-reduced-motion`, as the other libraries already did; the deck template's progress bar too.
  - The templates drop `aria-live` from their visible captions (the library reads the steps) and have a skip link past the figure, shown when focused. Tested in `tests/a11y.html` and `tests/deck.html`; documented in `api.md` (**Accessibility**), `conventions.md` and `SKILL.md`.
- **Visual regression test.** `scripts/visual.py` (`trazo visual`) renders every `templates/*.html`, a new one included, in light and dark at 1280 px (a deck slide by slide at 1280×720) and compares each image with its baseline in `tests/visual/`: a pixel counts when a channel moves by more than 32, and more than 25 such pixels fail. A failure writes the render and a diff image; a missing baseline is named and fails; `--update` writes the baselines. Fonts are pinned (no web fonts, only DejaVu through a fontconfig file of its own) and the Chrome the baselines were made with is recorded in `tests/visual/env.txt`. Standard library only: PNG is read and written with zlib. A `visual` job in the workflow runs it and uploads the images of a failure. Tested in `tests/test_visual.py`.
- **`?static`.** EdgeDiagram, EdgeSequence and EdgeDeck honour `?static[=K]` in the address, or `window.TRAZO_STATIC`: no motion and no packets, every figure at its last step (or step K), a deck's slide at its last step. Tested in `tests/static.html`.
- **Speaker's notes and a presenter view.** A slide's `<aside class="notes">` (or `notes` given to `EdgeDeck.run`, by slide or build, one item per step if a list) holds what the speaker says; it never shows on the slide. N, or a `#b-notes` button, opens the presenter view in a second window: the current slide and step, the next step's caption and the next slide, the notes with the current step's marked, the time since it opened and the clock. Both windows follow whichever moved, so the keys and a clicker drive both; they talk over a BroadcastChannel and by `postMessage` to the window opened, which also works for file:// pages that get no channel. Where popups are blocked, the view takes the deck's own window. **N no longer steps forward**; J still does. Tested in `tests/deck.html` and, with a real second window, `tests/presenter.html`.
- **Print and PDF.** A deck prints one 16:9 page per slide, at its last step with every build done, in the light theme (`printTheme` to change it), without notes or controls; EdgeDeck prints still copies with ids of their own, so arrowheads survive, and puts the deck back afterwards. `scripts/topdf.sh page.html out.pdf` (`trazo pdf`) does it with headless Chrome, `--steps` for a page per step and `--dark`. Each theme, and each theme `theme_from_design.py` makes, ends with a print block that keeps a figure, a table or a heading's first lines from being cut between pages and fits a scrolling figure to the page, so a plain page prints well too. `vendor.sh` copies `topdf.sh`. Tested in `tests/deck.html` and `tests/test_tools.py`.
- **Icon gallery.** `templates/icons.html` shows every icon of the sprite with its name, in light and dark: filter as you type, click to copy the name. `tests/icons.html` checks that names are unique and well formed and that every icon draws inside its grid; `tests/test_tools.py` that the gallery shows them all and that the count in the sprite's header and in `api.md` is right.
- **EdgeTimeline** (`lib/edgetimeline.js`), timelines and Gantt-style roadmaps:
  - a time axis in dates (by day, week, month, quarter or year, with a second tier above) or in abstract units (`W1`, `S1` ... or any prefix), labels thinned when they do not fit, and a today line;
  - lanes, gathered in titled bands;
  - bars with their label inside, or beside when it does not fit, on the side clear of other items and arrows; the theme's tones, a progress fill, dashed when planned;
  - milestones (diamonds, with a line across every lane for a gate) and phases (a strip above the lanes and a column behind them);
  - finish-to-start dependencies at right angles, which go around bars;
  - the viewBox's height follows the content.

  Steps come by default one per phase, with what starts in it (or one per item): forward steps grow the bars and draw the arrows, back steps jump. Hovering or focusing an item with `info` dims the rest but its dependencies and shows a tooltip with its dates and progress. With GSAP on the page, `ctl.timeline` drives it from an EdgeDeck slide, and EdgeDeck releases its tooltips on a slide change. Its own layout check (labels out of their bar or the chart, bars overlapping in a lane, dependencies pointing backward in time or crossing a bar, items outside the axis, text on text) reports into `shot.sh --check`. `templates/timeline.html` is a complete example; `inline.py` and `vendor.sh` know the file. Tested in `tests/timeline.html`.
- The draw.io export keeps diamonds (a timeline's milestones) as rhombi; it used to leave every filled path out. Tested on the timeline template in `tests/test_todrawio.py`.
- **EdgeMatrix** (`lib/edgematrix.js`), matrices and coverage maps:
  - rows and columns with headers and optional codes, row groups (a band beside the rows, or a band above each with `rowGroups: 'head'`) and column groups (a band above the headers);
  - cells in a state from a small legend, each state a tone (`add`, `gap`, `bad`, `accent`, `p3`, `muted`, ...) and a style (`solid`, `soft`, `outline`, `blank`), with an optional short mark; the library draws the legend, and a click on an entry highlights its state;
  - totals per state for each row and each column;
  - cells sized from their marks and headers; column headers turn to read bottom to top when they are long, and `clip` ends headers that are still too long with an ellipsis; a matrix over 60 rows or 900 cells is drawn compact (160 × 40 in about 1100 units wide), since an SVG never scrolls inside;
  - a plane mode for SGAM-like grids: axes with arrows, wrapping headers, small boxes with icons in the cells (`m.item`);
  - hover and arrow keys light the cell's row and column and show its info, in a status element or a tooltip;
  - `filter` (`'gaps'`, states, rows, columns), `highlight` (states, rows, columns, groups, or a function), `counts`;
  - steps that reveal row groups (or column groups) with their captions, then the totals; with GSAP, `ctl.timeline` for EdgeDeck.

  Its layout check reports headers wider or longer than their band, group labels wider than their span, marks too large for their cell, item labels out of their box, and anything outside the viewBox into `shot.sh --check`; EdgeSketch's check leaves its figures alone. It measures again when a web font loads after `document.fonts.ready`. draw.io exports it as a hand-drawn figure. `templates/matrix.html` is a complete example; `inline.py` and `vendor.sh` know the file. Tested in `tests/matrix.html` and `tests/test_todrawio.py`.
- **State machines in EdgeDiagram.**
  - Node shapes `state` (a rounded box), `initial` (a dot), `final` (a ringed dot), `choice` (a small diamond) and `composite` (a state holding others, with its title on a tab); links meet a dot or a diamond at the middle of a side.
  - `d.transition()` is a link labelled `event [guard] / action`, the guard quieter and the action in italics. A self-transition is a loop at right angles on a chosen side, its label beside it.
  - Two links that run opposite ways between the same sides keep 22 units apart, each label beside its wire on its outer side.
  - Steps take `current` (a ring on the state the walk is in) and `fire` (the transition drawn thicker, with a packet on it); `d.walk([state, transition, state, ...])` makes those steps.
- **Swimlanes in EdgeDiagram.** `d.lanes()` draws horizontal or vertical lanes with titles. A node given `lane` stays inside it, centred unless placed, and each lane grows to its content, moving the lanes after it; the viewBox follows. Process shapes `task`, `decision` (text inside the diamond) and `start`/`end` events.
- The check also reports a node outside its lane, a transition's label on another wire, text outside a diamond and a state on its composite's title tab.
- Two ends that face each other across a gap narrower than two stubs get shorter stubs, so the wire is one straight run instead of a loop.
- The draw.io export maps the new shapes to draw.io's own (startState, endState, rhombus, ellipses), composites with their tab, and lanes to swimlanes; a link's end attaches to the smallest node it touches, so a state inside a composite keeps its links.
- `templates/state.html` (an edge node's lifecycle) and `templates/swimlane.html` (a field device's onboarding across operator, hub, site and node). Tested in `tests/states.html` and `tests/test_todrawio.py`.
- **EdgeLayout** (`lib/edgelayout.js`), automatic layout for EdgeDiagram: declare nodes, links, fans and zones without coordinates, call `d.layout({dir: 'TB' | 'LR', bands})`, and it
  - breaks cycles, ranks the nodes (longest path, then balanced), and gives a link that skips ranks a lane in each;
  - orders each rank to cross as little as possible (barycentre sweeps and swaps from three starts), keeping a zone's nodes together;
  - lines chains up so their wires run straight, centres a fan's source over its ends and a node over branches only it feeds, and sizes each box from its text, with even columns;
  - draws each zone around its nodes (`bands: true` stacks them as layers in the order declared), keeps pinned nodes (`x`, `y` given) where they are, and fits the viewBox;
  - gives every link the sides facing its next rank and places the ends that share a side across from what they join, so the router draws them straight or with two deliberate turns.

  The same input gives the same figure. `d.layoutInfo` reports the crossings, and those of the order declared. EdgeDiagram's hook is small: a node or zone without `x` or `y` holds the calls until `d.layout(opts)` (or `steps`, `bindFocus`, `check`) hands them to EdgeLayout. `templates/auto.html` is a complete example; `inline.py`, `vendor.sh` and the draw.io export know the file. SKILL.md now says to prefer automatic layout unless the figure needs a hand composition. Tested in `tests/layout.html` on nine graphs (a pipeline, a hub with a fan, two architectures in zones as bands, zones side by side, a cycle, links that skip ranks, a labelled state cycle, a random graph): each passes the layout check with 0 issues and crosses less than the order it was declared in, or as little when that order does not cross.
- EdgeDiagram moves a link's label off a zone's label too, as it does off nodes and other labels.

## 1.3.1 (2026-11-23)

- EdgeSketch fits a box's text to its width by measuring it again after each step, until it fits or reaches the floor. It used to scale the size once in proportion; a web font at small sizes (a mono face above all) does not narrow in proportion, and texts were left a few pixels outside their box. Tested in `tests/sketch.html` over boxes of many widths.

## 1.3.0 (2026-11-20)

- **EdgeSequence** (`lib/edgesequence.js`), sequence diagrams:
  - actors in equal columns, optionally grouped in bands, with lifelines;
  - numbered messages with their labels above, dashed replies, self calls and notes;
  - activation bars that a message starts and its reply ends, nested for self calls;
  - `alt`, `opt`, `loop` and `par` frames (or any word), with `else` dividers, nesting;
  - the viewBox's height follows the content.

  Steps come by default one per message: the current one is drawn thicker, with a packet travelling along it. Forward steps draw the wire, then its arrowhead; back steps jump. With GSAP on the page, `ctl.timeline` drives it from an EdgeDeck slide. Its own layout check reports into `shot.sh --check`, and draw.io exports it as a hand-drawn figure. `templates/sequence.html` is a complete example; `inline.py` and `vendor.sh` know the file. Tested in `tests/sequence.html`.
- `shot.sh --only` keeps the element at the width it has on the page: in a grid whose other columns it hides, it no longer falls into the first column.

## 1.2.0 (2026-11-20)

- **Connectors at right angles.**
  - EdgeDiagram links are `ortho` by default (they were curves); `'curve'` stays for when one is asked for.
  - An end with no position, alone on its side, lines up with the other end when the two nodes face each other across a shared span, so the wire is one straight run instead of a Z with a jog.
  - The router avoids short jogs between two turns.
  - EdgeSketch's `s.arrow` joins points that are not in line with a Z or an L (`bend`), with rounded corners; `route: 'straight'` keeps a diagonal on purpose.
- **Fans.** `d.fan()` and `s.fan()` feed several nodes from one point, or gather several into one: a trunk, a bus at right angles, a branch into each, and a dot at each junction. The trunk lines up with a branch when one is in reach. In EdgeDiagram each branch is a link (`id.node`) with its own packets, and the fan's id in a step stands for all of them. The draw.io export keeps the branches attached and the dots.
- **`s.connect()`** joins two EdgeSketch boxes by their sides: straight when they face each other across a shared span, else an L, a Z or a U.
- **The checks see bad wires.**
  - EdgeDiagram reports a slanted `straight` link and an ortho link with a jog under 10 units.
  - `EdgeSketch.check` reports slanted and curved wires in any SVG: paths, lines and polylines with an arrowhead or a `wire`/`arrow`/`link`/`connector` class. A rounded corner passes, and `data-route="free"` marks a deliberate exception. `EdgeSketch.wireShape(el)` gives the verdict for one element.
- **The skill's rules for connectors** (SKILL.md, conventions): horizontal and vertical only, boxes that talk share a row or a column, a fan for one-to-many, few bends.
- **Install with uv.** `uv tool install git+https://github.com/nilsonfh/trazo` gives a `trazo` command:
  - `trazo install` copies (or `--link`s) the skill into Claude Code's, Copilot's or the open standard's folders, for the user or a repository, and `trazo uninstall` removes it;
  - `trazo inline`, `check`, `shot`, `todrawio`, `theme`, `check-theme`, `vendor` and `test` run the scripts.
- The example deck feeds its stable replicas with a fan, and the diagram template uses the default route.

## 1.1.0 (2026-11-19)

- **EdgeSketch** (`lib/edgesketch.js`), for figures drawn by hand on a grid: zones, boxes that fit their text to their width (vertical columns and centred bars too), straight and polyline arrows with one or two heads, free text and icons. `templates/sketch.html` is a complete example.
- **A layout check for any SVG.** `EdgeSketch.check(svg)` finds text outside the viewBox, text running out of its box, text on text, icons on text, and text partly on a box it does not belong to, in figures drawn with EdgeSketch or not. `scripts/shot.sh --check` now runs it on every `svg[role="img"]` that is not an EdgeDiagram figure, and injects EdgeSketch if the page does not load it; `--diagrams-only` restores the old behaviour. Both libraries report into the same `<pre id="ed-issues">`.
- **A tone for a further phase.** `p3` (dashed) in EdgeDiagram's nodes and links and in EdgeSketch, with `--p3`, `--p3-soft`, `--ed-p3` and `--ed-p3-soft` in every theme.
- **Screenshots of one element or of the whole page.** `shot.sh --only SELECTOR` crops to one element at the page's width, `--full` takes the whole page, and `--height N` sets the window height.
- `inline.py` matches library tags whatever their other attributes, inlines `edgesketch.js`, takes `--lib` and `--themes`, finds the files of a vendored copy beside itself, and fails on a library file or theme it cannot find or that is included twice. It reports other local scripts and stylesheets.
- `check_theme.py` checks the p3 tokens and fails when a theme's two dark blocks differ.
- `scripts/vendor.sh` copies the library into another project, and `--check` lists what differs.
- Version numbers in `VERSION`, in each library file's header and as `EdgeDiagram.version`, `EdgeSketch.version` and `EdgeDeck.version`.
- Tests for the layout checks, the ortho router, EdgeSketch, `inline.py` and `check_theme.py`, and a GitHub Actions workflow that runs them.
- The templates keep a safe-area side gutter and declare it for claude.ai artifacts.
- The isometric example draws a textbook distribution-grid example, and its colours come from the themes.
- MIT license.
- **Export to draw.io.** `scripts/todrawio.sh page.html TARGET out.drawio` writes one figure to a draw.io file: an EdgeDiagram figure with its links attached to their nodes, any other svg (EdgeSketch or hand-drawn) with its rects, ellipses, text, sprite icons and wires in the page's order, or an HTML figure. Icons become stencils that follow draw.io's dark mode, faces carry their Google Fonts address, and a target that matches nothing or an empty figure is an error. Tested in `tests/test_todrawio.py`.
- **Deck keys.** EdgeDeck takes the keys of a keyboard and a presenter's clicker: down/up and N/J, P/K as well as the arrows and PageDown/PageUp, Shift for a whole slide, a number then Enter for a slide, F for fullscreen, B, W or `.` to blank the screen. Enter or space on a focused button or diagram item no longer acts twice, keys with Ctrl, Alt or Cmd are left to the browser, and in an embedded deck the first click only brings it into focus. `run()` returns `go`, `nextSlide`, `prevSlide` and `state()`. Tested in `tests/deck.html`.
- **Themes from DESIGN.md.** `scripts/theme_from_design.py` makes a theme from a DESIGN.md file (Google Labs' format, with or without front matter): roles found by name, the missing mode derived, tones kept apart from the accent's hue, faces imported from Google Fonts when they are there, every pair brought to its contrast. It turns all 84 files of awesome-design-md into themes that pass `check_theme.py`. `examples/design-md/DESIGN.md` is a sample; `check_theme.py` can be imported.
- **Installable in GitHub Copilot and other agents.** The skill lives in `skills/html-diagrams-decks/`, the Agent Skills layout that `gh skill install` reads; its frontmatter carries `license` and `compatibility`; `install.sh` links or copies it into `~/.claude/skills`, `~/.copilot/skills`, `~/.agents/skills` or a repository's `.github/skills`.

## 1.0.0 (2026-10-28)

- EdgeDiagram with routed connectors, packet flows, tooltips, stepped builds and a layout check; EdgeDeck; the icon sprite; three themes on one token contract; `inline.py`, `shot.sh`, `check_theme.py`; the diagram and deck templates; the CI-to-canary example deck; the isometric example.
