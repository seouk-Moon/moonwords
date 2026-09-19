import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PdfExtractorApp } from "./PdfExtractorApp";
import "./pdf-extractor.css";

createRoot(document.getElementById("pdf-extractor-root")!).render(
  <StrictMode><PdfExtractorApp /></StrictMode>,
);
