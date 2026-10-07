import type { ExternalRecord } from "../src/core/types.ts";
import { writeFile, readFile } from "node:fs/promises";
import { readArchive, makeArchive } from "../src/core/archive.ts";
const archive = await readArchive(
  new File(
    [await readFile("work/qa/source-reference.ccreplay")],
    "source.ccreplay",
  ),
);
const d = archive.data,
  start = d.startedAt;
d.reference = false;
d.duration = 3000;
d.title = "원본 CSS·토큰 위치 검증";
const html = d.events[1].data.node.childNodes.find(
    (n: ExternalRecord) => n.tagName === "html",
  ),
  head = html.childNodes.find((n: ExternalRecord) => n.tagName === "head"),
  body = html.childNodes.find((n: ExternalRecord) => n.tagName === "body");
head.childNodes.push({
  type: 2,
  id: 10001,
  tagName: "style",
  attributes: {},
  childNodes: [
    {
      type: 3,
      id: 10002,
      isStyle: true,
      textContent:
        ".qa-token{position:absolute;left:100px;top:200px;width:72px;height:72px;background:#2196f3;color:white;display:grid;place-items:center;z-index:1000}.qa-token-label{font-size:14px}",
    },
  ],
});
body.childNodes.push({
  type: 2,
  id: 10003,
  tagName: "div",
  attributes: { class: "qa-token", "data-field-object": "qa" },
  childNodes: [
    {
      type: 2,
      id: 10004,
      tagName: "span",
      attributes: { class: "qa-token-label" },
      childNodes: [{ type: 3, id: 10005, textContent: "검증 토큰" }],
    },
  ],
});
d.frames = [
  {
    t: 0,
    cellSize: 24,
    room: { fieldWidth: 40, fieldHeight: 30, backgroundColor: "#202020" },
    tokens: [
      {
        iconUrl: "",
        color: "#fff",
        z: 0,
        angle: 0,
        id: "qa",
        name: "검증 토큰",
        memo: "원본 화면에서 토큰 정보 확인",
        x: 100,
        y: 200,
        width: 3,
        height: 3,
        status: [{ label: "HP", value: 10, max: 10 }],
      },
    ],
    items: [],
    bgm: [],
  },
];
d.messages = [
  {
    t: 0,
    id: "m",
    name: "검증",
    text: "첫 장면",
    channel: "main",
    channelName: "메인",
  },
  {
    t: 1000,
    id: "m2",
    name: "검증",
    text: "토큰이 이동했습니다.",
    channel: "main",
    channelName: "메인",
  },
];
d.events.push({
  type: 3,
  timestamp: start! + 1000,
  data: {
    source: 0,
    attributes: [
      { id: 10003, attributes: { style: { transform: "translateX(120px)" } } },
    ],
    texts: [],
    adds: [],
    removes: [],
  },
});
d.events.push({
  type: 3,
  timestamp: start! + 1500,
  data: {
    source: 13,
    id: 10001,
    index: [0],
    set: {
      property: "background-color",
      value: "rgb(220, 0, 78)",
      priority: "",
    },
  },
});
d.events.push({
  type: 3,
  timestamp: start! + 2000,
  data: {
    source: 15,
    id: 1,
    styleIds: [1],
    styles: [
      {
        styleId: 1,
        rules: [{ rule: ".qa-token-label{font-weight:700}", index: 0 }],
      },
    ],
  },
});
// A remote URL sink intentionally outside our attribute allowlist must still be denied by iframe CSP.
body.childNodes.push({
  type: 2,
  id: 10006,
  tagName: "input",
  attributes: {
    type: "image",
    src: "https://example.invalid/replay-beacon",
    style: "display:none",
  },
  childNodes: [],
});
const blobs = d.assets.map((a) => ({
  path: a.path,
  blob: archive.rawAssets!.get(a.url)!,
}));
const result = await makeArchive(d, blobs);
await writeFile(
  "work/qa/styles.ccreplay",
  new Uint8Array(await result.arrayBuffer()),
);
archive.release();
