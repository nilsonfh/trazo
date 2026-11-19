# Changelog

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
- **Themes from DESIGN.md.** `scripts/theme_from_design.py` makes a theme from a DESIGN.md file (Google Labs' format, with or without front matter): roles found by name, the missing mode derived, tones kept apart from the accent's hue, faces imported from Google Fonts when they are there, every pair brought to its contrast. It turns all 84 files of awesome-design-md into themes that pass `check_theme.py`. `examples/design-md/DESIGN.md` is a sample; `check_theme.py` can be imported.
- **Installable in GitHub Copilot and other agents.** The skill lives in `skills/html-diagrams-decks/`, the Agent Skills layout that `gh skill install` reads; its frontmatter carries `license` and `compatibility`; `install.sh` links or copies it into `~/.claude/skills`, `~/.copilot/skills`, `~/.agents/skills` or a repository's `.github/skills`.

## 1.0.0 (2026-10-28)

- EdgeDiagram with routed connectors, packet flows, tooltips, stepped builds and a layout check; EdgeDeck; the icon sprite; three themes on one token contract; `inline.py`, `shot.sh`, `check_theme.py`; the diagram and deck templates; the CI-to-canary example deck; the isometric example.
