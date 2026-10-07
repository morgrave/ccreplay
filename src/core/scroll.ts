import type { ExternalRecord } from "./types.ts";
// Recover the scroll state at a seek target after the replay becomes visible.
export function scrollStateAt(events: ExternalRecord[], timestamp: number) {
  const positions = new Map<number, { x: number; y: number }>();
  function visit(node: ExternalRecord) {
    const a = node.attributes || {};
    if ("rr_scrollTop" in a || "rr_scrollLeft" in a)
      positions.set(node.id, {
        x: Number(a.rr_scrollLeft) || 0,
        y: Number(a.rr_scrollTop) || 0,
      });
    for (const child of node.childNodes || []) visit(child);
  }
  for (const event of events) {
    if (event.timestamp > timestamp) break;
    if (event.type === 2) {
      positions.clear();
      visit(event.data.node);
    }
    if (event.type === 3 && event.data.source === 3)
      positions.set(event.data.id, { x: event.data.x, y: event.data.y });
  }
  return positions;
}
