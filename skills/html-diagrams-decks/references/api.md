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
| `shape` | `'pill'` for a rounded chip; the shapes of state machines and processes (see below) |
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

### State machines and processes

```js
d.node('init', {x: 96, y: 24, w: 18, h: 18, shape: 'initial'})
 .node('trusted', {x: 750, y: 110, w: 140, h: 56, shape: 'state', title: 'Trusted', sub: 'runs workloads'})
 .node('svc', {x: 625, y: 40, w: 375, h: 320, shape: 'composite', title: 'In service'});   // before the states it holds
d.transition('fail', {from: ['trusted', 'bottom'], to: ['untrusted', 'top'], event: 'quote fails', action: 'stop workloads'})
 .transition('heal', {from: ['untrusted', 'top'], to: ['trusted', 'bottom'], event: 'quote ok', guard: '3 in a row'})
 .transition('beat', {from: 'trusted', to: 'trusted', side: 'top', event: 'quote ok', action: 'reset timer'});
d.steps(d.walk(['init', 'enrol', 'registered', 'quote', 'attested'], captions));
```

Node shapes (`shape`):

| Shape | Drawn as |
| --- | --- |
| `state` | A rounded box (corner 18), its text centred |
| `task` | A rounded box (corner 12), its text centred: a step of a process |
| `initial` | A filled dot: where a state machine starts. Give it a small square box (18) |
| `final` | A ringed dot: where it ends |
| `choice` | A small diamond, where guards split a transition |
| `decision` | A diamond with its `title` (and `sub`) inside; the check reports text that runs outside the diamond, not just its box |
| `start`, `end` | A process's start and end events: circles, thin and thick. A `title` sits below the circle |
| `composite` | A state that holds others: a box in the layer colour with its `title` on a tab in its top-left corner. Define it before the states inside it. Links between those states, and links out of them, draw above its fill; a label inside it is fine; a state on its tab is reported |

Links meet a dot, a ring, a diamond or a circle at the middle of a side, whatever `t` says. `initial`, `final` and `choice` take `title` too, below them; `label` names them for screen readers.

### `d.transition(id, o)`: a state machine's transition

A `d.link` with `arrow: 'end'`, tone `ink2` and a packet that runs while a step fires it, labelled `event [guard] / action` (the guard quieter, the action in italics). Every `d.link` option applies.

| Option | Meaning |
| --- | --- |
| `from`, `to` | A node id (side `auto`) or `[nodeId, side, t]` |
| `event`, `guard`, `action` | The parts of the label; any may be left out. `label` replaces them all |
| `side`, `span`, `loop` | For a self-transition (`from` and `to` the same node): the side its loop sits on (default `right`), how far apart it leaves and comes back (30) and how far it reaches out (26). Its label sits beside the loop |
| `apart` | Two links that run opposite ways between the same sides, with no `t` given, keep `apart` (default 22) between them, centred on the span the nodes share: the one going right runs above, the one going down runs on the right. Each label goes beside its wire, on its outer side. `apart: false` turns this off. It applies to any `d.link`, not just transitions |

A label (a transition's or any link's) also slides along its wire until it clears every other wire, and the check reports one that still lies on another wire (with `labelFixed`, or with no clear spot).

### `d.lanes(id, o)`: swimlanes

```js
d.lanes('who', {x: 20, y: 20, w: 1100, head: 116, lanes: [{id: 'operator', title: 'Operator', sub: 'NOC console'}, {id: 'hub', title: 'Hub'}]});
d.node('register', {lane: 'operator', x: 225, w: 130, h: 56, shape: 'task', title: 'Register device'});
```

Lanes are rows (`dir: 'horizontal'`, the default) or columns (`dir: 'vertical'`), each with its title (and `sub`) in a head column on the left, or a head row on top. Define them before their nodes.

| Option | Meaning |
| --- | --- |
| `x y` | The top-left corner |
| `w` (rows) or `h` (columns) | The length of every lane |
| `lanes` | `[{id, title, sub, size}]`, in order. Each `id` is a step item like a zone's, with `id + '.label'` for its title; the lanes' own `id` stands for all of them |
| `head` | The title column's width (rows, default 130) or the title row's height (columns, 48) |
| `min`, `pad` | A lane's least size (100 for rows, 170 for columns; a lane's `size` overrides it) and the room kept around its nodes (22) |
| `fit` | `false` keeps the viewBox as it is. By default, its height (rows) or width (columns) follows the lanes, ending as far past them as it starts before them |

