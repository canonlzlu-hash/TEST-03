"use client";

import { useEffect, useRef, type ReactNode, type PointerEvent } from "react";
import { Grip, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WindowFrame = { x: number; y: number; w: number; h: number; maximized: boolean };
function fit(b: Box): Box {
  const w = Math.min(Math.max(280, b.w), window.innerWidth - 16);
  const h = Math.min(Math.max(200, b.h), window.innerHeight - 156);
  return { w, h, x: Math.max(8, Math.min(b.x, window.innerWidth-w-8)), y: Math.max(148, Math.min(b.y, window.innerHeight-h-8)) };
}
type Box = Omit<WindowFrame, "maximized">;
export function FloatingWindow({ title, open, layer, frame, onFrameChange, onClose, onFocus, contentClassName = "", children }: { id: string; title: string; open: boolean; layer: number; frame: WindowFrame; onFrameChange: (frame: WindowFrame) => void; onClose: () => void; onFocus: () => void; contentClassName?: string; children: ReactNode }) {
  const box = frame;
  const maximized = frame.maximized;
  const gesture = useRef<{ x: number; y: number; box: Box; resize: boolean } | null>(null);
  useEffect(() => {
    const resize = () => onFrameChange({ ...fit(frame), maximized: frame.maximized });
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // Refit only when the viewport changes; normal movement is driven by pointer events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function start(e: PointerEvent<HTMLElement>, resize = false) {
    if (maximized || e.button !== 0 || (!resize && (e.target as HTMLElement).closest("button"))) return;
    e.preventDefault(); onFocus();
    gesture.current = { x: e.clientX, y: e.clientY, box, resize };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLElement>) {
    const g = gesture.current; if (!g) return;
    const dx = e.clientX-g.x, dy = e.clientY-g.y;
    onFrameChange({ ...fit(g.resize ? { ...g.box, w: g.box.w+dx, h: g.box.h+dy } : { ...g.box, x: g.box.x+dx, y: g.box.y+dy }), maximized: false });
  }
  const stop = () => { gesture.current = null; };
  return <section role="dialog" aria-modal="false" aria-label={title} hidden={!open} className={"a-floating-window"+(maximized ? " maximized" : "")} style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: layer }} onPointerDownCapture={onFocus} onFocusCapture={onFocus} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <header className="a-window-title" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onDoubleClick={() => onFrameChange({ ...frame, maximized: !maximized })}>
      <span><Grip size={16}/>{title}</span><div>
        <Button variant="ghost" size="icon" aria-label={(maximized ? "还原" : "最大化")+title} onClick={() => onFrameChange({ ...frame, maximized: !maximized })}>{maximized ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</Button>
        <Button variant="ghost" size="icon" aria-label={"关闭"+title} onClick={onClose}><X size={17}/></Button>
      </div>
    </header>
    <div className={"a-window-content "+contentClassName}>{children}</div>
    {!maximized && <button className="a-window-resize" aria-label={"调整"+title+"大小"} onPointerDown={e => start(e, true)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onKeyDown={e => { const delta = { ArrowRight: [20,0], ArrowLeft: [-20,0], ArrowDown: [0,20], ArrowUp: [0,-20] }[e.key]; if (delta) { e.preventDefault(); onFrameChange({ ...frame, ...fit({ ...frame, w: frame.w+delta[0], h: frame.h+delta[1] }) }); } }}><span/></button>}
  </section>;
}
