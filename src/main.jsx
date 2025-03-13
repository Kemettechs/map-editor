import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
// import "./index.cs
import MyMap from "./MyMap";
import { MantineProvider } from "@mantine/core";
// const p = {
//   editor: {
//     /** Colors to be used in the UI. */
//     colors: {
//       blue: "#00BFFF",
//       orange: "#FFB400",
//       red: "#FF2800",
//     },
//     properties: ["prop1", "prop2", "prop3"],
//     /** GPX -> JSON converter. */
//     decoder: new MapWorker(),
//     /** JSON -> GPX converter. */
//     encoder: new Encoder(),
//     /** Editor map DOM element. */
//     // mapEl: document.getElementById('map'),
//     /** UI-locking overlay element. */
//     // overlayEl: document.getElementById('overlay'),
//     /** Virtual DOM element that enables file picking. */
//     fileInputEl: null,
//     /** Google Maps instance. */
//     map: null,
//     /** Dynamic collection of draggable markers on the map. */
//     markers: [],
//     /** Route represented as an array of GeoJSON points. */
//     points: [],
//     /** Median distance between points, used in the "danger area" detour calculations. */
//     medianPointDistance: null,
//     /** Route WebGL renderer. */
//     deckOverlay: null,
//     /** Area where route points are visible. */
//     revealedBounds: null,
//     /** Selection area. */
//     polygon: null,
//     /** Selection area mode. */
//     polygonMode: null,
//     /** Selection area origin point. */
//     polygonStart: null,
//     /** setState in enclosing react app. */
//     setState: null,
//     /**
//      * Update area selection mode.
//      * @param {string|null} mode
//      */
//     setPolygonMode(mode) {
//       if (mode === this.polygonMode) {
//         // toggle
//         mode = null;
//       }

//       this.markers.forEach((marker) =>
//         marker.setCursor(mode === null ? "pointer" : "default")
//       );

//       // prevent selection area glitch
//       this.map.setOptions({ draggable: mode === null });

//       console.debug("setting mode to:", mode);
//       this.polygonMode = mode;

//       // highlight selected mode control (change icon for control mode)
//       ["reveal", "select", "avoid"].forEach((someMode) => {
//         const img =
//           this.mapControls[`polygon-mode-${someMode}`].querySelector("img");

//         img.src =
//           someMode === mode
//             ? img.src.replace(".svg", "-active.svg")
//             : img.src.replace("-active.svg", ".svg");
//       });

//       let options;

//       if (mode === null) {
//         this.polygonStart = undefined;

//         options = {
//           map: null,
//           paths: [],
//         };
//       } else {
//         let color;

//         switch (mode) {
//           case "reveal":
//             color = this.colors.blue;
//             break;
//           case "select":
//             color = this.colors.orange;
//             break;
//           case "avoid":
//             color = this.colors.red;
//             break;
//         }

//         options = {
//           map: this.map,
//           strokeColor: color,
//           fillColor: color,
//         };
//       }

//       this.polygon.setOptions(options);
//       console.debug("setting polygon options with options:", options);
//     },
//     /**
//      * Calculate bounds of the selection area.
//      * @returns {google.maps.LatLngBounds}
//      */
//     getPolygonBounds() {
//       const bounds = new google.maps.LatLngBounds();

//       console.debug("bounds:", bounds);

//       this.polygon.getPath().forEach((latLng) => bounds.extend(latLng));
//       console.debug("extended bounds:", bounds);

//       return bounds;
//     },
//     /** Custom map controls. */
//     mapControls: {},
//     /**
//      * Add a new custom map control.
//      * @param {Object} options
//      * @param {string} options.id - custom id.
//      * @param {string} [options.title] - tooltip to show on hover.
//      * @param {string} [options.type] - 'input' for text input, 'button' for a button.
//      * @param {Function} [options.onClick] - click handler.
//      * @param {Function} [options.onChange] - input value change handler.
//      * @param {Function} [options.position] - control position.
//      * @param {string} [options.hotkeys] - hotkeys to bind.
//      */
//     addMapControl(options) {
//       const container = document.createElement("div");

//       if (!options.type) {
//         options.type = "button";
//       }

//       container.id = `map-control-${options.id}`;
//       container.className = `map-control map-control-${options.type}`;

//       if (options.type === "input") {
//         const input = document.createElement("input");

