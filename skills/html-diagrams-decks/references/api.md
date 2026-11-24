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
| `from`, `to` | `[nodeId, side, t]`. `side` is `top`, `bottom`, `left`, `right` or `auto`, and `auto` picks the side that faces the other end. `t` (0–1) is the position along the side. A wire leaves and enters perpendicular to its side. When the side or `t` is `'auto'`, the end is spread along its side with the other auto ends there, ordered by where their other ends are, so they do not cross. An explicit side with no `t` is its middle. Links on a `ghost` node meet at one point. An end with no number for `t` that is alone on its side moves along it to line up with the other end, when the two nodes face each other across a span they share, so the wire is one straight run |
| `route` | `ortho` (default: right angles, rounded corners), `straight` (for ends already in line; the check reports one that is slanted), `curve` (a cubic Bézier, only when a curve is wanted) |
| `stub`, `clearance`, `radius`, `avoid` | For `ortho`. Of the routes that avoid everything, it takes the one with the fewest bends, then the shortest, and avoids short jogs between two turns. `stub` is the straight run out of each side (default 16). `clearance` is the gap kept around nodes (default 8). `radius` rounds the corners (default 14). `avoid: false` stops the route going around nodes. By default the route goes around every node except its own ends, their parents and the chips inside them, keeps off other ortho wires, avoids crossing other wires when a slightly longer path does not, and prefers to stay out of zones that hold neither end: no turn inside one, and as short a run through one as the layout allows, so crossing a band is fine but running along inside one is not. It never leaves the viewBox |
| `tension` | Curve tension (default 0.45) |
| `tone` | `accent` (default), `muted`, `gap`, `add`, `ink2`, `p3` (dashed) |
| `dashed` | Dashed wire |
| `arrow` | `end`, `start`, `both` |
| `label`, `labelAt`, `labelFixed` | Text on a plate the colour of the zone beneath, placed at `labelAt` along the path (default 0.5). If it would cover a node or another label, it slides along the wire to a clear spot unless `labelFixed`. It sits on a layer above every wire, as `d.items[id + '.label']` |
| `info`, `infoTitle` | Makes the link focusable and gives it a tooltip like a node's. The title is `infoTitle`, else `label`, else "From → To" |
| `check` | `false` leaves the link out of the layout check |
| `flow` | `{dir: 1|-1, count, period (s), phase, r, tone}`: packets that follow the drawn path while the flow is on. They fade with their link (a dimmed link has dimmed packets), wait until the wire has been drawn, and stop while the figure is off screen |

### `d.fan(id, o)`: one point feeding several nodes, or several feeding one

```js
d.fan('jobs', {from: ['queue', 'bottom'], to: ['w1', 'w2', ['w3', 'top', null, {label: 'gpu'}]], arrow: 'end', label: 'jobs', flow: {dir: 1}});
d.fan('logs', {from: [['w1', 'bottom'], ['w2', 'bottom'], 'w3'], to: ['store', 'top'], arrow: 'end'});   // several into one
```

A trunk leaves the shared end. A bus runs across at right angles, halfway to the nearest end, and a branch drops from it into each end. A dot marks every junction where three or four runs meet. The corners there are square, and every other corner is rounded.

| Option | Meaning |
| --- | --- |
| `from` / `to` | The shared end `[nodeId, side, t]`, and the list of the other ends. Each of those is a node id or `[nodeId, side, t, {label, labelAt, info, flow, id}]`. When the list is in `from`, the fan gathers into `to`. A side left out faces the bus: an end below a bottom trunk enters at its top. An end on a side across the bus is reached along the bus and in through a stub. `t` left out is the middle, and the trunk's `t` left out puts the trunk in line with the end nearest its side's middle, when one is in reach |
| `at` | Where the bus runs (y for a vertical trunk, x for a horizontal one) |
| `label` | On the trunk, halfway. A branch's own `label` sits halfway along its last run |
| `tone`, `dashed`, `arrow`, `flow`, `info`, `radius`, `stub`, `check` | As for `d.link`, applied to every branch. Packets run the whole way along each branch |
| `dot`, `dotSize` | `false` leaves the junction dots out; their radius (default 3.6) |

