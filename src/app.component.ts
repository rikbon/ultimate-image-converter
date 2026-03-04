import { Component, ChangeDetectionStrategy, signal, computed, ElementRef, viewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import * as piexif from 'piexifjs';
// @ts-ignore
import heic2any from 'heic2any';
import Cropper from 'cropperjs';
import { removeBackground } from '@imgly/background-removal';

type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

interface FormatInfo {
  format: OutputFormat;
  mime: string;
  label: string;
  extension: string;
}

interface BatchFile {
  id: string;
  file: File;
  originalSrc: string | null;
  originalInfo: { size: string; resolution: string } | null;
  convertedBlob: Blob | null;
  convertedInfo: { size: string, newFileName: string } | null;
  status: 'loading' | 'ready' | 'converting' | 'done' | 'error';
  errorMessage: string | null;
  baseFileName: string;
}

interface AdjustmentState {
  contrast: number;
  saturation: number;
  hue: number;
  vibrance: number;
  // New features
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  grayscale: boolean;
  sepia: boolean;
  blur: number;
  invert: boolean;
  duotone: boolean;
  pixelate: number;
  vignette: number;
}

const initialAdjustmentState: AdjustmentState = {
  contrast: 0,
  saturation: 0,
  hue: 0,
  vibrance: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  grayscale: false,
  sepia: false,
  blur: 0,
  invert: false,
  duotone: false,
  pixelate: 0,
  vignette: 0
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class AppComponent {
  // --- Common State ---
  conversionMode = signal<'single' | 'batch'>('single');
  isConverting = signal(false);
  errorMessage = signal<string | null>(null);
  jpegQuality = signal(0.92);
  webpQuality = signal(0.92);
  avifQuality = signal(0.85);
  pngCompressionLevel = signal(0.9);
  outputFormat = signal<OutputFormat>('jpeg');
  stripMetadata = signal(true);
  removeGeminiWatermark = signal(false);
  autoCompressEnabled = signal(false);
  targetFileSizeKB = signal<number | null>(null);
  removeBackground = signal(false);

  // --- Watermark States ---
  addWatermark = signal(false);
  watermarkType = signal<'text' | 'image'>('text');
  watermarkText = signal('Ultimate Image Converter');
  watermarkColor = signal('#ffffff');
  watermarkOpacity = signal(0.5);
  watermarkPosition = signal<'bottom-right' | 'bottom-left' | 'center'>('bottom-right');
  watermarkLogoUrl = signal<string | null>(null);
  watermarkLogoImage = signal<HTMLImageElement | null>(null);

  // --- Single File Mode State ---
  originalFile = signal<File | null>(null);
  originalImageSrc = signal<string | null>(null);
  convertedImageSrc = signal<string | null>(null);
  originalImageInfo = signal<{ size: string; resolution: string } | null>(null);
  convertedImageInfo = signal<{ size: string; resolution: string } | null>(null);
  originalFileType = signal<string | null>(null);
  originalExifData = signal<any | null>(null);
  originalExifDataDisplay = signal<[string, string][] | null>(null);
  baseFileName = signal('converted');
  batchNamingPattern = signal('{original}_{sequence}');

  showHelpModal = signal(false);
  // --- Compare Mode State ---
  compareMode = signal(false);
  sliderPosition = signal(50); // 0 to 100 percentage

  // --- Cropper State ---
  showCropModal = signal(false);
  cropData = signal<{ x: number, y: number, width: number, height: number } | null>(null);
  private cropper: Cropper | null = null;

  // Image Adjustment History State
  adjustmentHistory = signal<AdjustmentState[]>([initialAdjustmentState]);
  historyIndex = signal(0);

  // Resize State
  resizeEnabled = signal(false);
  resizeMode = signal<'exact' | 'fit' | 'longestEdge'>('exact');
  resizeWidth = signal<number | null>(null);
  resizeHeight = signal<number | null>(null);
  maintainAspectRatio = signal(true);
  private originalAspectRatio = signal<number | null>(null);

  // --- Batch Mode State ---
  batchFiles = signal<BatchFile[]>([]);

  // Alpha Map Cache
  private alphaMaps: { [key: number]: Float32Array } = {};

  readonly supportedInputTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff'];
  readonly supportedOutputFormats: FormatInfo[] = [
    { format: 'jpeg', mime: 'image/jpeg', label: 'JPG', extension: 'jpg' },
    { format: 'png', mime: 'image/png', label: 'PNG', extension: 'png' },
    { format: 'webp', mime: 'image/webp', label: 'WEBP', extension: 'webp' },
    { format: 'avif', mime: 'image/avif', label: 'AVIF', extension: 'avif' },
  ];

  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  // --- Computed State ---
  canUndo = computed(() => this.historyIndex() > 0);
  canRedo = computed(() => this.historyIndex() < this.adjustmentHistory().length - 1);
  currentAdjustments = computed(() => this.adjustmentHistory()[this.historyIndex()]);

  availableOutputFormats = computed(() => {
    if (this.conversionMode() === 'batch' || !this.originalFileType()) {
      return this.supportedOutputFormats;
    }
    const originalMime = this.originalFileType();
    return this.supportedOutputFormats.filter(f => f.mime !== originalMime);
  });

  selectedOutputFormatInfo = computed(() => {
    const format = this.outputFormat();
    return this.supportedOutputFormats.find(f => f.format === format)!;
  });

  convertedFileName = computed(() => `${this.baseFileName()}.${this.selectedOutputFormatInfo().extension}`);

  batchReadyCount = computed(() => this.batchFiles().filter(f => f.status === 'ready').length);
  batchDoneCount = computed(() => this.batchFiles().filter(f => f.status === 'done').length);
  batchTotalCount = computed(() => this.batchFiles().length);
  canDownloadZip = computed(() => this.batchDoneCount() > 0 && !this.isConverting());

  // --- Methods ---

  private formatBytes(bytes: number, decimals: number = 2): string {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  setConversionMode(mode: 'single' | 'batch'): void {
    if (this.conversionMode() === mode) return;
    this.reset();
    this.conversionMode.set(mode);
  }

  triggerFileInput(): void {
    this.fileInput()?.nativeElement.click();
  }
  // --- Limits ---
  readonly SINGLE_FILE_MAX_SIZE_MB = 20;
  readonly BATCH_MAX_FILES = 15;
  readonly BATCH_MAX_TOTAL_SIZE_MB = 200;

  @HostListener('window:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (this.isConverting() || this.showCropModal()) return;
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          if (this.conversionMode() === 'single') {
            this.reset();
            this.handleSingleFile(file);
          } else {
            this.handleBatchFiles([file]);
          }
        }
        break; // Only handle the first image found
      }
    }
  }

  onFileSelected(event: Event | DragEvent): void {
    let files: FileList | null = null;
    let input: HTMLInputElement | null = null;
    if ('dataTransfer' in event && event.dataTransfer) {
      files = event.dataTransfer.files;
    } else {
      input = event.target as HTMLInputElement;
      files = input?.files;
    }

    if (!files?.length) return;

    this.errorMessage.set(null);

    // Common Type Validation
    const validFiles = Array.from(files).filter(file => {
      // Basic type check on extension/mime
      const isSupportedType = this.supportedInputTypes.includes(file.type) ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');

      if (!isSupportedType) {
        console.warn(`File "${file.name}" has an unsupported type: ${file.type}. Skipping.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      this.errorMessage.set('No supported image files selected.');
      if (input) input.value = '';
      return;
    }

    if (this.conversionMode() === 'single') {
      const file = validFiles[0];
      if (file.size > this.SINGLE_FILE_MAX_SIZE_MB * 1024 * 1024) {
        this.errorMessage.set(`File "${file.name}" exceeds the ${this.SINGLE_FILE_MAX_SIZE_MB}MB limit.`);
        if (input) input.value = '';
        return;
      }
      this.reset();
      this.handleSingleFile(file);
    } else {
      // Batch Validation
      const currentCount = this.batchFiles().length;
      if (currentCount + validFiles.length > this.BATCH_MAX_FILES) {
        this.errorMessage.set(`You can only add up to ${this.BATCH_MAX_FILES} files. You currently have ${currentCount}.`);
        if (input) input.value = '';
        return;
      }

      const currentTotalSize = this.batchFiles().reduce((acc, f) => acc + f.file.size, 0);
      const newFilesTotalSize = validFiles.reduce((acc, f) => acc + f.size, 0);

      if (currentTotalSize + newFilesTotalSize > this.BATCH_MAX_TOTAL_SIZE_MB * 1024 * 1024) {
        this.errorMessage.set(`Total batch size exceeds ${this.BATCH_MAX_TOTAL_SIZE_MB}MB.`);
        if (input) input.value = '';
        return;
      }

      this.handleBatchFiles(validFiles);
    }
    if (input) input.value = '';
  }

  private async handleSingleFile(file: File): Promise<void> {
    this.originalFile.set(file);
    this.originalFileType.set(file.type);
    this.baseFileName.set(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);

    // If HEIC is passed, originalFileType might need to be 'image/jpeg' logically after conversion in loadImageInfo,
    // but here we just store the upload type. 
    // The format selector logic might hide "JPG" output if input is JPG.
    // If input is HEIC/HEIF, we want JPG/PNG/WEBP all available.

    if (this.selectedOutputFormatInfo().mime === file.type) {
      const nextFormat = this.availableOutputFormats()[0]?.format || 'jpeg';
      this.outputFormat.set(nextFormat);
    }

    try {
      const { src, info, exifData, exifDisplay, width, height } = await this.loadImageInfo(file);
      this.originalImageSrc.set(src);
      this.originalImageInfo.set(info);
      this.originalExifData.set(exifData);
      this.originalExifDataDisplay.set(exifDisplay);
      this.resizeWidth.set(width);
      this.resizeHeight.set(height);
      this.originalAspectRatio.set(width / height);
      this.convertImage();
    } catch (e) {
      this.errorMessage.set('Failed to load image. It might be corrupted or unsupported.');
    }
  }

  private handleBatchFiles(files: File[]): void {
    const newBatchFiles: BatchFile[] = files.map(file => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${Math.random()}`, // Add random to ensure uniqueness
      file,
      originalSrc: null,
      originalInfo: null,
      convertedBlob: null,
      convertedInfo: null,
      status: 'loading',
      errorMessage: null,
      baseFileName: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
    }));

    this.batchFiles.update(current => [...current, ...newBatchFiles]);

    newBatchFiles.forEach(async (batchFile) => {
      try {
        const { src, info } = await this.loadImageInfo(batchFile.file);
        this.batchFiles.update(current => current.map(f => f.id === batchFile.id ? { ...f, originalSrc: src, originalInfo: info, status: 'ready' } : f));
      } catch (e) {
        this.batchFiles.update(current => current.map(f => f.id === batchFile.id ? { ...f, status: 'error', errorMessage: 'Load failed' } : f));
      }
    });
  }

  private loadImageInfo(file: File): Promise<{ src: string, info: { size: string; resolution: string }, exifData: any | null, exifDisplay: [string, string][] | null, width: number, height: number }> {
    return new Promise(async (resolve, reject) => {
      let fileToRead = file;

      // Handle HEIC/HEIF
      if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
        try {
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9
          }) as Blob;
          fileToRead = new File([convertedBlob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' });
        } catch (e) {
          console.error("Error converting HEIC", e);
          // Fallback or reject? Let's try to proceed, maybe browser supports it natively? (unlikely)
        }
      }

      const reader = new FileReader();
      const image = new Image();
      let exifData: any | null = null;
      let exifDisplay: [string, string][] | null = null;

      image.onload = () => {
        resolve({
          src: image.src,
          info: {
            size: this.formatBytes(file.size),
            resolution: `${image.width} x ${image.height}`,
          },
          exifData,
          exifDisplay,
          width: image.width,
          height: image.height
        });
        // URL.revokeObjectURL(image.src); // Keep open for now
      };

      image.onerror = (e) => {
        reject('Failed to load image');
      };

      reader.onload = (e) => {
        const url = e.target?.result as string;
        try {
          if (fileToRead.type === 'image/jpeg') {
            exifData = piexif.load(url);
            const display: [string, string][] = [];
            for (const ifd in exifData) {
              if (ifd === 'thumbnail') continue;
              for (const tag in exifData[ifd]) {
                const tagName = piexif.TAGS[ifd][tag]?.name;
                if (tagName) {
                  display.push([tagName, String(exifData[ifd][tag])]);
                }
              }
            }
            exifDisplay = display;
          }
        } catch (error) {
          // Not an image with EXIF or invalid data
        }
        image.src = URL.createObjectURL(fileToRead);
      };

      reader.readAsDataURL(fileToRead);
    });
  }

  async convertImage(): Promise<void> {
    const file = this.originalFile();
    if (!file) return;

    this.isConverting.set(true);
    this.convertedImageSrc.set(null);
    this.convertedImageInfo.set(null);

    try {
      const { blob, dataUrl, resolution } = await this.performConversion(file);
      this.convertedImageSrc.set(dataUrl);
      this.convertedImageInfo.set({
        size: this.formatBytes(blob.size),
        resolution: resolution
      });
    } catch (error) {
      console.error('Conversion failed', error);
      this.errorMessage.set('An error occurred during conversion.');
    } finally {
      this.isConverting.set(false);
    }
  }

  private async performConversion(file: File, returnLossless = false): Promise<{ blob: Blob; dataUrl: string; resolution: string; }> {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await new Promise(resolve => image.onload = resolve);

    // 1. Process Watermark Removal on the Original Image Dimensions
    const ogCanvas = document.createElement('canvas');
    ogCanvas.width = image.width;
    ogCanvas.height = image.height;
    const ogCtx = ogCanvas.getContext('2d')!;
    ogCtx.drawImage(image, 0, 0);

    if (this.removeGeminiWatermark()) {
      const isLarge = ogCanvas.width > 1024 && ogCanvas.height > 1024;
      const size = isLarge ? 96 : 48;
      const margin = isLarge ? 64 : 32;
      const x = ogCanvas.width - margin - size;
      const y = ogCanvas.height - margin - size;

      try {
        const alphaMap = await this.getAlphaMap(size as 48 | 96);
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
              // Reverse Alpha Blending Formula
              const original = (watermarked - alpha * LOGO_VALUE) / (1.0 - alpha);
              imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
            }
          }
        }
        ogCtx.putImageData(imageData, x, y);
      } catch (e) {
        console.error('Failed to remove Gemini watermark:', e);
        this.errorMessage.set(`Watermark removal failed: ${e}`);
      }
    }

    if (this.removeBackground()) {
      try {
        let publicPath = new URL('assets/imgly/', window.location.href).href;
        if (!publicPath.endsWith('/')) publicPath += '/';

        const tempBlob = await new Promise<Blob>((res) => ogCanvas.toBlob(b => res(b!), 'image/png'));
        const bgRemovedBlob = await removeBackground(tempBlob, {
          publicPath: publicPath,
          progress: (key, current, total) => {
            console.log(`Downloading ${key}: ${current}/${total}`);
          }
        });
        const bgImg = new Image();
        bgImg.src = URL.createObjectURL(bgRemovedBlob);
        await new Promise(res => bgImg.onload = res);
        ogCtx.clearRect(0, 0, ogCanvas.width, ogCanvas.height);
        ogCtx.drawImage(bgImg, 0, 0);
      } catch (e) {
        console.error('Failed to remove background:', e);
        this.errorMessage.set(`Background removal failed: ${e}`);
      }
    }

    // 1.5 Process Cropping
    let baseCanvas = ogCanvas;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (this.conversionMode() === 'single' && this.cropData()) {
      const crop = this.cropData()!;
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = crop.width;
      croppedCanvas.height = crop.height;
      const croppedCtx = croppedCanvas.getContext('2d')!;
      croppedCtx.drawImage(baseCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      baseCanvas = croppedCanvas;
      sourceWidth = crop.width;
      sourceHeight = crop.height;
    }

    // 2. Setup Final Canvas (Resizing & Formatting)
    const canvas = document.createElement('canvas');

    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;

    if (this.conversionMode() === 'single' && this.resizeEnabled() && this.resizeWidth() && this.resizeHeight()) {
      targetWidth = this.resizeWidth()!;
      targetHeight = this.resizeHeight()!;
    } else if (this.conversionMode() === 'batch' && this.resizeEnabled()) {
      if (this.resizeMode() === 'exact' && this.resizeWidth() && this.resizeHeight()) {
        targetWidth = this.resizeWidth()!;
        targetHeight = this.resizeHeight()!;
      } else if (this.resizeMode() === 'fit' && this.resizeWidth() && this.resizeHeight()) {
        const ratio = Math.min(this.resizeWidth()! / sourceWidth, this.resizeHeight()! / sourceHeight);
        targetWidth = Math.round(sourceWidth * ratio);
        targetHeight = Math.round(sourceHeight * ratio);
      } else if (this.resizeMode() === 'longestEdge' && this.resizeWidth()) { // Using resizeWidth as max edge
        const maxSize = this.resizeWidth()!;
        if (sourceWidth > sourceHeight) {
          targetWidth = maxSize;
          targetHeight = Math.round(sourceHeight * (maxSize / sourceWidth));
        } else {
          targetHeight = maxSize;
          targetWidth = Math.round(sourceWidth * (maxSize / sourceHeight));
        }
      }
    }

    let finalCanvasWidth = targetWidth;
    let finalCanvasHeight = targetHeight;

    if (this.conversionMode() === 'single') {
      const adjustments = this.currentAdjustments();
      if (adjustments.rotation === 90 || adjustments.rotation === 270) {
        finalCanvasWidth = targetHeight;
        finalCanvasHeight = targetWidth;
      }
    }

    canvas.width = finalCanvasWidth;
    canvas.height = finalCanvasHeight;

    const ctx = canvas.getContext('2d')!;

    const formatInfo = this.selectedOutputFormatInfo();

    if (!returnLossless && formatInfo.format === 'jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (this.conversionMode() === 'single') {
      const adjustments = this.currentAdjustments();

      // 1. Move to Center
      ctx.translate(finalCanvasWidth / 2, finalCanvasHeight / 2);

      // 2. Rotate
      if (adjustments.rotation) {
        ctx.rotate((adjustments.rotation * Math.PI) / 180);
      }

      // 3. Flip
      const scaleX = adjustments.flipH ? -1 : 1;
      const scaleY = adjustments.flipV ? -1 : 1;
      ctx.scale(scaleX, scaleY);

      const filters = [];
      if (adjustments.contrast !== 0) {
        filters.push(`contrast(${1 + adjustments.contrast / 100})`);
      }
      if (adjustments.saturation !== 0) {
        filters.push(`saturate(${1 + adjustments.saturation / 100})`);
      }
      if (adjustments.hue !== 0) {
        filters.push(`hue-rotate(${adjustments.hue}deg)`);
      }
      if (adjustments.vibrance !== 0) {
        filters.push(`saturate(${1 + adjustments.vibrance / 100})`);
      }
      if (adjustments.grayscale) {
        filters.push('grayscale(100%)');
      }
      if (adjustments.sepia) {
        filters.push('sepia(100%)');
      }
      if (adjustments.invert) {
        filters.push('invert(100%)');
      }
      if (adjustments.duotone) {
        // Simple duotone effect via CSS filters
        filters.push('grayscale(100%) sepia(100%) hue-rotate(240deg) saturate(300%) opacity(90%)');
      }
      if (adjustments.blur > 0) {
        filters.push(`blur(${adjustments.blur}px)`);
      }
      if (filters.length > 0) {
        ctx.filter = filters.join(' ');
      }

      let sourceDrawCanvas = baseCanvas;
      if (adjustments.pixelate > 0) {
        const pSize = adjustments.pixelate; // block size
        const pCanvas = document.createElement('canvas');
        pCanvas.width = Math.ceil(targetWidth / pSize);
        pCanvas.height = Math.ceil(targetHeight / pSize);
        const pCtx = pCanvas.getContext('2d')!;
        pCtx.drawImage(baseCanvas, 0, 0, targetWidth, targetHeight, 0, 0, pCanvas.width, pCanvas.height);

        ctx.imageSmoothingEnabled = false;
        sourceDrawCanvas = pCanvas;
      } else {
        ctx.imageSmoothingEnabled = true; // reset
      }

      // Draw the image centered around the origin (0,0) which is currently positioned at the center of the final canvas
      ctx.drawImage(sourceDrawCanvas, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);

      // Reset transforms
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = 'none';

      if (adjustments.vignette > 0) {
        ctx.globalCompositeOperation = 'multiply';
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const maxR = Math.sqrt(cx * cx + cy * cy);
        const vRatio = adjustments.vignette / 100;
        const gradient = ctx.createRadialGradient(cx, cy, maxR * (1 - vRatio * 0.8), cx, cy, maxR);
        gradient.addColorStop(0, 'rgba(255,255,255, 1)'); // Multiply by white does nothing
        gradient.addColorStop(1, `rgba(0,0,0, 1)`); // Multiply by black darkens
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over'; // reset
      }
    } else {
      ctx.drawImage(baseCanvas, 0, 0, targetWidth, targetHeight);
    }

    // Draw Custom Watermark
    if (this.addWatermark()) {
      ctx.globalAlpha = this.watermarkOpacity();

      let x = 0;
      let y = 0;
      const margin = 20;

      if (this.watermarkType() === 'text' && this.watermarkText()) {
        const fontSize = Math.max(16, canvas.width * 0.05);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = this.watermarkColor();
        ctx.textBaseline = 'bottom';
        const metrics = ctx.measureText(this.watermarkText());

        if (this.watermarkPosition() === 'bottom-right') {
          x = canvas.width - metrics.width - margin;
          y = canvas.height - margin;
        } else if (this.watermarkPosition() === 'bottom-left') {
          x = margin;
          y = canvas.height - margin;
        } else if (this.watermarkPosition() === 'center') {
          x = (canvas.width - metrics.width) / 2;
          y = canvas.height / 2 + fontSize / 2;
        }

        ctx.fillText(this.watermarkText(), x, y);
      } else if (this.watermarkType() === 'image' && this.watermarkLogoImage()) {
        const logo = this.watermarkLogoImage()!;
        // Scale logo to a max of 20% of the image width
        const logoWidth = canvas.width * 0.2;
        const logoHeight = logoWidth * (logo.height / logo.width);

        if (this.watermarkPosition() === 'bottom-right') {
          x = canvas.width - logoWidth - margin;
          y = canvas.height - logoHeight - margin;
        } else if (this.watermarkPosition() === 'bottom-left') {
          x = margin;
          y = canvas.height - logoHeight - margin;
        } else if (this.watermarkPosition() === 'center') {
          x = (canvas.width - logoWidth) / 2;
          y = (canvas.height - logoHeight) / 2;
        }

        ctx.drawImage(logo, x, y, logoWidth, logoHeight);
      }

      ctx.globalAlpha = 1.0; // Reset
    }

    URL.revokeObjectURL(image.src);

    const targetMime = returnLossless ? 'image/png' : formatInfo.mime;
    const defaultQuality = returnLossless ? undefined : (
      formatInfo.format === 'jpeg' ? this.jpegQuality() :
        formatInfo.format === 'webp' ? this.webpQuality() :
          formatInfo.format === 'avif' ? this.avifQuality() : undefined
    );

    let finalDataUrl = '';
    const compressibleFormats = ['image/jpeg', 'image/webp', 'image/avif'];

    if (!returnLossless && this.autoCompressEnabled() && this.targetFileSizeKB() && compressibleFormats.includes(formatInfo.mime)) {
      const targetBytes = this.targetFileSizeKB()! * 1024;
      let minQ = 0.01;
      let maxQ = 1.0;
      let bestQ = 0.01;
      let bestDataUrl = '';

      for (let i = 0; i < 7; i++) {
        const testQ = (minQ + maxQ) / 2;
        const testDataUrl = canvas.toDataURL(formatInfo.mime, testQ);
        // Estimate blob size from b64 length (approximate but much faster than canvas.toBlob)
        const sizeEstimate = Math.round((testDataUrl.length - testDataUrl.indexOf(',') - 1) * 0.75);

        if (sizeEstimate <= targetBytes) {
          bestQ = testQ;
          bestDataUrl = testDataUrl;
          minQ = testQ; // Try to get higher quality while staying under limit
        } else {
          maxQ = testQ; // Too big, need lower quality
        }
      }

      finalDataUrl = bestDataUrl || canvas.toDataURL(formatInfo.mime, 0.01);
    } else {
      finalDataUrl = canvas.toDataURL(targetMime, defaultQuality);
    }

    // Insert EXIF into the data string if needed
    if (!returnLossless && formatInfo.format === 'jpeg' && !this.stripMetadata() && this.originalExifData()) {
      const newExif = piexif.dump(this.originalExifData());
      finalDataUrl = piexif.insert(newExif, finalDataUrl);
    }

    // Generate accurate Blob directly from the manipulated Data URL to preserve EXIF in batch zip
    const response = await fetch(finalDataUrl);
    const blob = await response.blob();

    return {
      blob,
      dataUrl: finalDataUrl,
      resolution: `${canvas.width} x ${canvas.height}`
    };
  }

  downloadImage(): void {
    const url = this.convertedImageSrc();
    const fileName = this.convertedFileName();
    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  setOutputFormat(format: OutputFormat): void {
    this.outputFormat.set(format);
    if (this.conversionMode() === 'single' && this.originalFile()) {
      this.convertImage();
    }
  }

  onQualityChange(event: Event, type: 'jpeg' | 'webp' | 'png' | 'avif'): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (type === 'jpeg') this.jpegQuality.set(value);
    else if (type === 'webp') this.webpQuality.set(value);
    else if (type === 'avif') this.avifQuality.set(value);
    else this.pngCompressionLevel.set(value);

    if (this.conversionMode() === 'single' && this.originalFile()) {
      this.convertImage();
    }
  }

  onResizeEnabledChange(event: Event): void {
    this.resizeEnabled.set((event.target as HTMLInputElement).checked);
    if (this.originalFile()) {
      this.convertImage();
    }
  }

  onMaintainAspectRatioChange(event: Event): void {
    this.maintainAspectRatio.set((event.target as HTMLInputElement).checked);
  }

  onResizeDimensionChange(event: Event, dimension: 'width' | 'height'): void {
    const rawValue = (event.target as HTMLInputElement).value;
    const value = parseInt(rawValue, 10);
    const aspectRatio = this.originalAspectRatio();

    if (isNaN(value) || value <= 0 || !aspectRatio) {
      if (dimension === 'width') {
        this.resizeWidth.set(null);
      } else {
        this.resizeHeight.set(null);
      }
      if (this.resizeEnabled()) {
        this.triggerUpdateIfSingle();
      }
      return;
    }

    if (this.maintainAspectRatio()) {
      if (dimension === 'width') {
        this.resizeWidth.set(value);
        this.resizeHeight.set(Math.round(value / aspectRatio));
      } else { // height
        this.resizeHeight.set(value);
        this.resizeWidth.set(Math.round(value * aspectRatio));
      }
    } else {
      if (dimension === 'width') {
        this.resizeWidth.set(value);
      } else {
        this.resizeHeight.set(value);
      }
    }

    if (this.resizeEnabled() && this.originalFile()) {
      this.convertImage();
    }
  }

  private addHistoryState(change: Partial<AdjustmentState>): void {
    const currentState = this.currentAdjustments();
    const nextState = { ...currentState, ...change };

    const history = this.adjustmentHistory().slice(0, this.historyIndex() + 1);
    history.push(nextState);

    this.adjustmentHistory.set(history);
    this.historyIndex.set(history.length - 1);

    if (this.originalFile()) this.convertImage();
  }

  undo(): void {
    if (this.canUndo()) {
      this.historyIndex.update(i => i - 1);
      if (this.originalFile()) this.convertImage();
    }
  }

  redo(): void {
    if (this.canRedo()) {
      this.historyIndex.update(i => i + 1);
      if (this.originalFile()) this.convertImage();
    }
  }

  onContrastChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ contrast: value });
  }

  onSaturationChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ saturation: value });
  }

  onHueChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ hue: value });
  }

  onVibranceChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ vibrance: value });
  }

  onRotate(degrees: number): void {
    const current = this.currentAdjustments().rotation;
    this.addHistoryState({ rotation: (current + degrees + 360) % 360 });
  }

  onFlip(direction: 'h' | 'v'): void {
    const current = this.currentAdjustments();
    if (direction === 'h') this.addHistoryState({ flipH: !current.flipH });
    else this.addHistoryState({ flipV: !current.flipV });
  }

  onFilterChange(event: Event, type: 'grayscale' | 'sepia' | 'invert' | 'duotone'): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (type === 'grayscale') this.addHistoryState({ grayscale: checked });
    else if (type === 'sepia') this.addHistoryState({ sepia: checked });
    else if (type === 'invert') this.addHistoryState({ invert: checked });
    else if (type === 'duotone') this.addHistoryState({ duotone: checked });
  }

  onBlurChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ blur: value });
  }

  onPixelateChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ pixelate: value });
  }

  onVignetteChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.addHistoryState({ vignette: value });
  }

  onBaseFileNameChange(event: Event): void {
    this.baseFileName.set((event.target as HTMLInputElement).value);
  }

  onBatchNamingPatternChange(event: Event): void {
    this.batchNamingPattern.set((event.target as HTMLInputElement).value);
  }

  onResizeModeChange(event: Event): void {
    this.resizeMode.set((event.target as HTMLSelectElement).value as any);
  }

  onStripMetadataChange(event: Event): void {
    this.stripMetadata.set((event.target as HTMLInputElement).checked);
    if (this.originalFile() && this.outputFormat() === 'jpeg') {
      this.convertImage();
    }
  }

  onRemoveWatermarkChange(event: Event): void {
    this.removeGeminiWatermark.set((event.target as HTMLInputElement).checked);
    this.triggerUpdateIfSingle();
  }

  onAutoCompressEnabledChange(event: Event): void {
    this.autoCompressEnabled.set((event.target as HTMLInputElement).checked);
    this.triggerUpdateIfSingle();
  }

  onTargetFileSizeChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.targetFileSizeKB.set(isNaN(value) || value <= 0 ? null : value);
    if (this.autoCompressEnabled()) {
      this.triggerUpdateIfSingle();
    }
  }

  // --- Watermark Handlers ---

  onAddWatermarkChange(event: Event): void {
    this.addWatermark.set((event.target as HTMLInputElement).checked);
    this.triggerUpdateIfSingle();
  }

  onWatermarkTypeChange(type: 'text' | 'image'): void {
    this.watermarkType.set(type);
    this.triggerUpdateIfSingle();
  }

  onWatermarkTextChange(event: Event): void {
    this.watermarkText.set((event.target as HTMLInputElement).value);
    this.triggerUpdateIfSingle();
  }

  onWatermarkColorChange(event: Event): void {
    this.watermarkColor.set((event.target as HTMLInputElement).value);
    this.triggerUpdateIfSingle();
  }

  onWatermarkOpacityChange(event: Event): void {
    this.watermarkOpacity.set(parseFloat((event.target as HTMLInputElement).value));
    this.triggerUpdateIfSingle();
  }

  onWatermarkPositionChange(event: Event): void {
    this.watermarkPosition.set((event.target as HTMLSelectElement).value as any);
    this.triggerUpdateIfSingle();
  }

  onWatermarkLogoUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file && (file.type === 'image/png' || file.type === 'image/webp')) {
      const url = URL.createObjectURL(file);
      this.watermarkLogoUrl.set(url);
      const img = new Image();
      img.onload = () => {
        this.watermarkLogoImage.set(img);
        this.triggerUpdateIfSingle();
      };
      img.src = url;
    } else {
      alert("Please upload a PNG or WEBP for the watermark logo to support transparency.");
    }
  }

  private triggerUpdateIfSingle() {
    if (this.originalFile() || this.batchFiles().length > 0) {
      if (this.conversionMode() === 'single') {
        this.convertImage();
      }
    }
  }

  private calculateAlphaMap(imageData: ImageData): Float32Array {
    const { width, height, data } = imageData;
    const alphaMap = new Float32Array(width * height);
    for (let i = 0; i < alphaMap.length; i++) {
      const idx = i * 4;
      alphaMap[i] = Math.max(data[idx], data[idx + 1], data[idx + 2]) / 255.0;
    }
    return alphaMap;
  }

  private async getAlphaMap(size: 48 | 96): Promise<Float32Array> {
    if (this.alphaMaps[size]) return this.alphaMaps[size];

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const map = this.calculateAlphaMap(ctx.getImageData(0, 0, size, size));
        this.alphaMaps[size] = map;
        resolve(map);
      };
      img.onerror = () => reject(`Failed to load alpha map assets/bg_${size}.png`);
      img.src = `assets/bg_${size}.png`;
    });
  }

  async convertAllImages(): Promise<void> {
    this.isConverting.set(true);

    const filesToConvert = this.batchFiles().filter(f => f.status === 'ready');
    const formatInfo = this.selectedOutputFormatInfo();
    const quality = formatInfo.format === 'jpeg' ? this.jpegQuality() :
      formatInfo.format === 'webp' ? this.webpQuality() :
        formatInfo.format === 'avif' ? this.avifQuality() : undefined;

    let watermarkLogoBitmap: ImageBitmap | null = null;
    if (this.addWatermark() && this.watermarkType() === 'image' && this.watermarkLogoImage()) {
      watermarkLogoBitmap = await createImageBitmap(this.watermarkLogoImage()!);
    }

    let publicPath = new URL('assets/imgly/', window.location.href).href;
    if (!publicPath.endsWith('/')) publicPath += '/';

    const maxConcurrentWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 6) : 4;
    const workerPool: Worker[] = [];
    for (let i = 0; i < maxConcurrentWorkers; i++) {
      workerPool.push(new Worker(new URL('./conversion.worker', import.meta.url), { type: 'module' }));
    }

    let currentIndex = 0;

    const runWorker = (fileRecord: BatchFile, worker: Worker): Promise<void> => {
      return new Promise((resolve) => {
        this.batchFiles.update(files => files.map(f => f.id === fileRecord.id ? { ...f, status: 'converting' } : f));

        worker.onmessage = ({ data }) => {
          console.log(`[Main Thread] message from worker for ${fileRecord.file.name}:`, data);
          if (data.success) {
            const blob = data.blob as Blob;
            this.batchFiles.update(files => files.map(f => f.id === fileRecord.id ? { ...f, status: 'done', convertedBlob: blob, convertedInfo: { size: this.formatBytes(blob.size), newFileName: `${fileRecord.baseFileName}.${formatInfo.extension}` } } : f));
          } else {
            console.error(`[Main Thread] Worker failed for ${fileRecord.file.name}:`, data.error);
            this.batchFiles.update(files => files.map(f => f.id === fileRecord.id ? { ...f, status: 'error', errorMessage: 'Conversion failed' } : f));
          }
          resolve();
        };

        worker.onerror = (error) => {
          console.error(`[Main Thread] Worker threw unhandled error for ${fileRecord.file.name}:`, error);
          this.batchFiles.update(files => files.map(f => f.id === fileRecord.id ? { ...f, status: 'error', errorMessage: 'Worker crashed' } : f));
          resolve();
        };

        console.log(`[Main Thread] Sending ${fileRecord.file.name} to worker.`);
        worker.postMessage({
          file: fileRecord.file,
          publicPath,
          assetsPath: new URL('assets/', window.location.href).href,
          removeGeminiWatermark: this.removeGeminiWatermark(),
          doRemoveBackground: this.removeBackground(),
          addWatermark: this.addWatermark(),
          watermarkType: this.watermarkType(),
          watermarkText: this.watermarkText(),
          watermarkColor: this.watermarkColor(),
          watermarkOpacity: this.watermarkOpacity(),
          watermarkPosition: this.watermarkPosition(),
          watermarkLogoBitmap,
          formatInfo,
          quality,
          autoCompressEnabled: this.autoCompressEnabled(),
          targetFileSizeKB: this.targetFileSizeKB(),
          stripMetadata: this.stripMetadata(),
          resizeEnabled: this.resizeEnabled(),
          resizeMode: this.resizeMode(),
          resizeWidth: this.resizeWidth(),
          resizeHeight: this.resizeHeight()
        });
      });
    };

    const promises = workerPool.map(async (worker) => {
      while (currentIndex < filesToConvert.length) {
        const fileRecord = filesToConvert[currentIndex];
        const sequence = (currentIndex + 1).toString().padStart(3, '0');
        const patternName = this.batchNamingPattern() || '{original}_{sequence}';
        const finalBaseName = patternName
          .replace('{original}', fileRecord.baseFileName)
          .replace('{sequence}', sequence);

        currentIndex++;

        // Disable optimization to ensure rename and resize applies properly in worker unless we are passing it
        // Note: the worker natively supports rename logic now if we pass it finalBaseName
        fileRecord.baseFileName = finalBaseName; // Hacky way to pass it to worker via existing structure

        await runWorker(fileRecord, worker);
      }
    });

    await Promise.all(promises);

    workerPool.forEach(w => w.terminate());
    if (watermarkLogoBitmap) {
      watermarkLogoBitmap.close();
    }

    this.isConverting.set(false);
  }

  async downloadAllAsZip(): Promise<void> {
    const zip = new JSZip();
    const filesToZip = this.batchFiles().filter(f => f.status === 'done' && f.convertedBlob);

    filesToZip.forEach(file => {
      zip.file(file.convertedInfo!.newFileName, file.convertedBlob!);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `converted-images.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  async downloadAllAsCbz(): Promise<void> {
    const zip = new JSZip();
    const filesToZip = this.batchFiles().filter(f => f.status === 'done' && f.convertedBlob);

    filesToZip.forEach(file => {
      zip.file(file.convertedInfo!.newFileName, file.convertedBlob!);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `converted-images.cbz`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  async downloadAllAsPdf(): Promise<void> {
    const files = this.batchFiles().filter(f => f.status === 'done' && f.convertedBlob);
    if (files.length === 0) return;

    // Use A4 dimensions as a default
    const pdf = new jsPDF();

    for (let i = 0; i < files.length; i++) {
      if (i > 0) pdf.addPage();
      const file = files[i];
      const imgUrl = URL.createObjectURL(file.convertedBlob!);
      const img = new Image();
      img.src = imgUrl;
      await new Promise(res => img.onload = res);

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = img.width / img.height;
      const pdfRatio = pdfWidth / pdfHeight;

      let renderWidth = pdfWidth;
      let renderHeight = pdfWidth / imgRatio;

      if (renderHeight > pdfHeight) {
        renderHeight = pdfHeight;
        renderWidth = pdfHeight * imgRatio;
      }

      const x = (pdfWidth - renderWidth) / 2;
      const y = (pdfHeight - renderHeight) / 2;

      // Draw onto canvas to ensure compatibility with jsPDF (it prefers JPEG/PNG)
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

      pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight);
      URL.revokeObjectURL(imgUrl);
    }

    pdf.save('batch_converted_images.pdf');
  }

  reset(): void {
    this.isConverting.set(false);
    this.errorMessage.set(null);
    // Single file
    this.originalFile.set(null);
    this.originalImageSrc.set(null);
    this.convertedImageSrc.set(null);
    this.originalImageInfo.set(null);
    this.convertedImageInfo.set(null);
    this.originalFileType.set(null);
    this.originalExifData.set(null);
    this.originalExifDataDisplay.set(null);
    this.baseFileName.set('converted');
    this.adjustmentHistory.set([initialAdjustmentState]);
    this.historyIndex.set(0);
    this.resizeEnabled.set(false);
    this.resizeWidth.set(null);
    this.resizeHeight.set(null);
    this.maintainAspectRatio.set(true);
    this.originalAspectRatio.set(null);
    this.removeGeminiWatermark.set(false);
    this.removeBackground.set(false);
    this.autoCompressEnabled.set(false);
    this.targetFileSizeKB.set(null);
    this.cropData.set(null);
    this.closeCropModal();
    this.compareMode.set(false);
    this.sliderPosition.set(50);
    // Batch
    this.batchFiles.set([]);
  }

  // --- Help Modal ---
  openHelpModal(): void {
    this.showHelpModal.set(true);
  }

  closeHelpModal(): void {
    this.showHelpModal.set(false);
  }

  // --- Cropper Handlers ---
  openCropModal(): void {
    this.showCropModal.set(true);
    setTimeout(() => {
      const imageElement = document.getElementById('crop-target-image') as HTMLImageElement;
      if (imageElement && this.originalImageSrc()) {
        imageElement.src = this.originalImageSrc()!;
        this.cropper = new Cropper(imageElement, {
          viewMode: 2,
          dragMode: 'crop',
          autoCropArea: 0.8,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
        });
      }
    }, 100);
  }

  applyCrop(): void {
    if (this.cropper) {
      const data = this.cropper.getData(true); // true rounds the values
      this.cropData.set({
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height
      });
      this.closeCropModal();
      this.convertImage();
    }
  }

  closeCropModal(): void {
    this.showCropModal.set(false);
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  resetCrop(): void {
    this.cropData.set(null);
    if (this.conversionMode() === 'single') {
      this.convertImage();
    }
  }

  // --- AI Toolkit Handlers ---
  async upscaleImage(scale: 2 | 4): Promise<void> {
    if (!this.originalFile()) return;
    this.isConverting.set(true);

    try {
      // For demonstration, we simulate the ONNX loading and do a high-quality canvas resize.
      // In production, you would load `ort.InferenceSession.create('assets/models/super_resolution.onnx')` 
      // and run tensor inference here.
      let ort: any;
      try {
        ort = await import('onnxruntime-web');
        console.log("ONNX Runtime Web loaded successfully.");
      } catch (e) {
        console.warn("ONNX Runtime Web or local model could not be loaded. Falling back to high-quality cubic interpolation.");
      }

      // First, bake in all the current user edits/modifications losslessly
      const { dataUrl: bakedDataUrl } = await this.performConversion(this.originalFile()!, true);

      const img = new Image();
      img.src = bakedDataUrl;
      await new Promise(res => img.onload = res);

      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;

      // Basic fallback since ONNX model isn't physically present in repo yet
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const upscaledDataUrl = canvas.toDataURL(this.originalFileType() || 'image/png');
      const response = await fetch(upscaledDataUrl);
      const blob = await response.blob();

      let baseName = this.originalFile()!.name;
      const dotIdx = baseName.lastIndexOf('.');
      if (dotIdx > -1) {
        baseName = baseName.substring(0, dotIdx);
      }
      const newFileName = `upscaled_${scale}x_${baseName}.png`;
      const newFile = new File([blob], newFileName, { type: blob.type });

      this.reset();
      this.handleSingleFile(newFile);

    } catch (error) {
      console.error("Upscaling failed:", error);
      this.errorMessage.set('An error occurred during upscaling.');
    } finally {
      this.isConverting.set(false);
    }
  }

  autoEnhance(): void {
    const file = this.originalFile();
    if (!file) return;

    const current = this.currentAdjustments();
    // Simple heuristic: increase contrast and vibrance to add "pop"
    const newContrast = Math.min(100, current.contrast + 15);
    const newVibrance = Math.min(100, current.vibrance + 25);
    const newSaturation = Math.min(100, current.saturation + 10);

    this.addHistoryState({
      contrast: newContrast,
      vibrance: newVibrance,
      saturation: newSaturation
    });
  }

  onRemoveBackgroundChange(event: Event): void {
    this.removeBackground.set((event.target as HTMLInputElement).checked);
    this.triggerUpdateIfSingle();
  }
}