//         container.appendChild(input);
//         input.addEventListener("blur", () =>
//           options.onChange(input.value, input.dataset)
//         );
//       } else {
//         const icon = document.createElement("img");

//         icon.src = `/images/${options.id}.svg`;

//         container.title = options.title;
//         container.appendChild(icon);
//         container.addEventListener("click", options.onClick);
//       }

//       this.mapControls[options.id] = container;
//       this.map.controls[
//         options.position || google.maps.ControlPosition.TOP_CENTER
//       ].push(container);

//       if (options.hotkeys) {
//         hotkeys(options.hotkeys, options.onClick);
//         container.title += ` (${options.hotkeys})`;
//       }
//     },
//     /**
//      * (Re)draw route on the map.
//      */
//     drawRoute() {
//       const groups = [];
//       let currentGroup = { color: [], points: [] };
//       for (let i = 0; i < this.points.length; i++) {
//         const point = this.points[i];
//         if (point.properties.group === "NEWGROUP") {
//           groups.push(currentGroup);
//           currentGroup = { color: [], points: [] };
//         } else {
//           currentGroup.points.push(point);
//         }
//       }
//       groups.push(currentGroup);

//       const defaultColor = [0, 191, 255];
//       const red = [255, 0, 0];
//       const layers = groups.map((group) => {
//         if (group.points.every((point) => point.properties.prop3 === "r")) {
//           group.color = red;
//           group.size = 4;
//         } else {
//           group.color = defaultColor;
//         }
//         return new GeoJsonLayer({
//           data: lineString(
//             group.points.map((point) => point.geometry.coordinates)
//           ),
//           getLineColor: group.color,
//           getLineWidth: group.size || 2,
//           lineWidthUnits: "pixels",
//         });
//       });

//       this.deckOverlay.setProps({
//         layers: layers,
//       });
//     },
//     /**
//      * Lock UI.
//      * @param {string} message - message to display.
//      */
//     lock(message) {
//       this.overlayEl.querySelector(".text").textContent = message;
//       this.overlayEl.style.display = "flex";
//     },
//     /**
//      * Unlock UI.
//      */
//     unlock() {
//       this.overlayEl.style.display = "none";
//     },
//     /**
//      * Create a marker for the specified point.
//      * @param {Object} point
//      * @param {boolean} [isActive]
//      * @returns {google.maps.Marker}
//      */
//     createMarker(point, isActive) {
//       const latLng = this.positionToLatLng(point.geometry.coordinates);

//       const marker = new google.maps.Marker({
//         draggable: true,
//         position: latLng,
//         map: this.map,
//         clickable: false,
//       });

//       marker.point = point;
//       marker.isActive = isActive;
//       this.updateMarkerIcon(marker);

//       // toggle state on left click
//       marker.addListener("click", () => {
//         if (this.polygonMode !== null) {
//           return;
//         }

//         this.markers.forEach((someMarker) => {
//           if (marker === someMarker) {
//             someMarker.isActive = !someMarker.isActive;
//           } else {
//             someMarker.isActive = false;
//           }

//           this.updateMarkerIcon(someMarker);
//         });

//         this.updateDescriptionControl();
//       });

//       // delete on right click
//       marker.addListener("rightclick", () => {
//         marker.setMap(null);
//         this.points = this.points.filter((point) => point !== marker.point);
//         this.markers = this.markers.filter(
//           (someMarker) => someMarker !== marker
//         );
//         this.updateDescriptionControl();
//         this.drawRoute();
//         this.history.save();
//       });

//       // redraw route after dragging point to a new location
//       marker.addListener("dragend", () => {
//         const latLng = marker.getPosition();

//         // make sure the point is revealed in the future
//         this.revealedBounds.extend(latLng);
//         marker.point.geometry.coordinates = this.latLngToPosition(latLng);
//         this.drawRoute();
//         this.history.save();
//       });

//       return marker;
//     },
//     /**
//      * Update marker icon depending on the current map zoom level and marker state.
//      * @param {google.maps.Marker} marker
//      */
//     updateMarkerIcon(marker) {
//       // start increasing size at zoom level 20 by 1px per level
//       const offset = this.map.getZoom() - 20;
//       const dimension = 7 + (offset > 0 ? offset : 0);
//       const size = new google.maps.Size(dimension, dimension);
//       const anchor = new google.maps.Point(dimension / 2, dimension / 2);