Each branch is a link named `id + '.' + nodeId` (or its own `id`), for hover, `flows` and steps. In a step, the fan's `id` stands for all its branches and its dots, as `id + '.dots'`.

### `d.bindFocus()`

Call it after all nodes and links exist. Hovering or focusing a node or link that has `info` dims everything except it and its neighbours, and shows a tooltip.
- A click, or Enter or space on a focused item, pins the tooltip.
- A second click, a click elsewhere, or Escape releases it.

The tooltip is `position: fixed`, stays inside the window, and is announced through `aria-describedby`. Below 560 px it becomes a sheet at the bottom of the screen. `EdgeDiagram.clearAll()` releases every tooltip on the page; EdgeDeck calls it on every slide change.

### `d.layout(opts)`

Redraws every link. This is only needed after moving nodes by hand. A node added after some links already marks them for redrawing, and `steps`, `bindFocus` and `check` do that redraw.

When a node or a zone has no `x` or `y`, the diagram holds that call and every later `zone`, `node`, `text`, `link` and `fan` until `d.layout(opts)`; then `lib/edgelayout.js` places them and they are drawn in the order given. `steps`, `bindFocus` and `check` call it with no options when it was left out. See **EdgeLayout** below.

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
- a `straight` link that is slanted, and an ortho link with a jog under 10 units (two ends almost in line);
- an ortho link turning inside a zone that holds neither of its ends;
- a link label on a node or on another label;
- a node or label outside the viewBox.

In debug mode, the check runs once fonts have loaded. Each problem is outlined in red, logged with `console.warn`, and written to a hidden `<pre id="ed-issues">`; `EdgeDiagram.issues()` returns them all. `scripts/shot.sh --check page.html` reads that list and exits 1 if it is not empty.

`EdgeDiagram.route(p0, side0, p1, side1, kind, opts)` returns the path `d` string, for drawing a wire by hand. `EdgeDiagram.version` is the library's version.

## EdgeLayout (`lib/edgelayout.js`)

Automatic layout for EdgeDiagram: declare the nodes, links, fans and zones without coordinates and the library places them. Load it after `edgediagram.js`. `templates/auto.html` is a complete example.

```js
var d = EdgeDiagram.create(svg, {icons: window.EDGE_ICONS});
d.zone('edge', {label: 'EDGE'}).zone('cloud', {label: 'CLOUD'});           // drawn around their nodes
d.node('gw', {zone: 'edge', icon: 'rtu', title: 'Gateway', sub: 'polls · converts'})   // no x, y, w, h
 .node('ingest', {zone: 'cloud', icon: 'cloud', title: 'Ingest'});
d.fan('poll', {from: [['meter'], ['relay']], to: ['gw'], arrow: 'end'});   // sides left out
d.link('up', {from: ['gw'], to: ['ingest'], arrow: 'end', label: 'forward'});
d.layout({dir: 'LR', bands: true});
```

