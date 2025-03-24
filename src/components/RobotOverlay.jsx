import { useEffect, useRef } from "react";

export default function RobotOverlay({ position, rotation, map }) {
  const overlayRef = useRef(null);
  console.log(rotation);

  useEffect(() => {
    if (!map || !position) return;

    class CustomOverlay extends google.maps.OverlayView {
      constructor(position, rotation) {
        super();
        this.position = position;
        this.rotation = rotation;
        this.div = null;
      }

      onAdd() {
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.style.transformOrigin = "center";
        this.div.style.pointerEvents = "none"; // Prevent interaction issues
        this.div.innerHTML = `
          <img src="https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
            style="position: absolute; width: 100%; height: 100%; transform-origin: center;"/>
        `;
        this.getPanes().overlayLayer.appendChild(this.div);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;

        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(this.position.lat, this.position.lng)
        );

        const zoom = map.getZoom();

        // Compute meters per pixel dynamically based on zoom level
        const metersPerPixel =
          (156543.03392 * Math.cos((position.lat * Math.PI) / 180)) /
          Math.pow(2, zoom);

        // Convert real-world dimensions (meters) to pixels
        const widthPx = 1.8 / metersPerPixel;
        const heightPx = 4.5 / metersPerPixel;

        // Apply size, positioning, and rotation
        this.div.style.width = `${widthPx}px`;
        this.div.style.height = `${heightPx}px`;
        this.div.style.left = `${point.x - widthPx / 2}px`;
        this.div.style.top = `${point.y - heightPx / 2}px`;
        this.div.style.transform = `rotate(${this.rotation}deg)`;
      }

      onRemove() {
        if (this.div) {
          this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      }
    }

    // Remove old overlay if it exists
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
    }

    const newOverlay = new CustomOverlay(position, rotation);
    newOverlay.setMap(map);
    overlayRef.current = newOverlay;

    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
      }
    };
  }, [position, rotation, map]);

  return null;
}