//       let markerOptions = {
//         icon: {
//           url: marker.isActive ? "/images/dot-active.png" : "/images/dot.png",
//           scaledSize: size,
//           anchor: anchor,
//         },
//       };

//       marker.setOptions(markerOptions);
//     },
//     /**
//      * Toggle visibility and change text of the point description control.
//      */
//     updateDescriptionControl() {
//       const activeMarkers = this.markers.filter((marker) => marker.isActive);

//       if (activeMarkers.length === 1) {
//         this.properties.forEach((p) => {
//           let propEl = this.mapControls[p].querySelector("input");
//           propEl.dataset.propertyName = p;

//           let propVal = activeMarkers[0].point.properties[p];
//           this.mapControls[p].style.top = "auto";

//           propEl.value = propVal;
//           propEl.focus();
//         });
//       } else if (activeMarkers.length > 1) {
//         this.properties.forEach((p) => {
//           let propEl = this.mapControls[p].querySelector("input");
//           propEl.dataset.propertyName = p;

//           let propValues = [
//             ...new Set(activeMarkers.map((m) => m.point.properties[p])),
//           ];
//           if (propValues.length === 1 && propValues[0]) {
//             propEl.value = propValues[0];
//           } else {
//             propEl.value = null;
//           }

//           this.mapControls[p].style.top = "auto";

//           propEl.focus();
//         });
//       } else {
//         this.properties.forEach((p) => {
//           this.mapControls[p].style.top = "-1000px";
//         });
//       }
//     },
//     /**
//      * Create a new point at the specified position.
//      * @param {[number, number]} position
//      * @returns {*}
//      */
//     createPoint(position) {
//       const xml = {
//         tagName: "rtept",
//         attributes: { lon: position[0], lat: position[1] },
//         children: [],
//       };

//       return point(position, { xml });
//     },
//     /**
//      * Display route points in the reveal area.
//      */
//     showPoints() {
//       if (!this.points.length || !this.revealedBounds) {
//         console.debug(
//           "returning early from showPoints(), points or revealedBounds is falsey"
//         );
//         return;
//       }

//       // drop previously shown markers
//       this.markers.forEach((marker) => marker.setMap(null));

//       console.debug("creating new markers");
//       // create new markers
//       this.markers = this.points
//         .filter((point) =>
//           this.revealedBounds.contains(
//             this.positionToLatLng(point.geometry.coordinates)
//           )
//         )
//         .map((point) => this.createMarker(point));

//       this.updateDescriptionControl();
//     },
//     /**
//      * Select markers in the selection area.
//      */
//     selectPoints() {
//       if (!this.points.length) {
//         console.debug("no points selected...");
//         return;
//       }

//       const bounds = this.getPolygonBounds();

//       console.log("selected markers", this.markers);

//       this.markers.forEach((marker) => {
//         marker.isActive = bounds.contains(marker.getPosition());
//         this.updateMarkerIcon(marker);
//       });

//       this.updateDescriptionControl();
//     },
//     /**
//      * Drop points in the selection area and adjust route to go around it.
//      */
//     avoidPoints() {
//       if (!this.points.length) {
//         return;
//       }

//       const bounds = this.getPolygonBounds();

//       const turfPolygon = polygon([
//         this.polygon.getPath().getArray().map(this.latLngToPosition),
//       ]);

//       const vertices = turfPolygon.geometry.coordinates[0].slice(1);

//       // remove points within the selection area
//       this.points = this.points.filter((point) => {
//         return !bounds.contains(
//           this.positionToLatLng(point.geometry.coordinates)
//         );
//       });

//       // adjust route to go around the selection area
//       const proceed = (startingPointIdx) => {
//         for (
//           let currentPointIdx = startingPointIdx;
//           currentPointIdx < this.points.length - 1;
//           currentPointIdx++
//         ) {
//           const currentPoint = this.points[currentPointIdx];

//           // do nothing with points at the selection area vertices
//           if (vertices.includes(currentPoint.geometry.coordinates)) {
//             continue;
//           }

//           const nextPoint = this.points[currentPointIdx + 1];
//           const directNextPath = lineString([
//             currentPoint.geometry.coordinates,
//             nextPoint.geometry.coordinates,
//           ]);

