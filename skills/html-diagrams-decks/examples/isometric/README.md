# Isometric layered figure (example kit)

An isometric drawing of the SGAM cube (the Smart Grid Architecture Model of CEN-CENELEC-ETSI): five layer planes stacked vertically, with one block per component and its icon projected onto the block's top. The components are a textbook distribution-grid example: primary equipment, RTU and controllers, station bus, network model, DMS, market. This kit does not use `edgediagram.js`. Reach for it only when a layered figure really needs depth, because a flat layered SVG reads better on phones.

| File | What it is |
| --- | --- |
| `sgam_cube.py` | The generator. It prints an `<svg id="cube3d">` fragment containing five layer slabs, a highlighted column, the components as blocks with their icons, upright labels and stack verticals. Run `python3 sgam_cube.py > cube.svg.html`. |
| `sgam-cube.css` | The classes the fragment uses: slabs, tiles, badges, stack focus, and motion behind `prefers-reduced-motion`. Its colours come from any theme in `themes/`. |
| `sgam-cube.js` | Injects the icon sprite (`lib/icons.js`) into `<defs id="cube-ico">`. It also wires a "follow a stack" bar (`.focusbar` buttons with `data-f`) and starts the entrance animation when the figure scrolls into view. |

## What was learned

- **Projection.** Use 22° (cos 0.927, sin 0.375), not a true 30°. Each of five stacked planes then takes about 400 px of height instead of 530. `P3(u, v, layer, height)` maps the two floor axes and a height to screen coordinates. Draw the planes bottom to top so the upper slabs overlay the lower ones.
- **Square planes.** A square plane (520 × 520, five rows of 104) was much less crowded than a rectangle (720 × 250). In isometric, rows along the short axis move only about 41 px sideways and 16 px up per 44 world units, so thin rows pile up.
- **Labels collide.** Upright labels placed beside isometric blocks overlap easily. The generator prints `OVERLAP` lines to stderr from a bounding-box check. Move labels until that check prints nothing; a 4 px margin works.
- **Do not put text on the floor.** Projecting text onto a plane shears the glyphs by 60°. Icons project well, using `matrix(c, -s, c, s, x, y)`.
- **Limits.** The figure is tall (about 1600 px of viewBox), and its text is small below desktop width.
