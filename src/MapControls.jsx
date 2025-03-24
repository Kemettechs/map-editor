import { ActionIcon, Button, Paper, Tooltip } from "@mantine/core";
import {
  IconDownload,
  IconPaint,
  IconReload,
  IconUpload,
} from "@tabler/icons-react";
import Papa from "papaparse";
import { useRef } from "react";
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
}) {
  const fileInputRef = useRef(null);
  const fileInputRefEndPoints = useRef(null);
  const fileInputRefPerimeter = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

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
        setCurrentLength(
          newLines.length > 0
            ? computeLineLength(newLines[newLines.length - 1])
            : 0
        );

        if (mapRef.current && newLines.length > 0) {
          mapRef.current.panTo(newLines[0][0]);
        }
      },
      header: false,
      skipEmptyLines: true,
    });

    event.target.value = null;
  };

  const downloadCSV = () => {
    if (lines.length === 0) {
      alert("No drawings to download!");
      return;
    }

    let csvContent = "NEWGROUP\n";
    lines.forEach((line, index) => {
      if (index > 0) csvContent += "NEWGROUP\n";
      line.forEach((point) => {
        csvContent += `${point.lat},${point.lng}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const timestampString = now.toLocaleString();
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

        setPoints(extractedPoints);
        if (mapRef.current && extractedPoints.length > 0) {
          mapRef.current.panTo(extractedPoints[0]);
        }
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
            if (currentPath.length > 0) {
              extractedPaths.push([...currentPath]);
              currentPath = [];
            }
          } else if (row.length >= 2) {
            const lat = parseFloat(row[0]);
            const lng = parseFloat(row[1]);

            if (!isNaN(lat) && !isNaN(lng)) {
              currentPath.push({ lat, lng });
            }
          }
        });

        if (currentPath.length > 0) {
          extractedPaths.push([...currentPath]);
        }

        setPaths(extractedPaths);

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
    <>
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

      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        ref={fileInputRef}
        style={{ display: "none" }}
      />
    </>
  );
}
