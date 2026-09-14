import { useEffect, useRef } from 'react';
import { Panel } from './Panel';
export function FramebufferPanel({ image, width, height, onInput }: { image?: Uint8ClampedArray; width: number; height: number; onInput: (event: { type: number; x: number; y: number; button: number }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (!image || !canvas.current) return; const ctx = canvas.current.getContext('2d'); if (ctx) ctx.putImageData(new ImageData(image, width, height), 0, 0); }, [image, width, height]);
  const input = (type: number, event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); onInput({ type, x: Math.floor((event.clientX - rect.left) * width / rect.width), y: Math.floor((event.clientY - rect.top) * height / rect.height), button: event.button + 1 }); };
  return <Panel title="Framebuffer"><canvas ref={canvas} width={width} height={height} className="framebuffer" onPointerDown={(e) => input(1, e)} onPointerUp={(e) => input(2, e)} onPointerMove={(e) => { if (e.buttons) input(3, e); }} /></Panel>;
}
