import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { NexusBootSequence } from "./components/NexusBootSequence";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NexusBootSequence>
      <App />
    </NexusBootSequence>
  </StrictMode>,
);