//           // do nothing if the route to the next point does not cross the selection area or crosses it at a vertex
//           if (lineIntersect(turfPolygon, directNextPath).features.length < 2) {
//             continue;
//           }

//           let nextPointOutsideThePolygon;

//           for (let i = currentPointIdx + 1; i < this.points.length; i++) {
//             const point = this.points[i];
//             const latLng = this.positionToLatLng(point.geometry.coordinates);

//             if (!bounds.contains(latLng)) {
//               nextPointOutsideThePolygon = point;

//               break;
//             }
//           }

//           // do nothing if the selection area covers all points until the end of the route
//           if (!nextPointOutsideThePolygon) {
//             continue;
//           }

//           const directNextOutsidePath = lineString([
//             currentPoint.geometry.coordinates,
//             nextPointOutsideThePolygon.geometry.coordinates,
//           ]);

//           // do nothing if the route to the next point does not cross the selection area or crosses it at the vertex
//           if (
//             lineIntersect(turfPolygon, directNextOutsidePath).features.length <
//             2
//           ) {
//             continue;
//           }

//           // direct paths from the start point to vertices that do not cross the selection area
//           const safeDirectPathsToVertices = [];

//           vertices.forEach((position, idx) => {
//             const ls = lineString([
//               currentPoint.geometry.coordinates,
//               position,
//             ]);

//             if (lineIntersect(turfPolygon, ls).features.length === 1) {
//               const path = [currentPoint.geometry.coordinates, position];

//               path.vertexIdx = idx;
//               safeDirectPathsToVertices.push(path);
//             }
//           });

//           // paths that lead from the start point to the end point without crossing the selection area
//           // or visiting vertices that have been selected on the previous stage
//           const finalPaths = [];

//           safeDirectPathsToVertices.forEach((path) => {
//             const ls = lineString([
//               path[0],
//               path[1],
//               nextPointOutsideThePolygon.geometry.coordinates,
//             ]);

//             if (lineIntersect(turfPolygon, ls).features.length === 1) {
//               // this path can reach the end point without going to the next vertex
//               path.push(nextPointOutsideThePolygon.geometry.coordinates);
//               finalPaths.push(path);
//             } else {
//               // this path must go to some other vertex to reach the end point
//               const siblingVertexIdxs = [
//                 path.vertexIdx === 0 ? vertices.length - 1 : path.vertexIdx - 1,
//                 path.vertexIdx + 1 === vertices.length ? 0 : path.vertexIdx + 1,
//               ];

//               const directVertexIdxs = safeDirectPathsToVertices.map(
//                 (path) => path.vertexIdx
//               );

//               // pick the vertex that can't be visited from the start point directly
//               const nextVertexIdx = siblingVertexIdxs.find(
//                 (vertexIdx) => !directVertexIdxs.includes(vertexIdx)
//               );

//               // discard path if there's no such vertex
//               if (nextVertexIdx !== -1) {
//                 path.push(
//                   vertices[nextVertexIdx],
//                   nextPointOutsideThePolygon.geometry.coordinates
//                 );
//                 finalPaths.push(path);
//               }
//             }
//           });

//           // sort by distance
//           finalPaths.sort(
//             (a, b) => length(lineString(a)) - length(lineString(b))
//           );

//           const shortestPath = finalPaths[0];

//           /* try to remove up to 20 points before/after the detour to reduce the angle */
//           const targetBearing = bearing(
//             currentPoint,
//             nextPointOutsideThePolygon
//           );

//           // split the shortest path by segments
//           const segments = [];

//           for (let i = 0; i < shortestPath.length - 1; i++) {
//             segments.push([shortestPath[i], shortestPath[i + 1]]);
//           }

//           const firstSegment = segments[0];
//           const lastSegment = segments[segments.length - 1];

//           let firstSegmentOffset = 0;
//           let lastSegmentOffset = 0;

//           let basePointIdx = currentPointIdx;
//           let prevBearingDiff = null;

//           for (let i = 0; i <= 20; i++) {
//             const point = this.points[currentPointIdx - i];

//             if (!point) {
//               break;
//             }

//             const bearingDegrees = bearing(point, firstSegment[1]);
//             const bearingDiff = Math.abs(
//               Math.abs(bearingDegrees) - Math.abs(targetBearing)
//             );

//             // abort if the angle was smaller using the previous point
//             if (prevBearingDiff !== null && prevBearingDiff < bearingDiff) {
//               break;
//             }

