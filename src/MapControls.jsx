import { ActionIcon, Button, Paper, Tooltip } from "@mantine/core";
import {
  IconDownload,
  IconPaint,
  IconReload,
  IconUpload,
  IconMaximize,
  IconMinimize,
  IconCircle,
  IconMinus,
  IconCornerDownRight,
} from "@tabler/icons-react";
import Papa from "papaparse";
import { useRef, useEffect, useState } from "react";
import { computeLineLength } from "./pathUtils";

export default function MapControls({
  isDrawing,
  toggleDrawing,
  undoLastDrawing,
  setPoints,
  setPaths,
  mapRef,
  lines,
  setCurrentLength,
  setLines,
  circleRadius,
  setCircleRadius,
  showCircle,
  setShowCircle,
  connectMode,
  setConnectMode,
  selectedPoints,
}) {
  const fileInputRef = useRef(null);
  const fileInputRefEndPoints = useRef(null);
  const fileInputRefPerimeter = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      else if (document.documentElement.mozRequestFullScreen) document.documentElement.mozRequestFullScreen();
      else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
      else if (document.documentElement.msRequestFullscreen) document.documentElement.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (result) => {
        let newLines = [];
        let currentLine = [];
        result.data.forEach((row) => {
          if (row[0] === "NEWGROUP") {
            if (currentLine.length > 0) { newLines.push([...currentLine]); currentLine = []; }
          } else if (row.length >= 2) {
            const lat = parseFloat(row[0]);
            const lng = parseFloat(row[1]);
            if (!isNaN(lat) && !isNaN(lng)) currentLine.push({ lat, lng });
          }
        });
        if (currentLine.length > 0) newLines.push(currentLine);
        setLines(newLines);
        setCurrentLength(newLines.length > 0 ? computeLineLength(newLines[newLines.length - 1]) : 0);
        if (mapRef.current && newLines.length > 0) mapRef.current.panTo(newLines[0][0]);
      },
      header: false,
      skipEmptyLines: true,
    });
    event.target.value = null;
  };

  const downloadCSV = () => {
    if (lines.length === 0) { alert("No drawings to download!"); return; }
    let csvContent = "NEWGROUP\n";
    lines.forEach((line, index) => {
      if (index > 0) csvContent += "NEWGROUP\n";
      line.forEach((point) => { csvContent += `${point.lat},${point.lng}\n`; });
    });
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drawn_lines_checkpoint_${new Date().toLocaleString()}.csv`;
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
          .map((row) => ({ lat: parseFloat(row[0]), lng: parseFloat(row[1]) }))
          .filter((point) => !isNaN(point.lat) && !isNaN(point.lng));
        setPoints(extractedPoints);
        if (mapRef.current && extractedPoints.length > 0) mapRef.current.panTo(extractedPoints[0]);
      },
    });
    event.target.value = null;
  };

  const handleFileUploadPerimeter = (event) => {
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
            if (currentPath.length > 0) { extractedPaths.push([...currentPath]); currentPath = []; }
          } else if (row.length >= 2) {
            const lat = parseFloat(row[0]);
            const lng = parseFloat(row[1]);
            if (!isNaN(lat) && !isNaN(lng)) currentPath.push({ lat, lng });
          }
        });
        if (currentPath.length > 0) extractedPaths.push([...currentPath]);
        setPaths(extractedPaths);
        if (mapRef.current && extractedPaths.length > 0 && extractedPaths[0].length > 0)
          mapRef.current.panTo(extractedPaths[0][0]);
      },
      skipEmptyLines: true,
    });
    event.target.value = null;
  };

  // Toggle connect mode — clicking same button again cancels
  const handleConnectMode = (mode) => {
    setConnectMode(prev => prev === mode ? null : mode);
  };

  const rightButtons = [
    {
      top: 40, label: "Fullscreen", color: "blue",
      variant: "filled",
      icon: isFullscreen ? <IconMinimize size=".9rem" /> : <IconMaximize size=".9rem" />,
      onClick: toggleFullscreen,
    },
    {
      top: 70, label: "Upload Checkpoint", color: "blue",
      variant: "filled",
      icon: <IconUpload size=".9rem" />,
      onClick: () => fileInputRef.current?.click(),
    },
    {
      top: 100,
      label: isDrawing ? "Stop Drawing" : "Start Drawing",
      color: isDrawing ? "red" : "green",
      variant: "filled",
      icon: <IconPaint size=".9rem" />,
      onClick: toggleDrawing,
    },
    {
      top: 130, label: "Undo", color: "blue",
      variant: "filled",
      icon: <IconReload size=".9rem" />,
      onClick: undoLastDrawing,
    },
    {
      top: 160, label: "Download", color: "blue",
      variant: "filled",
      icon: <IconDownload size=".9rem" />,
      onClick: downloadCSV,
    },
    {
      top: 190,
      label: showCircle ? "Hide Circle" : "Show Circle",
      color: "blue",
      variant: showCircle ? "filled" : "outline",
      icon: <IconCircle size=".9rem" />,
      onClick: () => setShowCircle(!showCircle),
    },
    {
      top: 230,
      label: connectMode === "straight" ? "Cancel Straight Connect" : "Straight Connect",
      color: "orange",
      variant: connectMode === "straight" ? "filled" : "outline",
      icon: <IconMinus size=".9rem" />,
      onClick: () => handleConnectMode("straight"),
    },
    {
      top: 260,
      label: connectMode === "uturn" ? "Cancel U-turn Connect" : "U-turn Connect",
      color: "grape",
      variant: connectMode === "uturn" ? "filled" : "outline",
      icon: <IconCornerDownRight size=".9rem" />,
      onClick: () => handleConnectMode("uturn"),
    },
  ];

  return (
    <>
      {rightButtons.map(({ top, label, color, variant, icon, onClick }) => (
        <div key={top} style={{ position: "fixed", top, right: 5, zIndex: 9999, pointerEvents: "auto" }}>
          <Tooltip label={label} position="left">
            <ActionIcon size="md" color={color} variant={variant} onClick={onClick}>
              {icon}
            </ActionIcon>
          </Tooltip>
        </div>
      ))}

      {/* Status indicator when in connect mode */}
      {connectMode && (
        <div style={{
          position: "fixed",
          top: 10,
          right: 50,
          zIndex: 9999,
          background: connectMode === "straight" ? "rgba(255,140,0,0.9)" : "rgba(132,0,168,0.9)",
          color: "white",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: "bold",
          pointerEvents: "none",
        }}>
          {connectMode === "straight" ? "Straight Connect" : "U-turn Connect"}
          {" — "}
          {selectedPoints.length === 0 && "Click first endpoint"}
          {selectedPoints.length === 1 && "Click second endpoint"}
        </div>
      )}

      <Paper p="sm" shadow="sm" radius="md" style={{
        backgroundColor: "white",
        position: "absolute",
        top: 60,
        left: 5,
        zIndex: 1000,
      }}>
        <input ref={fileInputRefPerimeter} style={{ display: "none" }} type="file" accept=".csv" onChange={handleFileUploadPerimeter} />
        <Button mb="xs" radius="md" onClick={() => fileInputRefPerimeter.current?.click()} size="xs">
          Perimeter File
        </Button>
        <br />
        <input ref={fileInputRefEndPoints} style={{ display: "none" }} type="file" accept=".csv" onChange={handleFileUploadEndPoints} />
        <Button radius="md" onClick={() => fileInputRefEndPoints.current?.click()} size="xs">
          Endpoints File
        </Button>

        <div style={{ marginTop: "8px" }}>
          <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>Turn Radius (m)</div>
          <input
            type="number" min={1} max={500} step={0.5}
            value={circleRadius}
            onChange={(e) => setCircleRadius(parseFloat(e.target.value) || 1)}
            style={{ width: "100%", padding: "2px 4px", borderRadius: "4px", border: "1px solid #ccc", fontSize: "12px" }}
          />
        </div>
      </Paper>

      <input type="file" accept=".csv" onChange={handleFileUpload} ref={fileInputRef} style={{ display: "none" }} />
    </>
  );
}