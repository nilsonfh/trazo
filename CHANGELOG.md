# Changelog

## Unreleased

- **Speaker's notes and a presenter view.** A slide's `<aside class="notes">` (or `notes` given to `EdgeDeck.run`, by slide or build, one item per step if a list) holds what the speaker says; it never shows on the slide. N, or a `#b-notes` button, opens the presenter view in a second window: the current slide and step, the next step's caption and the next slide, the notes with the current step's marked, the time since it opened and the clock. Both windows follow whichever moved, so the keys and a clicker drive both; they talk over a BroadcastChannel and by `postMessage` to the window opened, which also works for file:// pages that get no channel. Where popups are blocked, the view takes the deck's own window. **N no longer steps forward**; J still does. Tested in `tests/deck.html` and, with a real second window, `tests/presenter.html`.
- **Print and PDF.** A deck prints one 16:9 page per slide, at its last step with every build done, in the light theme (`printTheme` to change it), without notes or controls; EdgeDeck prints still copies with ids of their own, so arrowheads survive, and puts the deck back afterwards. `scripts/topdf.sh page.html out.pdf` (`trazo pdf`) does it with headless Chrome, `--steps` for a page per step and `--dark`. Each theme, and each theme `theme_from_design.py` makes, ends with a print block that keeps a figure, a table or a heading's first lines from being cut between pages and fits a scrolling figure to the page, so a plain page prints well too. `vendor.sh` copies `topdf.sh`. Tested in `tests/deck.html` and `tests/test_tools.py`.
- **Icon gallery.** `templates/icons.html` shows every icon of the sprite with its name, in light and dark: filter as you type, click to copy the name. `tests/icons.html` checks that names are unique and well formed and that every icon draws inside its grid; `tests/test_tools.py` that the gallery shows them all and that the count in the sprite's header and in `api.md` is right.

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