//             prevBearingDiff = bearingDiff;

//             if (bearingDiff < 90) {
//               firstSegmentOffset = i;
//             }

//             // 30 degrees is good enough
//             if (bearingDiff < 30) {
//               break;
//             }
//           }

//           if (firstSegmentOffset) {
//             firstSegment[0] =
//               this.points[
//                 currentPointIdx - firstSegmentOffset
//               ].geometry.coordinates;
//             basePointIdx = currentPointIdx - firstSegmentOffset;
//             this.points.splice(basePointIdx + 1, firstSegmentOffset);
//           }

//           const nextPointOutsideThePolygonIdx = this.points.indexOf(
//             nextPointOutsideThePolygon
//           );
//           let nextPointToProcess = nextPointOutsideThePolygon;

//           prevBearingDiff = null;

//           for (let i = 0; i <= 20; i++) {
//             const point = this.points[nextPointOutsideThePolygonIdx + i];

//             if (!point) {
//               break;
//             }

//             const bearingDegrees = bearing(lastSegment[0], point);
//             const bearingDiff = Math.abs(
//               Math.abs(bearingDegrees) - Math.abs(targetBearing)
//             );

//             // abort if the angle was smaller using the previous point
//             if (prevBearingDiff !== null && prevBearingDiff < bearingDiff) {
//               break;
//             }

//             prevBearingDiff = bearingDiff;

//             if (bearingDiff < 90) {
//               lastSegmentOffset = i;
//             }

//             // 30 degrees is good enough
//             if (bearingDiff < 30) {
//               break;
//             }
//           }

//           if (lastSegmentOffset) {
//             lastSegment[1] =
//               this.points[
//                 nextPointOutsideThePolygonIdx + lastSegmentOffset
//               ].geometry.coordinates;
//             this.points.splice(basePointIdx + 1, lastSegmentOffset);
//             nextPointToProcess =
//               this.points[nextPointOutsideThePolygonIdx + lastSegmentOffset];
//           }

//           // add detour points to the route
//           segments.forEach((segment, segmentIdx) => {
//             const segmentLineString = lineString(segment);
//             const segmentDistance = distance(
//               point(segment[0]),
//               point(segment[1])
//             );
//             const subSegmentCount = Math.round(
//               segmentDistance / this.medianPointDistance
//             );
//             // set equal distance between points
//             const pointsDistance = segmentDistance / subSegmentCount;

//             for (let i = 0; i < subSegmentCount - 1; i++) {
//               const pointAlong = along(
//                 segmentLineString,
//                 pointsDistance * (i + 1)
//               );
//               const point = this.createPoint(pointAlong.geometry.coordinates);

//               this.points.splice(basePointIdx + 1, 0, point);
//               basePointIdx++;
//             }

//             // add vertex points
//             if (
//               segmentIdx === 0 ||
//               (segmentIdx === 1 && segments.length === 3)
//             ) {
//               this.points.splice(
//                 basePointIdx + 1,
//                 0,
//                 this.createPoint(segment[1])
//               );
//               basePointIdx++;
//             }
//           });

//           proceed(this.points.indexOf(nextPointToProcess));

//           break;
//         }
//       };

//       proceed(0);
//       this.showPoints();
//       this.drawRoute();
//       this.history.save();
//     },
//     /**
//      * Update selection area.
//      * @param {google.maps.MouseEvent} e
//      */
//     resizePolygon(e) {
//       if (!this.polygonMode || !this.polygonStart) {
//         return;
//       }

//       const polygonEnvelope = envelope(
//         featureCollection([
//           point(this.latLngToPosition(this.polygonStart)),
//           point(this.latLngToPosition(e.latLng)),
//         ])
//       );

//       this.polygon.setPath(
//         polygonEnvelope.geometry.coordinates[0].map(this.positionToLatLng)
//       );
//     },
//     /**
//      * Convert google.maps.LatLng instance into [lng, lat] for usage in GeoJSON functions.
//      * @param {google.maps.LatLng} latLng
//      * @returns {[number, number]}
//      */
//     latLngToPosition(latLng) {
//       return [latLng.lng(), latLng.lat()];
//     },
//     /**
//      * Convert [lng, lat] into google.maps.LatLng instance for usage in Google Maps functions.
//      * @param {[number, number]} position
//      * @returns {google.maps.LatLng}
//      */
//     positionToLatLng: (position) =>
//       new google.maps.LatLng(position[1], position[0]),
//     /**
//      * Generate editor state representation.
//      * @returns {{points: string}}
//      */
//     getState() {
//       return { points: JSON.stringify(this.points) };
//     },
//     /**
//      * Restore editor to the specified state.
//      * @param {Object} state
//      */
//     restoreState(state) {
//       if (!state) {
//         return;
//       }

