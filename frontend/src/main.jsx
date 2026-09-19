import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "./index.css";
import App from "./App.jsx";

// ReactFlowProvider lets components OUTSIDE the canvas (the folder list, the
// side panel links) call useReactFlow() to zoom/centre the view.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </StrictMode>,
);
