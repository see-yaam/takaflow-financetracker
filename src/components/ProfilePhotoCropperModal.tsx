import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCw, Check, X, Move } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  onCropComplete: (croppedDataUrl: string) => Promise<void>;
}

const CROP_BOX_SIZE = 260; // preview container dimension in pixels

export default function ProfilePhotoCropperModal({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const dragStartRef = useRef<{ x: number; y: number; initialPanX: number; initialPanY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Load image dimensions and reset zoom/pan on open
  useEffect(() => {
    if (open && imageSrc) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);

      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
    }
  }, [open, imageSrc]);

  // Compute base scale to cover crop circle
  const baseScale = useMemoBaseScale(imageDimensions, rotation);

  // Calculate pan limits to prevent exposing empty space outside the circle
  const maxPan = useMemoMaxPan(imageDimensions, baseScale, zoom, rotation);

  // Clamp pan when zoom changes
  useEffect(() => {
    setPan((prev) => ({
      x: Math.max(-maxPan.x, Math.min(maxPan.x, prev.x)),
      y: Math.max(-maxPan.y, Math.min(maxPan.y, prev.y)),
    }));
  }, [maxPan.x, maxPan.y]);

  // Pointer drag handling (mouse and touch)
  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current) return;
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    const newX = dragStartRef.current.initialPanX + deltaX;
    const newY = dragStartRef.current.initialPanY + deltaY;

    setPan({
      x: Math.max(-maxPan.x, Math.min(maxPan.x, newX)),
      y: Math.max(-maxPan.y, Math.min(maxPan.y, newY)),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
    setPan({ x: 0, y: 0 });
  };

  // Perform final high-resolution crop on Canvas and save
  const handleSaveCrop = async () => {
    if (!imageSrc || !imageDimensions) return;
    setIsSaving(true);

    try {
      const OUTPUT_SIZE = 360;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not access canvas context");

      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve) => {
        if (img.complete) resolve(null);
        else img.onload = () => resolve(null);
      });

      // Enable smooth high quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Center of output canvas + pan offset (matches CSS transform order)
      const ratio = OUTPUT_SIZE / CROP_BOX_SIZE;
      ctx.translate(OUTPUT_SIZE / 2 + pan.x * ratio, OUTPUT_SIZE / 2 + pan.y * ratio);

      // Apply rotation around center
      ctx.rotate((rotation * Math.PI) / 180);

      // Draw image centered at rotated origin
      const drawW = imageDimensions.width * baseScale * zoom * ratio;
      const drawH = imageDimensions.height * baseScale * zoom * ratio;

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

      const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      await onCropComplete(croppedDataUrl);
      onOpenChange(false);
    } catch (err) {
      console.error("Error cropping image:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!imageSrc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] w-[95vw] p-5 sm:p-6 bg-card border-border shadow-2xl rounded-2xl gap-4">
        <DialogHeader className="text-left pr-6">
          <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
            Adjust Profile Photo
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Drag to reposition your photo and use the slider to zoom in or out.
          </DialogDescription>
        </DialogHeader>

        {/* Circular Viewport & Interactive Canvas Preview */}
        <div className="flex flex-col items-center justify-center py-2">
          <div
            ref={containerRef}
            className="relative w-[260px] h-[260px] rounded-full overflow-hidden select-none cursor-grab active:cursor-grabbing border-4 border-primary/50 shadow-2xl bg-black"
            onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
            onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1) {
                handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            onTouchEnd={handlePointerUp}
          >
            {/* The Image inside the circular viewport */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop target"
              draggable={false}
              className="absolute pointer-events-none transition-transform duration-75 origin-center will-change-transform max-w-none"
              style={{
                width: imageDimensions
                  ? `${imageDimensions.width * baseScale * zoom}px`
                  : "auto",
                height: imageDimensions
                  ? `${imageDimensions.height * baseScale * zoom}px`
                  : "auto",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
              }}
            />

            {/* Circular focus overlay border */}
            <div className="absolute inset-0 rounded-full border-2 border-white/40 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]" />

            {/* Helper drag watermark */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white/90 flex items-center gap-1 font-medium">
              <Move className="h-3 w-3" /> Drag to move
            </div>
          </div>
        </div>

        {/* Controls: Zoom slider & Rotate */}
        <div className="space-y-3 px-1">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.02}
              onValueChange={([val]) => setZoom(val)}
              className="flex-1 cursor-pointer"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRotate}
              className="h-8 w-8 shrink-0 rounded-lg border-border text-foreground hover:bg-secondary"
              title="Rotate 90°"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5 w-full mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full h-10 border-border text-foreground hover:bg-muted/50 text-xs font-semibold rounded-xl"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSaveCrop}
            disabled={isSaving}
            className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-md rounded-xl"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? "Saving Photo..." : "Save Photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helpers
function useMemoBaseScale(
  dims: { width: number; height: number } | null,
  rotation: number
): number {
  if (!dims) return 1;
  const isRotated = rotation === 90 || rotation === 270;
  const w = isRotated ? dims.height : dims.width;
  const h = isRotated ? dims.width : dims.height;
  return Math.max(CROP_BOX_SIZE / w, CROP_BOX_SIZE / h);
}

function useMemoMaxPan(
  dims: { width: number; height: number } | null,
  baseScale: number,
  zoom: number,
  rotation: number
): { x: number; y: number } {
  if (!dims) return { x: 0, y: 0 };
  const isRotated = rotation === 90 || rotation === 270;
  const w = isRotated ? dims.height : dims.width;
  const h = isRotated ? dims.width : dims.height;

  const currentW = w * baseScale * zoom;
  const currentH = h * baseScale * zoom;

  return {
    x: Math.max(0, (currentW - CROP_BOX_SIZE) / 2),
    y: Math.max(0, (currentH - CROP_BOX_SIZE) / 2),
  };
}
