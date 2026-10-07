import type { RoomEvent, SerializedNode } from "../replay/types.ts";
// DOM is retained as a style/layout template; viewer activity is not session state.
export function roomEventFilter() {
  const cameras = new Map<number, string>(),
    ignored = new Set<number>();
  function visit(
    node: SerializedNode | undefined,
    ancestors: SerializedNode[] = [],
    hidden = false,
  ) {
    if (!node) return;
    const a = node.attributes || {};
    delete a.rr_scrollTop;
    delete a.rr_scrollLeft;
    hidden =
      hidden ||
      ["tooltip", "dialog", "alert"].includes(String(a.role)) ||
      String(a.class || "")
        .split(" ")
        .includes("MuiDialog-root");
    if (hidden) {
      ignored.add(node.id);
      if (node.type === 3) node.textContent = "";
      if (node.type === 2) {
        node.attributes = { ...a, hidden: "", style: "display:none" };
      }
    }
    if (a["data-field-object"]) {
      const scale = ancestors.at(-1),
        move = ancestors.at(-2);
      if (
        typeof scale?.attributes?.style === "string" &&
        scale.attributes.style.includes("scale(") &&
        typeof move?.attributes?.style === "string" &&
        move.attributes.style.includes("translate(")
      ) {
        cameras.set(scale.id, "scale(1)");
        cameras.set(move.id, "translate(0px,0px)");
        scale.attributes.style = "transform:scale(1)";
        move.attributes.style = "transform:translate(0px,0px)";
      }
    }
    for (const child of node.childNodes || [])
      visit(child, [...ancestors, node], hidden);
  }
  return (event: RoomEvent): RoomEvent | null => {
    if (event.type === 4)
      return { ...event, data: { ...event.data, width: 1280, height: 720 } };
    if (event.type === 2) {
      visit(event.data.node);
      event.data.initialOffset = { top: 0, left: 0 };
    }
    if (event.type === 3) {
      const d = event.data;
      if ([1, 2, 3, 4, 5, 6, 12].includes(d.source ?? -1)) return null;
      if (d.source === 0) {
        for (const add of d.adds || [])
          visit(add.node, [], ignored.has(add.parentId ?? -1));
        d.texts = d.texts?.filter((n) => !ignored.has(n.id));
        d.attributes = d.attributes
          ?.filter((n) => !ignored.has(n.id))
          .map((n) => {
            if (cameras.has(n.id) && n.attributes.style !== undefined)
              return {
                ...n,
                attributes: {
                  ...n.attributes,
                  style: "transform:" + cameras.get(n.id),
                },
              };
            return n;
          });
      }
    }
    return event;
  };
}
