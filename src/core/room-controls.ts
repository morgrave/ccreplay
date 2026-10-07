import type { Camera } from "../replay/types.ts";
interface Controls {
  camera: () => Camera | null;
  changed: () => void;
  hover: (event: PointerEvent) => void;
  leave: () => void;
}
import { cameraLayers } from "./free-view.ts";
const bound = new WeakSet();
const sliderSelector = 'input[type="range"][aria-orientation="vertical"]';
export function zoomValue(
  value: number,
  input: Pick<HTMLInputElement, "min" | "max" | "step"> | null,
) {
  const min = Number(input?.min) || 0.2,
    max = Number(input?.max) || 2,
    step = Number(input?.step) || 0.1;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
export function bindRoomControls(
  doc: Document,
  { camera, changed, hover, leave }: Controls,
) {
  const input = doc.querySelector<HTMLInputElement>(sliderSelector),
    state = camera();
  if (input && state) {
    input.value = String(state.scale);
    input.setAttribute("aria-valuenow", String(state.scale));
    input.setAttribute("aria-label", "맵 배율");
    const root = input.closest(".MuiSlider-root"),
      pct =
        (100 * (state.scale - Number(input.min))) /
        (Number(input.max) - Number(input.min));
    const thumb = root?.querySelector<HTMLElement>(".MuiSlider-thumb"),
      track = root?.querySelector<HTMLElement>(".MuiSlider-track");
    if (thumb) thumb.style.bottom = pct + "%";
    if (track) track.style.height = pct + "%";
    const label = root?.querySelector(".MuiSlider-valueLabelLabel");
    if (label) label.textContent = state.scale.toFixed(1);
  }
  if (bound.has(doc.documentElement)) return;
  bound.add(doc.documentElement);
  let drag: { x: number; y: number; px: number; py: number } | null = null,
    slider: HTMLElement | null = null;
  const map = (target: Node) =>
    cameraLayers(doc).some(({ move }) => move.parentElement?.contains(target));
  const setZoom = (value: number, point?: { x: number; y: number }) => {
    const c = camera();
    if (!c) return;
    const next = zoomValue(
      value,
      doc.querySelector<HTMLInputElement>(sliderSelector),
    );
    if (point) {
      const pane =
        cameraLayers(doc)[0]?.move.parentElement?.getBoundingClientRect();
      if (pane) {
        const x = point.x - pane.left - pane.width / 2,
          y = point.y - pane.top - pane.height / 2,
          ratio = next / c.scale;
        c.x = x + (c.x - x) * ratio;
        c.y = y + (c.y - y) * ratio;
      }
    }
    c.scale = next;
    leave();
    changed();
  };
  const slide = (e: PointerEvent) => {
    if (!slider) return;
    const r = slider.getBoundingClientRect(),
      range = slider.querySelector("input");
    if (!range) return;
    setZoom(
      Number(range.min) +
        (1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))) *
          (Number(range.max) - Number(range.min)),
    );
  };
  doc.addEventListener("click", (e) => {
    if (!(e.target as Element | null)?.closest) return;
    const button = (e.target as Element).closest("button");
    if (!button) return;
    if (button.querySelector('[data-testid="ZoomInIcon"]')) {
      e.preventDefault();
      setZoom(camera()!.scale + 0.1);
    } else if (button.querySelector('[data-testid="ZoomOutIcon"]')) {
      e.preventDefault();
      setZoom(camera()!.scale - 0.1);
    }
  });
  doc.addEventListener("input", (e) => {
    if ((e.target as Element).matches(sliderSelector))
      setZoom(Number((e.target as HTMLInputElement).value));
  });
  doc.addEventListener("keydown", (e) => {
    if (!(e.target as Element).matches(sliderSelector)) return;
    if (
      [
        "ArrowUp",
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "Home",
        "End",
      ].includes(e.key)
    ) {
      e.preventDefault();
      setZoom(
        e.key === "Home"
          ? 0.2
          : e.key === "End"
            ? 2
            : camera()!.scale +
              (["ArrowUp", "ArrowRight"].includes(e.key) ? 0.1 : -0.1),
      );
    }
  });
  doc.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !camera()) return;
    const root = (e.target as Element).closest<HTMLElement>(".MuiSlider-root");
    if (root?.querySelector(sliderSelector)) {
      e.preventDefault();
      slider = root;
      doc.documentElement.setPointerCapture(e.pointerId);
      slide(e);
      return;
    }
    if (!map(e.target as Node) || (e.target as Element).closest("button,input"))
      return;
    e.preventDefault();
    doc.defaultView?.getSelection()?.removeAllRanges();
    leave();
    drag = { x: e.clientX, y: e.clientY, px: camera()!.x, py: camera()!.y };
    doc.documentElement.setPointerCapture(e.pointerId);
  });
  doc.addEventListener("pointermove", (e) => {
    if (slider) {
      slide(e);
      return;
    }
    if (drag) {
      e.preventDefault();
      leave();
      Object.assign(camera()!, {
        x: drag.px + e.clientX - drag.x,
        y: drag.py + e.clientY - drag.y,
      });
      changed();
    } else hover(e);
  });
  for (const name of ["pointerup", "pointercancel"])
    doc.addEventListener(name, () => {
      drag = null;
      slider = null;
    });
  doc.addEventListener("pointerleave", leave);
  doc.addEventListener(
    "wheel",
    (e) => {
      if (!map(e.target as Node)) return;
      e.preventDefault();
      setZoom(camera()!.scale + (e.deltaY < 0 ? 0.1 : -0.1), {
        x: e.clientX,
        y: e.clientY,
      });
    },
    { passive: false },
  );
}
