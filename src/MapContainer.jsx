import { useState, useRef, useEffect } from "react";
import {
  GoogleMap,
  useLoadScript,
  Polyline,
  GroundOverlay,
  OverlayView,
} from "@react-google-maps/api";
import { ToastContainer } from "react-toastify";
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
const distanceBetweenTwoPoint = 0.1;
const segments = 5;
const smoothness = 0.5;

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
  const [generatedLine, setGeneratedLine] = useState([]); // Auto-generated path
  const [generatedLine2, setGeneratedLine2] = useState([]); // Auto-generated path

  function generateGeoPath(
    startPoint,
    angle,
    turnDirection = "right", // "left" or "right"
    straightLength = 0.000001,
    curveRadius = 3.2,
    numCurvePoints = 100 // Full curve points
  ) {
    const EARTH_RADIUS = 6371; // Earth's radius in km
    const angleRad = angle * (Math.PI / 180);

    // Convert distances to km
    const straightLengthKm = straightLength / 1000;
    const curveRadiusKm = curveRadius / 1000;

    // Store points
    const points = [startPoint];

    // Compute straight line endpoint
    const straightEndLat =
      startPoint.lat +
      (straightLengthKm / EARTH_RADIUS) * Math.cos(angleRad) * (180 / Math.PI);
    const straightEndLng =
      startPoint.lng +
      (straightLengthKm / EARTH_RADIUS) * Math.sin(angleRad) * (180 / Math.PI);

    points.push({ lat: straightEndLat, lng: straightEndLng });

    // 🔹 Correct curve direction based on movement
    let curveStartAngleRad = angleRad;
    if (turnDirection === "left") {
      curveStartAngleRad -= Math.PI / 2; // Adjust for left turns
    } else {
      curveStartAngleRad += Math.PI / 2; // Adjust for right turns
    }

    // 🔹 Generate **half** curve points
    for (let i = 1; i <= numCurvePoints; i++) {
      // ✅ Only half of the curve
      const t = i / numCurvePoints;
      const curveAngleRad =
        curveStartAngleRad +
        (turnDirection === "left" ? -1 : 1) * (Math.PI / 2) * t; // ✅ Half of π/2

      const curvePointLat =
        straightEndLat +
        (curveRadiusKm / EARTH_RADIUS) *
          Math.cos(curveAngleRad) *
          (180 / Math.PI);
      const curvePointLng =
        straightEndLng +
        (curveRadiusKm / EARTH_RADIUS) *
          Math.sin(curveAngleRad) *
          (180 / Math.PI);

      points.push({ lat: curvePointLat, lng: curvePointLng });
    }

    return points;
  }

  // Update bounds based on zoom level
  const updateBounds = () => {
    if (!mapRef.current) return;
    const zoom = mapRef.current.getZoom();
    if (!zoom) return;

    const scaleFactor = Math.pow(2, zoom - 15);
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
    if (mapRef.current) {
      updateBounds();
      mapRef.current.addListener("zoom_changed", updateBounds);
    }
  }, [isLoaded]);

  // Drawing handlers
  const handleMouseDown = (e) => {
    if (!isDrawing) return;
    setIsMouseDown(true);
    const startPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setCurrentLine([startPoint]);
    setIconPosition(startPoint);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !isMouseDown) return;

    let newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    let lastPoint = currentLine[currentLine.length - 1];
    let distanceBetweenPoints =
      computeLineLength([lastPoint, newPoint]) / 3.281;

    if (distanceBetweenPoints > distanceBetweenTwoPoint) {
      let tempLine = [...currentLine, newPoint];

      if (tempLine.length >= 3) {
        let radii = calculateCurvature(tempLine);
        let lastRadius = radii[radii.length - 1];

        if (lastRadius < MIN_TURNING_RADIUS) {
          let lastPoints = tempLine.slice(-30);
          lastPoints = filterPointsByDistance(lastPoints);

          let lastPointsCartesian = lastPoints
            .filter(
              (point) => point && isFinite(point.lat) && isFinite(point.lng)
            )
            .map((point) => latlngToCartesian(point.lat, point.lng));
          let utmZone =
            lastPointsCartesian[lastPointsCartesian.length - 1].utmZone;
          if (lastPointsCartesian.length > 5) {
            lastPointsCartesian = createSmoothBezierCurve(
              lastPointsCartesian,
              segments,
              smoothness
            );
          }

          lastPoints = lastPointsCartesian.map((point) =>
            cartesianToLatlng(point.x, point.y, utmZone)
          );
          tempLine = [...tempLine.slice(0, -30), ...lastPoints];
        }
      }

      if (tempLine.length > 1) {
        let angle = computeAngle(tempLine[tempLine.length - 2], newPoint);

        setIconRotation(angle);

        let generatedSegment = generateGeoPath(
          newPoint,
          180 - angle + 180,
          "right"
        );

        // Update the generated line separately, not modifying tempLine
        setGeneratedLine([...generatedSegment]);

        let generatedSegment2 = generateGeoPath(newPoint, 180 - angle, "left"); // Mirror but keep it aligned
        setGeneratedLine2([...generatedSegment2]);
      }

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
    setGeneratedLine([]);
    setGeneratedLine2([]);
    setIsMouseDown(false);
    setIconPosition(null);
  };

  // Attach event listeners
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

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
  }, [isDrawing, currentLine]);

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
            setTimeout(updateBounds, 500);
          }}
        >
          {/* Render all map elements */}
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
                  width: "2px",
                  height: "2px",
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
                strokeColor: `#4CC9FE`,
                strokeOpacity: 1,
                strokeWeight: 2,
                geodesic: true,
              }}
            />
          ))}

          {lines.map((path, idx) => (
            <Polyline
              key={idx}
              path={path}
              options={{ strokeColor: "#7CFC00", strokeWeight: 2 }}
            />
          ))}

          {currentLine.length > 1 && (
            <Polyline
              path={currentLine}
              options={{ strokeColor: "#FF0000", strokeWeight: 2 }}
            />
          )}
          {/* Render generated path separately */}
          {generatedLine.length > 1 && (
            <Polyline
              path={generatedLine}
              options={{
                strokeColor: "#FFF",
                strokeWeight: 2,
                // strokeDasharray: [5, 5],
              }}
            />
          )}
          {generatedLine2.length > 1 && (
            <Polyline
              path={generatedLine2}
              options={{
                strokeColor: "#fff",
                strokeWeight: 2,
                // strokeDasharray: [5, 5],
              }}
            />
          )}

          {iconPosition && (
            <RobotOverlay
              position={iconPosition}
              rotation={iconRotation}
              map={mapRef.current}
            />
          )}

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

      {/* Length display */}
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

      {/* Controls */}
      <MapControls
        isDrawing={isDrawing}
        toggleDrawing={() => setIsDrawing(!isDrawing)}
        undoLastDrawing={() => {
          if (lines.length === 0) return;
          const newLines = [...lines];
          newLines.pop();
          setLines(newLines);
          setCurrentLength(
            newLines.length > 0
              ? computeLineLength(newLines[newLines.length - 1])
              : 0
          );
        }}
        setPoints={setPoints}
        setPaths={setPaths}
        mapRef={mapRef}
        lines={lines}
        setCurrentLength={setCurrentLength}
        setLines={setLines}
      />

      <ToastContainer />
    </div>
  );
}
