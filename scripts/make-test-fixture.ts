import type { ExternalRecord } from "../src/core/types.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { demoRecording, demoSound } from "../src/core/demo.ts";
import { makeArchive } from "../src/core/archive.ts";
const d = demoRecording();
d.title = "파일 왕복 검증 세션";
d.demo = false;
const node = (
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
d.events = [
  {
    type: 4,
    timestamp: d.startedAt,
    data: { href: "https://ccfolia.com/rooms/test", width: 800, height: 450 },
  },
  {
    type: 2,
    timestamp: d.startedAt! + 1,
    data: {
      initialOffset: { top: 0, left: 0 },
      node: {
        type: 0,
        id: 1,
        childNodes: [
          node("html", 2, {}, [
            node("head", 3, {}, [
              node("style", 4, {}, [
                {
                  type: 3,
                  id: 5,
                  isStyle: true,
                  textContent:
                    "body{background:#1d2834;color:#edc16b;font:32px sans-serif;display:grid;place-items:center;height:100vh;margin:0}",
                },
              ]),
            ]),
            node("body", 6, {}, [
              node("p", 7, {}, [
                { type: 3, id: 8, textContent: "기록 화면 검증 · 0초" },
              ]),
            ]),
          ]),
        ],
      },
    },
  },
  {
    type: 3,
    timestamp: d.startedAt! + 1000,
    data: {
      source: 0,
      texts: [{ id: 8, value: "기록 화면 검증 · 1초" }],
      attributes: [],
      removes: [],
      adds: [],
    },
  },
];
const blob = demoSound();
d.assets = [
  {
    url: "demo:audio",
    path: "assets/tone",
    mime: "audio/wav",
    size: blob.size,
  },
];
const archive = await makeArchive(d, [{ path: "assets/tone", blob }]);
await mkdir("work/qa", { recursive: true });
await writeFile(
  "work/qa/fixture.ccreplay",
  new Uint8Array(await archive.arrayBuffer()),
);
