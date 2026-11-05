'use strict';

// Checks for the view maths (view.js): where a map sits in the viewport, scrolling, the camera's framing, the minimap and the edge arrows.
// Pure, so they run under jsc too. Loaded after checks-forces.js.

const L_SMALL = () => layoutFor(19, 12, 26), L_BIG = () => layoutFor(31, 20, 26);

check('view: a map that fits is centred across and cannot scroll; a big one starts at the corner and can', () => {
  const s = L_SMALL();
  eq([s.maxX, s.maxY], [0, 0], 'the 19 x 12 map fits the viewport');
  eq(s.offX, (VIEWPORT.w - s.w) / 2);
  eq(s.offY, 0);
  eq(clampScroll(s, 50, 50), { x: 0, y: 0 });
  const b = L_BIG();
  eq([b.offX, b.offY], [0, 0]);
  assert(b.maxX > 400 && b.maxY > 300, `big map scrolls ${b.maxX} x ${b.maxY}`);
  eq(clampScroll(b, -20, 99999), { x: 0, y: b.maxY });
  eq(clampScroll(b, 99999, 7), { x: b.maxX, y: 7 });
  throwsKind(MapError, 'layout', () => layoutFor(0, 5, 26));
});

check('view: the small map is placed exactly where the game has always drawn it', () => {
  const l = L_SMALL();
  const [px, py] = hexInPicture(l, 0, 0), [sx, sy] = pictureToScreen(l, { x: 0, y: 0 }, px, py);
  const [ux, uy] = hexCentre(0, 0);
  assert(Math.abs(sx - ((VIEWPORT.w - l.w) / 2 + 26 + ux * 26)) < 1e-9, 'x: the old ox plus the hex');
  assert(Math.abs(sy - (VIEWPORT.y + 26 * Math.sqrt(3) / 2 + uy * 26)) < 1e-9, 'y: the old oy plus the hex');
});

check('view: screen and picture positions convert back to each other at any scroll', () => {
  const l = L_BIG();
  for (const scroll of [{ x: 0, y: 0 }, { x: 123, y: 45 }, { x: l.maxX, y: l.maxY }]) {
    for (const [c, r] of [[0, 0], [15, 10], [30, 19]]) {
      const [px, py] = hexInPicture(l, c, r), [sx, sy] = pictureToScreen(l, scroll, px, py), [bx, by] = screenToPicture(l, scroll, sx, sy);
      assert(Math.abs(bx - px) < 1e-9 && Math.abs(by - py) < 1e-9, `${c},${r} at ${scroll.x},${scroll.y}`);
    }
  }
  assert(inViewport(VIEWPORT.x, VIEWPORT.y) && !inViewport(VIEWPORT.w, VIEWPORT.y) && !inViewport(10, VIEWPORT.y - 1) && !inViewport(10, VIEWPORT.y + VIEWPORT.h));
});

check('view: centring on a hex puts it in the middle of the viewport, or as near as the map allows', () => {
  const l = L_BIG();
  const s = scrollCentredOn(l, 15, 10);
  const [px, py] = hexInPicture(l, 15, 10), [sx, sy] = pictureToScreen(l, s, px, py);
  assert(Math.abs(sx - (VIEWPORT.x + VIEWPORT.w / 2)) < 1 && Math.abs(sy - (VIEWPORT.y + VIEWPORT.h / 2)) < 1, `${sx},${sy}`);
  eq(scrollCentredOn(l, 0, 0), { x: 0, y: 0 }, 'the corner hex cannot be centred: the scroll stops at the map edge');
});

check('view: framing keeps well-placed hexes still, moves the least that is needed, and centres what does not fit', () => {
  const l = L_BIG();
  const here = { x: 300, y: 200 };
  const [c, r] = [Math.round((300 + 395) / 39), Math.round((200 + 284) / 45)]; // a hex near the middle of the current view
  eq(scrollToShow(l, here, [[c, r]]), here, 'a hex well inside: no change, so the camera does not twitch');
  const away = scrollToShow(l, here, [[30, 19]]);
  assert(away.x > here.x && away.y > here.y, 'a hex far off to the bottom right pulls the view that way');
  const [px, py] = hexInPicture(l, 30, 19), [sx, sy] = pictureToScreen(l, away, px, py);
  assert(sx <= VIEWPORT.x + VIEWPORT.w && sy <= VIEWPORT.y + VIEWPORT.h, 'and it is now on screen');
  // a shooter and a target 9 hexes apart both end up on screen, whichever way round, and the scroll is the same either way
  const a = scrollToShow(l, { x: 0, y: 0 }, [[20, 10], [11, 10]]), b = scrollToShow(l, { x: 0, y: 0 }, [[11, 10], [20, 10]]);
  eq(a, b, 'the order of the hexes does not matter');
  for (const [c2, r2] of [[20, 10], [11, 10]]) {
    const [qx, qy] = hexInPicture(l, c2, r2), [tx, ty] = pictureToScreen(l, a, qx, qy);
    assert(inViewport(tx, ty), `${c2},${r2} is on screen at ${tx},${ty}`);
  }
  const wide = scrollToShow(l, { x: 0, y: 0 }, [[0, 10], [30, 10]]);
  assert(wide.x > 0 && wide.x < l.maxX, 'two hexes too far apart for the margin are centred between');
  eq(scrollToShow(l, here, []), here, 'nothing to frame: nothing moves');
});