//       this.points = JSON.parse(state.points);
//       this.drawRoute();
//       this.showPoints();
//     },

//     loadFile() {
//       const reader = new FileReader();
//       reader.addEventListener("load", (e) =>
//         this.decoder.postMessage({ decode: e.target.result })
//       );

//       this.lock(`Loading Map "${this.props?.name}" for Editing...`);

//       fetch(this.props?.file)
//         .then((res) => {
//           return res.blob();
//         })
//         .then((blob) => {
//           reader.readAsText(blob);
//         });
//     },

//     addMapListener(e) {
//       console.debug("map clicked");
//       if (this.polygonMode) {
//         console.debug("polygon mode is set");
//         if (this.polygonStart) {
//           console.debug("finishing selection");
//           /* finish selecting an area */
//           if (this.polygonMode === "reveal") {
//             console.debug("mode is", this.polygonMode);
//             this.revealedBounds = this.getPolygonBounds();
//             this.showPoints();
//           }

//           if (this.polygonMode === "select") {
//             console.debug("mode is", this.polygonMode);
//             this.revealedBounds = this.getPolygonBounds();
//             this.showPoints();
//             this.selectPoints();
//           }

//           if (this.polygonMode === "avoid") {
//             console.debug("mode is", this.polygonMode);
//             this.avoidPoints();
//           }

//           this.setPolygonMode(null);
//         } else {
//           /* start selecting an area */
//           this.polygonStart = e.latLng;
//         }
//       } else {
//         /* add a new point after the last active marker (if there's one) */
//         let lastActiveMarkerIdx = -1;

//         this.markers.forEach((marker, idx) => {
//           if (marker.isActive) {
//             lastActiveMarkerIdx = idx;
//           }
//         });

//         if (lastActiveMarkerIdx === -1) {
//           return;
//         }

//         const lastActiveMarker = this.markers[lastActiveMarkerIdx];
//         const point = this.createPoint(this.latLngToPosition(e.latLng));
//         const targetPointIdx = this.points.indexOf(lastActiveMarker.point) + 1;
//         const marker = this.createMarker(point, true);
//         const targetMarkerIdx = lastActiveMarkerIdx + 1;

//         this.markers.forEach((marker) => {
//           marker.isActive = false;
//           this.updateMarkerIcon(marker);
//         });

//         this.points.splice(targetPointIdx, 0, point);
//         this.markers.splice(targetMarkerIdx, 0, marker);
//         this.updateDescriptionControl();
//         // make sure the new point is revealed in the future
//         this.revealedBounds.extend(e.latLng);
//         this.drawRoute();
//         this.history.save();
//       }
//     },

//     sendToDashboard(csv) {
//       let url = `${location.protocol}//${location.host}/maps/${this.props.id}/create_from_map_editor`;
//       let formData = new FormData();
//       formData.append("csv", csv);
//       fetch(url, {
//         method: "POST",
//         body: JSON.stringify({ csv }),
//       }).then(async (res) => {
//         let body = await res.json();
//         if (body.status == "ok") {
//           this.unlock();
//         }
//       });
//     },
//     /**
//      * Initialize the this.
//      */
//     init(map) {
//       this.history = new SimpleUndo({
//         maxLength: 10,
//         provider: (done) => done(this.getState()),
//       });

//       this.mapEl ||= map;
//       this.loadFile();

//       // process decoded GPX
//       if (!this.decoder) {
//         console.error("❌ Worker not initialized before use.");
//         this.decoder = new MapWorker();
//       }
//       this.decoder.addEventListener("message", (e) => {
//         this.unlock();

//         if (e.data.error) {
//           alert(e.data.error);
//           return;
//         }

