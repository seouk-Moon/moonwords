import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { clearAuthParamsFromUrl } from "./lib/auth-url";
import "../app/globals.css";
import "./styles/modern-study.css";

clearAuthParamsFromUrl();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