check('view: the maximum weapon reach fits the viewport, so a shooter and its target can always be framed together', () => {
  const l = L_BIG();
  const reach = Math.max(...WEAPONS.map(w => w.range[2]));
  for (const [dc, dr] of [[reach, 0], [0, reach], [Math.floor(reach / 2), reach]]) {
    const a = [12, 6], b = [12 + dc, 6 + dr];
    const s = scrollToShow(l, { x: 0, y: 0 }, [a, b], 0);
    for (const h of [a, b]) { const [px, py] = hexInPicture(l, h[0], h[1]), [sx, sy] = pictureToScreen(l, s, px, py); assert(inViewport(sx, sy), `reach ${reach}, ${h} off screen`); }
  }
});

check('view: the camera glides toward its target and arrives, never overshoots', () => {
  let cur = { x: 0, y: 0 };
  const target = { x: 400, y: 300 };
  let last = Infinity;
  for (let i = 0; i < 200; i++) {
    cur = glide(cur, target, 1 / 60);
    const d = Math.hypot(target.x - cur.x, target.y - cur.y);
    assert(d <= last + 1e-9 && cur.x <= target.x + 1e-9 && cur.y <= target.y + 1e-9, 'moving closer, not past');
    last = d;
  }
  assert(last < 1, 'arrived within a pixel after 200 frames: ' + last);
  eq(glide({ x: 5, y: 5 }, { x: 5, y: 5 }, 0.5), { x: 5, y: 5 });
  eq(glide({ x: 0, y: 0 }, { x: 100, y: 0 }, 10), { x: 100, y: 0 }, 'a long frame arrives at once');
});

check('view: dragging moves the map with the mouse, stops at the edges, and a tiny movement is a click', () => {
  const l = L_BIG();
  eq(dragScroll(l, { x: 200, y: 200 }, [500, 300], [450, 330]), { x: 250, y: 170 }, 'drag left and down: the view goes right and up');
  eq(dragScroll(l, { x: 5, y: 5 }, [500, 300], [900, 900]), { x: 0, y: 0 }, 'clamped at the top left');
  assert(!isDrag([10, 10], [12, 11]) && isDrag([10, 10], [20, 10]), 'under 4 pixels is a click');
});

check('view: the minimap covers the whole map, jumps to where it is clicked and shows the viewport rectangle', () => {
  const l = L_BIG(), geo = miniGeometry(l);
  assert(geo.w > 100 && geo.h > 60 && geo.x >= SIDE_PANEL.x && geo.x + geo.w <= SIDE_PANEL.x + SIDE_PANEL.w && geo.y + geo.h <= SIDE_PANEL.bottom && geo.panelY < geo.y, 'inside the right-hand panel, at its bottom');
  assert(geo.x >= VIEWPORT.x + VIEWPORT.w, 'clear of the map: nothing is covered');
  assert(geo.panelH < 200 && geo.panelY > VIEWPORT.y + 250, 'small enough to leave the combat log most of the panel: ' + geo.panelH);
  assert(miniHit(geo, geo.x + 1, geo.y + 1) && !miniHit(geo, geo.x - 1, geo.y) && !miniHit(geo, geo.x + geo.w, geo.y));
  const s = miniToScroll(l, geo, geo.x + geo.w / 2, geo.y + geo.h / 2);
  assert(Math.abs(s.x - (l.maxX / 2)) < 2 && Math.abs(s.y - (l.maxY / 2)) < 2, 'the middle of the minimap centres the view: ' + JSON.stringify(s));
  eq(miniToScroll(l, geo, geo.x, geo.y), { x: 0, y: 0 }, 'the corner of the minimap is the corner of the map');
  const rect = miniViewRect(geo, { x: 100, y: 50 });
  assert(Math.abs(rect.w - VIEWPORT.w * geo.scale) < 1e-9 && Math.abs(rect.x - (geo.x + 100 * geo.scale)) < 1e-9);
  const small = miniGeometry(L_SMALL());
  assert(small.w < geo.w, 'a smaller map has a smaller minimap');
});

check('view: an edge arrow points from the middle of the viewport toward what is off screen, and sits on the edge', () => {
  eq(edgeArrow(VIEWPORT.x + 100, VIEWPORT.y + 100), null, 'on screen: no arrow');
  const right = edgeArrow(VIEWPORT.x + VIEWPORT.w + 400, VIEWPORT.y + VIEWPORT.h / 2);
  assert(Math.abs(right.angle) < 1e-6 && right.x > VIEWPORT.x + VIEWPORT.w - 20 && Math.abs(right.y - (VIEWPORT.y + VIEWPORT.h / 2)) < 1, JSON.stringify(right));
  const corner = edgeArrow(VIEWPORT.x - 900, VIEWPORT.y - 900);
  assert(corner.x >= VIEWPORT.x && corner.y >= VIEWPORT.y && corner.angle < -Math.PI / 2, JSON.stringify(corner));
  for (const [x, y] of [[-500, 100], [2000, 100], [400, -900], [400, 2000], [-300, -300], [2000, 2000]]) {
    const a = edgeArrow(x, y);
    assert(a.x >= VIEWPORT.x && a.x <= VIEWPORT.x + VIEWPORT.w && a.y >= VIEWPORT.y && a.y <= VIEWPORT.y + VIEWPORT.h, `${x},${y} arrow at ${a.x},${a.y} is inside the viewport`);
  }
});
