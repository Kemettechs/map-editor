/**
 * uTurnEngine.js
 *
 * Faithful JS port of the U-turn geometry and validation logic from robot_path.py.
 * All geometry is computed in local Cartesian metres using proj4/UTM via the
 * existing latlngToCartesian / cartesianToLatlng helpers from pathUtils.js.
 *
 * Public API
 * ──────────
 *   buildUTurnPath(p0LatLng, p1LatLng, perimLatLng, options)
 *     → { path: [{lat,lng}], fallback: bool, reason: string, radiusUsed: number, sy: number }
 *
 *   flipUTurnPath(p0LatLng, p1LatLng, perimLatLng, currentSY, baseRadius)
 *     → same shape
 */

import { latlngToCartesian, cartesianToLatlng } from "./pathUtils";

// ── Constants ──────────────────────────────────────────────────────────────
const MIN_R       = 3.5;   // absolute minimum turn radius (metres)
const PERIM_CLEAR = 1.0;   // minimum clearance from perimeter (metres)
const APEX_CLEAR  = 1.0;   // clearance used when computing available headland
const TARGET_OVER = 5.0;   // default cap on auto-computed radius (metres)
const ARC_STEPS   = 60;    // arc resolution
const SP          = 0.5;   // lerp step size (metres)
const SHRINK      = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]; // radius retry multipliers

// ── Geometry primitives ────────────────────────────────────────────────────

function lerp(a, b, sp) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-9) return [{ x: a.x, y: a.y }];
  const n = Math.max(1, Math.ceil(d / sp));
  const pts = [];
  for (let i = 0; i <= n; i++)
    pts.push({ x: a.x + (i / n) * (b.x - a.x), y: a.y + (i / n) * (b.y - a.y) });
  return pts;
}

