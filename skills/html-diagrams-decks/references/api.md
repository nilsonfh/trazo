# API reference

## EdgeDiagram (`lib/edgediagram.js`)

```js
const d = EdgeDiagram.create(svgElement, {icons: window.EDGE_ICONS});
```

`create` injects the library's CSS once. With `icons`, it also injects the sprite once, as `#ed-icons`. `{debug: true}` (or `window.ED_DEBUG = 1` before the script) runs the layout check described below. `{check: false}` leaves the whole figure out of it, for a figure whose own timeline swaps items that would otherwise overlap. The SVG needs a `viewBox`, and all coordinates are in viewBox units. Every method returns `d`, so calls can chain. `d.items[id]` gives `{el, kind, o, path?}` for custom GSAP work.

### `d.zone(id, o)`: a background band

| Option | Meaning |
| --- | --- |
| `x y w h` | The box |
| `r` | Corner radius (default 12) |
| `label` | An uppercase mono label; it is addressable as `id + '.label'` in steps |
| `labelPos` | `top-left` (default), `top-center`, `bottom-left`, `bottom-center` |
| `labelSize` | Default 11 |
| `tone` | `layer` (default, quiet fill) or `gap` (amber, dashed: "something is missing here") |

### `d.node(id, o)`: a box, a pill, a symbol or an anchor

| Option | Meaning |
| --- | --- |
| `x y w h` | The box |
| `title`, `titleSize` | Display font. Defaults: 17, or 13 in a pill |
| `sub`, `subSize`, `subWrap` | A string (wrapped at `subWrap` characters, default 44) or an array of lines. `subSize` defaults to 12 |
| `icon`, `iconSize` | A sprite id without `i-` (see `lib/icons.js`) |
| `tone` | `neutral` (default), `accent`, `add` (green), `gap` (amber), `p3` (a further phase, dashed), `ink` (filled dark) |
| `shape` | `'pill'` for a rounded chip |
| `dashed` | Dashes the outline |
| `align` | `'center'` centres the text, with the icon top-left; `'left'` is the default when there is an icon |
| `textY` | Pins the title's baseline; the icon aligns with it |
| `r` | Corner radius (default 10) |
| (chips) | A node drawn fully inside another is a chip of it. A link between two chips of the same node draws just above that node and under the chips, with its label and packets, so the node's fill does not cover it. Define the node before such links |
| `info` | Hover and focus text. A string, or `{text, facts: [[label, value], ...], href, hrefText}` for a tooltip with a small table and a link. It makes the node focusable (`tabindex`, `role=button`, `aria-label`) |
| `check` | `false` leaves the node out of the layout check |
| `ghost: true` | Draws nothing; it only gives links somewhere to attach |
| `ghost: true, pad: true` with `icon` and no `title` | A bare symbol whose background hides the wire running behind it (one-line diagrams) |
| `label` | The accessible name of an icon-only node |

### `d.text(id, o)`: a free label

`x y text size anchor ('start'|'middle'|'end') mono cls`

### `d.link(id, o)`: a connector

| Option | Meaning |
| --- | --- |
| `from`, `to` | `[nodeId, side, t]`. `side` is `top`, `bottom`, `left`, `right` or `auto`, and `auto` picks the side that faces the other end. `t` (0–1) is the position along the side. A wire leaves and enters perpendicular to its side. When the side or `t` is `'auto'`, the end is spread along its side with the other auto ends there, ordered by where their other ends are, so they do not cross. An explicit side with no `t` is its middle, and links on a `ghost` node meet at one point |
| `route` | `curve` (cubic Bézier, default), `ortho` (right angles, rounded corners), `straight` |
| `stub`, `clearance`, `radius`, `avoid` | For `ortho`. `stub` is the straight run out of each side (default 16). `clearance` is the gap kept around nodes (default 8). `radius` rounds the corners (default 14). `avoid: false` stops the route going around nodes. By default the route goes around every node except its own ends, their parents and the chips inside them, keeps off other ortho wires, avoids crossing other wires when a slightly longer path does not, and prefers to stay out of zones that hold neither end: no turn inside one, and as short a run through one as the layout allows, so crossing a band is fine but running along inside one is not. It never leaves the viewBox |
| `tension` | Curve tension (default 0.45) |
| `tone` | `accent` (default), `muted`, `gap`, `add`, `ink2`, `p3` (dashed) |
| `dashed` | Dashed wire |
| `arrow` | `end`, `start`, `both` |
| `label`, `labelAt`, `labelFixed` | Text on a plate the colour of the zone beneath, placed at `labelAt` along the path (default 0.5). If it would cover a node or another label, it slides along the wire to a clear spot unless `labelFixed`. It sits on a layer above every wire, as `d.items[id + '.label']` |
| `info`, `infoTitle` | Makes the link focusable and gives it a tooltip like a node's. The title is `infoTitle`, else `label`, else "From → To" |
| `check` | `false` leaves the link out of the layout check |
| `flow` | `{dir: 1|-1, count, period (s), phase, r, tone}`: packets that follow the drawn path while the flow is on. They fade with their link (a dimmed link has dimmed packets), wait until the wire has been drawn, and stop while the figure is off screen |

