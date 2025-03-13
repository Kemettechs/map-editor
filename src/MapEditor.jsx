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