function makeArc(cx, cy, r, aStart, aEnd, n) {
  // JavaScript % keeps sign for negatives — use proper mathematical modulo
  // to match Python's % behavior (always non-negative result).
  const twoPi = 2 * Math.PI;
  const d = ((((aEnd - aStart + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = aStart + d * (i / n);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/**
 * Direct port of robot_path.py u_turn().
 */
function uTurn(p0, p1, sy, r, steps, sp) {
  if (p1.x < p0.x) {
    const f = uTurn({ x: -p0.x, y: p0.y }, { x: -p1.x, y: p1.y }, sy, r, steps, sp);
    return f.map(pt => ({ x: -pt.x, y: pt.y }));
  }

  const A   = { x: p0.x, y: p0.y + sy * r };
  const B   = { x: p1.x, y: p1.y + sy * r };
  const gap = B.x - A.x;
  const si  = lerp(p0, A, sp);

  let turn;
  if (gap >= 2 * r) {
    const C0 = { x: A.x + r, y: A.y };
    const C1 = { x: B.x - r, y: B.y };
    const T0 = { x: C0.x, y: C0.y + sy * r };
    const T1 = { x: C1.x, y: C1.y + sy * r };
    turn = [
      ...makeArc(C0.x, C0.y, r, Math.PI, sy * Math.PI / 2, Math.floor(steps / 2)),
      ...lerp(T0, T1, sp).slice(1),
      ...makeArc(C1.x, C1.y, r, sy * Math.PI / 2, 0, Math.floor(steps / 2)).slice(1),
    ];
  } else {
    const rs = Math.max(gap / 2, 1e-6);
    const Cm = { x: (A.x + B.x) / 2, y: A.y + sy * rs };
    turn = [];
    for (let i = 0; i <= steps; i++) {
      const angle = Math.PI - sy * Math.PI * (i / steps);
      turn.push({ x: Cm.x + rs * Math.cos(angle), y: Cm.y + rs * Math.sin(angle) });
    }
  }

  return [...si, ...turn.slice(1), ...lerp(B, p1, sp).slice(1)];
}

// ── Perimeter helpers ──────────────────────────────────────────────────────

function pip(pt, polys) {
  for (const poly of polys) {
    let inside = false;
    const n = poly.length;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > pt.y) !== (yj > pt.y) &&
          pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
        inside = !inside;
      j = i;
    }
    if (inside) return true;
  }
  return false;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function perimDistDir(pt, polys, sy) {
  let best = Infinity;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if (sy * ((a.y + b.y) / 2 - pt.y) <= 0) continue;
      const d = segDist(pt.x, pt.y, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
  }
  return best;
}

function perimY(x, ry, sy, polys) {
  let best = null;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
      let s;
      if (Math.abs(b.x - a.x) < 1e-9) {
        s = (a.y + b.y) / 2;
      } else {
        s = a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y);
      }
      if (sy * (s - ry) <= 0) continue;
      if (best === null || sy * s < sy * best) best = s;
    }
  }
  return best;
}

/**
 * Port of compute_r() — find available headland radius.
 * maxR: user-configured radius cap (replaces hardcoded TARGET_OVER).
 */
function computeR(p0, p1, sy, polys, mr, maxR = TARGET_OVER) {
  const ax = (p0.x + p1.x) / 2;
  const ry = p0.y;
  let best = null;

  const offsets = [0, 1, -1, 2, -2, 3, -3, 5, -5, 10, -10, 20, -20];
  for (const dx of offsets) {
    const py = perimY(ax + dx, ry, sy, polys);
    if (py === null) continue;
    const depth = sy * (py - ry);
    const rc = Math.max((depth - APEX_CLEAR) / 2, mr);
    if (best === null || rc < best) best = rc;
  }

  const result = Math.min(best !== null ? best : mr, maxR);
  console.log(`[computeR] sy=${sy} ry=${ry.toFixed(1)} best=${best?.toFixed(1)} maxR=${maxR} → r=${result.toFixed(1)}m`);
  return result;
}

/**
 * determineSY — pick the direction with enough room for the full baseRadius.
 *
 * Logic:
 * 1. Probe baseRadius in each direction — must land inside perimeter.
 * 2. Get raw headland depth (best from perimY) for each direction.
 * 3. Pick the direction whose raw depth is >= baseRadius (enough room).
 *    If both qualify, pick the one with more depth (more open headland).
 *    If neither qualifies, pick the one with more depth as best effort.
 */
function determineSY(p0, p1, polys, baseRadius) {
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };

  const probePos = { x: mid.x, y: mid.y + baseRadius };
  const probeNeg = { x: mid.x, y: mid.y - baseRadius };

  const posInside = pip(probePos, polys);
  const negInside = pip(probeNeg, polys);

  // Get raw headland depth (before any capping) in each direction
  const ax = (p0.x + p1.x) / 2;
  const ry = p0.y;
  const offsets = [0, 1, -1, 2, -2, 3, -3, 5, -5, 10, -10, 20, -20];

  let rawDepthPos = 0, rawDepthNeg = 0;
  for (const dx of offsets) {
    const pyPos = perimY(ax + dx, ry, +1, polys);
    if (pyPos !== null) {
      const d = Math.abs(pyPos - ry);
      if (d > rawDepthPos) rawDepthPos = d;
    }
    const pyNeg = perimY(ax + dx, ry, -1, polys);
    if (pyNeg !== null) {
      const d = Math.abs(pyNeg - ry);
      if (d > rawDepthNeg) rawDepthNeg = d;
    }
  }

  console.log(`[determineSY] posInside=${posInside} negInside=${negInside} rawDepthPos=${rawDepthPos.toFixed(1)}m rawDepthNeg=${rawDepthNeg.toFixed(1)}m baseRadius=${baseRadius}m`);

  // If only one direction is inside the perimeter, use that
  if (posInside && !negInside) return +1;
  if (negInside && !posInside) return -1;

  // Both inside — pick the direction with enough depth for baseRadius
  // computeR: rc = (depth - APEX_CLEAR) / 2, minimum viable depth = MIN_R*2 + APEX_CLEAR
  const minViableDepth = MIN_R * 2 + APEX_CLEAR; // = 8m
  const posEnough = rawDepthPos >= minViableDepth;
  const negEnough = rawDepthNeg >= minViableDepth;

  if (posEnough && !negEnough) return +1;
  if (negEnough && !posEnough) return -1;

  // Pick the direction closest to minViableDepth from above — the most
  // constrained side that still has enough room. This naturally selects
  // the headland wall (small-but-sufficient depth) over the open
  // field / road side (huge depth = far boundary = wrong direction).
  const posScore = posEnough ? rawDepthPos : Infinity;
  const negScore = negEnough ? rawDepthNeg : Infinity;

  if (posScore === Infinity && negScore === Infinity) {
    // Neither meets minimum — pick whichever has more depth as last resort
    return rawDepthPos >= rawDepthNeg ? +1 : -1;
  }
  // Pick the SMALLER qualifying depth = nearest headland boundary
  return posScore <= negScore ? +1 : -1;
}

/**
 * Port of valid_turn() — check every other point on the path.
 */
function validTurn(pts, polys, sy, iy) {
  for (let i = 0; i < pts.length; i += 2) {
    const pt = pts[i];
    if (!pip(pt, polys)) return false;
    if (perimDistDir(pt, polys, sy) < PERIM_CLEAR) return false;
    if (sy * pt.y < sy * iy) return false;
  }
  return true;
}

/**
 * Rectangular fallback — port of robot_path.py RECT block in make_turn().
 */
function rectFallback(p0, p1, sy, polys, r) {
  const ax = (p0.x + p1.x) / 2;
  const py = perimY(ax, p0.y, sy, polys);
  const hd = py !== null ? sy * (py - p0.y) : 0;

  const sr = hd > PERIM_CLEAR
    ? Math.max(Math.min((hd - PERIM_CLEAR) / 2, r), 0.5)
    : 0.5;

  console.log(`[rectFallback] hd=${hd.toFixed(1)}m sr=${sr.toFixed(1)}m`);

  const A = { x: p0.x, y: p0.y + sy * sr };
  const B = { x: p1.x, y: p1.y + sy * sr };

  return [
    ...lerp(p0, A, SP),
    ...lerp(A, B, SP).slice(1),
    ...lerp(B, p1, SP).slice(1),
  ];
}

