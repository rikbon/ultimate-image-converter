# Ultimate Image Converter 🚀

A modern, fast, and **100% privacy-focused** web application for converting and editing images directly in your browser.

🔗 **Live Demo:** [https://uic.rikbon.xyz/](https://uic.rikbon.xyz/)

🚨 **Privacy First Guarantee:** Your images **never** leave your device. All processing, including AI Background Removal and Gemini Watermark Removal, happens completely locally using WebAssembly and Canvas APIs. No servers, no uploads, no tracking.

📚 **Documentation**:
- [Features & Capabilities](docs/features.md)
- [Architecture Overview](docs/architecture.md)
- [Installation & Running Guide](docs/install.md)

## ✨ Features (v0.9.0 Mega Update)

*   **Format Support:** Convert between HEIC, JPG, PNG, WEBP, TIFF, and **now AVIF**.
*   **AI Background Removal:** Deep-learning background segmentation (`@imgly/background-removal`) running entirely in your browser. All neural network models are pre-packaged into the app—no external CDN connections required!
*   **Target File Size Auto-Compress:** Tell us how big the file can be (e.g., 500KB) and the app will algorithmically find the best quality setting.
*   **Custom Watermarking:** Batch-stamp your text or custom logo across all your images to protect your intellectual property.
*   **Interactive Cropping:** Launch a visual modal to frame and crop your pictures precisely before converting.
*   **AI Watermark Removal:** Mathematically reverses the visible ✨ AI-sparkle watermark from Google Gemini images losslessly.
    *   **Limitations:**
        *   Only removes Gemini visible watermarks (the semi-transparent logo in bottom-right)
        *   Does not remove invisible/steganographic watermarks. (Learn more about SynthID)
        *   Designed for Gemini's current watermark pattern (as of 2025)
    *   *Thanks to Abhin Krishna, author of the [gemini-watermark-remover](https://github.com/dearabhin/gemini-watermark-remover)*
*   **Single & Batch Modes:** Optimize one photo perfectly, or process dozens at once.
*   **Non-Destructive Editing:** Adjust contrast, saturation, hue, vibrance, rotation, flip, or apply filters (grayscale, sepia, blur) with full undo/redo.
*   **Privacy Controls:** Option to strip EXIF data and metadata during conversion.
- **Powerful Batch Functionality**:
  - **Unified Archives**: Convert an entire batch of images and download them in a single `.zip` archive, a stitched `.pdf` document, or a `.cbz` comic book archive.
  - **Intelligent Skipping**: Automatically skips files that are already in the target format, saving time.
  - **Individual Status**: Track the progress of each file (Ready, Converting, Done, Error).
- **User-Friendly Interface**:
  - Modern, responsive design built with Tailwind CSS.
  - Intuitive drag-and-drop file uploads.
  - Live previews and real-time feedback.
- **SEO Optimized**: Fully equipped with descriptive meta tags, Open Graph properties, and Twitter Cards to ensure your deployed application stands out in search results and social media shares.

## 🚀 Technology Stack

- **Framework**: Angular (v19) using modern standalone components and signals for state management.
- **Styling**: Tailwind CSS for a utility-first, responsive design.
- **Core Libraries**:
  - **JSZip**: For creating `.zip` archives in batch mode.
  - **piexifjs**: For reading and writing EXIF metadata from JPEG files.
- **Language**: TypeScript

## 🐳 Docker & ARM Support

The Ultimate Image Converter includes specific Dockerfiles for ARM architectures (e.g., Apple Silicon, Raspberry Pi, AWS Graviton).

To build the image for your specific architecture, use the `-f` flag during your Docker build:
- **Default (x86_64/amd64)**: `docker build -t ultimate-image-converter .`
- **ARM64 (Apple M1/M2/M3, newer Raspberry Pi, etc.)**: `docker build -t ultimate-image-converter-arm64 -f Dockerfile.arm64 .`
- **ARM32 (v7, Older Raspberry Pi)**: `docker build -t ultimate-image-converter-arm -f Dockerfile.arm .`

If you are using Docker Compose, you can define which Dockerfile to build from in your `docker-compose.yml`:
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.arm64 # Change to Dockerfile.arm for 32-bit ARM
```

## 使い方 (How to Use)

### 📸 Single File Mode
*Perfect for detailed, granular editing of individual images.*

1.  **Load your Image**: Click the upload area, drag and drop a file, or simply hit `Ctrl+V` to paste from your clipboard.
2.  **Adjust & Enhance**:
    -   **AI Toolkit**: Use "Remove Background", "Remove Gemini Sparkle", or "AI Super Resolution" (2x/4x Upscale) for automated magic.
    -   **Editing Lab**: Fine-tune Sliders (Contrast, Saturation, etc.) or apply **Artistic Filters** (Vignette, Pixelate, Duotone).
    -   **Interactive Crop**: Click the crop icon to visually frame your image.
3.  **Preview**: Use the **Before/After Slider** to compare your changes in real-time.
4.  **Export**:
    -   Select your **Output Format** (JPG, PNG, WEBP, AVIF).
    -   Set a **Target File Size** (Auto-Compress) or adjust quality manually.
    -   Choose a custom filename and click **"Download"**.

### 📦 Batch Conversion Mode
*Ideal for processing large folders of images simultaneously.*

1.  **Bulk Upload**: Drag multiple images into the dropzone.
2.  **Global Settings**:
    -   **Format & Quality**: Choose settings that will apply to every file in the list.
    -   **Smart Naming**: Define a pattern like `vacation_{sequence}` to automatically rename your outputs.
    -   **Advanced Resize**: Force all images into a bounding box or set a "Max Long Edge" limit.
    -   **Batch AI**: Enable background removal or watermark stripping for the entire set.
3.  **Process**: Click **"Convert All Files"**. Watch the status signals for each file update in real-time.
4.  **Export Options**:
    -   **Download as ZIP**: Get a single compressed archive of all files.
    -   **Create PDF**: Stitch every converted image into a multi-page document.
    -   **Create CBZ**: Generate a Comic Book Archive for your reader app.

### 💡 Pro Tip: Help Modal
Stuck? Click the **"How to Use"** button next to the version number in the header for a quick reference on features and keyboard shortcuts!

## 🔒 Privacy First

This application is built with complete user privacy as its foundational pillar. Because everything runs natively in your browser leveraging Web APIs and WebAssembly:
- **No Uploads:** Your photos never touch our servers.
- **No Third-Party AI:** Our Deep Learning Background Removal model downloads locally to your cache, ensuring sensitive portraits never leave your specific device.
- **No Data Retention:** Closing the tab permanently wipes the session's image data from RAM.

## 📄 License

This project is licensed under the [WTFPL](LICENSE).

## 📝 Changelog

### v0.9.0
* Added AI Image Upscaling via ONNX (Super Resolution).
* Added advanced artistic filters: Duotone, Invert, Pixelate, and Vignette.
* Added Interactive Compare (Before/After Slider) for viewing edits inline.
* Added Clipboard Support (Ctrl+V) for rapid image pasting.
* Fixed Docker implementation by migrating to Nginx to correctly serve extensionless WASM blobs.
* Resolved `onnxruntime-web` version mismatch causing AI Background Removal to fail.

### v0.8.5
* Added AVIF output format support.
* Added Interactive Cropping for single-file mode.
* Added Custom Text & Logo Watermarking (batch & single).
* Added Target Auto-Compress for locking output size.
* Added WASM-powered AI Background Removal (100% Client-Side).
* Updated UI and Documentation to emphasize Privacy First architecture.

### v0.5.0
* Added AI Toolkit with Gemini Watermark Removal capability.
* Fixed drag-and-drop functionality for image uploads.

## 🗺️ Roadmap

### 🤖 Advanced AI & Processing (WASM / ONNX)
*   **Automatic Face Anonymizer**: Detect and "Emoji-mask" or blur faces locally for privacy-focused sharing.
*   **Smart Auto-Enhance**: A "Magic Wand" button that uses image histograms to automatically balance Contrast, Saturation, and Exposure.
*   **Semantic Auto-Crop**: AI-driven salience detection to automatically suggest optimal crops for social media (Instagram, YouTube, LinkedIn).
*   **AI Object Eraser (Inpainting)**: Brush over unwanted objects and use a lightweight WASM model to fill in the background.

### 🎨 Enhanced Creative Suite
*   **Preset "Recipes"**: Save your adjustment/filter combinations and apply them instantly to massive batches.
*   **Layered Annotations**: Add draggable text boxes, stickers, and arrows directly onto your images.
*   **Background Replacement**: Swap removed backgrounds with custom gradients, solid colors, or "Studio Blur" bokeh effects.

### 🚀 Batch & Professional Workflow
*   **Batch EXIF Editor**: Edit "Author", "Copyright", and "Date Taken" metadata fields across hundreds of photos at once.
*   **Smart Watermark Placement**: AI that finds the "least busy" corner of each image to place watermarks automatically.
*   **Animated GIF/WebP Burst**: Stitch a series of still photos into high-efficiency animated loops.
*   **SVG-to-Raster Pro**: Batch export SVGs as perfectly anti-aliased PNGs at 1x, 2x, and 3x scales.

### ✅ Recently Completed
*   ~~**Smart Batch Renaming**: Define custom naming patterns (e.g., `{original}_{sequence}`) for batch exports.~~ *(Implemented!)*
*   ~~**Advanced Resizing Rules**: Interactive "Fit", "Fill", and "Longest Edge" constraints for bulk processing.~~ *(Implemented!)*
*   ~~**Image to PDF Converter**: Batch stitch images into high-quality, multi-page PDF documents.~~ *(Implemented!)*
*   ~~**Comic Book Archive (CBZ) Support**: Generate `.cbz` archives directly from converted image batches.~~ *(Implemented!)*
*   ~~**Web Workers for Batch Processing**: Multi-threaded parallel conversion using a worker pool.~~ *(Implemented!)*
*   ~~**AI Image Upscaling**: 2x and 4x Super Resolution via local ONNX models.~~ *(Implemented!)*
*   ~~**Advanced Filters**: Pixelate, Duotone, Invert, and Vignette effects.~~ *(Implemented!)*
*   ~~**Clipboard Support (Ctrl+V)**: Instant image loading from the system clipboard.~~ *(Implemented!)*
