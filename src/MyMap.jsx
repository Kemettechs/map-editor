import { useState, useRef, useEffect } from "react";
import {
  GoogleMap,
  Polygon,
  useLoadScript,
  Polyline,
  GroundOverlay,
} from "@react-google-maps/api";
import Papa from "papaparse";
import { ActionIcon, Tooltip } from "@mantine/core";
import { ToastContainer } from "react-toastify";
import {
  IconDownload,
  IconPaint,
  IconReload,
  IconUpload,
} from "@tabler/icons-react";
import * as math from "mathjs";

const libraries = ["places", "geometry"]; // Define it outside
// import { computeDistanceBetween } from "spherical-geometry-js";

// Minimum segment length threshold (3.2 meters)
const mapContainerStyle = { width: "100%", height: "100vh" };
const center = { lat: 37.7749, lng: -122.4194 }; // Default to San Francisco
// Real-world dimensions in meters
const realWidthMeters = 1.8;
const realHeightMeters = 4.5;

// Approximate meters per degree of latitude (varies by location)
const metersPerDegreeLat = 111320;
const metersPerDegreeLng = 111320 * Math.cos((center.lat * Math.PI) / 180);
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
  const [isMouseDown, setIsMouseDown] = useState(false); // Track mouse state
  const [bounds, setBounds] = useState(null);
  const [polygonCoords, setPolygonCoords] = useState([]);

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

  // Handle Mouse Down (Start Drawing)
  const handleMouseDown = (e) => {
    if (!isDrawing) return;
    setIsMouseDown(true);
    setCurrentLine([{ lat: e.latLng.lat(), lng: e.latLng.lng() }]);
    // setCurrentLength(0);
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

  const MIN_TURNING_RADIUS = 3.2; // Minimum turning radius in meters
  const isValidPath = (point) => {
    // Example: Ensure the point is within map bounds
    return (
      point.lat >= -90 &&
      point.lat <= 90 &&
      point.lng >= -180 &&
      point.lng <= 180
    );
  };

  const adjustPoint = (points) => {
    if (points.length < 3) return points[points.length - 1];

    // Convert lat/lng objects to arrays
    const toArray = (point) => [point.lat, point.lng];
    const toLatLng = (arr) => ({ lat: arr[0], lng: arr[1] });

    const p0 = toArray(points[points.length - 3]);
    const p1 = toArray(points[points.length - 2]);
    const p2 = toArray(points[points.length - 1]);
    // console.log(points);
    // console.log(points[points.length - 3]);
    // console.log(points[points.length - 2]);
    // console.log(points[points.length - 1]);

    const v1 = math.subtract(p1, p0);
    const v2 = math.subtract(p2, p1);

    const mid1 = math.divide(math.add(p0, p1), 2);
    const mid2 = math.divide(math.add(p1, p2), 2);

    const perp1 = [-v1[1], v1[0]];
    const perp2 = [-v2[1], v2[0]];

    const dotProduct = math.dot(v1, v2) / (math.norm(v1) * math.norm(v2));
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

    if (Math.abs(angle - Math.PI) < 0.1) return p2;
    // console.log(v1, v2);
    const crossProduct = v1[0] * v2[1] - v1[1] * v2[0];

    let centerDir;
    if (Math.abs(crossProduct) < 1e-10) {
      centerDir = [v1[1], -v1[0]];
    } else {
      const v1Norm = math.divide(v1, math.norm(v1));
      const v2Norm = math.divide(v2, math.norm(v2));
      let bisector = math.add(v1Norm, v2Norm);

      if (math.norm(bisector) > 1e-10) {
        bisector = math.divide(bisector, math.norm(bisector));
      }

      centerDir = [-bisector[1], bisector[0]];
      if (math.cross(v1, v2) < 0) centerDir = math.multiply(centerDir, -1);
    }

    const moveDir = math.multiply(centerDir, 1);

    let minDist = 0;
    let maxDist = 100000000;
    let adjustedPoint = p2;

    for (let i = 0; i < 100; i++) {
      const midDist = (minDist + maxDist) / 2;
      const testPoint = math.add(p2, math.multiply(moveDir, midDist));
      console.log(moveDir, midDist, p2);

      console.log(`Test Point: ${testPoint}`);
      let newPath = [...points.slice(0, -1), toLatLng(testPoint)];
      let radii = calculateCurvature(newPath);
      let lastRadius = radii[radii.length - 1];

      console.log(`new Radius: ${lastRadius}`);

      if (lastRadius >= MIN_TURNING_RADIUS) {
        maxDist = midDist;
        adjustedPoint = testPoint;
      } else {
        minDist = midDist;
      }
    }

    return toLatLng(adjustedPoint);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !isMouseDown) return;

    let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };

    let tempLine = [...currentLine, newPoint];

    if (tempLine.length >= 3) {
      let radii = calculateCurvature(tempLine);
      let lastRadius = radii[radii.length - 1];

      console.log(`Last Radius: ${lastRadius}`);

      // If the radius is too small, adjust the points
      if (lastRadius < MIN_TURNING_RADIUS) {
        console.warn("Adjusting points to smooth the curve...");
        // console.log(tempLine);

        let newP = adjustPoint(tempLine);
        // console.log(newP);
        let newTempLine = [...tempLine];
        newTempLine[newTempLine.length - 1] = newP;
        // console.log(newTempLine);

        let w = calculateCurvature(newTempLine);
        let newR = w[w.length - 1];

        console.log(`newR: ${newR}`);
      }
    }

    setCurrentLine(tempLine);
    setCurrentLength(computeLineLength(tempLine));
  };

  const handleMouseUp = () => {
    if (isMouseDown && currentLine.length > 1) {
      setLines((prev) => [...prev, currentLine]);
    }
    setCurrentLine([]);
    setIsMouseDown(false);
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

  const fitMapToPolygon = (points) => {
    if (mapRef.current && points.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      points.forEach((point) => bounds.extend(point));
      mapRef.current.fitBounds(bounds); // Use mapRef.current instead of map
    }
  };
  //handleFileUpload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        let points = results.data
          .map((row) => ({
            lat: parseFloat(row.latitude),
            lng: parseFloat(row.longitude),
          }))
          .filter((point) => !isNaN(point.lat) && !isNaN(point.lng));

        if (points.length > 2) {
          // Ensure polygon is closed
          const firstPoint = points[0];
          const lastPoint = points[points.length - 1];

          if (
            firstPoint.lat !== lastPoint.lat ||
            firstPoint.lng !== lastPoint.lng
          ) {
            points.push(firstPoint); // Close the polygon
          }

          setPolygonCoords(points);
          fitMapToPolygon(points);
        }
      },
    });
  };

  // Convert drawn lines to CSV format and download
  const downloadCSV = () => {
    if (lines.length === 0) {
      alert("No drawings to download!");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Latitude,Longitude\n";

    lines.forEach((line, index) => {
      csvContent += `Line ${index + 1}\n`;
      line.forEach((point) => {
        csvContent += `${point.lat},${point.lng}\n`;
      });
      csvContent += "\n"; // Blank line between different lines
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "drawn_lines.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          {polygonCoords.length > 2 && (
            <Polygon
              paths={polygonCoords}
              options={{
                fillColor: "rgba(0, 0, 255, 0.3)", // Blue with opacity
                strokeColor: "blue",
                strokeWeight: 2,
                clickable: false, // Allow drawing on top of polygon
                zIndex: 1, // Lower than polylines
              }}
            />
          )}

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
        <Tooltip label="Upload CSV" position="left">
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
      <ToastContainer />
    </div>
  );
}