What it does, in order (a layered, Sugiyama-style layout written for the ortho router):
1. **Cycles.** A depth-first walk reverses the links it finds going back; they are drawn the other way round, as loops.
2. **Ranks.** Longest path, then sources pulled next to what they feed and other nodes moved toward the side with more links. The ends of a fan share one rank, one rank from its source when the graph allows.
3. **Lanes.** A link that spans several ranks gets a dummy in each rank between, which keeps a lane open for its wire (as wide as its label).
4. **Order.** Barycentre sweeps down and up, and swaps of neighbours, from three starts (the order declared and two depth-first walks); it keeps the order with the fewest crossings. A zone's nodes stay together, and zones keep the order they were declared in.
5. **Position across the ranks.** A node joins the column of its median neighbour when it is that neighbour's median too, preferring the branch that leads on (so a chain runs straight and a side branch bends off it); two alike branches are centred on instead. The columns are packed, then each is pulled to the median of its neighbours as far as the nodes beside it allow. A fan's source is centred over its ends, and a node over branches only it feeds.
6. **Position along the ranks.** Each rank is as deep as its deepest node; boxes of one rank get the same depth (width in LR, height in TB) unless they gave it, so columns are even. The gaps leave room for zone pads and labels, link labels and the lanes of bent wires.
7. **Ends.** Every link without a side gets the side facing its next rank (a long link whose lane runs beside its end, with nothing between, leaves by that side). Ends that share a side are placed across from what they join, in order, apart by 24 or by their labels; a pair a few units out of line is moved into line, or far enough apart to turn on purpose. A side or a `t` given by hand is kept.

Then the viewBox is fitted to the figure (`fit: false` keeps it).

| Option of `d.layout` | Meaning |
| --- | --- |
| `dir` | `'TB'` (default, ranks top to bottom) or `'LR'` |
| `bands` | `true`: each zone takes its own ranks, in the order declared (a layered architecture: field, edge, cloud). A link from a later zone to an earlier one is drawn back. Without it, zones sit side by side or anywhere their links put them |
| `rankSep`, `nodeSep` | The gap between ranks (64 TB, 72 LR) and between neighbours in a rank (40 TB, 28 LR) |
| `zonePad`, `margin` | Space between a zone's edge and its nodes (20, plus 22 for the label), and around the figure (24) |
| `uniform` | `false` keeps each box's measured depth instead of the rank's |
| `iterations` | Crossing sweeps per start (12) |
| `order` | `'input'` skips crossing reduction (the order declared), to compare |
| `fit` | `false` keeps the SVG's viewBox |

