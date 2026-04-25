import { useState, useRef, useEffect, useCallback } from "react";
import { buildUTurnPath, flipUTurnPath } from "./uTurnEngine";
import React from "react";
import {
  GoogleMap,
  useLoadScript,
  Polyline,
  GroundOverlay,
  OverlayView,
  Circle,
} from "@react-google-maps/api";
import { Portal } from "@mantine/core";
import { ToastContainer, toast } from "react-toastify";
import RobotOverlay from "./components/RobotOverlay";
import MapControls from "./MapControls";
import {
  computeLineLength,
  calculateCurvature,
  filterPointsByDistance,
  createSmoothBezierCurve,
  latlngToCartesian,
  cartesianToLatlng,
  computeAngle,
} from "./pathUtils";

const libraries = ["places", "geometry"];
const mapContainerStyle = { width: "100%", height: "100vh" };
const center = { lat: 37.7749, lng: -122.4194 };
const realWidthMeters = 1.8;
const realHeightMeters = 4.5;
const metersPerDegreeLat = 101320 * Math.cos((center.lat * Math.PI) / 180);
const metersPerDegreeLng = 101320 * Math.cos((center.lat * Math.PI) / 180);
const MIN_TURNING_RADIUS = 10;
const distanceBetweenTwoPoint = 0.2;
const segments = 5;
const smoothness = 0.5;
const POINT_SELECT_TOLERANCE = 0.0003;

// ── Geometry helpers ───────────────────────────────────────────────────────

function lerpXY(a, b, sp) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-9) return [a];
  const n = Math.max(1, Math.ceil(d / sp));
  const pts = [];
  for (let i = 0; i <= n; i++)
    pts.push({ x: a.x + (i / n) * (b.x - a.x), y: a.y + (i / n) * (b.y - a.y) });
  return pts;
}

function makeArc(cx, cy, r, aStart, aEnd, n) {
  const delta = ((aEnd - aStart + Math.PI) % (2 * Math.PI)) - Math.PI;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = aStart + delta * (i / n);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}


// ── REPLACEMENT 1: uTurnXY ─────────────────────────────────────────────────
// Narrow gap now uses straight lead-in/out segments so the arc always
// sweeps properly into the headland regardless of inter-row spacing.

function uTurnXY(p0, p1, sy, r, steps, sp) {
  if (p1.x < p0.x) {
    const flipped = uTurnXY({ x: -p0.x, y: p0.y }, { x: -p1.x, y: p1.y }, sy, r, steps, sp);
    return flipped.map(pt => ({ x: -pt.x, y: pt.y }));
  }

  const gap = p1.x - p0.x;

  if (gap >= 2 * r) {
    // ── Wide gap: two quarter-arcs + straight connector ──────────────────
    const A  = { x: p0.x,    y: p0.y + sy * r };
    const B  = { x: p1.x,    y: p1.y + sy * r };
    const C0 = { x: A.x + r, y: A.y };
    const C1 = { x: B.x - r, y: B.y };
    const T0 = { x: C0.x,    y: C0.y + sy * r };
    const T1 = { x: C1.x,    y: C1.y + sy * r };

    return [
      ...lerpXY(p0, A, sp),
      ...makeArc(C0.x, C0.y, r, Math.PI, sy * Math.PI / 2, Math.floor(steps / 2)).slice(1),
      ...lerpXY(T0, T1, sp).slice(1),
      ...makeArc(C1.x, C1.y, r, sy * Math.PI / 2, 0, Math.floor(steps / 2)).slice(1),
      ...lerpXY(B, p1, sp).slice(1),
    ];
  }

  // ── Narrow gap: lead-in + semicircle + lead-out ──────────────────────────
  // Move both points outward by r in sy direction to give the arc room,
  // then connect with a semicircle centred between them.
  //
  //   p0 ──► p0' ──┐
  //                 ) semicircle of radius r
  //   p1 ──► p1' ──┘
  //
  const midX  = (p0.x + p1.x) / 2;
  const p0out = { x: p0.x, y: p0.y + sy * r };
  const p1out = { x: p1.x, y: p1.y + sy * r };

  // Arc centre is at midX, same y as p0out/p1out
  const arcCX = midX;
  const arcCY = p0out.y; // == p1out.y (both endpoints share the same original y)

  // Angles from arc centre to p0out and p1out
  const a0 = Math.atan2(p0out.y - arcCY, p0out.x - arcCX); // will be ±π
  const a1 = Math.atan2(p1out.y - arcCY, p1out.x - arcCX); // will be 0

  // Sweep direction: if sy=+1 arc peaks upward (positive y), sweep CCW
  // if sy=-1 arc peaks downward, sweep CW
  const arc = makeArc(arcCX, arcCY, gap / 2, a0, a1, steps);

  return [
    ...lerpXY(p0, p0out, sp),
    ...arc.slice(1),
    ...lerpXY(p1out, p1, sp).slice(1),
  ];
}


