import type { ExternalRecord } from "../src/core/types.ts";
import { collectCSS, absoluteURL, rewriteSrcset } from "../src/core/css.ts";

// Normalize resource URLs before rrweb loses the original stylesheet base URL.
export function createStyleCollector(
  asset: (url: string, kind?: string) => void,
  mirror: { getNode(id: number): Node | null } | undefined,
  base: string,
) {
  const styleIds = new Set(),
    tags = new Map();
  const css = (text: unknown, context = "stylesheet", href = base) => {
    const result = collectCSS(text, href, context);
    for (const { url, kind } of result.urls) asset(url, kind);
    return result.css;
  };
  const resource = (v: string, href = base, kind?: string) => {
    const u = absoluteURL(v, href);
    if (/^https?:/.test(u)) asset(u, kind);
    return u;
  };
  const style = (v: unknown, href?: string) => {
    if (typeof v === "string") return css(v, "declarationList", href);
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        x === false
          ? false
          : Array.isArray(x)
            ? [css(x[0], "value", href), x[1]]
            : css(x, "value", href),
      ]),
    );
  };
  function attrs(values: ExternalRecord, tag?: string, href = base) {
    for (const [key, v] of Object.entries(values || {})) {
      if (v === null) continue;
      const k = key.toLowerCase();
      if (k === "_csstext") values[key] = css(v, "stylesheet", href);
      else if (k === "style") values[key] = style(v, href);
      else if (["src", "poster", "rr_dataurl"].includes(k))
        values[key] = resource(String(v));
      else if (k === "href" && tag === "link" && values.rel === "stylesheet")
        values[key] = resource(String(v), base, "stylesheet");
      else if (k === "srcset")
        values[key] = rewriteSrcset(v, (u) => resource(u));
      else if (
        ["fill", "stroke", "filter", "clip-path", "mask"].includes(k) &&
        String(v).includes("url")
      )
        values[key] = css(v, "value");
    }
    return values;
  }
  function node(n: ExternalRecord, parent?: string) {
    if (!n) return;
    tags.set(n.id, n.tagName);
    if (n.isStyle || n.tagName === "style" || parent === "style")
      styleIds.add(n.id);
    const href =
      n.tagName === "link" ? absoluteURL(n.attributes?.href || "", base) : base;
    attrs(n.attributes, n.tagName, href);
    if (n.type === 3 && styleIds.has(n.id)) n.textContent = css(n.textContent);
    for (const c of n.childNodes || []) node(c, n.tagName);
  }
  function event(e: ExternalRecord) {
    const d = e.data;
    if (e.type === 2) node(d.node);
    if (e.type !== 3) return e;
    const element = mirror?.getNode(d.id) as HTMLLinkElement | null;
    const href = element?.sheet?.href || element?.href || base;
    if (d.source === 0) {
      for (const a of d.adds || []) node(a.node, tags.get(a.parentId));
      for (const a of d.attributes || []) attrs(a.attributes, tags.get(a.id));
      for (const t of d.texts || [])
        if (styleIds.has(t.id)) t.value = css(t.value);
    }
    if (d.source === 8) {
      for (const a of d.adds || []) a.rule = css(a.rule, "stylesheet", href);
      for (const k of ["replace", "replaceSync"])
        if (typeof d[k] === "string") d[k] = css(d[k], "stylesheet", href);
    }
    if (d.source === 13 && typeof d.set?.value === "string")
      d.set.value = css(d.set.value, "value", href);
    if (d.source === 15)
      for (const s of d.styles || [])
        for (const r of s.rules || []) r.rule = css(r.rule);
    if (d.source === 10 && !d.buffer) d.fontSource = css(d.fontSource, "value");
    return e;
  }
  return { event, resource };
}
