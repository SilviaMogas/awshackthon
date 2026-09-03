/**
 * Small icons built as real SVG DOM nodes (createElementNS, not innerHTML) so
 * icon rendering never goes through a markup-parsing sink. Each icon inherits
 * the button's `color` via `stroke="currentColor"`.
 */
import { svg } from "./dom.js";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

function icon(size: string, ...children: SVGElement[]): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", ...STROKE },
    ...children,
  );
}

export function iconMic(): SVGElement {
  return icon(
    "18",
    svg("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }),
    svg("path", { d: "M5 10v1a7 7 0 0 0 14 0v-1" }),
    svg("path", { d: "M12 18v4" }),
    svg("path", { d: "M8 22h8" }),
  );
}

export function iconSend(): SVGElement {
  return icon("18", svg("path", { d: "M4 12 20 4l-6.5 16-3-6.5L4 12Z" }));
}

export function iconReset(): SVGElement {
  return icon(
    "17",
    svg("path", { d: "M3 12a9 9 0 1 1 2.64 6.36" }),
    svg("path", { d: "M3 21v-6h6" }),
  );
}

export function iconCode(): SVGElement {
  return icon(
    "17",
    svg("path", { d: "m9 8-4 4 4 4" }),
    svg("path", { d: "m15 8 4 4-4 4" }),
  );
}
