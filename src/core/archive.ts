import type {
  Recording,
  RecordingData,
  Asset,
  ExternalRecord,
} from "./types.ts";
import type { Zippable } from "fflate";
import { strToU8, strFromU8 } from "fflate";
import { compress } from "./compression.ts";
import { validateRecording } from "./model.ts";
import { rewriteCSS, rewriteSrcset, absoluteURL } from "./css.ts";
const LIMIT = 1024 * 1024 * 1024;
export async function readArchive(
  file: File,
  options: {
    loadAsset?: (asset: Asset) => Promise<Uint8Array<ArrayBuffer>>;
  } = {},
): Promise<Recording> {
  if (file.size > LIMIT)
    throw new Error(
      "1 GB 이하의 기록 파일을 열어주세요. 큰 세션은 나누어 기록하는 것을 권장합니다.",
    );
  if (/\.json$/i.test(file.name))
    return {
      data: validateRecording(JSON.parse(await file.text())),
      assets: new Map(),
      release() {},
    };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await compress({
    operation: "unzip",
    input: bytes,
    recordingOnly: true,
  });
  if (!files["recording.json"])
    throw new Error("기록 데이터(recording.json)가 없는 파일입니다.");
  const data = validateRecording(
    JSON.parse(strFromU8(files["recording.json"])),
  );
  if (
    data.assetStorage === "sha256-chunks-v1" &&
    (data.assets || []).reduce((n, a) => n + (Number(a.size) || 0), 0) > LIMIT
  )
    throw Error("에피소드 전체 자산이 1 GB를 넘습니다.");
  if (data.assetStorage === "sha256-chunks-v1" && !options.loadAsset)
    throw Error(
      "공용 자산을 참조하는 회차입니다. 캠페인 목록에서 열거나 자산이 포함된 파일을 사용하세요.",
    );
  const assets = new Map<string, string>();
  const rawAssets = new Map<string, Blob>();
  const urls: string[] = [];
  const styles = new Map<string, string>();
  for (const a of data.assets || []) {
    if (typeof a.url !== "string" || !/^assets\/[^/]+$/.test(a.path)) continue;
    let bytes = files[a.path];
    if (!bytes && options.loadAsset && a.sha256)
      bytes = await options.loadAsset(a);
    if (!bytes) continue;
    rawAssets.set(
      a.url,
      new Blob([new Uint8Array(bytes)], {
        type: a.mime || "application/octet-stream",
      }),
    );
    if (a.mime === "text/css") {
      styles.set(a.url, strFromU8(bytes));
      continue;
    }
    const mime =
      /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|audio\/[\w.+-]+|video\/[\w.+-]+|font\/[\w.+-]+|application\/(octet-stream|font-woff))$/i.test(
        a.mime,
      )
        ? a.mime
        : "application/octet-stream";
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: mime }),
    );
    assets.set(a.url, url);
    urls.push(url);
  }
  const resolving = new Set();
  const resolveStyle = (u: string): string => {
    if (assets.has(u)) return assets.get(u)!;
    if (!styles.has(u) || resolving.has(u)) return "";
    resolving.add(u);
    const css = rewriteCSS(styles.get(u), (v, kind) => {
      const key = absoluteURL(v, u);
      return v.startsWith("#") ||
        /^data:(?:image\/(?:png|jpeg|gif|webp|avif)|font\/[\w.+-]+);base64,/i.test(
          v,
        )
        ? v
        : kind === "stylesheet"
          ? resolveStyle(key)
          : assets.get(key) || "";
    });
    const local = URL.createObjectURL(new Blob([css], { type: "text/css" }));
    assets.set(u, local);
    urls.push(local);
    resolving.delete(u);
    return local;
  };
  for (const u of styles.keys()) resolveStyle(u);
  return {
    data,
    assets,
    rawAssets,
    release() {
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}
export async function makeArchive(
  data: RecordingData,
  blobs: { path: string; blob: Blob }[] = [],
) {
  const entries: Zippable = { "recording.json": strToU8(JSON.stringify(data)) };
  for (const a of blobs) {
    entries[a.path] = [
      new Uint8Array(await a.blob.arrayBuffer()),
      { level: 0 },
    ];
  }
  return new Blob(
    [await compress({ operation: "zip", input: entries, level: 6 })],
    { type: "application/zip" },
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
// Rebuild styles without restoring scripts, navigation, or remote network access.
export function sanitizeEvents(
  events: ExternalRecord[],
  assets: Map<string, string>,
) {
  const sentinel = 2000000001,
    styleNodes = new Set(),
    tagNames = new Map();
  const policy =
    "default-src 'none'; img-src blob: data:; media-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  let base =
    events.find((e) => e.type === 4)?.data?.href || "https://ccfolia.com/";
  const resolve = (value: unknown) => {
    const v = String(value || "");
    return /^#[\w:.-]+$/.test(v)
      ? v
      : assets.get(v) ||
          assets.get(absoluteURL(v, base)) ||
          (/^data:(?:image\/(?:png|jpeg|gif|webp|avif)|font\/[\w.+-]+);base64,/i.test(
            v,
          )
            ? v
            : "");
  };
  const css = (v: unknown, context = "stylesheet") =>
    rewriteCSS(v, resolve, context);
  function style(value: unknown) {
    if (value === null) return null;
    if (typeof value === "string") return css(value, "declarationList");
    if (!value || typeof value !== "object") return "";
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        v === false
          ? false
          : Array.isArray(v)
            ? [css(v[0], "value"), v[1] === "important" ? "important" : ""]
            : css(v, "value"),
      ]),
    );
  }
  function attr(key: string, value: unknown, tag: string) {
    if (value === null) return null;
    const k = key.toLowerCase();
    if (
      k.startsWith("on") ||
      [
        "srcdoc",
        "action",
        "formaction",
        "integrity",
        "nonce",
        "autofocus",
      ].includes(k)
    )
      return "";
    if (k === "style") return style(value);
    if (k === "_csstext") return css(value);
    if (["src", "poster", "rr_dataurl", "background"].includes(k))
      return resolve(value);
    if (k === "srcset") return rewriteSrcset(value, resolve);
    if (k === "href" || k === "xlink:href")
      return ["use", "image", "feimage", "link"].includes(tag)
        ? resolve(value)
        : "";
    if (
      [
        "fill",
        "stroke",
        "filter",
        "clip-path",
        "mask",
        "marker-start",
        "marker-mid",
        "marker-end",
      ].includes(k)
    )
      return css(String(value), "value");
    if (k === "value") return ""; // Unsubmitted input is masked at capture and replay.
    return value;
  }
  function node(n: ExternalRecord, parent = "") {
    if (!n || typeof n !== "object") return n;
    const out = { ...n };
    if (out.id >= 2000000000) out.id = -2;
    const tag = String(n.tagName || "").toLowerCase();
    tagNames.set(n.id, tag);
    if (
      [
        "script",
        "iframe",
        "object",
        "embed",
        "base",
        "meta",
        "audio",
        "video",
      ].includes(tag)
    ) {
      out.tagName = "span";
      out.attributes = {};
      out.childNodes = [];
      return out;
    }
    if (tag === "form") out.tagName = "div";
    if (tag === "style" || n.isStyle || parent === "style")
      styleNodes.add(n.id);
    if (n.attributes)
      out.attributes = Object.fromEntries(
        Object.entries(n.attributes).map(([k, v]) => [k, attr(k, v, tag)]),
      );
    if (n.type === 3 && styleNodes.has(n.id))
      out.textContent = css(n.textContent);
    if (n.childNodes)
      out.childNodes = n.childNodes.map((c: ExternalRecord) => node(c, tag));
    if (tag === "head")
      out.childNodes = [
        {
          type: 2,
          tagName: "meta",
          attributes: {
            "http-equiv": "content-security-policy",
            content: policy,
          },
          childNodes: [],
          id: sentinel,
        },
        ...(out.childNodes || []),
      ];
    return out;
  }
  const output = [];
  for (const event of events) {
    if (
      event.type === 6 ||
      (event.type === 3 && [9, 11].includes(event.data?.source))
    )
      continue;
    const e = structuredClone(event),
      d = e.data;
    if (e.type === 4 && d.href) base = d.href;
    if (e.type === 2) d.node = node(d.node);
    if (e.type === 3) {
      if (d.source === 0) {
        d.removes = d.removes?.filter((a: ExternalRecord) => a.id < sentinel);
        d.adds = d.adds
          ?.filter((a: ExternalRecord) => a.parentId < sentinel)
          .map((a: ExternalRecord) => ({
            ...a,
            node: node(a.node, tagNames.get(a.parentId)),
          }));
        d.attributes = d.attributes
          ?.filter((a: ExternalRecord) => a.id < sentinel)
          .map((a: ExternalRecord) => ({
            ...a,
            attributes: Object.fromEntries(
              Object.entries(a.attributes || {}).map(([k, v]) => [
                k,
                attr(k, v, tagNames.get(a.id)),
              ]),
            ),
          }));
        d.texts = d.texts
          ?.filter((a: ExternalRecord) => a.id < sentinel)
          .map((t: ExternalRecord) => ({
            ...t,
            value: styleNodes.has(t.id) ? css(t.value) : t.value,
          }));
      }
      if (d.source === 8) {
        d.adds = d.adds?.map((a: ExternalRecord) => ({
          ...a,
          rule: css(a.rule),
        }));
        for (const key of ["replace", "replaceSync"])
          if (typeof d[key] === "string") d[key] = css(d[key]);
      }
      if (d.source === 13 && d.set)
        d.set.value = d.set.value === null ? null : css(d.set.value, "value");
      if (d.source === 15)
        d.styles = d.styles?.map((s: ExternalRecord) => ({
          ...s,
          rules: s.rules.map((r: ExternalRecord) => ({
            ...r,
            rule: css(r.rule),
          })),
        }));
      if (d.source === 10) {
        if (d.buffer) {
          try {
            const bytes = JSON.parse(d.fontSource);
            if (
              !Array.isArray(bytes) ||
              bytes.length > 20 * 1024 * 1024 ||
              bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)
            )
              continue;
          } catch {
            continue;
          }
        } else {
          d.fontSource = css(d.fontSource, "value");
          if (!d.fontSource || d.fontSource.includes("url()")) continue;
        }
      }
    }
    output.push(e);
  }
  return output;
}
