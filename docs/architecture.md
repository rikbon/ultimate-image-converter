[<-- Back to Home](../README.md)

# Ultimate Image Converter - Architecture Overview

## High-Level Overview

The **Ultimate Image Converter** is a **Client-Side Single Page Application (SPA)** built with **Angular (v19)**. It is designed to perform all image processing tasks directly within the user's browser, ensuring privacy and speed by eliminating server-side processing.

The application leverages modern web APIs (Canvas API, FileReader, Web Workers) and specialized libraries (`piexifjs`, `jszip`, `jspdf`, `heic2any`) to handle image manipulation, metadata management, and high-performance batch processing.

## Tech Stack

*   **Frontend Framework**: Angular v19 (Standalone Components, Signals for state management)
*   **Styling**: Tailwind CSS (Utility-first CSS framework)
*   **Language**: TypeScript
*   **Build Tool**: Angular CLI (via build-angular)
*   **PWA**: `@angular/pwa` for service worker and manifest generation
*   **Worker Pool**: Custom implementation using native Web Workers for parallel task execution.
*   **Containerization**: Docker & Docker Compose (Nginx for serving the static app)

## Core Components

The application logic is primarily contained within `AppComponent` (`src/app.component.ts`), which manages the state and logic for both conversion modes. Note: As the app grows, this should be refactored into smaller, dedicated feature modules.

### 1. State Management (Signals)
The app uses Angular Signals for reactive state management. Key signals include:
*   `conversionMode`: Toggles between 'single' and 'batch' modes.
*   `isConverting`: specialized loading state.
*   `originalFile` / `batchFiles`: Stores references to the user's uploaded files.
*   `adjustmentHistory`: Managing the undo/redo stack for image edits.

### 2. Image Processing Pipeline
The core image processing pipeline follows these steps:
1.  **Input**: User selects file(s) -> Validated against limits (Size/Count) and Types.
2.  **Pre-processing (HEIC)**: If the input is HEIC/HEIF, `heic2any` converts it to a purely in-memory Blob before further processing.
3.  **Read**: `FileReader` reads the file as a Data URL.
4.  **Metadata (Optional)**: `piexifjs` extracts EXIF data (if present).
5.  **Canvas Rendering**:
    *   An HTML5 `<canvas>` element is created.
    *   **Filters**: CSS-style filters (contrast, hue, saturation, blur, grayscale, sepia) are applied.
    *   **Transforms**: Rotation and Flipping are applied via Context transformation matrix.
    *   **Resizing**: Canvas is sized to target dimensions.
6.  **Export**:
    *   `canvas.toDataURL()` or `canvas.toBlob()` is called with the target format.
    *   If metadata preservation is enabled (JPEG only), `piexifjs` re-inserts the EXIF data.
7.  **Output**: The resulting Blob/DataURL is made available for download.

### 3. AI Capabilities & Models
The AI Toolkit features (like background removal, Gemini watermark stripping, and Super Resolution Upscaling) are powered by WebAssembly (WASM) and ONNX neural network models. To ensure the app remains 100% functional offline and privacy-respecting, all required models (such as `isnet_fp16`) are pre-downloaded and hosted statically within the `public/assets/imgly/` directory, avoiding any reliance on external CDNs at runtime. AI tasks are offloaded to Web Workers in batch mode to prevent UI jank.

### 4. Batch Processing
Batch mode processes files in parallel using a pool of dedicated Web Workers (`src/conversion.worker.ts`). 
*   **Concurrency**: Uses a worker pool limited by `navigator.hardwareConcurrency` (capped at 6) to perform multi-threaded image processing without blocking the main UI thread.
*   **Zipping & Archives**: `JSZip` accumulates processed Blobs for ZIP and **CBZ** creation. `jsPDF` is used for stitching images into multi-page documents.

## Project Structure

```
c:\rik\prj\ultimate-image-converter\
├── .dockerignore          # Docker build exclusions
├── .gitignore             # Git exclusions
├── angular.json           # Angular CLI configuration
├── docker-compose.yml     # Docker Compose orchestration
├── Dockerfile             # Multi-stage Docker build instruction
├── nginx.conf             # Nginx server config (SPA routing)
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript compiler options
├── README.md              # Main entry documentation
├── docs/                  # Detailed documentation
│   ├── architecture.md    # This file
│   ├── features.md        # Features and capabilities
│   └── install.md         # Installation/Running guide
└── src/                   # Source code
    ├── app.component.html # Main UI template
    ├── app.component.ts   # Main Application Logic
    ├── main.ts            # Application Entry Point
    └── styles.css         # Global styles & Tailwind directives
```

## Docker Architecture

The deployment uses a **multi-stage build** optimization:
1.  **Build Stage**: Uses a `node:20` image to install dependencies (`npm ci`) and compile the Angular app (`npm run build`).
2.  **Production Stage**: Uses a lightweight `nginx:alpine` image.
    *   Uses a custom `nginx.conf` to handle SPA routing (redirecting 404s to `index.html`).

---
*Last Updated: 2026-02-26*
