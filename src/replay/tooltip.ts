// CCfolia 1.37.4: theme.ts MuiTooltip + Pieces/Piece.tsx (placement="top").
// Values verified against the archived .css-1vuhgrr rule, independent of hover timing.
export const tokenTooltipStyle: Partial<CSSStyleDeclaration> = {
  backgroundColor: "rgb(22, 22, 22)",
  borderRadius: "4px",
  color: "#fff",
  fontFamily: "Roboto, Helvetica, Arial, sans-serif",
  padding: "4px 8px",
  fontSize: "0.75rem",
  maxWidth: "300px",
  overflowWrap: "break-word",
  fontWeight: "500",
  whiteSpace: "pre-wrap",
  boxShadow:
    "0px 1px 3px 0px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 2px 1px -1px rgba(0,0,0,0.12)",
};
export class TokenTooltip {
  private node: HTMLDivElement | null = null;
  private anchor: Element | null = null;
  private memo = "";
  hide(): void {
    this.node?.remove();
    this.node = null;
    this.anchor = null;
    this.memo = "";
  }
  show(doc: Document, anchor: Element, memo: string): void {
    if (!memo) {
      this.hide();
      return;
    }
    if (this.anchor === anchor && this.memo === memo && this.node?.isConnected)
      return;
    this.hide();
    this.anchor = anchor;
    this.memo = memo;
    const tip = doc.createElement("div");
    tip.id = "ccreplay-live-tooltip";
    tip.role = "tooltip";
    tip.textContent = memo;
    Object.assign(tip.style, tokenTooltipStyle, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
      margin: "0",
    });
    doc.body.append(tip);
    this.node = tip;
    const rect = anchor.getBoundingClientRect(),
      width = doc.documentElement.clientWidth;
    tip.style.left =
      Math.max(
        8,
        Math.min(
          width - tip.offsetWidth - 8,
          rect.left + (rect.width - tip.offsetWidth) / 2,
        ),
      ) + "px";
    tip.style.top =
      (rect.top - tip.offsetHeight - 14 >= 8
        ? rect.top - tip.offsetHeight - 14
        : rect.bottom + 14) + "px";
  }
}
