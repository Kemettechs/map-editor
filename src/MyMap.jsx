import { useState, useRef, useEffect } from "react";
import {
  GoogleMap,
  Polygon,
  useLoadScript,
  Polyline,
  GroundOverlay,
} from "@react-google-maps/api";
import Papa from "papaparse";
import proj4 from "proj4";
import { ActionIcon, Tooltip } from "@mantine/core";
import { ToastContainer } from "react-toastify";
import {
  IconDownload,
  IconPaint,
  IconReload,
  IconUpload,
} from "@tabler/icons-react";
import * as math from "mathjs";
import { Line } from "react-chartjs-2";
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

  const MIN_TURNING_RADIUS = 3.2;
  /**
   * Smooths the last point in a three-point sequence to ensure a smooth curve
   * with limited curvature.
   * 
   * @param {Object} p1 - First point with x,y coordinates
   * @param {Object} p2 - Second point with x,y coordinates
   * @param {Object} p3 - Third point with x,y coordinates (the one to be adjusted)
   * @param {Number} pointDistance - Distance between consecutive points (in meters)
   * @param {Number} maxDeviation - Maximum allowed deviation from projected straight line (in meters)
   * @returns {Object} - Adjusted p3 point with x,y coordinates
   */
  function smoothPoint(p1, p2, p3, pointDistance = 0.3, maxDeviation = 0.105, minDeviation = 0.01, deviationAmplifier = 2.5, perpendicularOffset = 1) {

    console.log('Input points:', { p1, p2, p3 });
    console.log('Constraints:', { pointDistance, maxDeviation });
  
    p1 = latlngToCartesian(p1.lat, p1.lng);
    p2 = latlngToCartesian(p2.lat, p2.lng);
    p3 = latlngToCartesian(p3.lat, p3.lng);
    console.log('Input points:', { p1, p2, p3 });
    console.log('Constraints:', { pointDistance, maxDeviation });
  
    // Calculate the direction vector from p1 to p2
    const v12 = { x: p2.x - p1.x, y: p2.y - p1.y };
    console.log('Direction vector p1->p2:', v12);
  
    // Normalize the direction vector
    const v12Length = Math.sqrt(v12.x * v12.x + v12.y * v12.y);
    console.log('Distance p1->p2:', v12Length);
    const v12Unit = { x: v12.x / v12Length, y: v12.y / v12Length };
    console.log('Unit direction p1->p2:', v12Unit);
  
    // Project where p3 should be if continuing straight from p1->p2
    const projectedP3 = { x: p2.x + v12Unit.x * pointDistance, y: p2.y + v12Unit.y * pointDistance };
    console.log('Projected p3 (straight line):', projectedP3);
  
    // Calculate the current deviation from the projected path
    const deviationVector = { x: p3.x - projectedP3.x, y: p3.y - projectedP3.y };
    const deviationLength = Math.sqrt(
      deviationVector.x * deviationVector.x + deviationVector.y * deviationVector.y
    );
    console.log('Deviation from straight line:', deviationLength);
  
    // If the deviation is within constraints, return the original point
    if (deviationLength <= maxDeviation) {
      console.log('Deviation within limits, returning original p3');
      // Force the point to move to the maximum deviation in the same direction
      // This is the key change - we're always pushing to the maximum deviation
      if (deviationLength > 0) {
        const deviationUnit = { 
          x: deviationVector.x / deviationLength, 
          y: deviationVector.y / deviationLength 
        };
        const forcedP3 = {
          x: projectedP3.x + deviationUnit.x * maxDeviation,
          y: projectedP3.y + deviationUnit.y * maxDeviation
        };
        console.log('Forcing deviation to maximum:', forcedP3);
        
        // Ensure the distance from p2 to forcedP3 is still pointDistance
        const currentDistance = Math.sqrt(
          Math.pow(forcedP3.x - p2.x, 2) + Math.pow(forcedP3.y - p2.y, 2)
        );
        
        if (Math.abs(currentDistance - pointDistance) > 0.001) {
          console.log('Adjusting distance to maintain pointDistance...');
          // Create a vector from p2 to forcedP3
          const adjustedDirection = { x: forcedP3.x - p2.x, y: forcedP3.y - p2.y };
          // Normalize and scale to the correct distance
          const adjustedLength = Math.sqrt(
            adjustedDirection.x * adjustedDirection.x + adjustedDirection.y * adjustedDirection.y
          );
          const finalP3 = {
            x: p2.x + (adjustedDirection.x / adjustedLength) * pointDistance,
            y: p2.y + (adjustedDirection.y / adjustedLength) * pointDistance
          };
          
          // Calculate how different the result is from the original
          const changeX = finalP3.x - p3.x;
          const changeY = finalP3.y - p3.y;
          console.log('Change from original:', { changeX, changeY, distance: Math.sqrt(changeX*changeX + changeY*changeY) });
          
          return cartesianToLatlng(finalP3.x, finalP3.y, p1.utmZone);
        }
        
        return cartesianToLatlng(forcedP3.x, forcedP3.y, p1.utmZone);
      }
      return cartesianToLatlng(p3.x, p3.y, p1.utmZone);
    }
  
    console.log('Deviation exceeds maximum, adjusting point...');
    
    // Otherwise, limit the deviation to the maximum allowed
    // First, normalize the deviation vector
    const deviationUnit = { x: deviationVector.x / deviationLength, y: deviationVector.y / deviationLength };
    
    // Create a point at the maximum allowed deviation
    const adjustedP3 = { x: projectedP3.x + deviationUnit.x * maxDeviation, y: projectedP3.y + deviationUnit.y * maxDeviation };
    console.log('Initial adjusted p3:', adjustedP3);
  
    // Ensure the distance from p2 to adjustedP3 is still pointDistance
    const currentDistance = Math.sqrt(
      Math.pow(adjustedP3.x - p2.x, 2) + Math.pow(adjustedP3.y - p2.y, 2)
    );
    console.log('Distance from p2 to adjusted p3:', currentDistance);
  
    let finalP3 = { ...adjustedP3 };
    if (Math.abs(currentDistance - pointDistance) > 0.001) {
      console.log('Adjusting distance to maintain pointDistance...');
      // Create a vector from p2 to adjustedP3
      const adjustedDirection = { x: adjustedP3.x - p2.x, y: adjustedP3.y - p2.y };
      // Normalize and scale to the correct distance
      const adjustedLength = Math.sqrt(
        adjustedDirection.x * adjustedDirection.x + adjustedDirection.y * adjustedDirection.y
      );
      finalP3 = {
        x: p2.x + (adjustedDirection.x / adjustedLength) * pointDistance,
        y: p2.y + (adjustedDirection.y / adjustedLength) * pointDistance
      };
      console.log('Final adjusted p3:', finalP3);
    }
  
    // Calculate how different the result is from the original
    const changeX = finalP3.x - p3.x;
    const changeY = finalP3.y - p3.y;
    console.log('Change from original:', { changeX, changeY, distance: Math.sqrt(changeX*changeX + changeY*changeY) });
              
    return cartesianToLatlng(finalP3.x, finalP3.y, p1.utmZone);
  }

  const smoothWithArc = (p1, p2, p3, minRadius = 3.2, numPoints = 20) => {
    p1 = latlngToCartesian(p1.lat, p1.lng);
    p2 = latlngToCartesian(p2.lat, p2.lng);
    p3 = latlngToCartesian(p3.lat, p3.lng);
    // Vectors from p2 to p1 and p2 to p3
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    // Normalize vectors
    const normV1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
    const normV2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
    const v1Normalized = { x: v1.x / normV1, y: v1.y / normV1 };
    const v2Normalized = { x: v2.x / normV2, y: v2.y / normV2 };

    const crossProduct = v1Normalized.x * v2Normalized.y - v1Normalized.y * v2Normalized.x;
    const angle = Math.atan2(crossProduct, v1Normalized.x * v2Normalized.x + v1Normalized.y * v2Normalized.y);
    // Skip smoothing for near-straight angles
    // if (Math.abs(angle) < 1e-9 || Math.abs(angle - Math.PI) < 1e-9) {
    //   return [p1, p2, p3];
    // }

    // Calculate tangent length and check segment lengths
    const halfAngle = angle / 2;
    const tangentLength = minRadius / Math.tan(halfAngle);
    // if (normV1 < tangentLength || normV2 < tangentLength) {
    //   return [p1, p2, p3];
    // }

    // Correct bisector direction (outward from the corner)
    const bisector = {
      x: v1Normalized.x - v2Normalized.x,
      y: v1Normalized.y - v2Normalized.y,
    };
    const bisectorNorm = Math.sqrt(bisector.x ** 2 + bisector.y ** 2);
    const bisectorNormalized = {
      x: bisector.x / bisectorNorm,
      y: bisector.y / bisectorNorm,
    };

    // Calculate arc center
    const center = {
      x: p2.x + bisectorNormalized.x * (minRadius / Math.sin(halfAngle)),
      y: p2.y + bisectorNormalized.y * (minRadius / Math.sin(halfAngle)),
    };

    // Calculate start/end points of the arc
    const startPoint = {
      x: p2.x + v1Normalized.x * tangentLength,
      y: p2.y + v1Normalized.y * tangentLength,
    };
    const endPoint = {
      x: p2.x + v2Normalized.x * tangentLength,
      y: p2.y + v2Normalized.y * tangentLength,
    };

    // Generate points along the arc
    const thetaStart = Math.atan2(
      startPoint.y - center.y,
      startPoint.x - center.x
    );
    const thetaEnd = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
    const theta = Array.from(
      { length: numPoints },
      (_, i) => thetaStart + (thetaEnd - thetaStart) * (i / (numPoints - 1))
    );

    let arcPoints = theta.map((t) => ({
      x: center.x + minRadius * Math.cos(t),
      y: center.y + minRadius * Math.sin(t),
    }));
    console.log(arcPoints);

    arcPoints = arcPoints.map((point) => {
      return cartesianToLatlng(point.x, point.y, p1.utmZone);
    });
    console.log(arcPoints);

    return arcPoints;
  };

  const smoothThreePoints = (p1, p2, p3, minRadius = MIN_TURNING_RADIUS) => {
    console.log(p1, p2, p3);
    p1 = latlngToCartesian(p1.lat, p1.lng);
    p2 = latlngToCartesian(p2.lat, p2.lng);
    p3 = latlngToCartesian(p3.lat, p3.lng);
    console.log(p1, p2, p3);

    const toArray = (point) => [point.x, point.y]; // Use lat/lng consistently
    const p1Arr = toArray(p1),
      p2Arr = toArray(p2),
      p3Arr = toArray(p3);

    const v1 = [p1Arr[0] - p2Arr[0], p1Arr[1] - p2Arr[1]];
    const v2 = [p3Arr[0] - p2Arr[0], p3Arr[1] - p2Arr[1]];

    const dotProduct = v1[0] * v2[0] + v1[1] * v2[1];
    const normV1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
    const normV2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);

    // if (normV1 === 0 || normV2 === 0) return [p1, p2, p3];

    const cosAngle = dotProduct / (normV1 * normV2);
    // if (cosAngle < -1 || cosAngle > 1) return [p1, p2, p3];

    const angle = Math.acos(cosAngle);
    const halfAngle = angle / 2;
    const sinHalfAngle = Math.sin(halfAngle);
    // if (sinHalfAngle === 0) return [p1, p2, p3];

    const distance = minRadius / sinHalfAngle;

    const bisector = [
      (v1[0] / normV1 + v2[0] / normV2) / 2,
      (v1[1] / normV1 + v2[1] / normV2) / 2,
    ];
    const normBisector = Math.sqrt(bisector[0] ** 2 + bisector[1] ** 2);
    // if (normBisector === 0) return [p1, p2, p3];

    let adjustedP2 = {
      x: p2.x - (bisector[0] / normBisector) * distance,
      y: p2.y - (bisector[1] / normBisector) * distance,
    };
    // console.log(cartesianToLatlng(adjustedP2.x, adjustedP2.y, 10));
    adjustedP2 = cartesianToLatlng(adjustedP2.x, adjustedP2.y, p1.utmZone);
    console.log(adjustedP2);

    return [p1, adjustedP2, p3];
  };
  let pointsAdj = 1000000;
  const handleMouseMove = (e) => {
    if (!isDrawing || !isMouseDown) return;

    let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    let lastPoint = currentLine[currentLine.length - 1];
    let distanceBetweenPoints = computeLineLength([lastPoint, newPoint]) / 3.281 ; // Convert to meters
    console.log(distanceBetweenPoints)
    // console.log(d);
    if (distanceBetweenPoints > 0.3) {
      let tempLine = [...currentLine, newPoint];

      if (tempLine.length >= 3) {
        let radii = calculateCurvature(tempLine);
        let lastRadius = radii[radii.length - 1];

        console.log(`Last Radius: ${lastRadius}`);
        console.log(tempLine);

        if (lastRadius < MIN_TURNING_RADIUS) {
          // let smoothedPoints = smoothWithArc(
          //   tempLine[tempLine.length - 3],
          //   tempLine[tempLine.length - 2],
          //   tempLine[tempLine.length - 1],
          //   MIN_TURNING_RADIUS,
          //   50
          // );
          let smoothedP3 = smoothPoint(
            tempLine[tempLine.length - 3],
            tempLine[tempLine.length - 2],
            tempLine[tempLine.length - 1]
          );
          // console.log(tempLine);

          console.log("Adjusted Points:", smoothedP3);
          tempLine[tempLine.length - 1] = smoothedP3;
          let newPath = [...tempLine];
          // let newPath = [...tempLine];
          // newPath = [
          //   tempLine[0],
          //   smoothedPoints[1],
          //   tempLine[tempLine.length - 1],
          // ];
          // newPath.splice(newPath.length - 2, 1, ...smoothedPoints); // Insert valid lat/lng
          console.log(newPath);
          let radii = calculateCurvature(newPath);
          let newLastRadius = radii[radii.length - 1];
          tempLine = newPath;
          console.log(`new Radius: ${newLastRadius}`);
        }
      }

      setCurrentLine(tempLine);
      setCurrentLength(computeLineLength(tempLine));
    }
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
