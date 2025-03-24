import proj4 from "proj4";

const WGS84 = "EPSG:4326";

export const latlngToCartesian = (lat, lng) => {
  const utmZone = Math.floor((lng + 180) / 6) + 1;
  const UTM_PROJ = `+proj=utm +zone=${utmZone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  const [x, y] = proj4(WGS84, UTM_PROJ, [lng, lat]);
  return { x, y, utmZone };
};

export const cartesianToLatlng = (x, y, utmZone) => {
  const UTM_PROJ = `+proj=utm +zone=${utmZone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  const [lng, lat] = proj4(UTM_PROJ, WGS84, [x, y]);
  return { lat, lng };
};

export const computeLineLength = (line) => {
  if (window.google?.maps?.geometry) {
    return window.google.maps.geometry.spherical.computeLength(line) * 3.28084;
  }
  return 0;
};

export const calculateCurvature = (path) => {
  if (path.length < 3) return [];

  const scale = 1e6;
  const scaledPath = path.map((point) => ({
    lat: point.lat * scale,
    lng: point.lng * scale,
  }));

  let curvatures = [];
  let dx = [];
  let dy = [];

  for (let i = 1; i < scaledPath.length - 1; i++) {
    dx.push(scaledPath[i + 1].lat - scaledPath[i - 1].lat);
    dy.push(scaledPath[i + 1].lng - scaledPath[i - 1].lng);
  }

  let ddx = [];
  let ddy = [];

  for (let i = 1; i < dx.length - 1; i++) {
    ddx.push(dx[i + 1] - dx[i - 1]);
    ddy.push(dy[i + 1] - dy[i - 1]);
  }

  for (let i = 0; i < ddx.length; i++) {
    const xPrime = dx[i + 1];
    const yPrime = dy[i + 1];
    const xDoublePrime = ddx[i];
    const yDoublePrime = ddy[i];

    const numerator = Math.abs(xPrime * yDoublePrime - yPrime * xDoublePrime);
    const denominator = Math.pow(xPrime ** 2 + yPrime ** 2, 1.5);

    const epsilon = 1e-6;
    let curvature = denominator > epsilon ? numerator / denominator : 0;
    let radius = curvature > epsilon ? 1 / curvature : Infinity;

    curvatures.push(radius);
  }

  return curvatures;
};

export const filterPointsByDistance = (points) => {
  if (!points || points.length === 0) return [];

  const result = [];
  const targetDistanceInMeters = 1.5;
  const targetDistanceInFeet = targetDistanceInMeters * 3.28084;

  result.push(points[0]);
  let lastIncludedPoint = points[0];

  for (let i = 1; i < points.length; i++) {
    const currentPoint = points[i];
    const lineSegment = [lastIncludedPoint, currentPoint];
    const distanceInFeet = computeLineLength(lineSegment);

    if (
      Math.abs(distanceInFeet - targetDistanceInFeet) <
      0.1 * targetDistanceInFeet
    ) {
      result.push(currentPoint);
      lastIncludedPoint = currentPoint;
    } else if (distanceInFeet > targetDistanceInFeet) {
      const ratio = targetDistanceInFeet / distanceInFeet;
      const interpolatedPoint = {
        lat:
          lastIncludedPoint.lat +
          (currentPoint.lat - lastIncludedPoint.lat) * ratio,
        lng:
          lastIncludedPoint.lng +
          (currentPoint.lng - lastIncludedPoint.lng) * ratio,
      };

      result.push(interpolatedPoint);
      lastIncludedPoint = interpolatedPoint;
      i--;
    }
  }

  return result;
};

export const createSmoothBezierCurve = (
  points,
  segments = 10,
  smoothness = 1
) => {
  if (!points || points.length < 2) return [];

  const controlPoints = calculateSmoothControlPoints(points, smoothness);
  const bezierPoints = [];

  bezierPoints.push({ x: points[0].x, y: points[0].y });

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p3 = points[i + 1];
    const p1 = controlPoints[i][1];
    const p2 = controlPoints[i + 1][0];

    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      const point = calculateBezierPoint(t, p0, p1, p2, p3);
      bezierPoints.push(point);
    }
  }

  return bezierPoints;
};

const calculateSmoothControlPoints = (points, smoothness = 0.4) => {
  const n = points.length;
  if (n < 3) {
    if (n === 2) {
      const p0 = points[0];
      const p1 = points[1];
      const cp1x = p0.x + (p1.x - p0.x) / 3;
      const cp1y = p0.y + (p1.y - p0.y) / 3;
      const cp2x = p1.x - (p1.x - p0.x) / 3;
      const cp2y = p1.y - (p1.y - p0.y) / 3;

      return [
        [null, { x: cp1x, y: cp1y }],
        [{ x: cp2x, y: cp2y }, null],
      ];
    }
    return [];
  }

  const tangents = [];
  for (let i = 0; i < n; i++) {
    let prevPoint, nextPoint;

    if (i === 0) {
      prevPoint = points[0];
      nextPoint = points[1];
    } else if (i === n - 1) {
      prevPoint = points[n - 2];
      nextPoint = points[n - 1];
    } else {
      prevPoint = points[i - 1];
      nextPoint = points[i + 1];
    }

    const tangent = {
      x: nextPoint.x - prevPoint.x,
      y: nextPoint.y - prevPoint.y,
    };

    const length = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    if (length > 0) {
      tangent.x /= length;
      tangent.y /= length;
    }

    tangents.push(tangent);
  }

  const controlPoints = [];
  for (let i = 0; i < n; i++) {
    const tangent = tangents[i];
    const point = points[i];

    let distanceToPrev = 0;
    let distanceToNext = 0;

    if (i > 0) {
      const prev = points[i - 1];
      distanceToPrev = Math.sqrt(
        Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2)
      );
    }

    if (i < n - 1) {
      const next = points[i + 1];
      distanceToNext = Math.sqrt(
        Math.pow(next.x - point.x, 2) + Math.pow(next.y - point.y, 2)
      );
    }

    const cp1Distance = distanceToPrev * smoothness;
    const cp2Distance = distanceToNext * smoothness;

    const cp1 =
      i > 0
        ? {
            x: point.x - tangent.x * cp1Distance,
            y: point.y - tangent.y * cp1Distance,
          }
        : null;

    const cp2 =
      i < n - 1
        ? {
            x: point.x + tangent.x * cp2Distance,
            y: point.y + tangent.y * cp2Distance,
          }
        : null;

    controlPoints.push([cp1, cp2]);
  }

  return controlPoints;
};

const calculateBezierPoint = (t, p0, p1, p2, p3) => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
};

export const computeAngle = (p1, p2) => {
  const deltaY = p2.lat - p1.lat;
  const deltaX = p2.lng - p1.lng;
  return (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
};