// ── Coordinate conversion ──────────────────────────────────────────────────

/**
 * Convert perimeter [{lat,lng}][] to Cartesian {x,y}[][] using a fixed UTM zone
 * so all coordinates are in the same space as p0/p1.
 */
function perimToCartesian(perimLatLng, utmZone) {
  if (!perimLatLng || perimLatLng.length === 0) return [];
  return perimLatLng.map(poly =>
    poly.map(pt => {
      const c = latlngToCartesian(pt.lat, pt.lng, utmZone);
      return { x: c.x, y: c.y };
    })
  );
}

// ── Core path builder ──────────────────────────────────────────────────────

function tryBuildUTurn(p0, p1, sy, polys, utmZone, hasPerim, baseRadius) {
  const baseR = hasPerim ? computeR(p0, p1, sy, polys, MIN_R, baseRadius) : baseRadius;
  const iy    = sy * p0.y <= sy * p1.y ? p0.y : p1.y;

  for (const factor of SHRINK) {
    const r = Math.max(baseR * factor, MIN_R);
    const pts = uTurn(p0, p1, sy, r, ARC_STEPS, SP);
    if (!pts || pts.length < 2) continue;

    const valid = hasPerim ? validTurn(pts, polys, sy, iy) : true;
    console.log(`[tryBuildUTurn] sy=${sy} r=${r.toFixed(1)}m valid=${valid}`);

    if (valid) {
      return {
        path: pts.map(pt => cartesianToLatlng(pt.x, pt.y, utmZone)),
        fallback: false,
        reason: "",
        radiusUsed: r,
        sy,
      };
    }

    if (r <= MIN_R) break;
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * buildUTurnPath(p0LatLng, p1LatLng, perimLatLng, options)
 *
 * p0LatLng    : {lat, lng} — exit point of current row
 * p1LatLng    : {lat, lng} — entry point of next row
 * perimLatLng : array of arrays of {lat, lng}
 * options     : {
 *   forceSY    : null | +1 | -1   — null = auto-detect
 *   baseRadius : number            — user-configured turn radius in metres
 * }
 */
export function buildUTurnPath(p0LatLng, p1LatLng, perimLatLng, options = {}) {
  const { forceSY = null, baseRadius = TARGET_OVER } = options;

  const c0      = latlngToCartesian(p0LatLng.lat, p0LatLng.lng);
  const c1      = latlngToCartesian(p1LatLng.lat, p1LatLng.lng);
  const utmZone = c0.utmZone;
  const p0      = { x: c0.x, y: c0.y };
  const p1      = { x: c1.x, y: c1.y };
  const polys   = perimToCartesian(perimLatLng, utmZone);
  const hasPerim = polys.length > 0 && polys[0].length >= 3;

  console.log(`[buildUTurnPath] p0=(${p0.x.toFixed(1)},${p0.y.toFixed(1)}) p1=(${p1.x.toFixed(1)},${p1.y.toFixed(1)}) hasPerim=${hasPerim} baseRadius=${baseRadius}m`);

  // Determine direction order to try
  let syOrder;
  if (forceSY !== null) {
    syOrder = [forceSY];
  } else {
    const autoSY = hasPerim ? determineSY(p0, p1, polys, baseRadius) : 1;
    syOrder = [autoSY, autoSY * -1];
  }

  for (const sy of syOrder) {
    const result = tryBuildUTurn(p0, p1, sy, polys, utmZone, hasPerim, baseRadius);
    if (result) {
      if (result.radiusUsed < baseRadius)
        result.reducedRadius = true;
      return result;
    }
  }

  // Rectangular fallback
  const sy    = hasPerim ? determineSY(p0, p1, polys, baseRadius) : 1;
  const baseR = hasPerim ? computeR(p0, p1, sy, polys, MIN_R, baseRadius) : baseRadius;
  const rectPts = rectFallback(p0, p1, sy, polys, baseR);

  console.log(`[buildUTurnPath] All U-turn attempts failed → rectangular fallback`);

  return {
    path: rectPts.map(pt => cartesianToLatlng(pt.x, pt.y, utmZone)),
    fallback: true,
    reason: "Not enough space for U-turn — using rectangular fallback",
    radiusUsed: 0,
    sy,
  };
}

/**
 * flipUTurnPath(p0LatLng, p1LatLng, perimLatLng, currentSY, baseRadius)
 * Force the opposite sy direction. Used by the Flip button.
 */
export function flipUTurnPath(p0LatLng, p1LatLng, perimLatLng, currentSY, baseRadius = TARGET_OVER) {
  return buildUTurnPath(p0LatLng, p1LatLng, perimLatLng, {
    forceSY: currentSY * -1,
    baseRadius,
  });
}