### `d.bindFocus()`

Call it after all nodes and links exist. Hovering or focusing a node or link that has `info` dims everything except it and its neighbours, and shows a tooltip.
- A click, or Enter or space on a focused item, pins the tooltip.
- A second click, a click elsewhere, or Escape releases it.

The tooltip is `position: fixed`, stays inside the window, and is announced through `aria-describedby`. Below 560 px it becomes a sheet at the bottom of the screen. `EdgeDiagram.clearAll()` releases every tooltip on the page; EdgeDeck calls it on every slide change.

### `d.layout()`

Redraws every link. This is only needed after moving nodes by hand. A node added after some links already marks them for redrawing, and `steps`, `bindFocus` and `check` do that redraw.

### `d.steps(list, {onStep, start})` returns `ctl`

Each step is an object:

| Key | Meaning |
| --- | --- |
| `show: [ids]` | Fade or pop in. A link draws its wire first, then its label, then its arrowhead. It also restores an item an earlier step dimmed or hid, including one shown at step 0 |
| `hide: [ids]` | Fade to 0 |
| `dim: [ids]` | Fade to 0.25 |
| `flows: [linkIds]` | Start packets; they stay on in later steps |
| `stopFlows: [linkIds]` | Stop packets |
| `view: 'x y w h'` | Animate the viewBox; it holds until a later step sets another one |
| Anything else | Kept for `onStep(k, step)`, for example `caption` |

Step 0 is the resting state, and its `show` items are drawn from the start. Items listed in a later `show` start hidden. A jump to any step, forwards or back, lands on what the steps up to it leave: every reveal is a `set` and a `to`, never a `fromTo`, so going back never leaves a shown item hidden. `scripts/test.sh` checks this. `ctl` has `next()`, `prev()`, `go(k)`, `end()`, `step`, `count`, `timeline` (a paused GSAP timeline with labels `s0..sN`) and `flowsAt(k)` (`-1` stops all flows). Going forward animates, going back jumps, and reduced motion always jumps. Without GSAP, everything is shown at once.

### `d.check()`: the layout check

Returns a list of problems, checked at every step with what is visible at that step:
- nodes that partly overlap (a chip fully inside a node is fine);
- text that runs outside its node;
- a link through a node that is not one of its ends;
- an ortho link turning inside a zone that holds neither of its ends;
- a link label on a node or on another label;
- a node or label outside the viewBox.

In debug mode, the check runs once fonts have loaded. Each problem is outlined in red, logged with `console.warn`, and written to a hidden `<pre id="ed-issues">`; `EdgeDiagram.issues()` returns them all. `scripts/shot.sh --check page.html` reads that list and exits 1 if it is not empty.

`EdgeDiagram.route(p0, side0, p1, side1, kind, opts)` returns the path `d` string, for drawing a wire by hand. `EdgeDiagram.version` is the library's version.

## EdgeSketch (`lib/edgesketch.js`)

For figures drawn by hand: layered stacks, left-to-right platform views, anything laid out on a grid that EdgeDiagram's routed links and steps do not fit. `templates/sketch.html` is a complete example.

```js
const s = EdgeSketch.create(svgElement, {icons: window.EDGE_ICONS});
```

`create` injects its CSS once, and the sprite once as `#ed-icons` (shared with EdgeDiagram). It draws in four layers, bottom to top: zones, wires, boxes, labels. Coordinates are viewBox units. Every method returns the element it drew.

| Method | What it draws |
| --- | --- |
| `s.zone(x, y, w, h, o)` | A background band. `o.tone` `layer` (default) or `accent`; `o.label` an uppercase mono label at the top-left; `o.r` the corner radius (default 12) |
| `s.box(x, y, w, h, o)` | A box with an icon, a title and a sub. See below |
| `s.arrow(x1, y1, x2, y2, o)` or `s.arrow([[x, y], ...], o)` | A straight or polyline arrow. `o.tone` (default `accent`), `o.heads` `end` (default), `both`, `start`, `none`; `o.dashed`; `o.label` with `o.labelAt` (0–1, default 0.5) |
| `s.text(x, y, text, o)` | A free label. `o.cls` `head` (display face), `tag` (mono, ink2), `mono` (mono, muted, spaced), or your own; `o.anchor`, `o.size`, `o.rotate`, `o.parent` |
| `s.icon(name, x, y, size, o)` | A sprite icon, without `i-` |
| `s.el(tag, attrs, parent)` | Any SVG element, in the labels layer unless a parent is given |
| `s.layout()` | Fits every box's text again; it runs at once and when the web fonts have loaded |
| `s.check()` | `EdgeSketch.check` on this figure |