| Per item | Meaning |
| --- | --- |
| node `x`, `y` | A pinned node: it stays there, and the others are placed around it. A node drawn before the held calls counts as pinned |
| node `w`, `h` | Optional; measured from the title, sub and icon otherwise |
| node `zone` | The id of a zone without coordinates (or list the nodes in the zone's `nodes: [ids]`) |
| node `rank` | The least rank the node may take (0 is the first) |
| zone without `x`, `y` | Drawn around its nodes, with room for its label. Zones do not nest |
| link `from`/`to` | `[id]` is enough; a side or a `t` given is kept |

After `d.layout`, `d.layoutInfo` holds `{dir, ranks, crossings, inputCrossings, width, height, order}`: `crossings` between ranks after reduction, `inputCrossings` in the order declared, and `order`, each rank's node ids (`~` for a lane). Same input, same figure: every sort breaks ties by the order of declaration. Node sizes are measured with the page's fonts and never smaller than an estimate, so a figure laid out before the web fonts arrive still fits its text. `EdgeLayout.size(svg, o)` fills in a node's `w` and `h` the same way, and `EdgeLayout.version` is the version.

Limits: a fan whose ends cannot share a rank one away from its source draws its bus across the ranks between, and its branches do not go around nodes; zones do not nest; a pinned node in a rank sets that rank's line, and a second pinned node in the same rank may sit off it. Prefer a hand composition (`x`, `y` on every node, or EdgeSketch) when the arrangement itself carries the meaning: a stack of layers in a fixed order, a figure that must match another, a symmetric diagram.

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
| `s.arrow(x1, y1, x2, y2, o)` or `s.arrow([[x, y], ...], o)` | An arrow at right angles. Two points that are not in line are joined by a Z that turns halfway (`o.bend: 'mid'`), or by an L (`'hv'` horizontal first, `'vh'` vertical first). In a polyline, each point not in line with the last is reached by going on in the same direction first. `o.radius` rounds the corners (default 6). `o.route: 'straight'` keeps a diagonal and marks it `data-route="free"`. `o.tone` (default `accent`), `o.heads` `end` (default), `both`, `start`, `none`; `o.dashed`; `o.label`, halfway along the longest run, or at `o.labelAt` (0–1) along the whole wire |
| `s.connect(a, sideA, b, sideB, o)` | An arrow from a side of one box to a side of another. A box is what `s.box` returned, `{x, y, w, h}` or `[x, y, w, h]`. Facing sides on boxes that share a span give one straight run; otherwise it is an L, a Z, or a U around the back. `o.at`, `o.to` (0–1) fix the positions along each side, `o.gap` the room left at each end (2 and 3), `o.stub` the run out of a side (14); the rest as in `s.arrow` |
| `s.fan(a, side, [b, [c, side, t], ...], o)` | One point on a side feeding several boxes: a trunk, a bus at right angles (`o.at` places it), a branch into each box and a dot at each junction. `o.into: true` gathers them into the one point instead; `o.t` fixes the trunk's position, else it lines up with the end nearest the middle; `o.label` goes beside the trunk; `o.dot: false` leaves the dots out. Returns the group |
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
- text partly on a box it does not belong to;
- a wire that is slanted or curved. A wire is a `path`, `line` or `polyline` with an arrowhead marker, or with a class `wire`, `arrow`, `link` or `connector`, and no fill. A curve that turns one right angle within 40 units is a rounded corner and passes. A wire inside `[data-route="free"]`, or one with that attribute, is left alone. `EdgeSketch.wireShape(el)` returns `'slanted'`, `'curved'` or `null` for one element.

Hidden elements are skipped, and so is anything inside `[data-check="false"]`. Each problem is outlined in red. With `window.ED_DEBUG` set, every EdgeSketch figure and every `svg[data-check]` is checked once the fonts have loaded, and with `window.ED_DEBUG_ALL` every `svg[role="img"]` that is not an EdgeDiagram figure; the problems go into the same `<pre id="ed-issues">` as EdgeDiagram's. `scripts/shot.sh --check` sets both. `EdgeSketch.checkAll(all)` runs that pass by hand, `EdgeSketch.report(key, list)` adds a list to the `<pre>`, and `EdgeSketch.version` is the version.

## EdgeSequence (`lib/edgesequence.js`)

Sequence diagrams: who talks to whom, in what order. `templates/sequence.html` is a complete example.

```js
var q = EdgeSequence.create(svgElement, {icons: window.EDGE_ICONS});
q.group('SERVICE', ['api', 'db']);
q.actor('web', {icon: 'desktop', title: 'Browser'}).actor('api', {icon: 'server', title: 'API', tone: 'accent'}).actor('db', {icon: 'database', title: 'Database'});
q.msg('post', {from: 'web', to: 'api', label: 'POST /orders', caption: 'The browser sends a write.'})
 .self('check', {at: 'api', label: 'validate'})
 .msg('ins', {from: 'api', to: 'db', label: 'INSERT'})
 .msg('ok', {from: 'db', to: 'api', label: 'commit', reply: true, with: true})
 .msg('201', {from: 'api', to: 'web', label: '201 Created', reply: true})
 .note('why', {over: ['web', 'api'], text: 'one round trip'});
q.frame('tx', {kind: 'alt', label: 'valid', from: 'ins', to: 'ok', else: [{at: 'ok', label: 'invalid'}]});
var ctl = q.steps();
```

The actors stand in equal columns across the viewBox's width, in the order they are defined, with a dashed lifeline below each. Rows run top to bottom in the order the entries are defined, and the library sets the viewBox's height to fit them. Everything is drawn when `steps`, `render` or `check` is first called.

| Call | What it draws |
| --- | --- |
| `q.actor(id, o)` | A box at the head of a column. `title`, `sub` (wrapped at `subWrap`, 26), `icon`, `tone` (`neutral`, `accent`, `add`, `gap`, `p3`, `muted`), `shape: 'pill'`, `info` (a tooltip, and the box becomes focusable) |
| `q.group(label, [actorIds])` | A band behind those actors' columns, labelled at its top |
| `q.msg(id, o)` | A numbered arrow from `from` to `to`, its `label` above it. `reply: true` dashes it (tone `muted` by default) and ends the activation bar of the actor it leaves. Otherwise it starts a bar on the actor it reaches, unless `activate: false`. `tone` (`accent` by default), `info`, `caption` (for the step), `with: true` (shown in the same step as the entry before it) |
| `q.self(id, {at, label, side, ...})` | A message from an actor to itself: a loop and a nested bar. The loop opens to the right, and to the left from the last column; `side: 'left'` or `'right'` chooses |
| `q.note(id, {over: [actorIds], text, wrap})` | A note across those actors' lifelines, in its own row |
| `q.frame(id, {kind, label, from, to, else, over})` | A box around the entries from `from` to `to`, across the columns they touch (and those in `over`). `kind` is the word in its tab (`alt`, `opt`, `loop`, `par`, or any other), `label` the guard in brackets, and `else: [{at: entryId, label}]` a dashed divider before that entry. Frames nest |
| `q.steps(list, o)` returns `ctl` | With no list, step 0 shows the actors and each later step one entry (or more, with `with`), and a frame shows with its first entry. A list is `[{show: [ids], caption}, ...]`, with the actors added to step 0. The entries of the current step are drawn thicker, with a packet travelling along each; forward steps draw the wire and then its arrowhead, and back steps jump. `o.onStep(k, step)`, `o.start` (a number or `'end'`), `o.caption0` (step 0's caption), `o.packets: false`. `ctl` has `next`, `prev`, `go(k)`, `end`, `step`, `count`, `steps` (the list) and `timeline` (with GSAP on the page: a paused timeline with labels `s0..sN` and `onStep`, for an EdgeDeck build) |
| `q.render()`, `q.check()` | Draw now; the layout check, returning the problems |

`create` options: `width` (else the viewBox's), `row` (row height, 44), `boxH` (actor height, 56), `boxW` (actor width, at most the column), `margin` (16), `top` (14), `numbers: false` (no numbers), `debug`.

The check finds text running out of an actor or a note, labels on top of each other, a message label wider than the gap between its lifelines, a self message's label across another lifeline, a frame's head under a label, and anything outside the viewBox. With `window.ED_DEBUG` it runs once the fonts have loaded and writes into the shared `<pre id="ed-issues">`, so `scripts/shot.sh --check` covers sequence figures; EdgeSketch's check leaves them alone. `EdgeSequence.version` is the version.

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

| Keys | What they do |
| --- | --- |
| right, down, PageDown, space, Enter, N, J | The next step, then the next slide |
| left, up, PageUp, Backspace, Shift+space, P, K | The previous step, then the previous slide |
| Shift with an arrow or PageUp/PageDown | A whole slide, past its steps |
| Home, End | The first slide, the end of the last one |
| a number, then Enter | That slide |
| F | Fullscreen on and off |
| B, W or `.` | Blanks the screen (the key a presenter's clicker sends); any key brings it back |

- Presenter clickers send PageDown and PageUp, so they work as they are.
- Enter and space on a focused button, link or diagram item are left to it, so one press never acts twice; keys with Ctrl, Alt or Cmd are left to the browser, and keys typed into a field to the field.
- A click turns the page (the left 30% goes back), a swipe too, and a click on a diagram node pins its tooltip instead. When the deck is embedded (an iframe, a claude.ai artifact), the first click only brings it into focus, so that the keys reach it.
- A bare `#n` in the URL opens slide n.

`EdgeDeck.run` returns `{next, prev, show, go, nextSlide, prevSlide, state}`; `state()` is `{slide, step, blank}`.

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
