import { removeBackground } from '@imgly/background-removal';
import * as piexif from 'piexifjs';

addEventListener('message', async ({ data }) => {
    try {
        const {
            file, publicPath, assetsPath, removeGeminiWatermark, doRemoveBackground,
            addWatermark, watermarkType, watermarkText, watermarkColor,
            watermarkOpacity, watermarkPosition, watermarkLogoBitmap,
            formatInfo, quality, autoCompressEnabled, targetFileSizeKB,
            stripMetadata, resizeEnabled, resizeMode, resizeWidth, resizeHeight
        } = data;

        console.log(`[Worker] Started processing file: ${file.name}`);

        // Load Image
        const imageBitmap = await createImageBitmap(file);
        const sourceWidth = imageBitmap.width;
        const sourceHeight = imageBitmap.height;

        // 1. Setup Original Canvas
        let ogCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
        let ogCtx = ogCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
        ogCtx.drawImage(imageBitmap, 0, 0);

        // AI Watermark Removal
        if (removeGeminiWatermark) {
            const isLarge = sourceWidth > 1024 && sourceHeight > 1024;
            const size = isLarge ? 96 : 48;
            const margin = isLarge ? 64 : 32;
            const x = sourceWidth - margin - size;
            const y = sourceHeight - margin - size;

            try {
                const bgUrl = `${assetsPath || publicPath.replace('imgly/', '')}bg_${size}.png`;
                const bgResponse = await fetch(bgUrl);
                const bgBlob = await bgResponse.blob();
                const bgBitmap = await createImageBitmap(bgBlob);

                const alphaCanvas = new OffscreenCanvas(size, size);
                const alphaCtx = alphaCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
                alphaCtx.drawImage(bgBitmap, 0, 0);
                const alphaData = alphaCtx.getImageData(0, 0, size, size);

                const alphaMap = new Float32Array(size * size);
                for (let i = 0; i < alphaMap.length; i++) {
                    const idx = i * 4;
                    alphaMap[i] = Math.max(alphaData.data[idx], alphaData.data[idx + 1], alphaData.data[idx + 2]) / 255.0;
                }

                const imageData = ogCtx.getImageData(x, y, size, size);
                const ALPHA_THRESHOLD = 0.002;
                const MAX_ALPHA = 0.99;
                const LOGO_VALUE = 255;

                for (let row = 0; row < size; row++) {
                    for (let col = 0; col < size; col++) {
                        const imgIdx = (row * size + col) * 4;
                        const alphaIdx = row * size + col;

                        let alpha = alphaMap[alphaIdx];
                        if (alpha < ALPHA_THRESHOLD) continue;
                        alpha = Math.min(alpha, MAX_ALPHA);

                        for (let c = 0; c < 3; c++) {
                            const watermarked = imageData.data[imgIdx + c];
                            const original = (watermarked - alpha * LOGO_VALUE) / (1.0 - alpha);
                            imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
                        }
                    }
                }
                ogCtx.putImageData(imageData, x, y);
            } catch (e) {
                console.error('Failed to remove Gemini watermark in worker:', e);
            }
        }

        console.log(`[Worker] Setup Original Canvas Done for ${file.name}`);

        // AI Background Removal
        if (doRemoveBackground) {
            try {
                const tempBlob = await ogCanvas.convertToBlob({ type: 'image/png' });
                const bgRemovedBlob = await removeBackground(tempBlob, { publicPath: publicPath });
                const bgImgBitmap = await createImageBitmap(bgRemovedBlob);
                ogCtx.clearRect(0, 0, sourceWidth, sourceHeight);
                ogCtx.drawImage(bgImgBitmap, 0, 0);
            } catch (e) {
                console.error('Failed to remove background in worker:', e);
            }
        }

        console.log(`[Worker] AI Background Removal check done for ${file.name}`);

        // Resize Logic
        let targetWidth = sourceWidth;
        let targetHeight = sourceHeight;

        if (resizeEnabled) {
            if (resizeMode === 'exact' && resizeWidth && resizeHeight) {
                targetWidth = resizeWidth;
                targetHeight = resizeHeight;
            } else if (resizeMode === 'fit' && resizeWidth && resizeHeight) {
                const ratio = Math.min(resizeWidth / sourceWidth, resizeHeight / sourceHeight);
                targetWidth = Math.round(sourceWidth * ratio);
                targetHeight = Math.round(sourceHeight * ratio);
            } else if (resizeMode === 'longestEdge' && resizeWidth) {
                const maxSize = resizeWidth;
                if (sourceWidth > sourceHeight) {
                    targetWidth = maxSize;
                    targetHeight = Math.round(sourceHeight * (maxSize / sourceWidth));
                } else {
                    targetHeight = maxSize;
                    targetWidth = Math.round(sourceWidth * (maxSize / sourceHeight));
                }
            }
        }

        // Setup Target Canvas
        const canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

        if (formatInfo.format === 'jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(ogCanvas, 0, 0, targetWidth, targetHeight);

        // Apply Custom Watermark
        if (addWatermark) {
            ctx.globalAlpha = watermarkOpacity;
            let wx = 0, wy = 0;
            const margin = 20;

            if (watermarkType === 'text' && watermarkText) {
                const fontSize = Math.max(16, canvas.width * 0.05);
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = watermarkColor;
                ctx.textBaseline = 'bottom';
                const metrics = ctx.measureText(watermarkText);

                if (watermarkPosition === 'bottom-right') {
                    wx = canvas.width - metrics.width - margin;
                    wy = canvas.height - margin;
                } else if (watermarkPosition === 'bottom-left') {
                    wx = margin;
                    wy = canvas.height - margin;
                } else if (watermarkPosition === 'center') {
                    wx = (canvas.width - metrics.width) / 2;
                    wy = canvas.height / 2 + fontSize / 2;
                }
                ctx.fillText(watermarkText, wx, wy);
            } else if (watermarkType === 'image' && watermarkLogoBitmap) {
                const logo = watermarkLogoBitmap;
                const logoWidth = canvas.width * 0.2;
                const logoHeight = logoWidth * (logo.height / logo.width);

                if (watermarkPosition === 'bottom-right') {
                    wx = canvas.width - logoWidth - margin;
                    wy = canvas.height - logoHeight - margin;
                } else if (watermarkPosition === 'bottom-left') {
                    wx = margin;
                    wy = canvas.height - logoHeight - margin;
                } else if (watermarkPosition === 'center') {
                    wx = (canvas.width - logoWidth) / 2;
                    wy = (canvas.height - logoHeight) / 2;
                }
                ctx.drawImage(logo, wx, wy, logoWidth, logoHeight);
            }
            ctx.globalAlpha = 1.0;
        }

        console.log(`[Worker] Pre-Export Phase (resizing/watermark done) for ${file.name}`);

        // Export Phase
        let finalBlob: Blob;
        const compressibleFormats = ['image/jpeg', 'image/webp', 'image/avif'];

        if (autoCompressEnabled && targetFileSizeKB && compressibleFormats.includes(formatInfo.mime)) {
            const targetBytes = targetFileSizeKB * 1024;
            let minQ = 0.01, maxQ = 1.0, bestQ = 0.01;
            let bestBlob: Blob | null = null;

            for (let i = 0; i < 7; i++) {
                const testQ = (minQ + maxQ) / 2;
                const testBlob = await canvas.convertToBlob({ type: formatInfo.mime, quality: testQ });

                if (testBlob.size <= targetBytes) {
                    bestQ = testQ;
                    bestBlob = testBlob;
                    minQ = testQ;
                } else {
                    maxQ = testQ;
                }
            }
            finalBlob = bestBlob || await canvas.convertToBlob({ type: formatInfo.mime, quality: 0.01 });
        } else {
            finalBlob = await canvas.convertToBlob({ type: formatInfo.mime, quality: quality });
        }

        // Metadata Support
        if (formatInfo.format === 'jpeg' && !stripMetadata && file.type === 'image/jpeg') {
            try {
                const reader = new (globalThis as any).FileReaderSync();
                const originalDataUrl = reader.readAsDataURL(file);
                const exifData = piexif.load(originalDataUrl);
                if (Object.keys(exifData).length > 0) {
                    const newExif = piexif.dump(exifData);
                    const finalDataUrl = reader.readAsDataURL(finalBlob);
                    const exifDataUrl = piexif.insert(newExif, finalDataUrl);

                    // convert string back to blob
                    const response = await fetch(exifDataUrl);
                    finalBlob = await response.blob();
                }
            } catch (e) {
                console.error('Failed to inject EXIF in worker:', e);
            }
        }

        console.log(`[Worker] Finished processing file: ${file.name}. Posting final message.`);
        postMessage({ success: true, blob: finalBlob });
    } catch (error) {
        console.error(`[Worker] Failed for file:`, error);
        postMessage({ success: false, error: String(error) });
    }
});