//         // drop old markers and points
//         this.markers.forEach((marker) => marker.setMap(null));
//         this.markers = [];
//         this.points = e.data.decoded.points;
//         // this.points = [
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.522259, 35.4691] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "A",
//         //       prop2: "B",
//         //       prop3: "C",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.502754, 35.463455] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "D",
//         //       prop2: "E",
//         //       prop3: "F",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.508269, 35.463245] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "G",
//         //       prop2: "H",
//         //       prop3: "I",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.515, 35.47] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "J",
//         //       prop2: "K",
//         //       prop3: "L",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.52, 35.468] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "M",
//         //       prop2: "N",
//         //       prop3: "O",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.51, 35.465] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "P",
//         //       prop2: "Q",
//         //       prop3: "R",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.505, 35.464] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "S",
//         //       prop2: "T",
//         //       prop3: "U",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.5, 35.462] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "V",
//         //       prop2: "W",
//         //       prop3: "X",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.495, 35.461] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "Y",
//         //       prop2: "Z",
//         //       prop3: "AA",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.525, 35.4705] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "BB",
//         //       prop2: "CC",
//         //       prop3: "DD",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.53, 35.471] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "EE",
//         //       prop2: "FF",
//         //       prop3: "GG",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.535, 35.472] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "HH",
//         //       prop2: "II",
//         //       prop3: "JJ",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.54, 35.473] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "KK",
//         //       prop2: "LL",
//         //       prop3: "MM",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.545, 35.474] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "NN",
//         //       prop2: "OO",
//         //       prop3: "PP",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.55, 35.475] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "QQ",
//         //       prop2: "RR",
//         //       prop3: "SS",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.555, 35.476] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "TT",
//         //       prop2: "UU",
//         //       prop3: "VV",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.56, 35.477] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "WW",
//         //       prop2: "XX",
//         //       prop3: "YY",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.565, 35.478] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "ZZ",
//         //       prop2: "AAA",
//         //       prop3: "BBB",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.57, 35.479] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "CCC",
//         //       prop2: "DDD",
//         //       prop3: "EEE",
//         //     },
//         //   },
//         //   {
//         //     type: "Feature",
//         //     geometry: { type: "Point", coordinates: [-97.575, 35.48] },
//         //     properties: {
//         //       group: "default-group",
//         //       prop1: "FFF",
//         //       prop2: "GGG",
//         //       prop3: "HHH",
//         //     },
//         //   },
//         // ];
//         // console.log(this.points);
//         this.updateDescriptionControl();

//         const collection = featureCollection(this.points);
//         const collectionCenter = center(collection);
//         const boundingBox = bbox(collection);

//         this.map.setCenter(
//           this.positionToLatLng(collectionCenter.geometry.coordinates)
//         );
//         this.map.fitBounds(
//           new google.maps.LatLngBounds(
//             { lat: boundingBox[1], lng: boundingBox[0] },
//             { lat: boundingBox[3], lng: boundingBox[2] }
//           )
//         );

//         this.drawRoute();
//         // maintain history only for the last loaded file
//         this.history.clear();
//         this.history.initialize(this.getState());

//         /* calculate this.medianPointDistance */
//         const pointDistances = [];

//         for (
//           let i = 0;
//           i < (this.points.length < 20 ? this.points.length : 20) - 1;
//           i++
//         ) {
//           pointDistances.push(distance(this.points[i], this.points[i + 1]));
//         }

//         const mid = Math.floor(pointDistances.length / 2);

//         pointDistances.sort((a, b) => a - b);

//         this.medianPointDistance =
//           pointDistances.length % 2 !== 0
//             ? pointDistances[mid]
//             : (pointDistances[mid - 1] + pointDistances[mid]) / 2;
//       });

//       // process encoded GPX
//       this.encoder.addEventListener("message", (e) => {
//         if (e.data.error) {
//           alert(e.data.error);
//           return;
//         }

//         this.sendToDashboard(e.data.encoded);
//       });

//       /* init map */

//       this.map = new google.maps.Map(this.mapEl, {
//         center: { lat: 39.5, lng: -98.35 },
//         zoom: 5,
//         mapTypeControlOptions: {
//           mapTypeIds: ["roadmap", "satellite", "precision"],
//         },
//         mapTypeId: "satellite",
//         draggableCursor: "default",
//         draggingCursor: "default",
//       });

