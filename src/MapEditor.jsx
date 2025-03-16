import React, { useState, useEffect, useRef } from "react";
import MapWorker from "./workers/MapWorker.worker.js?worker"; // ✅ Ensure correct Vite worker import

import { useLoadScript } from "@react-google-maps/api";

const MapEditor = ({ p }) => {
  const [editor, setEditor] = useState(p.editor);
  const overlayRef = useRef(null);
  const mapRef = useRef(null);
  const fileInputRef = useRef(null);
  const workerRef = useRef(new MapWorker());

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: p.map_key, // Make sure this key is valid
  });

  useEffect(() => {
    setEditor((prevState) => {
      let refs = {
        mapEl: mapRef.current,
        overlayEl: overlayRef.current,
        props: p.inputProps,
        setState: setEditor,
      };
      return { ...prevState, ...refs };
    });
  }, []);

  useEffect(() => {
    if (editor && isLoaded) {
      editor.init();
    }
  }, [editor, isLoaded]);

  // ✅ Handle File Upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      console.log("📂 CSV Data Before Sending to Worker:", e.target.result);

      // ✅ Send only valid CSV to the worker
      if (
        typeof e.target.result === "string" &&
        e.target.result.includes(",")
      ) {
        workerRef.current.postMessage({ decode: e.target.result });
      } else {
        console.error("❌ Invalid CSV data. Not sending to worker.");
      }
    };
    reader.readAsText(file);
  };

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

  // const handleMouseMove = (e) => {
  //   if (!isDrawing || !isMouseDown) return;

  //   let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
  //   let tempLine = [...currentLine, newPoint];

  //   if (tempLine.length >= 3) {
  //     let radii = calculateCurvature(tempLine);
  //     let lastRadius = radii[radii.length - 1];

  //     console.log(`Last Radius: ${lastRadius}`);

  //     if (lastRadius < MIN_TURNING_RADIUS) {
  //       console.warn("Removing last 1 points due to sharp turn!");
  //       tempLine = tempLine.slice(0, -1); // Remove last 1 points
  //       let g = calculateCurvature(tempLine);
  //       let h = g[g.length - 1];
  //       console.log(`Last Radius after removing: ${h}`);
  //     }
  //   }

  //   setCurrentLine(tempLine);
  //   setCurrentLength(computeLineLength(tempLine));
  // };
  const MIN_TURNING_RADIUS = 3.2; // meters
  // Function to calculate the angle between three points (P1, P2,
  const isValidPoint = (point) => {
    return (
      typeof point.lat === "number" &&
      !isNaN(point.lat) &&
      typeof point.lng === "number" &&
      !isNaN(point.lng)
    );
  };
  const adjustPoint = (p1, p2, p3, minRadius) => {
    if (!isValidPoint(p1) || !isValidPoint(p2) || !isValidPoint(p3)) {
      console.error("Invalid input points in adjustPoint");
      return p2; // Return the original point if inputs are invalid
    }

    // Calculate the vectors for the triangle formed by p1, p2, p3
    let v1 = { lat: p2.lat - p1.lat, lng: p2.lng - p1.lng };
    let v2 = { lat: p3.lat - p2.lat, lng: p3.lng - p2.lng };

    // Calculate the cross product of v1 and v2
    let crossProduct = v1.lat * v2.lng - v1.lng * v2.lat;

    // Check if the cross product is too small (close to zero)
    const epsilon = 1e-10; // Small threshold to avoid division by zero
    if (Math.abs(crossProduct) < epsilon) {
      console.warn("Cross product is too small, returning original point");
      return p2; // Return the original point if the cross product is invalid
    }

    // Calculate the magnitudes of v1 and v2
    let magV1 = Math.sqrt(v1.lat ** 2 + v1.lng ** 2);
    let magV2 = Math.sqrt(v2.lat ** 2 + v2.lng ** 2);

    // Check if the magnitudes are too small (close to zero)
    if (magV1 < epsilon || magV2 < epsilon) {
      console.warn("Magnitudes are too small, returning original point");
      return p2; // Return the original point if magnitudes are invalid
    }

    // Calculate the radius of curvature
    let radius = Math.abs((magV1 * magV2 * magV2) / (2 * crossProduct));

    // If the radius is already greater than minRadius, no adjustment is needed
    if (radius >= minRadius) {
      return p2;
    }

    // Adjust p2 to ensure the radius is at least minRadius
    let adjustmentFactor = (minRadius - radius) / minRadius;

    // Calculate the midpoint between p1 and p3
    let midpoint = {
      lat: (p1.lat + p3.lat) / 2,
      lng: (p1.lng + p3.lng) / 2,
    };

    // Move p2 towards the midpoint to reduce curvature
    let adjustedP2 = {
      lat: p2.lat + adjustmentFactor * (midpoint.lat - p2.lat),
      lng: p2.lng + adjustmentFactor * (midpoint.lng - p2.lng),
    };

    // Validate the adjusted point
    if (!isValidPoint(adjustedP2)) {
      console.error("Adjusted point is invalid:", adjustedP2);
      return p2; // Return the original point if the adjusted point is invalid
    }

    return adjustedP2;
  };
  const handleMouseMove = (e) => {
    if (!isDrawing || !isMouseDown) return;

    let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };

    // Validate the new point
    if (!isValidPoint(newPoint)) {
      console.error("Invalid new point:", newPoint);
      return;
    }

    let tempLine = [...currentLine, newPoint];

    if (tempLine.length >= 3) {
      let radii = calculateCurvature(tempLine);
      let lastRadius = radii[radii.length - 1];

      console.log(`Last Radius: ${lastRadius}`);

      // If the radius is too small, adjust the points
      if (lastRadius < MIN_TURNING_RADIUS) {
        console.warn("Adjusting points to smooth the curve...");

        // Get the last three points
        let p1 = tempLine[tempLine.length - 3];
        let p2 = tempLine[tempLine.length - 2];
        let p3 = tempLine[tempLine.length - 1];

        // Adjust p2 to ensure the radius is at least MIN_TURNING_RADIUS
        let adjustedP2 = adjustPoint(p1, p2, p3, MIN_TURNING_RADIUS);

        // Replace the last three points with the adjusted points
        tempLine = [
          ...tempLine.slice(0, tempLine.length - 3),
          p1,
          adjustedP2,
          p3,
        ];

        // Recalculate the curvature after adjustment
        radii = calculateCurvature(tempLine);
        lastRadius = radii[radii.length - 1];
        console.log(`Last Radius after adjustment: ${lastRadius}`);

        // If the radius is still too small, remove points until the radius is valid
        const maxRemovalLimit = 5; // Maximum number of points to remove
        let removalCount = 0;

        while (
          lastRadius < MIN_TURNING_RADIUS &&
          removalCount < maxRemovalLimit
        ) {
          console.warn("Removing last point due to sharp turn!");
          tempLine = tempLine.slice(0, -1); // Remove last point
          removalCount++;

          // Recalculate the curvature after removing the last point
          radii = calculateCurvature(tempLine);
          lastRadius = radii[radii.length - 1];
          console.log(`Last Radius after removing: ${lastRadius}`);
        }

        // If the radius is still too small after removing points, stop drawing
        if (lastRadius < MIN_TURNING_RADIUS) {
          console.error("Unable to resolve sharp turn. Stopping drawing.");
          return;
        }

        // Continue drawing by adding the new point again
        tempLine = [...tempLine, newPoint];
      }
    }

    // Validate the updated path
    if (tempLine.some((point) => !isValidPoint(point))) {
      console.error("Invalid points in path:", tempLine);
      return;
    }

    setCurrentLine(tempLine);
    setCurrentLength(computeLineLength(tempLine));
  };

  // const isValidPath = (point) => {
  //   // Example: Ensure the point is within map bounds
  //   return (
  //     point.lat >= -90 &&
  //     point.lat <= 90 &&
  //     point.lng >= -180 &&
  //     point.lng <= 180
  //   );
  // };

  // const adjustPoint = (points) => {
  //   if (points.length < 3) return points[points.length - 1];

  //   // Convert lat/lng objects to arrays
  //   const toArray = (point) => [point.lat, point.lng];
  //   const toLatLng = (arr) => ({ lat: arr[0], lng: arr[1] });

  //   const p0 = toArray(points[points.length - 3]);
  //   const p1 = toArray(points[points.length - 2]);
  //   const p2 = toArray(points[points.length - 1]);
  //   // console.log(points);
  //   // console.log(points[points.length - 3]);
  //   // console.log(points[points.length - 2]);
  //   // console.log(points[points.length - 1]);

  //   const v1 = math.subtract(p1, p0);
  //   const v2 = math.subtract(p2, p1);

  //   const mid1 = math.divide(math.add(p0, p1), 2);
  //   const mid2 = math.divide(math.add(p1, p2), 2);

  //   const perp1 = [-v1[1], v1[0]];
  //   const perp2 = [-v2[1], v2[0]];

  //   const dotProduct = math.dot(v1, v2) / (math.norm(v1) * math.norm(v2));
  //   const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

  //   if (Math.abs(angle - Math.PI) < 0.1) return p2;
  //   // console.log(v1, v2);
  //   const crossProduct = v1[0] * v2[1] - v1[1] * v2[0];

  //   let centerDir;
  //   if (Math.abs(crossProduct) < 1e-10) {
  //     centerDir = [v1[1], -v1[0]];
  //   } else {
  //     const v1Norm = math.divide(v1, math.norm(v1));
  //     const v2Norm = math.divide(v2, math.norm(v2));
  //     let bisector = math.add(v1Norm, v2Norm);

  //     if (math.norm(bisector) > 1e-10) {
  //       bisector = math.divide(bisector, math.norm(bisector));
  //     }

  //     centerDir = [-bisector[1], bisector[0]];
  //     if (math.cross(v1, v2) < 0) centerDir = math.multiply(centerDir, -1);
  //   }

  //   const moveDir = math.multiply(centerDir, 1);

  //   let minDist = 0;
  //   let maxDist = 100000000;
  //   let adjustedPoint = p2;

  //   for (let i = 0; i < 100; i++) {
  //     const midDist = (minDist + maxDist) / 2;
  //     const testPoint = math.add(p2, math.multiply(moveDir, midDist));
  //     console.log(moveDir, midDist, p2);

  //     console.log(`Test Point: ${testPoint}`);
  //     let newPath = [...points.slice(0, -1), toLatLng(testPoint)];
  //     let radii = calculateCurvature(newPath);
  //     let lastRadius = radii[radii.length - 1];

  //     console.log(`new Radius: ${lastRadius}`);

  //     if (lastRadius >= MIN_TURNING_RADIUS) {
  //       maxDist = midDist;
  //       adjustedPoint = testPoint;
  //     } else {
  //       minDist = midDist;
  //     }
  //   }

  //   return toLatLng(adjustedPoint);
  // };

  // const handleMouseMove = (e) => {
  //   if (!isDrawing || !isMouseDown) return;

  //   let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };

  //   let tempLine = [...currentLine, newPoint];

  //   if (tempLine.length >= 3) {
  //     let radii = calculateCurvature(tempLine);
  //     let lastRadius = radii[radii.length - 1];

  //     console.log(`Last Radius: ${lastRadius}`);

  //     // If the radius is too small, adjust the points
  //     if (lastRadius < MIN_TURNING_RADIUS) {
  //       console.warn("Adjusting points to smooth the curve...");
  //       // console.log(tempLine);

  //       let newP = adjustPoint(tempLine);
  //       // console.log(newP);
  //       let newTempLine = [...tempLine];
  //       newTempLine[newTempLine.length - 1] = newP;
  //       // console.log(newTempLine);

  //       let w = calculateCurvature(newTempLine);
  //       let newR = w[w.length - 1];

  //       console.log(`newR: ${newR}`);
  //     }
  //   }

  //   setCurrentLine(tempLine);
  //   setCurrentLength(computeLineLength(tempLine));
  // };
  return (
    <>
      <div id="mapcanvas" ref={mapRef}></div>
      <div id="overlay" ref={overlayRef}>
        <span className="message">
          <span className="spinner"></span>
          <span className="text"></span>
        </span>
      </div>
      {/* ✅ File Input for Uploading CSV */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv"
      />
      {/* <Map
        ref={mapRef}
        mapCenter={{ lat: 39.5, lng: -98.35 }}
        onLoad={onLoad}
        mapTypeIds={["precision"]}
        zoom={5}
        {...p}
      >
        <div>HELLO THERE</div>
      </Map> */}
    </>
  );
};

export default MapEditor;
