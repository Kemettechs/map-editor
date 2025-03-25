import { useState, useRef, useEffect } from "react";
import {
  GoogleMap,
  useLoadScript,
  Polyline,
  GroundOverlay,
  OverlayView,
  Marker,
} from "@react-google-maps/api";

import Papa from "papaparse";
import proj4 from "proj4";
import { ActionIcon, Button, Paper, Tooltip } from "@mantine/core";
import { ToastContainer } from "react-toastify";
import RobotOverlay from "./components/RobotOverlay";
import {
  IconDownload,
  IconPaint,
  IconReload,
  IconUpload,
} from "@tabler/icons-react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip as t,
  Legend,
} from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, Title, t, Legend);

const libraries = ["places", "geometry"]; // Define it outside
// import { computeDistanceBetween } from "spherical-geometry-js";
// Define WGS84 and UTM projection strings
const WGS84 = "EPSG:4326"; // Standard GPS coordinate system

const latlngToCartesian = (lat, lng) => {
  // Auto-detect UTM zone based on longitude
  const utmZone = Math.floor((lng + 180) / 6) + 1;
  const UTM_PROJ = `+proj=utm +zone=${utmZone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;

  // Convert LatLng to UTM (meters)
  const [x, y] = proj4(WGS84, UTM_PROJ, [lng, lat]);
  return { x, y, utmZone };
};

const cartesianToLatlng = (x, y, utmZone) => {
  const UTM_PROJ = `+proj=utm +zone=${utmZone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;

  // Convert back to LatLng
  const [lng, lat] = proj4(UTM_PROJ, WGS84, [x, y]);
  return { lat, lng };
};
// Minimum segment length threshold (3.2 meters)
const mapContainerStyle = { width: "100%", height: "100vh" };
const center = { lat: 37.7749, lng: -122.4194 }; // Default to San Francisco
// Real-world dimensions in meters
const realWidthMeters = 1.8;
const realHeightMeters = 4.5;

// Approximate meters per degree of latitude (varies by location)
const metersPerDegreeLat = 101320 * Math.cos((center.lat * Math.PI) / 180);
const metersPerDegreeLng = 101320 * Math.cos((center.lat * Math.PI) / 180);
// Function to compute the distance between two lat/lng points

export default function MyMap() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyD717SaSi1ffFDo3Zaoa-f5ntIi3Lg0w6E",
    libraries, // Needed for distance calculations
  });

  const markers = [];
  const zoomLevel = 15;
  const [lines, setLines] = useState([]); // Stores multiple drawn lines
  const [currentLine, setCurrentLine] = useState([]); // Current active drawing
  const [isDrawing, setIsDrawing] = useState(false); // Toggle drawing mode
  const mapRef = useRef(null);
  const [currentLength, setCurrentLength] = useState(0); // Length of active line
  const fileInputRef = useRef(null);
  const fileInputRefEndPoints = useRef(null);
  const [paths, setPaths] = useState([]); // Store multiple paths

  const fileInputRefPerimeter = useRef(null);
  const [isMouseDown, setIsMouseDown] = useState(false); // Track mouse state
  const [bounds, setBounds] = useState(null);
  const [points, setPoints] = useState([]);
  const [iconPosition, setIconPosition] = useState(null);
  const [iconRotation, setIconRotation] = useState(0);

  // Function to update bounds dynamically
  const updateBounds = () => {
    if (!mapRef.current) return;

    const zoom = mapRef.current.getZoom();
    if (!zoom) return;

    const scaleFactor = Math.pow(2, zoom - 15); // Adjust based on zoom level
    const scaledWidth = realWidthMeters / metersPerDegreeLng / scaleFactor;
    const scaledHeight = realHeightMeters / metersPerDegreeLat / scaleFactor;

    setBounds({
      north: center.lat + scaledHeight / 2,
      south: center.lat - scaledHeight / 2,
      east: center.lng + scaledWidth / 2,
      west: center.lng - scaledWidth / 2,
    });
  };

  useEffect(() => {
    if (!isLoaded) return;

    // Ensure bounds are updated once the map is loaded
    if (mapRef.current) {
      updateBounds();
      mapRef.current.addListener("zoom_changed", updateBounds);
    }
  }, [isLoaded]);

  // Toggle Drawing Mode
  const toggleDrawing = () => {
    setIsDrawing((prev) => !prev);
  };

  // undoLastDrawing
  const undoLastDrawing = () => {
    if (lines.length === 0) return; // Nothing to undo

    const newLines = [...lines];
    newLines.pop(); // Remove the last drawn line

    setLines(newLines);

    // Update the length to the previous line or reset to 0 if no lines remain
    if (newLines.length > 0) {
      const lastLine = newLines[newLines.length - 1]; // Get the last remaining line
      setCurrentLength(computeLineLength(lastLine)); // Update to its length
    } else {
      setCurrentLength(0); // Reset to zero if no lines remain
    }
  };

  // Compute length of a polyline in feet
  const computeLineLength = (line) => {
    if (window.google?.maps?.geometry) {
      return (
        window.google.maps.geometry.spherical.computeLength(line) * 3.28084
      ); // Convert meters to feet
    }
    return 0;
  };

  const calculateCurvature = (path) => {
    if (path.length < 3) return [];

    // Scale latitude and longitude to avoid precision issues
    const scale = 1e6; // Scale factor
    const scaledPath = path.map((point) => ({
      lat: point.lat * scale,
      lng: point.lng * scale,
    }));

    let curvatures = [];
    let dx = [];
    let dy = [];

    // Compute first derivatives using central differences
    for (let i = 1; i < scaledPath.length - 1; i++) {
      dx.push(scaledPath[i + 1].lat - scaledPath[i - 1].lat); // Δx
      dy.push(scaledPath[i + 1].lng - scaledPath[i - 1].lng); // Δy
    }

    // Compute second derivatives using central differences
    let ddx = [];
    let ddy = [];

    for (let i = 1; i < dx.length - 1; i++) {
      ddx.push(dx[i + 1] - dx[i - 1]); // Δ²x
      ddy.push(dy[i + 1] - dy[i - 1]); // Δ²y
    }

    // Calculate curvature: κ = |x' y'' - y' x''| / (x'² + y'²)^(3/2)
    for (let i = 0; i < ddx.length; i++) {
      const xPrime = dx[i + 1]; // x'
      const yPrime = dy[i + 1]; // y'
      const xDoublePrime = ddx[i]; // x''
      const yDoublePrime = ddy[i]; // y''

      const numerator = Math.abs(xPrime * yDoublePrime - yPrime * xDoublePrime);
      const denominator = Math.pow(xPrime ** 2 + yPrime ** 2, 1.5);

      const epsilon = 1e-6; // Prevent division by zero
      let curvature = denominator > epsilon ? numerator / denominator : 0;
      let radius = curvature > epsilon ? 1 / curvature : Infinity;

      curvatures.push(radius);
    }

    return curvatures;
  };

  /**
   * Filter points to be approximately 1.5 meters apart
   * @param {Array} points - Array of objects with lat and lng properties
   * @returns {Array} Filtered array of points
   */
  function filterPointsByDistance(points) {
    if (!points || points.length === 0) {
      return [];
    }

    const result = [];
    const targetDistanceInMeters = 1.5;
    const targetDistanceInFeet = targetDistanceInMeters * 3.28084; // Convert to feet

    // Always include the first point
    result.push(points[0]);

    let lastIncludedPoint = points[0];

    // Check each point
    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];

      // Create a line segment between the last included point and current point
      const lineSegment = [lastIncludedPoint, currentPoint];

      // Compute distance in feet
      const distanceInFeet = computeLineLength(lineSegment);

      // If distance is approximately 1.5 meters (with small tolerance)
      if (
        Math.abs(distanceInFeet - targetDistanceInFeet) <
        0.1 * targetDistanceInFeet
      ) {
        result.push(currentPoint);
        lastIncludedPoint = currentPoint;
      }
      // If we've gone too far without finding a suitable point, interpolate
      else if (distanceInFeet > targetDistanceInFeet) {
        // Find a point that's approximately 1.5 meters away through interpolation
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

        // Don't skip the current point, it might be needed for the next segment
        i--;
      }
    }

    return result;
  }

  const MIN_TURNING_RADIUS = 10;
  const distanceBetweenTwoPoint = 0.1;
  const segments = 5;
  const smoothness = 0.5;
  /**
   * Converts an array of points into a set of points representing a smooth Bézier curve
   * @param {Array} points - Array of {x, y} coordinates
   * @param {number} segments - Number of segments to generate per curve section
   * @param {number} smoothness - Factor controlling control point distance (0-1, higher = smoother)
   * @returns {Array} Array of {x, y} points representing the smooth Bézier curve
   */
  function createSmoothBezierCurve(points, segments = 10, smoothness = 1) {
    if (!points || points.length < 2) {
      return [];
    }

    // Generate control points for each point
    const controlPoints = calculateSmoothControlPoints(points, smoothness);
    const bezierPoints = [];

    // Add the first point
    bezierPoints.push({ x: points[0].x, y: points[0].y });

    // For each point (except the last one), generate a cubic Bézier curve
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i]; // Current point
      const p3 = points[i + 1]; // Next point
      const p1 = controlPoints[i][1]; // Second control point of current point
      const p2 = controlPoints[i + 1][0]; // First control point of next point

      // Generate points along the cubic Bézier curve
      for (let j = 1; j <= segments; j++) {
        const t = j / segments;
        const point = calculateBezierPoint(t, p0, p1, p2, p3);
        bezierPoints.push(point);
      }
    }

    return bezierPoints;
  }

  /**
   * Calculates smooth control points for all points
   * @param {Array} points - Array of {x, y} coordinates
   * @param {number} smoothness - Factor controlling control point distance (0-1)
   * @returns {Array} Array of control point pairs for each point
   */
  function calculateSmoothControlPoints(points, smoothness = 0.4) {
    const n = points.length;

    // We need at least 3 points for smooth control point calculation
    if (n < 3) {
      // For 2 points, just use simple control points at 1/3 and 2/3
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

    // Calculate tangent vectors at each point
    const tangents = [];

    for (let i = 0; i < n; i++) {
      let prevPoint, nextPoint;

      if (i === 0) {
        // First point
        prevPoint = points[0];
        nextPoint = points[1];
      } else if (i === n - 1) {
        // Last point
        prevPoint = points[n - 2];
        nextPoint = points[n - 1];
      } else {
        // Middle points - use points on both sides
        prevPoint = points[i - 1];
        nextPoint = points[i + 1];
      }

      // Calculate tangent as a vector from previous to next point
      const tangent = {
        x: nextPoint.x - prevPoint.x,
        y: nextPoint.y - prevPoint.y,
      };

      // Normalize tangent vector
      const length = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
      if (length > 0) {
        tangent.x /= length;
        tangent.y /= length;
      }

      tangents.push(tangent);
    }

    // Calculate control points for each point
    const controlPoints = [];

    for (let i = 0; i < n; i++) {
      const tangent = tangents[i];
      const point = points[i];

      // Determine distance to adjacent points
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

      // Control point distances are based on distances to adjacent points
      // multiplied by the smoothness factor
      const cp1Distance = distanceToPrev * smoothness;
      const cp2Distance = distanceToNext * smoothness;

      // Calculate control points based on tangent vector
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
  }

  /**
   * Calculates a single point on a cubic Bézier curve
   * @param {number} t - Parameter between 0 and 1
   * @param {Object} p0 - Start point
   * @param {Object} p1 - First control point
   * @param {Object} p2 - Second control point
   * @param {Object} p3 - End point
   * @returns {Object} Point on the curve
   */
  function calculateBezierPoint(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    };
  }

  const computeAngle = (p1, p2) => {
    const deltaY = p2.lat - p1.lat;
    const deltaX = p2.lng - p1.lng;
    return (Math.atan2(deltaY, deltaX) * 180) / Math.PI; // Convert to degrees
  };
  // Handle Mouse Down (Start Drawing)
  const handleMouseDown = (e) => {
    if (!isDrawing) return;
    setIsMouseDown(true);
    const startPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setCurrentLine([startPoint]);
    setIconPosition(startPoint);
    // setCurrentLength(0);
  };
  const handleMouseMove = (e) => {
    if (!isDrawing || !isMouseDown) return;

    let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    let lastPoint = currentLine[currentLine.length - 1];

    let distanceBetweenPoints =
      computeLineLength([lastPoint, newPoint]) / 3.281; // Convert to meters

    if (distanceBetweenPoints > distanceBetweenTwoPoint) {
      // Keep full path but modify only the last 10 points
      let tempLine = [...currentLine, newPoint];
      console.log(tempLine);

      if (tempLine.length >= 3) {
        let radii = calculateCurvature(tempLine);
        let lastRadius = radii[radii.length - 1];
        let generatedLine = generateGeoPath(
          tempLine[tempLine.length - 2],
          angle,
        )
        console.log(generatedLine);
        tempLine = [...tempLine, generatedLine.straightEndPoint, generatedLine.curveEndPoint];
  
        if (lastRadius < MIN_TURNING_RADIUS) {
          // Extract last 10 points to process
          let lastPoints = tempLine.slice(-30);

          // filter the points to have a new array with points of distance of 1.5M between them.
          lastPoints = filterPointsByDistance(lastPoints);
          // Convert to Cartesian
          let lastPointsCartesian = lastPoints
            .filter(
              (point) => point && isFinite(point.lat) && isFinite(point.lng)
            )
            .map((point) => latlngToCartesian(point.lat, point.lng));

          // if (lastPointsCartesian.length > 10) {
          //   const simplified = simplify(
          //     lastPointsCartesian,
          //     Math.max(1, lastPointsCartesian.length * 0.005),
          //     true
          //   );
          //   lastPointsCartesian =
          //     simplified.length > 5 ? simplified : lastPointsCartesian;
          // }

          // Smooth if enough points remain
          if (lastPointsCartesian.length > 5) {
            lastPointsCartesian = createSmoothBezierCurve(
              lastPointsCartesian,
              segments,
              smoothness
            );
          }

          // Convert back to lat/lng
          lastPoints = lastPointsCartesian.map((point) =>
            cartesianToLatlng(point.x, point.y, 10)
          );

          // Preserve earlier points, replace only last 20
          tempLine = [...tempLine.slice(0, -30), ...lastPoints];
        }
      }
      if (tempLine.length > 1) {
        let angle = computeAngle(tempLine[tempLine.length - 2], newPoint);
        setIconRotation(angle);        
      }
      // Use requestAnimationFrame to optimize updates
      requestAnimationFrame(() => {
        setCurrentLine(tempLine);
        setIconPosition(newPoint);
        setCurrentLength(computeLineLength(tempLine));
      });
    }
  };

  const handleMouseUp = () => {
    if (isMouseDown && currentLine.length > 1) {
      setLines((prev) => [...prev, currentLine]);
    }
    setCurrentLine([]);
    setIsMouseDown(false);
    setIconPosition(null); // Hide icon when drawing stops

    // setCurrentLength(0);
  };

  // Attach event listeners dynamically
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Update Map Options
    map.setOptions({
      draggable: !isDrawing,
      cursor: isDrawing ? "crosshair" : "grab",
      gestureHandling: isDrawing ? "none" : "auto",
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
      mapTypeControl: true,
      mapTypeId: "satellite",
    });

    // Add event listeners to the map
    map.addListener("mousedown", handleMouseDown);
    map.addListener("mousemove", handleMouseMove);
    map.addListener("mouseup", handleMouseUp);

    // Ensure drawing stops when the mouse leaves the map
    document.addEventListener("mouseup", handleMouseUp);

    // Cleanup on unmount
    return () => {
      google.maps.event.clearListeners(map, "mousedown");
      google.maps.event.clearListeners(map, "mousemove");
      google.maps.event.clearListeners(map, "mouseup");
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDrawing, currentLine]);
  console.log(iconRotation);

  //handleFileUpload

  const handleFileUpload = (event) => {
    const file = event.target.files[0]; // Get the uploaded file
    if (!file) return; // Stop if no file is selected

    Papa.parse(file, {
      complete: (result) => {
        let newLines = [];
        let currentLine = [];

        result.data.forEach((row) => {
          if (row[0] === "NEWGROUP") {
            if (currentLine.length > 0) {
              newLines.push([...currentLine]);
              currentLine = [];
            }
          } else if (row.length >= 2) {
            const lat = parseFloat(row[0]);
            const lng = parseFloat(row[1]);

            if (!isNaN(lat) && !isNaN(lng)) {
              currentLine.push({ lat, lng });
            }
          }
        });

        if (currentLine.length > 0) {
          newLines.push(currentLine);
        }

        setLines(newLines);

        // ✅ Compute the length of the last line and update state
        if (newLines.length > 0) {
          const lastLine = newLines[newLines.length - 1];
          setCurrentLength(computeLineLength(lastLine));
        } else {
          setCurrentLength(0);
        }

        if (mapRef.current && newLines.length > 0) {
          mapRef.current.panTo(newLines[0][0]); // Move to the first line
        }
      },
      header: false,
      skipEmptyLines: true,
    });

    event.target.value = null;
  };

  // Convert drawn lines to CSV format and download
  const downloadCSV = () => {
    if (lines.length === 0) {
      alert("No drawings to download!");
      return;
    }

    let csvContent = "NEWGROUP\n"; // CSV header

    lines.forEach((line, index) => {
      if (index > 0) csvContent += "NEWGROUP\n"; // Separator between different lines
      line.forEach((point) => {
        csvContent += `${point.lat},${point.lng}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const timestampString = now.toLocaleString(); // Simple, locale-sensitive format

    link.download = `drawn_lines_checkpoint_${timestampString}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUploadEndPoints = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (result) => {
        const extractedPoints = result.data
          .filter((row) => row.length >= 2)
          .map((row) => ({
            lat: parseFloat(row[0]),
            lng: parseFloat(row[1]),
          }))
          .filter((point) => !isNaN(point.lat) && !isNaN(point.lng));

        setPoints(extractedPoints); // Store all points at once
        if (mapRef.current && extractedPoints.length > 0) {
          mapRef.current.panTo(extractedPoints[0]); // Move to the first point
        }
      },
    });

    event.target.value = null;
  };

  const handleFileUploadPerimeter = (csvData) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (result) => {
        const csvData = result.data;
        let extractedPaths = [];
        let currentPath = [];

        csvData.forEach((row) => {
          const firstColumn = row[0]?.trim().toUpperCase();

          if (row.length === 1 && firstColumn === "NEWGROUP") {
            // If there are existing points, save them as a separate polyline
            if (currentPath.length > 0) {
              extractedPaths.push([...currentPath]);
              currentPath = []; // Reset path for the next group
            }
          } else if (row.length >= 2) {
            // Convert to numbers
            const lat = parseFloat(row[0]);
            const lng = parseFloat(row[1]);

            if (!isNaN(lat) && !isNaN(lng)) {
              currentPath.push({ lat, lng });
            }
          }
        });

        // Push the last group if it has points
        if (currentPath.length > 0) {
          extractedPaths.push([...currentPath]);
        }

        setPaths(extractedPaths);

        // Pan to the first polyline if available
        if (
          mapRef.current &&
          extractedPaths.length > 0 &&
          extractedPaths[0].length > 0
        ) {
          mapRef.current.panTo(extractedPaths[0][0]);
        }
      },
      skipEmptyLines: true,
    });
    event.target.value = null;
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      {isLoaded ? (
        <GoogleMap
          options={{
            disableDefaultUI: true,
            mapTypeId: "satellite",
            zoomControl: true,
            fullscreenControl: true,
            mapTypeControl: true,
          }}
          mapContainerStyle={mapContainerStyle}
          center={markers[0] || center}
          zoom={zoomLevel}
          onLoad={(map) => {
            mapRef.current = map;
            setTimeout(updateBounds, 500); // Ensure bounds update after load
          }}
        >
          {points.map((point, index) => (
            <OverlayView
              key={index}
              position={point}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={(width, height) => ({
                x: -width / 2,
                y: -height / 2,
              })}
            >
              <div
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  backgroundColor: "magenta",
                  position: "absolute",
                }}
              />
            </OverlayView>
          ))}
          {paths.map((path, index) => (
            <Polyline
              key={index}
              path={path}
              options={{
                strokeColor: `#4CC9FE`, // Unique color per path
                strokeOpacity: 1,
                strokeWeight: 2,
                geodesic: true,
              }}
            />
          ))}
          {/* Render all drawn lines */}
          {lines.map((path, idx) => (
            <Polyline
              key={idx}
              path={path}
              options={{ strokeColor: "#7CFC00", strokeWeight: 2 }}
            />
          ))}

          {/* Active drawing line */}
          {currentLine.length > 1 && (
            <Polyline
              path={currentLine}
              options={{ strokeColor: "#FF0000", strokeWeight: 2 }}
            />
          )}
          {iconPosition && (
            <RobotOverlay
              position={iconPosition}
              rotation={iconRotation}
              map={mapRef.current}
            />
          )}

          {/* Floating Robot Image */}
          {/* Dynamic Scaling GroundOverlay */}
          {bounds && (
            <GroundOverlay
              key="robot-overlay"
              bounds={bounds}
              url="https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
              opacity={1}
            />
          )}
        </GoogleMap>
      ) : (
        <p>Loading Map...</p>
      )}
      {/* Display Length Information */}
      <p
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          padding: "5px 10px",
          borderRadius: "5px",
          fontSize: "14px",
          zIndex: 1000,
        }}
      >
        {currentLength.toFixed(2)} feet
      </p>
      {/* Hidden File Input */}
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        ref={fileInputRef}
        style={{ display: "none" }}
      />

      {/* Buttons on Map */}
      <div style={{ position: "absolute", top: 70, right: 5, zIndex: 1000 }}>
        <Tooltip label="Upload Checkpoint" position="left">
          <ActionIcon
            onClick={() => fileInputRef.current?.click()}
            size="md"
            color="blue"
            variant="filled"
          >
            <IconUpload size=".9rem" />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Toggle Draw Mode */}
      <div style={{ position: "absolute", top: 100, right: 5, zIndex: 1000 }}>
        <Tooltip
          label={isDrawing ? "Stop Drawing" : "Start Drawing"}
          position="left"
        >
          <ActionIcon
            size="md"
            color={isDrawing ? "red" : "green"}
            variant="filled"
            onClick={toggleDrawing}
          >
            <IconPaint size=".9rem" />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Clear Drawings */}
      <div style={{ position: "absolute", top: 130, right: 5, zIndex: 1000 }}>
        <Tooltip label="Undo" position="left">
          <ActionIcon
            size="md"
            color="blue"
            variant="filled"
            onClick={undoLastDrawing}
          >
            <IconReload size=".9rem" />
          </ActionIcon>
        </Tooltip>
      </div>

      <div style={{ position: "absolute", top: 160, right: 5, zIndex: 1000 }}>
        <Tooltip label="Download" position="left">
          <ActionIcon
            size="md"
            color="blue"
            variant="filled"
            onClick={downloadCSV}
          >
            <IconDownload size=".9rem" />
          </ActionIcon>
        </Tooltip>
      </div>
      <Paper
        p="sm"
        shadow="sm"
        radius="md"
        style={{
          backgroundColor: "white",
          position: "absolute",
          top: 60,
          left: 5,
          zIndex: 1000,
        }}
      >
        <input
          ref={fileInputRefPerimeter}
          style={{ display: "none" }}
          type="file"
          accept=".csv"
          onChange={handleFileUploadPerimeter}
        />

        <Button
          mb="xs"
          radius="md"
          onClick={() => fileInputRefPerimeter.current?.click()}
          size="xs"
        >
          Perimeter File
        </Button>
        <br />
        <input
          ref={fileInputRefEndPoints}
          style={{ display: "none" }}
          type="file"
          accept=".csv"
          onChange={handleFileUploadEndPoints}
        />

        <Button
          radius="md"
          onClick={() => fileInputRefEndPoints.current?.click()}
          size="xs"
        >
          Endpoints File
        </Button>
      </Paper>

      <ToastContainer />
    </div>
  );
}