`s.box` options:

| Option | Meaning |
| --- | --- |
| `icon`, `iconSize` | A sprite id without `i-`. The size defaults to 20 (16 in a box under 44 high, 22 in a vertical box) |
| `title`, `titleSize` | Default 12.5. A title too long for the box is set smaller, down to 10 |
| `sub`, `subSize` | A string or an array of lines, in mono. Default 9, down to `minSize` |
| `minSize` | The smallest size a sub may be set at (default 8) |
| `tone` | `neutral` (default), `accent`, `add`, `gap`, `p3` (dashed), `muted`, `ink` |
| `dashed`, `shadow` | A dashed outline; an offset shadow in the accent colour |
| `align` | `'center'`: the title and sub centred, the icon left of the wider of the two (a bar across a layer) |
| `vertical` | The title and sub read bottom to top, the icon at the foot (a column a message crosses) |
| `info` | A tooltip (`<title>`), and the box becomes focusable with an `aria-label` |
| `cls`, `r` | Extra classes; the corner radius (default 8) |

### `EdgeSketch.check(svg)`: the check for any figure

Returns a list of problems in the figure's current state, whether it was drawn with EdgeSketch or not:
- text outside the viewBox;
- text running outside its box. A box is a `.sk-box` or a `[data-box]` element, and its frame is its `.sk-frame`, else its first rect. A text in no marked box takes the smallest painted rect beside it in the same group that holds its centre; rects that are transparent hit areas, and rects directly in an `<svg>`, where background bands live, are not boxes;
- text on top of text, and an icon on top of text;
- text partly on a box it does not belong to.

Hidden elements are skipped, and so is anything inside `[data-check="false"]`. Each problem is outlined in red. With `window.ED_DEBUG` set, every EdgeSketch figure and every `svg[data-check]` is checked once the fonts have loaded, and with `window.ED_DEBUG_ALL` every `svg[role="img"]` that is not an EdgeDiagram figure; the problems go into the same `<pre id="ed-issues">` as EdgeDiagram's. `scripts/shot.sh --check` sets both. `EdgeSketch.checkAll(all)` runs that pass by hand, `EdgeSketch.report(key, list)` adds a list to the `<pre>`, and `EdgeSketch.version` is the version.

## EdgeDeck (`lib/edgedeck.js`)

`EdgeDeck.version` is the version.

```js
EdgeDeck.run({builds: BUILDS, lib: {name: 1}, icons: window.EDGE_ICONS});
```

The page must contain:

- `#viewport` with a 1600×900 `#stage` inside it;
- slides as `<section class="slide" data-steps="N" data-build="name">`;
- in each slide, an optional `<ol class="caps">` (N+1 `<li>`, one per state) and `<div class="stepdots">`;
- a control bar with `#b-prev`, `#b-next`, `#b-full`, `#prog` and `#count`.

`templates/deck.html` has all of this.

`BUILDS[name](slide)` returns a paused GSAP timeline with labels `s0..sN`, or `null`. If the timeline has `onStep(k)`, it is called on every step, and with `-1` when the slide is left. Builds listed in `lib` still run once without GSAP, to draw their final state.

With `window.ED_DEBUG` set, every slide is built at the start, so the check covers the whole deck.

Input:

- arrows, space, Enter, PageUp/PageDown, Home/End;
- a click (the left 30% goes back);
- a swipe;
- a bare `#n` in the URL opens slide n.

A click on a diagram node pins its tooltip instead of turning the page.

## Icons (`lib/icons.js`)

`window.EDGE_ICONS` is a string of `<symbol id="i-…">` elements on a 24-unit grid, with a 1.7 stroke, round caps, and colour from `currentColor`. To list them:

```bash
grep -o 'symbol id=\\"i-[a-z-]*' lib/icons.js | sed 's/.*i-//'
```

There are 50. They cover:

- **Grid:** recloser, regulator, capacitor, transformer, substation, rtu, pv, meter, ev, fault, cabinet.
- **Compute and platform:** server, desktop, vm, container, wasm, chip, database, broker, cloud, radio, code, apps.
- **Trust:** lock, key, shield, certificate, verified, policy, manifest.
- **Operations:** control, gauge, clock, calendar, truck, coin, link, plug, target, safety, home, phone, watch.
- **Test:** simulator, evidence, cell, federated, model, wan-cut, ticket.

To add an icon, append a `<symbol id="i-name" viewBox="0 0 24 24">` that uses the same stroke conventions.
