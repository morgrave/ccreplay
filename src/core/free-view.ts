import type { Camera, RoomEvent, SerializedNode } from "../replay/types.ts";
// Change the room camera inside the captured document, leaving its UI and CSS intact.
export function cameraLayers(doc: Document) {
  const layers = new Map<HTMLElement, HTMLElement>();
  for (const object of doc.querySelectorAll<HTMLElement>(
    "[data-field-object]",
  )) {
    const scale = object.parentElement,
      move = scale?.parentElement;
    if (
      scale?.style.transform.startsWith("scale(") &&
      move?.style.transform.startsWith("translate(")
    )
      layers.set(move, scale);
  }
  return [...layers].map(([move, scale]) => ({ move, scale }));
}
export function tooltipClass(events: RoomEvent[]) {
  let result = "";
  function visit(node?: SerializedNode) {
    const classes = node?.attributes?.class;
    if (
      typeof classes === "string" &&
      classes.split(" ").includes("MuiTooltip-tooltip")
    )
      result = classes;
    for (const child of node?.childNodes || []) visit(child);
  }
  for (const event of events) {
    if (event.type === 2) visit(event.data.node);
    for (const add of event.data?.adds || []) if (add.node) visit(add.node);
    if (result) return result;
  }
  return result;
}
export function applyCamera(doc: Document, camera: Camera | null) {
  let style = doc.getElementById("ccreplay-free-camera");
  if (!camera) {
    style?.remove();
    doc.getElementById("ccreplay-live-tooltip")?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement("style");
    style.id = "ccreplay-free-camera";
    doc.head.append(style);
  }
  for (const { move, scale } of cameraLayers(doc)) {
    move.setAttribute("data-ccreplay-camera", "move");
    scale.setAttribute("data-ccreplay-camera", "scale");
  }
  const css = `[data-ccreplay-camera="move"]{transform:translate(${camera.x}px,${camera.y}px)!important}[data-ccreplay-camera="scale"]{transform:scale(${camera.scale})!important}[role="alert"],.MuiDialog-root,.MuiTooltip-popper{display:none!important}html,body,*{user-select:none!important;-webkit-user-select:none!important}`;
  if (style.textContent !== css) style.textContent = css;
}