// New helper needed by the narrow-gap omega turn above.
// Sweeps from angleStart to angleEnd in the given rotational direction (dir=+1 or -1).
// Add this alongside makeArc — it does NOT replace makeArc.

function makeArcDirect(cx, cy, r, angleStart, angleEnd, dir, n) {
  // Normalize sweep so it goes in the correct rotational direction
  let sweep = dir > 0
    ? angleEnd - angleStart
    : angleStart - angleEnd;

  // Ensure sweep is positive (we always step positively, direction is baked in)
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (sweep < 1e-6) sweep = 2 * Math.PI; // full circle fallback

  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = dir > 0
      ? angleStart + sweep * t
      : angleStart - sweep * t;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}


// ── Perimeter validation helpers ───────────────────────────────────────────

/**
 * Ray-casting point-in-polygon for a single polygon (array of {lat,lng}).
 */
function pointInPolygon(pt, poly) {
  let inside = false;
  const x = pt.lng, y = pt.lat;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat;
    const xj = poly[j].lng, yj = poly[j].lat;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

/**
 * Returns true if pt is inside ANY of the perimeter polygons.
 */
function pointInAnyPolygon(pt, polys) {
  return polys.some(poly => pointInPolygon(pt, poly));
}

/**
 * Minimum distance in metres from a {lat,lng} point to the nearest
 * segment of any perimeter polygon.
 * Uses a flat-earth approximation (good enough at field scale).
 */
function minDistToPerimeter(pt, polys) {
  const LAT_M = 111320;
  const LNG_M = 111320 * Math.cos(pt.lat * Math.PI / 180);
  let best = Infinity;

  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      // Convert segment to metres relative to pt
      const ax = (a.lng - pt.lng) * LNG_M, ay = (a.lat - pt.lat) * LAT_M;
      const bx = (b.lng - pt.lng) * LNG_M, by = (b.lat - pt.lat) * LAT_M;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 1e-12 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = Math.hypot(cx, cy);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Validate every point on a lat/lng path against:
 *  1. Inside any perimeter polygon
 *  2. At least PERIM_CLEARANCE_M metres from the boundary
 * Returns { valid: bool, reason: string }
 */
function validatePath(latlngPath, perimPolys) {
  if (!perimPolys || perimPolys.length === 0) return { valid: true, reason: "" };
  // Only check every 5th point for performance and to reduce false positives
  for (let i = 0; i < latlngPath.length; i += 5) {
    const pt = latlngPath[i];
    if (!pointInAnyPolygon(pt, perimPolys)) {
      return { valid: false, reason: "Path goes outside the perimeter" };
    }
  }
  return { valid: true, reason: "" };
}

/**
 * Try to build a valid U-turn, shrinking radius if needed.
 * Returns { path, valid, reason, radiusUsed }
 */
// ── REPLACEMENT 2: buildValidUTurn ─────────────────────────────────────────
// - Floors radius at MIN_ABS_RADIUS (3.5m)
// - Auto-detects sy by trying both directions
// - Returns { path, valid, reason, radiusUsed, sy, fallback }
//   where fallback=true means rectangular turn was used

function buildValidUTurn(p0LatLng, p1LatLng, baseRadiusM, perimPolys) {
  const c0 = latlngToCartesian(p0LatLng.lat, p0LatLng.lng);
  const c1 = latlngToCartesian(p1LatLng.lat, p1LatLng.lng);
  const utmZone = c0.utmZone;
  const p0 = { x: c0.x, y: c0.y };
  const p1 = { x: c1.x, y: c1.y };
  const SP = 0.5, STEPS = 60;

  let bestResult = null;

  // Try both sy directions, shrinking radius each time
  for (const sy of [1, -1]) {
    for (const factor of RADIUS_SHRINK_FACTORS) {
      const r = Math.max(baseRadiusM * factor, MIN_ABS_RADIUS);

      const cartPts = uTurnXY(p0, p1, sy, r, STEPS, SP);
      if (!cartPts || cartPts.length < 2) continue;

      const latlngPath = cartPts.map(pt => cartesianToLatlng(pt.x, pt.y, utmZone));
      const { valid } = validatePath(latlngPath, perimPolys);

      if (valid) {
        const minDist = perimPolys?.length
          ? Math.min(...latlngPath.filter((_, i) => i % 5 === 0)
              .map(pt => minDistToPerimeter(pt, perimPolys)))
          : Infinity;

        if (!bestResult || minDist > bestResult.minDist) {
          bestResult = { path: latlngPath, valid: true, reason: "", radiusUsed: r, sy, minDist, fallback: false };
        }
        break; // best radius found for this sy
      }

      // Stop shrinking if we've hit the absolute floor
      if (r <= MIN_ABS_RADIUS) break;
    }
  }

  if (bestResult) return bestResult;

  // ── Rectangular fallback ─────────────────────────────────────────────────
  // No valid U-turn found — build a simple 3-segment rectangular path:
  //   p0 → p0+outward → p1+outward → p1
  // Use sy=1 to pick outward direction; if that fails try sy=-1.
  for (const sy of [1, -1]) {
    const outDist = MIN_ABS_RADIUS; // how far to step into the headland

    const p0out = { x: p0.x, y: p0.y + sy * outDist };
    const p1out = { x: p1.x, y: p1.y + sy * outDist };

    const cartPts = [
      p0,
      ...lerpXY(p0, p0out, SP).slice(1),
      ...lerpXY(p0out, p1out, SP).slice(1),
      ...lerpXY(p1out, p1, SP).slice(1),
    ];

    const latlngPath = cartPts.map(pt => cartesianToLatlng(pt.x, pt.y, utmZone));
    const { valid, reason } = validatePath(latlngPath, perimPolys);

    // Return regardless of validity — let the UI show it and let user decide
    return {
      path: latlngPath,
      valid,
      reason: valid ? "" : reason,
      radiusUsed: 0,
      sy,
      fallback: true,
    };
  }

  return { path: null, valid: false, reason: "Could not generate any path", radiusUsed: 0, sy: 1, fallback: true };
}



// ── MemoPolyline outside component so React.memo works properly ────────────

const MemoPolyline = React.memo(({ path, color, weight = 2, zIndex = 1 }) => (
  <Polyline path={path} options={{ strokeColor: color, strokeWeight: weight, clickable: false, zIndex }} />
));

// ── Main component ─────────────────────────────────────────────────────────

export default function MapContainer() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const markers = [];
  const zoomLevel = 15;
  const [lines, setLines] = useState([]);
  const [currentLine, setCurrentLine] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const mapRef = useRef(null);
  const [currentLength, setCurrentLength] = useState(0);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [bounds, setBounds] = useState(null);
  const [points, setPoints] = useState([]);
  const [iconPosition, setIconPosition] = useState(null);
  const [iconRotation, setIconRotation] = useState(0);
  const [paths, setPaths] = useState([]);
  const [generatedLine, setGeneratedLine] = useState([]);
  const [generatedLine2, setGeneratedLine2] = useState([]);
  const [mapCenter, setMapCenter] = useState(center);
  const [circleRadius, setCircleRadius] = useState(10);
  const [showCircle, setShowCircle] = useState(true);

  // connect mode
  const [connectMode, setConnectMode] = useState(null);
  const [selectedPoints, setSelectedPoints] = useState([]);
  const [previewPath, setPreviewPath] = useState([]);
  const [previewValid, setPreviewValid] = useState(true);
  const [previewReason, setPreviewReason] = useState("");
  const [uturnSY, setUturnSY] = useState(1);

  // refs so closures always see latest values
  const connectModeRef   = useRef(connectMode);
  const selectedPtsRef   = useRef(selectedPoints);
  const pointsRef        = useRef(points);
  const pathsRef         = useRef(paths);
  const uturnSYRef       = useRef(uturnSY);
  const circleRadiusRef  = useRef(circleRadius);

  useEffect(() => { connectModeRef.current  = connectMode;    }, [connectMode]);
  useEffect(() => { selectedPtsRef.current  = selectedPoints; }, [selectedPoints]);
  useEffect(() => { pointsRef.current       = points;         }, [points]);
  useEffect(() => { pathsRef.current        = paths;          }, [paths]);
  useEffect(() => { uturnSYRef.current      = uturnSY;        }, [uturnSY]);
  useEffect(() => { circleRadiusRef.current = circleRadius;   }, [circleRadius]);

  const cancelConnectMode = useCallback(() => {
    setConnectMode(null);
    setSelectedPoints([]);
    setPreviewPath([]);
    setPreviewValid(true);
    setPreviewReason("");
  }, []);

  useEffect(() => {
    if (connectMode === null) {
      setSelectedPoints([]);
      setPreviewPath([]);
      setPreviewValid(true);
      setPreviewReason("");
    }
  }, [connectMode]);

  // ── Preview generation ─────────────────────────────────────────────────

  const generatePreview = useCallback((p1, p2, mode, sy, radius) => {
    if (mode === "straight") {
      const path = [p1, p2];
      const { valid, reason } = validatePath(path, pathsRef.current);
      setPreviewPath(path);
      setPreviewValid(valid);
      setPreviewReason(reason);
      return;
    }

if (mode === "uturn") {
  const result = buildUTurnPath(p1, p2, pathsRef.current, {
    baseRadius: circleRadiusRef.current,
  });
  if (!result.path) {
    setPreviewPath([]);
    setPreviewValid(false);
    setPreviewReason("Could not generate any path");
    return;
  }
  setUturnSY(result.sy);
  setPreviewPath(result.path);
  setPreviewValid(!result.fallback);
  setPreviewReason(result.reason);
  if (result.fallback)
    toast.warn(result.reason, { autoClose: 3500 });
  else if (result.reducedRadius)
    toast.info(`Radius reduced to ${result.radiusUsed.toFixed(1)}m to fit perimeter`, { autoClose: 2500 });
}  }, []);

  // ── Find nearest endpoint dot ──────────────────────────────────────────

  const findNearestPoint = useCallback((latLng) => {
    const pts = pointsRef.current;
    if (!pts.length) return null;
    let best = null, bestDist = POINT_SELECT_TOLERANCE;
    for (const pt of pts) {
      const d = Math.hypot(pt.lat - latLng.lat, pt.lng - latLng.lng);
      if (d < bestDist) { bestDist = d; best = pt; }
    }
    return best;
  }, []);

  // ── Handle click on map in connect mode ───────────────────────────────

  const handleConnectClick = useCallback((latLng) => {
    const mode = connectModeRef.current;
    if (!mode) return;
    const nearest = findNearestPoint(latLng);
    if (!nearest) { toast.info("Click an endpoint dot", { autoClose: 1200 }); return; }

    const prev = selectedPtsRef.current;
    if (prev.length === 1 && prev[0].lat === nearest.lat && prev[0].lng === nearest.lng) {
      setSelectedPoints([]);
      setPreviewPath([]);
      return;
    }
    if (prev.length === 0) { setSelectedPoints([nearest]); return; }

    const newSel = [prev[0], nearest];
    setSelectedPoints(newSel);
    generatePreview(prev[0], nearest, mode, uturnSYRef.current, circleRadiusRef.current);
  }, [findNearestPoint, generatePreview]);

  // ── Confirm ────────────────────────────────────────────────────────────

  const confirmConnect = useCallback(() => {
    if (previewPath.length < 2 || !previewValid) return;
    setLines(prev => [...prev, previewPath]);
    setCurrentLength(computeLineLength(previewPath));
    cancelConnectMode();
    toast.success("Path added!", { autoClose: 1200 });
  }, [previewPath, previewValid, cancelConnectMode]);

  // ── Flip U-turn direction ──────────────────────────────────────────────

const flipUTurn = useCallback(() => {
  const sel = selectedPtsRef.current;
  if (sel.length !== 2) return;
  const result = flipUTurnPath(
    sel[0], sel[1],
    pathsRef.current,
    uturnSYRef.current,
    circleRadiusRef.current
  );
  if (!result.path) return;
  setUturnSY(result.sy);
  setPreviewPath(result.path);
  setPreviewValid(!result.fallback);
  setPreviewReason(result.reason);
  if (result.fallback)
    toast.warn(result.reason, { autoClose: 3500 });
}, []);
  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Escape") cancelConnectMode();
      if (e.code === "Space" && !connectModeRef.current) { e.preventDefault(); setIsDrawing(p => !p); }
      if (e.code === "KeyF" && connectModeRef.current === "uturn") flipUTurn();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancelConnectMode, flipUTurn]);

  // ── Freehand drawing geo helpers ───────────────────────────────────────

  function generateGeoPath(startPoint, angle, turnDirection = "right", boxWidth = 3.2, curveRadius = 3.2, numCurvePoints = 200) {
    const EARTH_RADIUS = 6371;
    const angleRad = angle * (Math.PI / 180);
    const boxWidthKm = boxWidth / 1000, curveRadiusKm = curveRadius / 1000, boxLengthKm = 5.5 / 1000;
    const startLatShift = (boxWidthKm / EARTH_RADIUS) * Math.cos(angleRad) * (180 / Math.PI);
    const startLngShift = (boxWidthKm / EARTH_RADIUS) * Math.sin(angleRad) * (180 / Math.PI);
    const startLatShiftUp = (boxLengthKm / EARTH_RADIUS) * Math.sin(angleRad) * (180 / Math.PI);
    const startLngShiftUp = (boxLengthKm / EARTH_RADIUS) * Math.cos(angleRad) * (180 / Math.PI);
    let actualStartLat = startPoint.lat + startLatShift - startLatShiftUp;
    let actualStartLng = startPoint.lng + startLngShift + startLngShiftUp;
    if (turnDirection === "left") {
      actualStartLat = startPoint.lat - startLatShift - startLatShiftUp;
      actualStartLng = startPoint.lng - startLngShift + startLngShiftUp;
    }
    const directionAngleRad = angleRad - Math.PI / 2;
    const centerLat = actualStartLat + (curveRadiusKm / EARTH_RADIUS) * Math.cos(directionAngleRad) * (180 / Math.PI);
    const centerLng = actualStartLng + (curveRadiusKm / EARTH_RADIUS) * Math.sin(directionAngleRad) * (180 / Math.PI);
    const startAngle = directionAngleRad + (turnDirection === "left" ? Math.PI / 2 : -Math.PI / 2);
    const angleStep = (Math.PI / numCurvePoints) * (turnDirection === "left" ? 1 : -1);
    const pts = [];
    for (let i = 0; i <= numCurvePoints; i++) {
      const a = startAngle + angleStep * i;
      pts.push({ lat: centerLat + (curveRadiusKm / EARTH_RADIUS) * Math.cos(a) * (180 / Math.PI), lng: centerLng + (curveRadiusKm / EARTH_RADIUS) * Math.sin(a) * (180 / Math.PI) });
    }
    return pts;
  }

  const updateBounds = () => {
    if (!mapRef.current) return;
    const zoom = mapRef.current.getZoom();
    if (!zoom) return;
    const sf = Math.pow(2, zoom - 15);
    setBounds({
      north: center.lat + (realHeightMeters / metersPerDegreeLat / sf) / 2,
      south: center.lat - (realHeightMeters / metersPerDegreeLat / sf) / 2,
      east:  center.lng + (realWidthMeters  / metersPerDegreeLng / sf) / 2,
      west:  center.lng - (realWidthMeters  / metersPerDegreeLng / sf) / 2,
    });
  };

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    updateBounds();
    mapRef.current.addListener("zoom_changed", updateBounds);
  }, [isLoaded]);

  // ── Map event handlers ─────────────────────────────────────────────────

  const handleMouseDown = (e) => {
    if (connectModeRef.current) {
      const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      const nearest = findNearestPoint(latLng);
      if (nearest) { e.stop(); handleConnectClick(latLng); }
      return;
    }
    if (!isDrawing) return;
    setIsMouseDown(true);
    const sp = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setCurrentLine([sp]);
    setIconPosition(sp);
  };

  let lastUpdateTime = 0;
  const THROTTLE_MS = 16;

  const handleMouseMove = (e) => {
    if (connectModeRef.current) return;
    if (!isDrawing || !isMouseDown) return;
    const now = performance.now();
    if (now - lastUpdateTime < THROTTLE_MS) return;
    lastUpdateTime = now;

    const newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    const lastPoint = currentLine[currentLine.length - 1];
    if (computeLineLength([lastPoint, newPoint]) / 3.281 <= distanceBetweenTwoPoint) return;

    const tempLine = [...currentLine, newPoint];
    let updatedLine = tempLine;

    if (tempLine.length >= 3) {
      const radii = calculateCurvature(tempLine);
      if (radii[radii.length - 1] < MIN_TURNING_RADIUS) {
        let lastPoints = filterPointsByDistance(tempLine.slice(-30));
        let cartesian = lastPoints.filter(p => p && isFinite(p.lat) && isFinite(p.lng)).map(p => latlngToCartesian(p.lat, p.lng));
        const utmZone = cartesian.at(-1)?.utmZone;
        if (cartesian.length > 5) cartesian = createSmoothBezierCurve(cartesian, segments, smoothness);
        updatedLine = [...tempLine.slice(0, -30), ...cartesian.map(p => cartesianToLatlng(p.x, p.y, utmZone))];
      }
    }

    if (updatedLine.length > 1) {
      const angle = computeAngle(updatedLine.at(-2), newPoint);
      setIconRotation(angle);
      setGeneratedLine(generateGeoPath(newPoint, 180 - angle + 180, "right"));
      setGeneratedLine2(generateGeoPath(newPoint, 180 - angle + 180, "left"));
    }

    requestAnimationFrame(() => {
      setCurrentLine(updatedLine);
      setIconPosition(newPoint);
      setCurrentLength(computeLineLength(updatedLine));
    });
  };

  const handleMouseUp = () => {
    if (connectModeRef.current) return;
    if (isMouseDown && currentLine.length > 1) setLines(prev => [...prev, currentLine]);
    setCurrentLine([]);
    setGeneratedLine([]);
    setGeneratedLine2([]);
    setIsMouseDown(false);
    setIconPosition(null);
  };

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    map.setOptions({
      draggable: true,
      cursor: (connectMode || isDrawing) ? "crosshair" : "grab",
      gestureHandling: isDrawing && !connectMode ? "none" : "auto",
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: false,
      mapTypeControl: true,
      mapTypeId: "satellite",
    });
    map.addListener("mousedown", handleMouseDown);
    map.addListener("mousemove", handleMouseMove);
    map.addListener("mouseup", handleMouseUp);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      google.maps.event.clearListeners(map, "mousedown");
      google.maps.event.clearListeners(map, "mousemove");
      google.maps.event.clearListeners(map, "mouseup");
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDrawing, currentLine, connectMode]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      {isLoaded ? (
        <GoogleMap
          onCenterChanged={() => {
            if (mapRef.current) {
              const c = mapRef.current.getCenter();
              setMapCenter({ lat: c.lat(), lng: c.lng() });
            }
          }}
          options={{ disableDefaultUI: true, mapTypeId: "satellite", zoomControl: true, fullscreenControl: false, mapTypeControl: true }}
          mapContainerStyle={mapContainerStyle}
          center={markers[0] || center}
          zoom={zoomLevel}
          onLoad={(map) => { mapRef.current = map; setTimeout(updateBounds, 500); }}
        >
          {/* Endpoint dots */}
          {points.map((point, index) => {
            const isSel = selectedPoints.some(p => p.lat === point.lat && p.lng === point.lng);
            return (
              <OverlayView key={index} position={point} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={(w, h) => ({ x: -w / 2, y: -h / 2 })}>
                <div style={{
                  width: isSel ? "12px" : "6px", height: isSel ? "12px" : "6px",
                  borderRadius: "50%",
                  backgroundColor: isSel ? "#FFD700" : "magenta",
                  border: isSel ? "2px solid white" : "none",
                  position: "absolute", transition: "all 0.15s ease",
                  cursor: connectMode ? "pointer" : "default",
                  pointerEvents: connectMode ? "auto" : "none",
                }} />
              </OverlayView>
            );
          })}

          {/* Perimeter paths */}
          {paths.map((path, index) => (
            <Polyline key={index} path={path} options={{ strokeColor: "#4CC9FE", strokeOpacity: 1, strokeWeight: 2, geodesic: true }} />
          ))}

          {/* Turn radius circle */}
          {showCircle && (
            <Circle center={mapCenter} radius={circleRadius} options={{
              strokeColor: "#FF0000", strokeOpacity: 0.9, strokeWeight: 2,
              fillOpacity: 0, clickable: false, zIndex: 5,
            }} />
          )}

          {/* Saved lines — key includes length so removal triggers re-render */}
          {lines.map((line, idx) => (
            <MemoPolyline key={`line-${idx}-${lines.length}`} path={line} color="#7CFC00" />
          ))}

          {/* Active freehand */}
          {currentLine.length > 1 && (
            <Polyline path={currentLine} options={{ strokeColor: "#FF0000", strokeWeight: 2, clickable: false, zIndex: 2 }} />
          )}

          {/* Drawing assist arcs */}
          {generatedLine.length > 1  && <MemoPolyline key="gen1" path={generatedLine}  color="#FFFFFF" />}
          {generatedLine2.length > 1 && <MemoPolyline key="gen2" path={generatedLine2} color="#FFFFFF" />}

          {/* Preview — yellow if valid, red if invalid */}
          {previewPath.length > 1 && (
            <Polyline
              path={previewPath}
              options={{
                strokeColor: previewValid ? "#FFD700" : "#FF3333",
                strokeWeight: 3, clickable: false, zIndex: 6,
              }}
            />
          )}

          {iconPosition && <RobotOverlay position={iconPosition} rotation={iconRotation} map={mapRef.current} />}
          {bounds && <GroundOverlay key="robot-overlay" bounds={bounds} url="https://cdn-icons-png.flaticon.com/512/4712/4712035.png" opacity={1} />}
        </GoogleMap>
      ) : (
        <p>Loading Map...</p>
      )}

      {/* Length display */}
      <p style={{
        position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.7)", color: "#fff", padding: "5px 10px",
        borderRadius: "5px", fontSize: "14px", zIndex: 1000,
      }}>
        {currentLength.toFixed(2)} feet
      </p>

      {/* Confirm / Cancel / Flip bar */}
      {previewPath.length > 1 && (
        <div style={{
          position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.85)", color: "white",
          padding: "8px 16px", borderRadius: "8px",
          zIndex: 9999, display: "flex", gap: "12px", alignItems: "center", fontSize: "13px",
        }}>
          {!previewValid
            ? <span style={{ color: "#FF6B6B" }}>⚠ {previewReason}</span>
            : <span style={{ color: "#69F0AE" }}>✓ Path looks good</span>
          }
          {connectMode === "uturn" && (
            <button onClick={flipUTurn} style={{
              background: "#1565C0", color: "white", border: "none",
              padding: "4px 12px", borderRadius: "4px", cursor: "pointer",
            }}>⇅ Flip (F)</button>
          )}
          <button
            onClick={confirmConnect}
            disabled={!previewValid}
            style={{
              background: previewValid ? "#4CAF50" : "#555", color: "white", border: "none",
              padding: "4px 12px", borderRadius: "4px",
              cursor: previewValid ? "pointer" : "not-allowed", fontWeight: "bold",
            }}
          >✓ Confirm</button>
          <button onClick={cancelConnectMode} style={{
            background: "#e53935", color: "white", border: "none",
            padding: "4px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold",
          }}>✗ Cancel</button>
        </div>
      )}

      <Portal>
        <MapControls
          isDrawing={isDrawing}
          toggleDrawing={() => setIsDrawing(!isDrawing)}
          undoLastDrawing={() => {
            setLines(prev => {
              if (prev.length === 0) return prev;
              const next = prev.slice(0, -1);
              setCurrentLength(next.length > 0 ? computeLineLength(next[next.length - 1]) : 0);
              return next;
            });
          }}
          setPoints={setPoints}
          setPaths={setPaths}
          mapRef={mapRef}
          lines={lines}
          setCurrentLength={setCurrentLength}
          setLines={setLines}
          circleRadius={circleRadius}
          setCircleRadius={setCircleRadius}
          showCircle={showCircle}
          setShowCircle={setShowCircle}
          connectMode={connectMode}
          setConnectMode={setConnectMode}
          selectedPoints={selectedPoints}
        />
      </Portal>

      <ToastContainer />
    </div>
  );
}