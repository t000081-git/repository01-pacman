"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLS,
  ROWS,
} from "../lib/maze";
import {
  Dir,
  GameState,
  createGameState,
  finalizeDeath,
  render,
  restart,
  setNextDir,
  startPlaying,
  step,
  togglePause,
} from "../lib/engine";
import { audio } from "../lib/audio";
import DPad from "./DPad";

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [muted, setMuted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [cellSize, setCellSize] = useState(20);

  // Initialize game state once on mount (client-only).
  useEffect(() => {
    stateRef.current = createGameState();
    rerender();
  }, []);

  // Detect touch devices to show on-screen D-pad.
  useEffect(() => {
    const touch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    setIsTouch(touch);
  }, []);

  // Compute a tile size that fits the viewport, leaving room for HUD + D-pad.
  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const reserveTop = 72; // HUD
      const reserveBottom = isTouch ? 200 : 24; // D-pad on mobile
      const availW = vw - 16;
      const availH = vh - reserveTop - reserveBottom;
      const sz = Math.max(
        8,
        Math.floor(Math.min(availW / COLS, availH / ROWS)),
      );
      setCellSize(sz);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [isTouch]);

  // Game loop (rAF)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let dyingTimer = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      if (s) {
        if (s.status === "dying") {
          dyingTimer += dt;
          s.flashTimer = dyingTimer;
          if (dyingTimer >= 1.4) {
            dyingTimer = 0;
            finalizeDeath(s);
          }
        } else {
          dyingTimer = 0;
          step(s, dt);
        }
        const c = canvasRef.current;
        if (c) {
          const ctx = c.getContext("2d");
          if (ctx) {
            // Crisp pixel rendering
            ctx.imageSmoothingEnabled = false;
            render(ctx, s, { cellSize });
          }
        }
        rerender();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cellSize]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s) return;
      let dir: Dir | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dir = "up";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dir = "down";
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dir = "left";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dir = "right";
          break;
        case " ":
        case "Enter":
          if (s.status === "ready") {
            startPlaying(s);
          } else if (s.status === "lost" || s.status === "won") {
            stateRef.current = restart(s);
          } else {
            togglePause(s);
          }
          e.preventDefault();
          return;
        case "m":
        case "M":
          audio.setMuted(!audio.isMuted());
          setMuted(audio.isMuted());
          return;
      }
      if (dir) {
        if (s.status === "ready") startPlaying(s);
        setNextDir(s, dir);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swipe controls on the canvas (mobile)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let sx = 0,
      sy = 0,
      tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
      tracking = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const ad = Math.max(Math.abs(dx), Math.abs(dy));
      if (ad < 24) return;
      const s = stateRef.current;
      if (!s) return;
      let dir: Dir;
      if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx > 0 ? "right" : "left";
      } else {
        dir = dy > 0 ? "down" : "up";
      }
      if (s.status === "ready") startPlaying(s);
      setNextDir(s, dir);
      tracking = false;
      e.preventDefault();
    };
    const onEnd = () => {
      tracking = false;
    };
    c.addEventListener("touchstart", onStart, { passive: false });
    c.addEventListener("touchmove", onMove, { passive: false });
    c.addEventListener("touchend", onEnd);
    return () => {
      c.removeEventListener("touchstart", onStart);
      c.removeEventListener("touchmove", onMove);
      c.removeEventListener("touchend", onEnd);
    };
  }, []);

  const handleDir = (dir: Dir) => {
    const s = stateRef.current;
    if (!s) return;
    if (s.status === "ready") startPlaying(s);
    if (s.status === "lost" || s.status === "won") {
      stateRef.current = restart(s);
      return;
    }
    setNextDir(s, dir);
  };

  const handlePauseTap = () => {
    const s = stateRef.current;
    if (!s) return;
    if (s.status === "ready") {
      startPlaying(s);
    } else if (s.status === "lost" || s.status === "won") {
      stateRef.current = restart(s);
    } else {
      togglePause(s);
    }
  };

  const handleMuteToggle = () => {
    audio.setMuted(!audio.isMuted());
    setMuted(audio.isMuted());
  };

  const s = stateRef.current;
  const w = COLS * cellSize;
  const h = ROWS * cellSize;

  return (
    <div className="game-root">
      <div className="hud">
        <div className="hud-col">
          <span className="hud-label">SCORE</span>
          <span className="hud-value">{s?.score ?? 0}</span>
        </div>
        <div className="hud-col">
          <span className="hud-label">HI</span>
          <span className="hud-value">{s?.highScore ?? 0}</span>
        </div>
        <div className="hud-col">
          <span className="hud-label">LIVES</span>
          <span className="hud-value">
            {Array.from({ length: s?.lives ?? 0 }).map((_, i) => (
              <span key={i} className="life">
                ●
              </span>
            ))}
          </span>
        </div>
        <div className="hud-col actions">
          <button onClick={handlePauseTap} className="btn">
            {s?.status === "paused"
              ? "▶"
              : s?.status === "ready"
              ? "START"
              : s?.status === "lost" || s?.status === "won"
              ? "RESTART"
              : "❚❚"}
          </button>
          <button onClick={handleMuteToggle} className="btn" aria-label="mute">
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={w}
          height={h}
          style={{ width: w, height: h }}
          onClick={() => {
            const st = stateRef.current;
            if (st && st.status === "ready") startPlaying(st);
          }}
        />
      </div>

      {isTouch && <DPad onDir={handleDir} />}

      <div className="hint">
        {isTouch
          ? "Swipe or use D-pad. Tap ❚❚ to pause."
          : "Arrow keys / WASD to move. Space to pause. M to mute."}
      </div>

      <style jsx>{`
        .game-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100vw;
          height: 100vh;
          padding: 8px;
          gap: 6px;
          background: #000;
          color: #fff;
        }
        .hud {
          width: ${w}px;
          max-width: 100%;
          display: flex;
          gap: 14px;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px;
        }
        .hud-col {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.1;
        }
        .hud-col.actions {
          flex-direction: row;
          align-items: center;
          gap: 6px;
        }
        .hud-label {
          font-size: 11px;
          letter-spacing: 0.1em;
          color: #ffd02b;
        }
        .hud-value {
          font-size: 18px;
          font-weight: bold;
          color: #fff;
        }
        .life {
          color: #ffd02b;
          margin-right: 2px;
        }
        .btn {
          background: #1f3bff;
          color: #fff;
          border: 2px solid #3b82ff;
          font-family: inherit;
          font-weight: bold;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }
        .btn:active {
          transform: translateY(1px);
        }
        .canvas-wrap {
          display: flex;
          justify-content: center;
        }
        canvas {
          background: #000;
          image-rendering: pixelated;
          touch-action: none;
          display: block;
        }
        .hint {
          font-size: 11px;
          opacity: 0.55;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
