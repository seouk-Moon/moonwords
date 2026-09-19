import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const projectFile = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "pages-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: projectFile("./index.html"),
        pdfExtractor: projectFile("./pdf-extractor.html"),
      },
    },
  },
});
