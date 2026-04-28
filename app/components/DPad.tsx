"use client";

import type { Dir } from "../lib/engine";

interface Props {
  onDir: (dir: Dir) => void;
}

export default function DPad({ onDir }: Props) {
  const press = (d: Dir) => (e: React.PointerEvent) => {
    e.preventDefault();
    onDir(d);
  };

  return (
    <div className="dpad" role="group" aria-label="movement controls">
      <button
        className="pad up"
        onPointerDown={press("up")}
        aria-label="up"
      >
        ▲
      </button>
      <button
        className="pad left"
        onPointerDown={press("left")}
        aria-label="left"
      >
        ◀
      </button>
      <div className="pad center" aria-hidden />
      <button
        className="pad right"
        onPointerDown={press("right")}
        aria-label="right"
      >
        ▶
      </button>
      <button
        className="pad down"
        onPointerDown={press("down")}
        aria-label="down"
      >
        ▼
      </button>

      <style jsx>{`
        .dpad {
          display: grid;
          grid-template-columns: 60px 60px 60px;
          grid-template-rows: 60px 60px 60px;
          gap: 6px;
          margin-top: 8px;
          touch-action: none;
        }
        .pad {
          background: #1f3bff;
          color: #fff;
          border: 2px solid #3b82ff;
          font-size: 22px;
          font-weight: bold;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          touch-action: none;
        }
        .pad:active {
          background: #3b82ff;
        }
        .pad.up {
          grid-column: 2;
          grid-row: 1;
        }
        .pad.left {
          grid-column: 1;
          grid-row: 2;
        }
        .pad.center {
          grid-column: 2;
          grid-row: 2;
          background: transparent;
          border: none;
        }
        .pad.right {
          grid-column: 3;
          grid-row: 2;
        }
        .pad.down {
          grid-column: 2;
          grid-row: 3;
        }
      `}</style>
    </div>
  );
}
