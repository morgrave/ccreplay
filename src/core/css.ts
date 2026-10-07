import {
  parse,
  walk,
  generate,
  ident,
  type CssNode,
  type ListItem,
  type List,
  type WalkContext,
} from "css-tree";

const decoded = (s: unknown) => ident.decode(String(s)).toLowerCase();
// Keep selectors, keyframes, custom properties and rule order intact; rewrite only resource tokens.
export function rewriteCSS(
  source: unknown,
  resolve: (url: string, kind: string) => string,
  context = "stylesheet",
): string {
  if (typeof source !== "string") return "";
  if (context === "stylesheet" && source.includes("/* rr_split */"))
    return source
      .split("/* rr_split */")
      .map((part) => rewriteCSS(part, resolve, context))
      .join("/* rr_split */");
  try {
    const ast = parse(source, { context, parseCustomProperty: true });
    walk(ast, {
      enter(
        this: WalkContext,
        node: CssNode,
        item: ListItem<CssNode>,
        list: List<CssNode>,
      ) {
        if (node.type === "Atrule" && decoded(node.name) === "import") {
          const first =
            node.prelude?.type === "AtrulePrelude"
              ? node.prelude.children.first
              : null;
          const value =
            first && (first.type === "String" || first.type === "Url")
              ? resolve(first.value, "stylesheet")
              : "";
          if (!value) {
            if (list) list.remove(item);
            return this.skip;
          }
          if (first && (first.type === "String" || first.type === "Url"))
            first.value = value;
          return this.skip;
        }
        if (node.type === "Url") node.value = resolve(node.value, "asset");
        if (
          node.type === "Function" &&
          ["image-set", "-webkit-image-set"].includes(decoded(node.name))
        ) {
          node.children.forEach((c) => {
            if (c.type === "String") c.value = resolve(c.value, "asset");
          });
        }
        if (
          node.type === "Raw" &&
          /\\|url\s*\(|image-set\s*\(|@import/i.test(node.value)
        )
          node.value = "";
      },
    });
    return generate(ast);
  } catch {
    return "";
  }
}

export function absoluteURL(value: string, base: string) {
  if (!value || value.startsWith("#") || value.startsWith("data:"))
    return value;
  try {
    return new URL(value, base).href;
  } catch {
    return "";
  }
}
export function collectCSS(
  source: unknown,
  base: string,
  context = "stylesheet",
) {
  const urls: { url: string; kind: string }[] = [];
  const css = rewriteCSS(
    source,
    (value, kind) => {
      const url = absoluteURL(value, base);
      if (/^https?:/.test(url)) urls.push({ url, kind });
      return url;
    },
    context,
  );
  return { css, urls };
}

// WHATWG srcset URL tokens can contain commas, particularly inside data URLs.
export function rewriteSrcset(
  input: unknown,
  resolve: (url: string) => string,
) {
  const candidates = [];
  let rest = String(input || "");
  while (rest.trim()) {
    rest = rest.replace(/^[\s,]+/, "");
    const match = /^\S+/.exec(rest);
    if (!match) break;
    let src = match[0];
    rest = rest.slice(src.length);
    let descriptor = "";
    if (src.endsWith(",")) src = src.replace(/,+$/, "");
    else {
      const end = rest.indexOf(",");
      descriptor = (end < 0 ? rest : rest.slice(0, end)).trim();
      rest = end < 0 ? "" : rest.slice(end + 1);
    }
    const local = resolve(src);
    if (local && (!descriptor || /^\d+(?:\.\d+)?[wx]$/.test(descriptor)))
      candidates.push(local + (descriptor ? " " + descriptor : ""));
  }
  return candidates.join(", ");
}