A node with `lane` stays in that lane. In a row, its `y` is measured from the lane's top, and left out it is centred in the lane; in a column, the same goes for its `x`. Each lane grows to hold its nodes (a start or end event's title included), and the lanes after it move along, with their nodes and links. Lanes are zones to the router, so a wire crosses a lane that holds neither of its ends without turning inside it. The check reports a node outside its lane (in its head, or past its end).



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
| `current: nodeId` | Rings that node (a state machine's current state) until a later step names another (`null` clears it) |
| `fire: linkId` or `[ids]` | Draws the link thicker with its packets running, for this step only |
| Anything else | Kept for `onStep(k, step)`, for example `caption` |

Step 0 is the resting state, and its `show` items are drawn from the start. Items listed in a later `show` start hidden. A jump to any step, forwards or back, lands on what the steps up to it leave: every reveal is a `set` and a `to`, never a `fromTo`, so going back never leaves a shown item hidden. `scripts/test.sh` checks this. `ctl` has `next()`, `prev()`, `go(k)`, `end()`, `step`, `count`, `timeline` (a paused GSAP timeline with labels `s0..sN`) and `flowsAt(k)` (`-1` stops all flows). Going forward animates, going back jumps, and reduced motion always jumps. Without GSAP, everything is shown at once.

`d.walk([state, transition, state, ...], captions)` returns such steps: the first state is current at step 0, and each transition fires in the step that makes the state after it current (a self-transition between the same state twice). Captions, if given, go on the steps in order.

### Drill-down: a node that opens into its inner diagram

```js
d.node('broker', {x, y, w, h, icon: 'broker', title: 'Message broker', info: 'shown on hover',
  drill: {title: 'Inside the message broker', view: [0, 0, 1000, 400], draw: function (s) {
    s.node('ingest', {...}).node('topics', {..., drill: {...}});   // any depth
    s.link('in', {from: ['@api', 'right'], to: ['ingest', 'left'], arrow: 'end'});
  }}});
```

A node with `drill` carries a ⊕ in its top right corner. A click on it, or Enter, zooms the figure's view into the node, fades the figure out and grows the inner diagram from the node to the whole figure. `s` is an EdgeDiagram of its own (every call above works in it, `drill` too), drawn in an `<svg>` the size of the figure laid over it. To hold them both, the figure is wrapped in a `div.ed-host`, so a page rule like `.stage > svg` no longer matches it: write `.stage svg`. Each level is drawn at the figure's scale, so its text measures and checks as the top level's does.

| Key | Meaning |
| --- | --- |
| `draw(s)` | Draws the inner diagram. `drill: function (s) {...}` is short for `{draw}` |
| `view` | Its viewBox, `[x, y, w, h]` or `'x y w h'`. Give it the figure's aspect, so it fills the zoomed view; the default is 960 wide at that aspect |
| `title` | Its name in the trail of levels and for screen readers (default: the node's title) |
| `ports` | `false` for none, or per neighbour id: `false` (leave it out), `{side, at}` (`at` from 0 to 1 along the side), `{x, y, w, h}`, `{info}` |
| `mark` | `false` leaves out the ⊕ |

**Ports.** Each link of the figure that ends on the node becomes a port on the inner diagram's edge: a dashed pill named after the neighbour, with id `'@' + neighbour id`, on the side the link enters by, spread in the order of the links. Link it like any node (`from: ['@api', 'right']`). Ports are made before `draw` runs, so leave a margin of about 170 units on the sides that have them. A port of a port keeps its name: inside a level, the port of `@db` is `@db` again.

**Moving between levels.** The trail of levels (`nav.ed-crumbs`, put before the figure) shows a hint at the top level and, inside, Back and the path; each part is a button that goes back to that level. Escape goes up one level (after releasing a pinned tooltip). Focus moves into the inner diagram when it opens and back to the node when it closes. A node with `info` shows it on hover, the click opens. Reduced motion jumps.

| Call | Effect |
| --- | --- |
| `d.open(id)`, `d.close()` | Open a node of this level, close what is open below this level |
| `d.go('a/b')` or `d.go(['a', 'b'])` | Open that path at once, `''` back to the top |
| `d.path()` | The ids open below this level, e.g. `['broker', 'topics']` |
| `EdgeDiagram.go(svgId, 'a/b')` | The same for a figure by its id; with `shot.sh`, the js argument shoots a level: `shot.sh page.html out.png light 1280 'EdgeDiagram.go("shop","orders/payments")'` |

`create(svg, {hash: true})`, with an svg id, keeps the open level in the address (`#shop/orders/payments`) and opens it on load. `create(svg, {crumbs: false})` leaves the trail out; `{crumbs: element}` fills that element instead; `{crumbs: {home, hint}}` renames the top level and the hint. Every level shares the figure's options (`icons`, `debug`).

**Check.** Each inner diagram is checked as a figure of its own (`shot.sh --check` counts it). The parent's check adds a port with no link inside the level, and a ⊕ on the node's text. When printed, the top level is shown. `templates/drill.html` is a complete example, three levels deep.

### `d.check()`: the layout check

Returns a list of problems, checked at every step with what is visible at that step:
- nodes that partly overlap (a chip fully inside a node is fine);
- text that runs outside its node;
- a link through a node that is not one of its ends;
- a `straight` link that is slanted, and an ortho link with a jog under 10 units (two ends almost in line);
- an ortho link turning inside a zone that holds neither of its ends;
- a link label on a node or on another label;
- a node or label outside the viewBox;
- a node outside its lane, a node on a composite's title tab, and text outside a diamond;
- a link's label on another wire (its plate hides that wire, so the label reads as that wire's): move it with `labelAt`, or route one of them apart;
- crowding: two nodes closer than 8 units, and a node closer than 8 units to the border of the zone or lane it sits in (a chip inside a node is left alone);
- avoidable crossings: two links that cross where a clear change would remove the crossing, which the message names. Either their ends on a side of a node they share are in the wrong order (`swap their ends on the right side of node s (up at 0.30, down at 0.70)`), or one end of one of them can move to another side of its node (`take hx out of the left side of node h instead of its right side`). The check reroutes the links with the change and names it only when the new routes run through no node and along no other wire and stay in the viewBox, and then: for a swap, cross neither each other nor more of the other links than before; for another side, cross no link at all, turn no more often and are at most 40 units longer. Fans, self-transitions, pairs kept `apart` and routes other than `ortho` are left alone.

With `lib/edgesketch.js` on the page (`scripts/shot.sh --check` puts it there), the check adds `EdgeSketch.paint` (below): contrast in the light and the dark theme, a wire through a text that is not its own, and wires that run together. It looks at the figure as it is drawn when the check runs.

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

Then the viewBox is fitted to the figure (`fit: false` keeps it), and grown to hold any wire or label drawn past the boxes, such as a self-loop's label. In TB, a zone whose label (top-left) would be crossed by a wire entering it from above gets room on its left, so the label sits beside the wire.

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
- a wire that is slanted or curved. A wire is a `path`, `line` or `polyline` with an arrowhead marker, or with a class `wire`, `arrow`, `link` or `connector`, and no fill. A curve that turns one right angle within 40 units is a rounded corner and passes. A wire inside `[data-route="free"]`, or one with that attribute, is left alone. `EdgeSketch.wireShape(el)` returns `'slanted'`, `'curved'` or `null` for one element;
- crowding: two boxes closer than 8 units, and a box closer than 8 units to the border of the `.sk-zone` it sits in (a box inside a box is left alone);
- and everything `EdgeSketch.paint(svg)` finds.

`EdgeSketch.paint(svg, name)` returns `{msg, box}` for the problems a reader sees in the figure as it is drawn, whatever drew it; EdgeDiagram, EdgeSequence, EdgeTimeline and EdgeMatrix add it to their own check when `lib/edgesketch.js` is on the page:
- **contrast**, in the light and the dark theme: it sets `data-theme` on the root to `light`, then `dark`, and puts it back (with transitions off meanwhile). Each text, wire and icon (`use`) is measured against what is painted under it: the fills drawn before it in document order that hold the point, each with its fill opacity and every opacity above it (a soft tone, a translucent plate, `filter: opacity()`), over the backgrounds of the page around the svg. Text needs 4.5:1, or 3:1 when it is 18.66 px and bold (600 and up) or 24 px and up; wires and icons need 3:1. The message names what is behind, the theme and the ratio, rounded down. Colours that `rgb()` does not spell (`color-mix()`, `oklch()`) are read through a canvas pixel. Anything faded below half its opacity (a dimmed step, a focus fade) is taken as faded on purpose and left out;
- **a wire through a text** that is not its own: any text (a node's title or sub, a link label, a zone label, free text) that a wire's line passes through. A wire drawn under the text with a solid fill between them (a label's plate, a node) does not count, so a label on a plate over its own wire passes; the last 10 units at an arrowhead, and 3 at a plain end, are left out, so an arrowhead may touch its target;
- **wires that run together**: two wires whose straight runs are parallel, between 0.75 and 6 units apart, over 30 units or more; they read as one. Runs closer than 0.75 are one shared run, as in a fan, and pass.

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
| `q.steps(list, o)` returns `ctl` | With no list, step 0 shows the actors and each later step one entry (or more, with `with`), and a frame shows with its first entry. A list is `[{show: [ids], caption}, ...]`, with the actors added to step 0. The entries of the current step are drawn thicker, with a packet travelling along each; forward steps draw the wire and then its arrowhead, and back steps jump. `o.onStep(k, step, ctl)` (ctl is passed because the first call comes before `steps` returns), `o.start` (a number or `'end'`), `o.caption0` (step 0's caption), `o.packets: false`. `ctl` has `next`, `prev`, `go(k)`, `end`, `step`, `count`, `steps` (the list) and `timeline` (with GSAP on the page: a paused timeline with labels `s0..sN` and `onStep`, for an EdgeDeck build) |
| `q.render()`, `q.check()` | Draw now; the layout check, returning the problems |

`create` options: `width` (else the viewBox's), `row` (row height, 44), `boxH` (actor height, 56), `boxW` (actor width, at most the column), `margin` (16), `top` (14), `numbers: false` (no numbers), `debug`.

The check finds text running out of an actor or a note, labels on top of each other, a message label wider than the gap between its lifelines, a self message's label across another lifeline, a frame's head under a label, and anything outside the viewBox, and with `lib/edgesketch.js` on the page adds `EdgeSketch.paint` (contrast, wires through text, wires run together). With `window.ED_DEBUG` it runs once the fonts have loaded and writes into the shared `<pre id="ed-issues">`, so `scripts/shot.sh --check` covers sequence figures; EdgeSketch's check leaves them alone. `EdgeSequence.version` is the version.

## EdgeTimeline (`lib/edgetimeline.js`)

Timelines and Gantt-style roadmaps: what happens when, in which workstream, and what waits for what. `templates/timeline.html` is a complete example.

```js
var t = EdgeTimeline.create(svgElement, {start: '2027-01-01', end: '2027-12-31', unit: 'month', today: '2027-04-19'});
t.band('product', {title: 'PRODUCT'});
t.lane('api', {title: 'API', sub: 'platform team', band: 'product'}).lane('web', {title: 'Web app', band: 'product'});
t.phase('design', {start: '2027-01-01', end: '2027-03-31', label: 'Design', tone: 'accent', caption: 'The API comes first.'});
t.bar('schema', {lane: 'api', start: '2027-01-11', end: '2027-03-05', label: 'Schema', tone: 'accent', progress: 1, info: 'Resources and errors.'})
 .bar('ui', {lane: 'web', start: '2027-03-15', end: '2027-07-16', label: 'Screens', planned: true})
 .milestone('beta', {lane: 'web', at: '2027-07-30', label: 'Beta', tone: 'gap', line: true});
t.dep('d1', {from: 'schema', to: 'ui'}).dep('d2', {from: 'ui', to: 'beta'});
var ctl = t.steps();
```

The lane titles take a column on the left (`labelW`) and the time axis the rest of the viewBox's width. Lanes run top to bottom in the order they are defined, gathered under their band, and the library sets the viewBox's height to fit them. Everything is drawn when `steps`, `render` or `check` is first called.

**Time.** With dates (`'YYYY-MM-DD'`, `'YYYY-MM'`, `'YYYY'` or a `Date`), an `end` is inclusive: `end: '2027-03-31'` runs to the end of that day, `'2027-03'` to the end of March. A milestone sits in the middle of its day. `unit` is `day`, `week` (ISO weeks, `W14`), `month` (default), `quarter` or `year`, and a second tier above names the months (for days and weeks) or the years (for months and quarters). With numbers, the axis is in abstract units from `start`: `{start: 0, end: 12, unit: 'week'}` labels its cells `W1` to `W12`, a bar `{start: 0, end: 4}` covers W1 to W4, and a milestone `at: 4` sits between W4 and W5. Labels that do not fit their cells are thinned to every second, third ... cell.

| Call | What it draws |
| --- | --- |
| `t.band(id, {title})` | A layer behind a group of lanes, its title in small capitals above them. A lane's `band` that is not defined yet is created with its id as the title |
| `t.lane(id, o)` | A row. `title`, `sub` (a second, smaller line), `icon`, `band`, `h` (its height, else `row`), `info` (hovering it lights its items) |
| `t.bar(id, o)` | A bar on `lane` from `start` to `end`. `label` goes inside when it fits and beside it when not, on the side clear of other bars, labels and arrows (`labelPos: 'inside'`, `'right'`, `'left'` choose). `tone` (`neutral`, `accent`, `add`, `gap`, `p3`, `muted`; `p3` and `muted` are dashed), `progress` (0 to 1, a fill from the left), `planned: true` (dashed, on the surface), `info`, `caption` and `with` (item steps) |
| `t.milestone(id, o)` | A diamond on `lane` `at` a time, its `label` beside it. `tone` (default `neutral`), `line: true` (a dashed line across every lane, for a gate), `size` (8), `info`, `caption`, `with` |
| `t.phase(id, o)` | A strip above the lanes from `start` to `end`, and a soft column behind the lanes in `lanes` (all by default). `label`, `tone`, `caption`, `info`. Overlapping phases take separate rows |
| `t.dep(id, {from, to, info})` | Finish to start: an arrow from the end of a bar or milestone to the start of another. It runs straight in a lane; between lanes it goes out, down at the first column that crosses no bar, and in; when the target starts too soon for that, it runs along the boundary between lanes and comes back. Corners are rounded |
| `t.steps(list, o)` returns `ctl` | With no list and some phases, step 0 shows the axis and the lanes and each later step one phase with the bars and milestones that start in it; with `o.by: 'item'` or no phases, one step per bar or milestone in time order (`with: true` joins the step before). A list is `[{show: [ids], caption}, ...]`. A dependency shows with the later of its ends. The items of the current step are drawn thicker; forward steps grow the bars from their start and draw the arrows, back steps jump. `o.onStep(k, step, ctl)` (ctl is passed because the first call comes before `steps` returns), `o.start` (a number or `'end'`), `o.caption0`. `ctl` has `next`, `prev`, `go(k)`, `end`, `step`, `count`, `steps` and `timeline` (with GSAP: a paused timeline with labels `s0..sN` and `onStep`, for an EdgeDeck build) |
| `t.render()`, `t.check()` | Draw now; the layout check, returning the problems |

`create` options: `start`, `end` (required), `unit`, `today` (a line down the lanes, labelled at its foot; `todayLabel`), `labelW` (170), `row` (lane height, 40), `barH` (22), `margin` (16), `right` (room right of the axis, 8), `tiers: 1` (no upper tier), `tickFormat(date or number)` and `upperFormat(date)` (the tiers' labels), `format(t0, t1)` (the span in tooltips, given in the axis's numbers: days since 1970 for dates, `t1` left out for a milestone), and, for abstract units, `prefix` (else `W`, `S`, `M`, `Q` ... from `unit`), `first` (the first cell's number, 1), `every` (units per cell, 1) and `upper: {every, prefix | label(i)}` (an upper tier), `debug`.

Items with `info` are focusable. Hovering or focusing one dims the rest but its dependencies and their other ends (a phase keeps what it spans, a lane its items) and shows a tooltip with the info, the dates, the progress and what it waits for; `info` can be `{text, facts: [[key, value]]}`. A click, Enter or space pins it; Escape or a click elsewhere releases it. `EdgeTimeline.clearAll()` releases every tooltip; EdgeDeck calls it on every slide change.

The check finds a lane title running into the chart, a label overflowing its bar or running out of the chart, a beside label on another item or crossed by an arrow, bars overlapping in a lane, a dependency pointing backward in time (its target starts before its source ends) or crossing a bar, an item outside the time axis, a phase label wider than its phase, and text on text or outside the viewBox, and with `lib/edgesketch.js` on the page adds `EdgeSketch.paint` (contrast, wires through text, wires run together). With `window.ED_DEBUG` it runs once the fonts have loaded and writes into the shared `<pre id="ed-issues">`, so `scripts/shot.sh --check` covers timelines; EdgeSketch's check leaves them alone. `EdgeTimeline.version` is the version.
## EdgeMatrix (`lib/edgematrix.js`)

Matrices and coverage maps: what covers what, in which state. `templates/matrix.html` is a complete example of both modes.

```js
var m = EdgeMatrix.create(svgElement, {status: '#status', totals: true});
m.colGroup('lab', {label: 'LAB'}).cols([{id: 'c1', label: 'Power cut', group: 'lab'}, {id: 'c2', label: 'Disk full', group: 'lab'}]);
m.rowGroup('upd', {label: 'UPDATES', caption: 'Updates first.'});
m.rows([{id: 'r1', code: 'U-01', label: 'Applies atomically', group: 'upd'}, {id: 'r2', code: 'U-02', label: 'Rolls back', group: 'upd'}]);
m.cells({r1: 'FP', r2: 'N.'});                              // one legend key per column; '.' is an empty cell
m.cell('r2', 'c2', {state: 'part', mark: '3', info: 'three of ten sites'});
var ctl = m.steps();                                         // one step per row group, then the totals
```

The library sets the viewBox to fit the content, and a `max-width` on the svg of 1.15 times its width (`maxScale`, `0` for none), so a small matrix is not blown up. Everything is drawn when `render`, `steps` or `check` is first called, and again when a web font loads.

| Call | What it does |
| --- | --- |
| `m.row(id, o)`, `m.rows([o])` | A row: `label`, `code` (a mono column before the labels), `group`, `info` (shown on hover of its header) |
| `m.col(id, o)`, `m.cols([o])` | A column: `label`, `code` (shown before the label unless `colCodes: false`), `group`, `info` |
| `m.rowGroup(id, o)`, `m.colGroup(id, o)` | `label`, `caption` (for the default steps). Keep a group's rows (or columns) together: each run of them gets one band |
| `m.cell(row, col, v)` | `v` is a state id, `[state, mark, info]` or `{state, mark, info}`. A mark is a short text in the cell (two or three characters) |
| `m.cells(map)` | `{rowId: 'FPN.X'}`, one legend `key` per column in order, or `{rowId: {colId: v}}` |
| `m.item(id, {row, col, label, icon, tone, info})` | A small box in a cell (plane mode, or any matrix): `icon` is a sprite id without `i-`; without `label` it is an icon square. `tone` as in the other libraries; `p3` and `muted` are dashed |
| `m.get(row, col)`, `m.counts(id)` | A cell's value; the counts per state of a row (over the visible columns) or a column (over the visible rows) |
| `m.filter(spec)` | Draws only some rows or columns: `'gaps'` (rows with a cell in a state with `gap: true`), `{states: [...]}`, `{rows: [ids or group ids] or fn(row, counts)}`, `{cols: [...] or fn(col)}`; `null` for all. Totals follow the filter |
| `m.highlight(spec)` | Dims all but the matching cells and their headers: `{states}`, `{rows}`, `{cols}`, `{groups}` (combined with and), or `fn(row, col, value)`; `null` clears. A click on a legend entry does `{states: [its id]}` and a second click clears it |
| `m.focus(row, col)` | Puts the cursor on a cell and shows its info; `m.focus(null)` clears |
| `m.steps(list, o)` returns `ctl` | With no list: step 0 shows the headers, each later step a row group (else a column group) with its `caption`, and a last step the totals when there are any (`o.captionTotals`). A list is `[{show: [ids], caption, highlight}]`, where ids are rows, columns, their groups, items or `'totals'`; a row or column no step names shows from step 0. The rows of the current step have bold headers. `o.onStep(k, step, ctl)`, `o.start` (a number or `'end'`), `o.caption0`. `ctl` has `next`, `prev`, `go(k)`, `end`, `step`, `count`, `steps` and `timeline` (with GSAP: labels `s0..sN` and `onStep`, for EdgeDeck) |
| `m.render()`, `m.redraw()`, `m.check()` | Draw if needed; draw again; the layout check, returning the problems |

`create` options:

| Option | Meaning |
| --- | --- |
| `legend` | The states, in order: `[{id, label, key, tone, style, gap}]`. `tone`: `add`, `gap`, `bad` (red, from `--ed-bad`, else the page's `--bad`), `accent`, `p3`, `muted`, `ink`, `neutral`. `style`: `solid` (filled; a mark is drawn in the surface colour), `soft` (the tone's soft fill), `outline`, `blank` (dashed, no fill). `gap: true` marks a state as a gap for `filter('gaps')`. The default is `EdgeMatrix.legend`: `full` (F, add, solid), `part` (P, gap, soft, a gap), `none` (N, bad, outline, a gap), `na` (X, muted, blank). `legend: false` keeps the states but draws no legend |
| `totals` | `true`, or `{rows, cols, states}`: a column per state with each row's counts, and a row per state with each column's counts. Counts too wide for a compact column are turned |
| `compact` | `'auto'` (default: over 60 rows or 900 cells), `true` or `false`. Compact cells are 14 units, normal ones 26 × 22 |
| `rotate` | `'auto'` (default: when a header would make the cells much wider), `true`, `false` (the cells widen to the headers) |
| `clip` | Ends a header that does not fit its room with an ellipsis; the full text is in its tooltip |
| `cw`, `ch`, `gap`, `fs`, `ms`, `rowMax`, `colH` | The cell's width and height, the gap, the header and mark font sizes, the widest row header (300, compact 240), the tallest turned header band (170, compact 130). A mark widens its column up to twice `cw` |
| `rowGroups` | `'side'` (default, a band beside the rows, its label wrapped to `groupW`, 130) or `'head'` (a band above each group's rows, for groups of one or two rows) |
| `corner` | A short text above the row headers, such as `REQ \ TEST` |
| `mode: 'plane'` | Wide cells (128 × 50 at least) that grow to hold their items, headers that wrap, no legend unless a cell has a state |
| `axes` | `{x, y, yDir}`: labelled arrows along the bottom and the left (`yDir: 'down'` points the left one down) |
| `status` | An element or selector that receives the info of the cell under the pointer or the cursor as one line; its own text comes back when the pointer leaves. Without it, a tooltip shows the info (`tooltip: false` for none) |
| `describe(row, col, value, items)` | Returns `{title, lines}` to replace the default info: the row, the column, the state and mark, the items, the cell's `info` |
| `keys: false` | The figure is not focusable. Otherwise it is, and the arrow keys move a cursor (PageUp/PageDown by ten rows, Home/End along the row, Escape clears); the cursor scrolls into view |
| `marks: false`, `margin`, `icons`, `debug` | No marks; the outer margin (8); the sprite; the check on load |

The check finds headers wider than the row header column or longer than the header band, column and row group labels wider than their span or taller than their rows, marks too large for their cell, totals that do not fit, item labels out of their box and items out of their cell, and text or legend entries outside the viewBox. Hidden rows of a step are checked too. With `lib/edgesketch.js` on the page it adds `EdgeSketch.paint` (contrast, wires through text, wires run together) for what is shown. With `window.ED_DEBUG` it runs once the fonts have loaded and writes into the shared `<pre id="ed-issues">`, so `scripts/shot.sh --check` covers matrix figures; EdgeSketch's check leaves them alone. `EdgeMatrix.version` is the version.

## EdgeText (`lib/edgetext.js`)

Figures written as a few lines of text, Mermaid-like, drawn by the libraries above: a quick figure without writing JS. `templates/text.html` has one of each kind. Load `edgetext.js` after the libraries it uses: `flow` and `state` need `edgediagram.js` and `edgelayout.js`, `sequence` `edgesequence.js`, `timeline` `edgetimeline.js`, `matrix` `edgematrix.js` (and `icons.js` for icons).

```html
<svg id="f" role="img" aria-label="What the figure claims"></svg>
<p id="cap"></p>
<script type="text/trazo" data-target="#f" data-caption="#cap">
flow LR
zone FIELD { meter[Meter | Modbus] {icon: meter} relay[Recloser | DNP3] }
gw[Gateway | polls · converts] {icon: rtu, tone: accent}
meter, relay -> gw: poll
gw -> cloud[Ingest]: forward {tone: add}
step: meter relay | Field devices speak their own protocols.
step: gw cloud | A gateway polls them and forwards every reading.
</script>
```

| Call | What it does |
| --- | --- |
| `EdgeText.render(svg or selector, source, opts)` | Parses the text and draws it into the svg. Returns `{kind, model, svg, figure, ctl, steps, errors, check()}`: `figure` is the library's object (`d`, `q`, `t` or `m`), `ctl` its `steps()` controller, `steps` the step list given to EdgeDiagram (flow, state), `check()` the library's layout check. `opts`: `caption` (an element or selector that gets each step's caption), `onStep(k, step, ctl)`, `start` (a step number or `'end'`), `maxScale` (a flow or state figure's svg gets a `max-width` of its viewBox's width times this, 1.15 by default, so it is not blown up; `0` for none), `icons`, `debug` |
| `EdgeText.parse(source)` | The model alone, with `errors: [{line, message}]` (empty when the text is fine); for tests |
| `EdgeText.auto()` | Renders every `script[type="text/trazo"]` and `pre.trazo` not rendered yet and returns all results, in page order. It runs by itself once the page has loaded. A block's `data-target` is its svg (else an svg is made in its place, with the block's `data-id` as its id; a `pre` is hidden); `data-caption` and `data-start` are as in `opts` |

**Errors.** Parsing stops at the first error. `render` draws the error in the figure's place (the message, the line number and the line), returns it in `errors`, and reports it into the shared `<pre id="ed-issues">`, so `shot.sh --check` fails on it. An error the library raises while drawing (an axis that ends before it starts) gets the number of the line that made the call.

**Common to every kind.** The first line names the kind. `%%` (also at the end of a line) and `#` (at the start) begin comments. `title: text` sets the svg's `aria-label` if it has none, and the first caption of a sequence, timeline or matrix. Options in braces at the end of a line, `{icon: server, tone: accent, info: 'Polls, then converts.'}`, pass straight to the library call that the line makes, so every option in this reference works; values are numbers, `true`, `false`, quoted text or bare text (which may hold commas). Options on the header line go to the layout (flow, state) or to `create` (the others). A name is letters, digits, `_` and inner `-`.

### `flow LR` or `flow TB`: EdgeDiagram, placed by EdgeLayout

| Line | Meaning |
| --- | --- |
| `A[Title \| sub] {opts}` | A node: a box with a title and a sub (more `\|` give more sub lines). `A(Title)` is a pill. A name used without brackets is its own title. Declaring a node again adds to it |
| `A -> B: label {opts}` | A link. `-->` dashed, `<->` arrows at both ends, `<-->` both and dashed, `--` no arrow. A chain `A -> B -> C: label` puts the label on its last link; the options go on every link of the line |
| `A -> B, C, D` / `A, B -> C` | A fan out of A, or into C (`&` works as the comma) |
| `zone NAME { A B }`, or `zone NAME {` … `}` | A zone holding those nodes; in the block form, every node first named inside it. Zones do not nest. With zones, the layout puts each in its own ranks (`bands: true`); `flow LR {bands: false}` lets them sit side by side |
| `step: A B zoneName A->B \| caption` | A step showing those items. A zone shows with its first node and a link once all its ends are shown, unless a step names them; a node no step names shows from the start. The first step line is step 0. A link with an arrow carries packets in the step it appears in, `{flow: true}` in every step, `{flow: false}` never |

### `state` (top to bottom by default, or `state LR`): EdgeDiagram state shapes, placed by EdgeLayout

TB keeps a machine of any length readable: in LR a chain of states becomes a strip too thin for its labels. Put the figure beside its caption (`templates/text.html` does) rather than across the page.

| Line | Meaning |
| --- | --- |
| `[*] -> Registered` / `Done -> [*]` | The start (a filled dot) and an end (a ringed dot) of the machine, or of the composite state the line is in |
| `Registered -> Attested: quote [EK valid] / store` | A transition: `event [guard] / action`, each part optional; `-->` dashes it. `A -> A: tick` is a self-transition |
| `Registered[Registered \| identity issued] {tone: add}` | A state; `Registered: identity issued` gives just the sub. `state X <<choice>>` (or `{shape: choice}`) is a choice diamond |
| `state InService[In service] {` … `}` | A composite state, drawn as a zone around its states. A transition to it enters at its `[*]` (else its first state), one from it leaves from its end (else its first state). Composites do not nest |
| `step: State \| caption` | The walk: each step names the state reached, by a transition from the state before (`d.walk`); the first is where it starts (`[*]` for the start). `walk: A B C` is the same without captions |

### `sequence`: EdgeSequence

| Line | Meaning |
| --- | --- |
| `participant api[API \| sub] {icon: server, tone: accent}` | A participant (`actor` is the same, `participant api as API` too). Participants named only in messages are added in the order they appear |
| `group SERVICE { api db }` | A band behind those columns |
| `A -> B: label \| caption {opts}` | A message; `-->` is a reply (dashed). `->>` and `-->>` are read as `->` and `-->`. `A -> A: label` is a self call. `{with: true}` shows it in the same step as the one before |
| `note over A, B: text` | A note over those columns (`left of`, `right of` mean over) |
| `alt cond` … `else cond` … `end` | A frame; also `opt`, `loop`, `par` (with `and`), `critical`, `break`. Frames nest |

Without a viewBox, the svg is 190 units per participant wide (560 to 1200).

### `timeline`: EdgeTimeline

| Line | Meaning |
| --- | --- |
| `axis 2027-01 .. 2027-12 month` | The time axis (required): dates or plain numbers, and a unit |
| `today 2027-04-19` | The today line (or `{today: ...}` on the header) |
| `band PRODUCT` | The lanes after it are in this band |
| `lane API`, or `lane api[API \| platform team] {opts}` | A lane; the bars and milestones after it are on it |
| `bar Schema 2027-01-15 .. 2027-03-10 {progress: 1}` | A bar; its label is everything before the dates. `bar id[Label] ...` gives it an id |
| `milestone Beta 2027-07-20 {tone: gap, line: true}` | A milestone |
| `phase Design 2027-01 .. 2027-03 \| caption {tone: accent}` | A phase; the default steps go phase by phase (`timeline {by: item}`: item by item) |
| `Schema -> Endpoints, Screens` | Dependencies, by label or id, after the items they join |

### `matrix`: EdgeMatrix

```
matrix {totals: true, corner: REQ \ TEST}
| Power cut | Disk full | Link down
group UPDATES | Updates first.
[U-01] Applies atomically | F P N
Rolls back | F | P3 | .
```

The first row names the columns (its first cell, before the first `|`, is the corner). Each row after it is a label (`[code] label` gives a code), then its cells, one per column: separated by `|`, or by spaces after a single `|`. A cell is a legend key (`F` full, `P` partly, `N` not, `X` not applicable), a key and a mark (`P3`), or `.` (empty). `group NAME | caption` starts a row group; the default steps reveal the groups, then the totals. `state K Label {tone: add, style: solid, gap: true}` lines replace the legend with your own states.

### Text or JS

Prefer the text for a quick figure: a flow of a dozen boxes, a sequence, a lifecycle, a plan, a small matrix. Use the JS API when the figure needs what the text does not say: a hand composition (coordinates, `d.lanes`, EdgeSketch), steps that dim, hide or fire particular links, packets in chosen directions, a fan's own branch labels, column groups, plane matrices, `d.text` labels, or anything driven by code. The two meet: `EdgeText.render` returns the library's object, so a page can add to `r.figure` or drive `r.ctl`.

## EdgeDeck (`lib/edgedeck.js`)

`EdgeDeck.version` is the version.

```js
EdgeDeck.run({builds: BUILDS, lib: {name: 1}, icons: window.EDGE_ICONS, notes: {name: ['step 0', 'step 1']}, printTheme: 'light'});
```

The page must contain:

- `#viewport` with a 1600×900 `#stage` inside it;
- slides as `<section class="slide" data-steps="N" data-build="name">`;
- in each slide, an optional `<ol class="caps">` (N+1 `<li>`, one per state), `<div class="stepdots">` and `<aside class="notes">` (the speaker's notes);
- a control bar with `#b-prev`, `#b-next`, `#b-full`, `#prog` and `#count`, and optionally `#b-notes` (opens the presenter view).

`templates/deck.html` has all of this.

`BUILDS[name](slide)` returns a paused GSAP timeline with labels `s0..sN`, or `null`. If the timeline has `onStep(k)`, it is called on every step, and with `-1` when the slide is left. Builds listed in `lib` still run once without GSAP, to draw their final state.

With `window.ED_DEBUG` set, every slide is built at the start, so the check covers the whole deck.

Input:

| Keys | What they do |
| --- | --- |
| right, down, PageDown, space, Enter, J | The next step, then the next slide |
| left, up, PageUp, Backspace, Shift+space, P, K | The previous step, then the previous slide |
| Shift with an arrow or PageUp/PageDown | A whole slide, past its steps |
| Home, End | The first slide, the end of the last one |
| a number, then Enter | That slide |
| F | Fullscreen on and off |
| B, W or `.` | Blanks the screen (the key a presenter's clicker sends); any key brings it back |
| N | Opens the presenter view (N in the presenter view closes it when it shares the deck's window) |

- Presenter clickers send PageDown and PageUp, so they work as they are.
- Enter and space on a focused button, link or diagram item are left to it, so one press never acts twice; keys with Ctrl, Alt or Cmd are left to the browser, and keys typed into a field to the field.
- A click turns the page (the left 30% goes back), a swipe too, and a click on a diagram node pins its tooltip instead. When the deck is embedded (an iframe, a claude.ai artifact), the first click only brings it into focus, so that the keys reach it.
- A bare `#n` in the URL opens slide n.

### Speaker's notes and the presenter view

A slide's notes are its `<aside class="notes">`, which never shows on the slide; an element in it with `data-step="k"` is marked while step k is on. A slide without one takes `opt.notes[n]` (n, the slide's number from 1) or `opt.notes[build name]`, or the build function's own `.notes`: a string, or a list with one item per step, the current one marked.

N (or `#b-notes`) opens the presenter view in a second window: the same page at `#presenter`, with the current slide and step, the next step's caption, the next slide as it opens, the notes, the time since the view opened (Reset sets it to 0) and the clock. Every window of the deck follows the one that moved, so the keys and a clicker drive both from either; the blank key blanks the room's screen and dims the presenter's copy. The windows talk over a BroadcastChannel named after the page's path, and by `postMessage` between the deck and the window it opened, which also works where file:// pages get no channel (Firefox). A window that opens asks the others where the deck is. Where popups are blocked (a claude.ai artifact's frame, a popup blocker), the view takes the deck's own window; N leaves it.

### Print and PDF

The browser's print gives one 1600×900 page per slide (16:9, no margins), every slide at its last step, every build done, captions at the last one, notes and controls left out, in the light theme (`printTheme: 'dark'`, or `'page'` for the theme on screen). EdgeDeck makes a still copy of each slide for it, and puts the deck back as it was after printing. `scripts/topdf.sh` (or `trazo pdf`) does the same with headless Chrome:

```bash
scripts/topdf.sh build/deck.html deck.pdf            # a page per slide, light
scripts/topdf.sh --steps --dark build/deck.html steps.pdf   # a page per step, dark
scripts/topdf.sh build/figure.html figure.pdf        # any other page, as the browser prints it
```

A page that is not a deck prints as the browser lays it out; the themes keep each figure (`svg[role="img"]` or `svg[role="group"]`, `figure`, `.fig`, `.pane`, `.stage`), table and `pre` on one page, keep a heading with what follows it, and shrink a figure that scrolls on screen to the page's width. Figures print at their resting state. `window.ED_PRINT = {steps, theme}` set before `run` makes the still copies at once, for a print run by a script.

### Returns

`EdgeDeck.run` returns `{next, prev, show, go, nextSlide, prevSlide, presenter, notes, printPages, state}`. `state()` is `{slide, step, blank, presenter}`. `presenter()` opens the view as N does, `presenter(true | false)` shows or leaves it in this window. `notes(i, k)` is the notes' HTML for slide i (from 0) at step k. `printPages({steps, theme})` makes the still copies the print shows and returns how many; `printPages(false)` takes them away.

## Accessibility

Every figure library describes its figure in words, from its model rather than its pixels, and wires that description to the SVG for screen readers. Nothing is asked of the page; the words come from the titles, subs, `info` texts, labels and captions the figure already has, so meaningful ones make a useful description.

- **The description.** `d.describe()` (on EdgeDiagram, EdgeSequence, EdgeTimeline, EdgeMatrix and EdgeSketch alike) returns it as plain text, a paragraph or a list item per line (`- ` before an item), and brings the figure's description element up to date. The library writes it on its own once the page's script is done, and again after any later call that changes the model.
  - EdgeDiagram: a summary (parts, zones, links), each zone and what it holds, the parts with their sub and `info`, each link as a sentence (`Gateway sends to Buffer (publish): Readings, every second.`; the arrow, else the packets' direction, says which way; `both` reads `A and B exchange`), a fan as one sentence (`Gateway feeds Buffer and Local HMI`), a state machine's transitions (`From Trusted, on quote fails, to Untrusted (stop workloads).`, a self-transition `In Trusted, on quote ok, it stays in Trusted`), lanes as who does what in order (`Operator: Register device, then Investigate.`), free texts, and the steps' captions. A figure held for EdgeLayout is described from its calls, without laying it out.
  - EdgeSequence: the actors left to right, the groups, then the numbered messages in order (`3. Database replies to API: ok`), notes, and frames with what they hold (`loop every 200 ms: 6. Worker to Queue: take; 7. ...; end of loop`, an `alt` with its `else` branches), and the steps' captions.
  - EdgeTimeline: the span and today, the phases with their dates and captions, each band's lanes with their bars (dates, progress, planned) and milestones (a `line` one is a gate), the dependencies (`Screens starts after Schema ends.`), and the steps' captions.
  - EdgeMatrix: the size, the cells per state, the row groups, then the gaps (each row with a cell in a `gap` state, which state in which column, and each column's count of gaps), the items of a plane by cell, and the steps' captions. A visually hidden `<table>` after the figure (`div.trazo-table`) holds every cell, with row and column headers, for reading cell by cell; `table: false` leaves it out.
  - EdgeSketch: read from the drawing, best effort: the zones in reading order (a zone without a label is named by the first free text inside it, a `head` first), the boxes in each, top to bottom and left to right, with their sub and `info`, the arrows between boxes (`Web shop and Ingress, both ways (HTTP).`), a fan as one sentence, and the free labels. `EdgeSketch.describe(svg)` does the same for any SVG drawn by hand: a `[data-box]` element is a box, a wire with an arrowhead is an arrow.
- **The wiring.** The SVG keeps its `aria-label`; without one it is named by its `<title>`, `create(svg, {title})`, or its `<figure>`'s `<figcaption>` (`aria-labelledby`). It gets `aria-describedby` pointing at a visually hidden `div.trazo-desc` the library puts right after it (id `<svg id>-desc`), or at the page's own element `[data-describe="<svg id>"]`, which it fills instead (for a description shown on the page, in a `<details>` for instance). Its role is `img`, or `group` with `aria-roledescription` (`diagram`, `sequence diagram`, `timeline`, `matrix`, `plane`, `figure`) when it holds focusable items, since a screen reader does not enter an image; the themes' print rules cover both.
- **Steps.** A figure with `steps()` puts a visually hidden `aria-live="polite"` region (`div.trazo-live`) after its description, and each move to another step writes `Step 3 of 5: <caption>` into it; a step without a caption reads what it brings in (EdgeSequence: its messages). The first step, shown on load, is not read. In an EdgeDeck slide the deck reads the steps instead. A page that reads its own captions passes `live: false`, and should not also give its visible caption `aria-live`.
- **Focusable items.** Every node, link, actor, message, bar, lane, legend entry or box with `info` is focusable and carries an `aria-label` with its name and its info; an EdgeDiagram link's name is its sentence.
- **Opting out.** `create(svg, {describe: false})` leaves the SVG as the page made it: no description, no role change, no live region. `d.describe()` still returns the text. (EdgeMatrix's `describe` option may also be a function: then it is the cell's info, as above, and the description stays on.)
- **EdgeDeck.** Each slide is a `group` with `aria-roledescription="slide"`, named by its `aria-label` or else its first heading. A visually hidden live region (`div.ed-live`) reads `Slide 2 of 5: <name>. <caption>` on a new slide and the step's caption (from `.caps li`) on a new step; the slide shown on load and moves made in another window are not read. `run({live: false})` leaves it out. The figures on a slide are described by their own libraries, as anywhere.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, every library jumps between steps instead of animating, runs no packets, and turns off its CSS transitions; EdgeDeck turns pages and shows captions without motion.

## A frozen page: `?static`

`?static` in a page's address, or `window.TRAZO_STATIC = true` set before the library loads, stops all motion: EdgeDiagram, EdgeSequence and EdgeDeck behave as under reduced motion (steps jump, no packets) and every `steps()` stands at its last step, whatever `go`, `next` or `start` ask for. `?static=K` (or `TRAZO_STATIC = K`) stands at step K, counted as `ctl.go(K)` counts. A deck shows the slide from `#n` (else the first) at its last step, or at step K. Use it for a printout, a still image, or a screenshot that must be the same every time: `scripts/visual.py` renders the templates so.

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

`templates/icons.html` shows every icon with its name, in light and dark: type to filter, click to copy the name. `python3 scripts/inline.py templates/icons.html > icons.html` makes it a page to keep open or publish.

To add an icon, append a `<symbol id="i-name" viewBox="0 0 24 24">` that uses the same stroke conventions; `tests/icons.html` checks that every name is unique and that every icon draws inside its grid, and `tests/test_tools.py` that the count in the sprite's header and here is right.
