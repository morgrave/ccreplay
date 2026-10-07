import type { ExternalRecord } from "../src/core/types.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeEvents,
  makeArchive,
  readArchive,
} from "../src/core/archive.ts";
import { collectCSS, rewriteCSS, rewriteSrcset } from "../src/core/css.ts";
import { createStyleCollector } from "../extension/capture-styles.ts";
const el = (
  tagName: string,
  id: number,
  attributes = {},
  childNodes: ExternalRecord[] = [],
): ExternalRecord => ({
  type: 2,
  tagName,
  id,
  attributes,
  childNodes,
});
test("stylesheet snapshots, CSSOM edits, adopted rules, fragments and normal chat survive", () => {
  const events = [
    {
      type: 2,
      timestamp: 1,
      data: {
        node: el("html", 1, {}, [
          el("head", 2, {}, [
            el("link", 3, {
              rel: "stylesheet",
              _cssText: ".x{color:red}/* rr_split */.y{color:blue}",
              media: "screen",
            }),
            el("style", 4, {}, [
              {
                type: 3,
                id: 5,
                isStyle: true,
                textContent: ".a{transform:translateX(2px)}",
              },
            ]),
          ]),
          el("body", 6, {}, [
            el("form", 7, {}, [el("input", 8)]),
            el("svg", 9, {}, [el("use", 10, { href: "#dice" })]),
            { type: 3, id: 11, textContent: "url(https://chat.test)" },
          ]),
        ]),
      },
    },
    {
      type: 3,
      timestamp: 2,
      data: {
        source: 0,
        attributes: [
          {
            id: 7,
            attributes: {
              style: {
                transform: "translateX(123px)",
                opacity: [".5", "important"],
                display: false,
              },
            },
          },
          { id: 8, attributes: { style: null } },
        ],
        texts: [
          { id: 11, value: "url(https://chat.test)" },
          { id: 5, value: ".x{background:url(https://file.test/bg)}" },
        ],
      },
    },
    {
      type: 3,
      timestamp: 3,
      data: {
        source: 8,
        id: 4,
        replaceSync: ".x{background:url(https://file.test/bg)}",
        adds: [{ rule: ".a{color:green}", index: 0 }],
      },
    },
    {
      type: 3,
      timestamp: 4,
      data: {
        source: 13,
        id: 4,
        index: [0],
        set: {
          property: "transform",
          value: "translate(30px, 40px)",
          priority: "important",
        },
      },
    },
    {
      type: 3,
      timestamp: 5,
      data: {
        source: 15,
        id: 6,
        styleIds: [19],
        styles: [
          {
            styleId: 19,
            rules: [{ rule: ".x{fill:url(#gradient)}", index: 0 }],
          },
        ],
      },
    },
  ];
  const result = sanitizeEvents(
    events,
    new Map([["https://file.test/bg", "blob:bg"]]),
  );
  const html = result[0].data.node;
  assert(
    html.childNodes[0].childNodes[1].attributes._cssText.includes(
      "/* rr_split */",
    ),
  );
  assert.equal(html.childNodes[1].childNodes[0].tagName, "div");
  assert.equal(html.childNodes[1].childNodes[0].childNodes.length, 1);
  assert.equal(
    html.childNodes[1].childNodes[1].childNodes[0].attributes.href,
    "#dice",
  );
  assert.deepEqual(result[1].data.attributes[0].attributes.style, {
    transform: "translateX(123px)",
    opacity: [".5", "important"],
    display: false,
  });
  assert.equal(result[1].data.attributes[1].attributes.style, null);
  assert.equal(result[1].data.texts[0].value, "url(https://chat.test)");
  assert(result[1].data.texts[1].value.includes("blob:bg"));
  assert(result[2].data.replaceSync.includes("blob:bg"));
  assert.equal(result[3].data.set.value, "translate(30px,40px)");
  assert(result[4].data.styles[0].rules[0].rule.includes("#gradient"));
});
test("CSS resource parser handles imports, image sets, srcsets and escaped network attempts", () => {
  const source =
    '@import "theme.css" screen;.x{background:image-set("a.png" 1x,url(b.png) 2x);mask:url(#mask)}';
  const c = collectCSS(source, "https://ccfolia.com/css/base.css");
  assert.deepEqual(
    c.urls.map((x) => x.url),
    [
      "https://ccfolia.com/css/theme.css",
      "https://ccfolia.com/css/a.png",
      "https://ccfolia.com/css/b.png",
    ],
  );
  const hostile =
    '@im\\70ort "https://evil.test/import";x{background:u\\72l(https://evil.test/a);mask:image-set("https://evil.test/b" 1x);--x:url(https://evil.test/c)}';
  assert(!rewriteCSS(hostile, () => "").includes("evil.test"));
  const inline = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(
    rewriteSrcset(inline + " 1x, https://file.test/a 2x", (v) =>
      v === inline ? v : "blob:a",
    ),
    inline + " 1x, blob:a 2x",
  );
});
test("CSS archives preserve source bytes across export and reimport, including nested fonts and data images", async () => {
  const originals = new Map([
    [
      "https://ccfolia.com/css/main.css",
      new Blob(
        [
          '@import "nested.css";.x{background:url(data:image/png;base64,aGVsbG8=)}',
        ],
        { type: "text/css" },
      ),
    ],
    [
      "https://ccfolia.com/css/nested.css",
      new Blob(["@font-face{font-family:test;src:url(../f.woff2)}"], {
        type: "text/css",
      }),
    ],
    ["https://ccfolia.com/f.woff2", new Blob(["font"], { type: "font/woff2" })],
  ]);
  const data = {
    format: "ccreplay",
    version: 1,
    duration: 0,
    frames: [],
    messages: [],
    audio: [],
    events: [],
    assets: [...originals].map(([url, blob], i) => ({
      url,
      path: "assets/" + i,
      mime: blob.type,
      size: blob.size,
    })),
  };
  const archive = await makeArchive(
    data,
    [...originals].map(([, blob], i) => ({ path: "assets/" + i, blob })),
  );
  const first = await readArchive(new File([archive], "first.ccreplay"));
  const css = await (await fetch(first.assets.get(data.assets[0].url)!)).text();
  assert(css.includes("blob:"));
  assert(css.includes("data:image/png"));
  const exported = await makeArchive(
    data,
    data.assets.map((a) => ({
      path: a.path,
      blob: first.rawAssets!.get(a.url)!,
    })),
  );
  first.release();
  const second = await readArchive(new File([exported], "second.ccreplay"));
  const nested = await (
    await fetch(second.assets.get(data.assets[1].url)!)
  ).text();
  assert(nested.includes("blob:"));
  assert(!nested.includes("url()"));
  second.release();
});
test("capture normalizes dynamic CSS resource bases and includes fonts and responsive images", () => {
  const resources: { url: string; kind?: string }[] = [];
  const collector = createStyleCollector(
    (url, kind) => resources.push({ url, kind }),
    {
      getNode: () =>
        ({
          sheet: { href: "https://ccfolia.com/css/base.css" },
        }) as unknown as Node,
    },
    "https://ccfolia.com/rooms/test",
  );
  const rule = {
    type: 3,
    data: {
      source: 8,
      id: 7,
      adds: [{ rule: ".x{background:url(../img/bg.png)}" }],
    },
  };
  collector.event(rule);
  assert(rule.data.adds[0].rule.includes("https://ccfolia.com/img/bg.png"));
  collector.event({
    type: 3,
    data: { source: 10, fontSource: "url(/font.woff2)", buffer: false },
  });
  collector.event({
    type: 2,
    data: { node: el("img", 1, { srcset: "/a.png 1x, /b.png 2x" }) },
  });
  assert.deepEqual(
    resources.map((x) => x.url),
    [
      "https://ccfolia.com/img/bg.png",
      "https://ccfolia.com/font.woff2",
      "https://ccfolia.com/a.png",
      "https://ccfolia.com/b.png",
    ],
  );
});