//       // define the "Precision" map type
//       this.map.mapTypes.set("precision", {
//         name: "Precision",
//         maxZoom: 25,
//         tileSize: new google.maps.Size(256, 256),
//         getTile: () => {
//           const tile = document.createElement("div");

//           tile.style.width = tile.style.height = "256px";

//           return document.createElement("div");
//         },
//       });

//       this.map.addListener("click", (e) => this.addMapListener(e));

//       // resize markers when changing map zoom level to improve UX
//       this.map.addListener("zoom_changed", () =>
//         this.markers.forEach((m) => this.updateMarkerIcon(m))
//       );

//       ["Reveal", "Select", "Avoid"].forEach((mode) => {
//         this.addMapControl({
//           id: `polygon-mode-${mode.toLowerCase()}`,
//           title: mode,
//           onClick: () => {
//             return this.setPolygonMode(mode.toLowerCase());
//           },
//           hotkeys: mode.substr(0, 1),
//         });
//       });

//       this.addMapControl({
//         id: "upload",
//         title: "Save Map",
//         onClick: () => {
//           if (!this.points.length) {
//             return;
//           }

//           this.lock("Saving Map...");
//           this.encoder.postMessage({ encode: this.points });
//         },
//         hotkeys: "ctrl+s, command+s",
//       });

//       this.properties.forEach((property) => {
//         this.addMapControl({
//           id: property,
//           type: "input",
//           onChange: (value, dataset) => {
//             const activeMarkers = this.markers.filter(
//               (marker) => marker.isActive
//             );
//             const propertyName = dataset.propertyName;

//             if (!activeMarkers.length) {
//               return;
//             }

//             activeMarkers.forEach(
//               (marker) => (marker.point.properties[propertyName] = value)
//             );

//             // patch history in place to preserve description changes without adding a new state
//             this.history.stack[this.history.position] = this.getState();
//           },
//           position: google.maps.ControlPosition.BOTTOM_LEFT,
//         });
//       });

//       this.updateDescriptionControl();
//       /* init selection area */
//       this.polygon = new google.maps.Polygon({ clickable: false });

//       this.map.addListener("mousemove", (e) => this.resizePolygon(e));
//       this.polygon.addListener("mousemove", (e) => this.resizePolygon(e));

//       // abort selection on right click
//       this.map.addListener("rightclick", () => this.setPolygonMode(null));

//       /* init WebGL route renderer */
//       this.deckOverlay = new GoogleMapsOverlay();
//       this.deckOverlay.setMap(this.map);

//       /* init keyboard shortcuts */
//       hotkeys("delete", () => {
//         if (!this.points.length) {
//           return;
//         }

//         this.points = this.points.filter((point) => {
//           return !this.markers.some(
//             (marker) => marker.isActive && marker.point === point
//           );
//         });

//         this.showPoints();
//         this.drawRoute();
//         this.history.save();
//       });

//       hotkeys("ctrl+z, command+z", () =>
//         this.history.undo((p) => this.restoreState(p))
//       );
//       hotkeys("ctrl+y, command+shift+z", () =>
//         this.history.redo((p) => this.restoreState(p))
//       );

//       hotkeys("tab, shift+tab", (e, handler) => {
//         const activeMarkers = this.markers.filter((marker) => marker.isActive);

//         if (activeMarkers.length !== 1) {
//           return;
//         }

//         const activeMarker = activeMarkers[0];
//         const activeMarkerIdx = this.markers.indexOf(activeMarker);
//         const nextMarker =
//           this.markers[
//             handler.key === "tab" ? activeMarkerIdx + 1 : activeMarkerIdx - 1
//           ];

//         if (!nextMarker) {
//           return;
//         }

//         // save current value
//         this.properties.forEach((p) => {
//           this.mapControls[p]
//             .querySelector("input")
//             .dispatchEvent(new Event("blur"));
//         });

//         activeMarker.isActive = false;
//         nextMarker.isActive = true;

//         [activeMarker, nextMarker].forEach((marker) =>
//           this.updateMarkerIcon(marker)
//         );

//         this.updateDescriptionControl();
//         e.preventDefault();
//       });

//       hotkeys.filter = () => true;
//     },
//   },
//   map_key: "AIzaSyD717SaSi1ffFDo3Zaoa-f5ntIi3Lg0w6E",
// };

createRoot(document.getElementById("root")).render(
  <MantineProvider>
    <MyMap />
  </MantineProvider>
);
