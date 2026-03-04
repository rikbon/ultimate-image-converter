[<-- Back to Home](../README.md)

# Installation and Running Guide

This guide covers how to set up, run, and build the **Ultimate Image Converter** locally and using Docker.

## Prerequisites

*   **Node.js**: v18 or preferably v20 (LTS)
*   **npm**: (Included with Node.js)
*   **Docker Desktop**: (Optional, for containerized running)

## Local Development (Without Docker)

1.  **Clone the repository** (if you haven't already).

2.  **Install Dependencies**:
    Navigate to the project root and run:
    ```bash
    npm install
    ```
    *Note: This will install Angular v19 and other required libraries. If you encounter peer dependency errors (common with AI libraries), use `npm install --legacy-peer-deps`.*

3.  **Start the Development Server**:
    ```bash
    npm run dev
    ```
    (or `ng serve` if you have Angular CLI installed globally)

4.  **Access the App**:
    Open your browser to [http://localhost:4200](http://localhost:4200).
    The app will automatically reload if you change any of the source files.

## Running with Docker (Recommended)

Docker provides a consistent environment and serves the application using Nginx, mimicking a production setup.

1.  **Build and Run**:
    In the project root, run:
    ```bash
    docker-compose up --build
    ```

2.  **Access the App**:
    Open your browser to [http://localhost:8085](http://localhost:8085).

3.  **Stop the Container**:
    Press `Ctrl+C` in the terminal or run:
    ```bash
    docker-compose down
    ```

### ARM Architectures (Apple Silicon, Raspberry Pi)

If you are running on an ARM-based device, specify the corresponding Dockerfile:

**ARM64 (Apple M-Series, Newer Raspberry Pi)**:
```bash
docker build -t ultimate-image-converter -f Dockerfile.arm64 .
docker run -p 8085:80 ultimate-image-converter
```

**ARM32 (Older Raspberry Pi)**:
```bash
docker build -t ultimate-image-converter -f Dockerfile.arm .
docker run -p 8085:80 ultimate-image-converter
```

Alternatively, you can update `docker-compose.yml` to specify the `dockerfile`:
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.arm64
```

## Building for Production

To generate the static files for deployment (without Docker):

1.  Run the build command:
    ```bash
    npm run build
    ```

2.  The build artifacts will be stored in the `dist/` directory.

## Troubleshooting

### `npm install` fails
*   Ensure you are using a compatible Node.js version (`node -v`). v18+ is required.
*   Delete `node_modules` and `package-lock.json` and try again.

### Docker build fails
*   Ensure Docker Desktop is running.
*   Check the build logs for specific errors.
*   Verify your `.dockerignore` file isn't excluding necessary source files.

### Port Conflicts
*   If port `4200` (Local) or `8085` (Docker) is already in use, you can change them:
    *   **Local**: `ng serve --port 4300`
    *   **Docker**: Edit `docker-compose.yml` and change `"8085:80"` to `"YOUR_PORT:80"`.

---
*Last Updated: 2026-02-26*
