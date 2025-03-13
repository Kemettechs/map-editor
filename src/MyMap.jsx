import { useState, useRef, useEffect } from "react";
import {
  GoogleMap,
  Marker,
  useLoadScript,
  Polyline,
  GroundOverlay,
} from "@react-google-maps/api";
import Papa from "papaparse";
import { ActionIcon, Tooltip } from "@mantine/core";
import { toast, ToastContainer } from "react-toastify";
import {
  IconDownload,
  IconPaint,
  IconReload,
  IconUpload,
} from "@tabler/icons-react";
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

  const [markers, setMarkers] = useState([]);
  const zoomLevel = 15;
  const [lines, setLines] = useState([]); // Stores multiple drawn lines
  const [currentLine, setCurrentLine] = useState([]); // Current active drawing
  const [isDrawing, setIsDrawing] = useState(false); // Toggle drawing mode
  const mapRef = useRef(null);
  const [currentLength, setCurrentLength] = useState(0); // Length of active line
  const fileInputRef = useRef(null);
  const [isMouseDown, setIsMouseDown] = useState(false); // Track mouse state
  const [bounds, setBounds] = useState(null);

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

  const MIN_TURNING_RADIUS = 3.2; // Minimum allowed turning radius

  const calculateCurvature = (path) => {
    if (path.length < 3) return [];

    let curvatures = [];
    let dx = [];
    let dy = [];

    // Compute first derivatives using central differences
    for (let i = 1; i < path.length - 1; i++) {
      dx.push((path[i + 1].lat - path[i - 1].lat) / 2);
      dy.push((path[i + 1].lng - path[i - 1].lng) / 2);
    }

    // console.log("dx:", dx);
    // console.log("dy:", dy);

    // Normalize dx and dy to prevent precision issues
    for (let i = 0; i < dx.length; i++) {
      const magnitude = Math.sqrt(dx[i] ** 2 + dy[i] ** 2);
      if (magnitude > 1e-6) {
        dx[i] /= magnitude;
        dy[i] /= magnitude;
      }
    }

    // Compute second derivatives
    let ddx = [];
    let ddy = [];

    for (let i = 1; i < dx.length - 1; i++) {
      ddx.push((dx[i + 1] - dx[i - 1]) / 2);
      ddy.push((dy[i + 1] - dy[i - 1]) / 2);
    }

    // console.log("ddx:", ddx);
    // console.log("ddy:", ddy);

    // Calculate curvature: κ = |x' y'' - y' x''| / (x'² + y'²)^(3/2)
    for (let i = 0; i < ddx.length; i++) {
      const numerator = Math.abs(dx[i] * ddy[i] - dy[i] * ddx[i]);
      const denominator = Math.pow(dx[i] ** 2 + dy[i] ** 2, 1.5);

      const epsilon = 1e-6; // Prevent division by zero
      let curvature = denominator > epsilon ? numerator / denominator : 0;
      let radius = curvature > epsilon ? 1 / curvature : Infinity;

      // console.log(`Curvature at ${i}:`, curvature);
      // console.log(`Radius at ${i}:`, radius);

      curvatures.push(radius);
    }

    return curvatures;
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !isMouseDown) return;

    const newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    const newLine = [...currentLine, newPoint];

    if (newLine.length >= 3) {
      const radii = calculateCurvature(newLine);
      const lastRadius = radii[radii.length - 1];

      console.log("Last Radius:", lastRadius);

      if (lastRadius < MIN_TURNING_RADIUS) {
        toast.error(
          <span
            style={{
              fontSize: "12px",
            }}
          >
            The curve radius must be at least 3.2 meters!
          </span>
        );

        setIsDrawing(false);
        setCurrentLine(newLine.slice(0, -1)); // Remove last invalid point
        return;
      }
    }

    setCurrentLine(newLine);
    setCurrentLength(computeLineLength(newLine));
  };

  // Compute numerical gradient using finite differences

  // Handle Mouse Up (Stop Drawing)
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

  //handleFileUpload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const points = results.data
          .map((row) => ({
            lat: parseFloat(row.latitude),
            lng: parseFloat(row.longitude),
          }))
          .filter((point) => !isNaN(point.lat) && !isNaN(point.lng));

        if (points.length > 0) {
          setMarkers(points);
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
          {markers.map((pos, idx) => (
            <Marker key={idx} position={pos} />
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
