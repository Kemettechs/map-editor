import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import MapContainer from "./MapContainer";

createRoot(document.getElementById("root")).render(
  <MantineProvider>
    <MapContainer />
  </MantineProvider>
);
