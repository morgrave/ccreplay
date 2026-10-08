import test from "node:test";
import assert from "node:assert/strict";
import { isReplayAsset, replayWarnings } from "../src/core/resource-policy.ts";
import { createStyleCollector } from "../recorder/capture-styles.ts";

test("script warnings are excluded while genuine missing images and BGM remain visible", () => {
  const warnings = [
    "자산 저장 실패: https://www.googletagmanager.com/gtag/js?id=G-TEST (허용된 자산 호스트가 아닙니다.)",
    "자산 저장 실패: https://www.youtube.com/iframe_api (허용된 자산 호스트가 아닙니다.)",
    "자산 저장 실패: https://www.youtube.com/s/player/widget.js (허용된 자산 호스트가 아닙니다.)",
    "자산 저장 실패: https://storage.ccfolia-cdn.net/bg.png (HTTP 404)",
    "자산 저장 실패: https://storage.ccfolia-cdn.net/bgm.mp3 (HTTP 403)",
    "코코포리아 상태 연결 실패",
  ];
  assert.deepEqual(replayWarnings(warnings), warnings.slice(3));
  assert(!isReplayAsset("text/javascript"));
  assert(!isReplayAsset("text/html"));
  assert(isReplayAsset("text/css"));
  assert(isReplayAsset("audio/mpeg"));
});

test("capture ignores script and iframe dependencies but still collects scene images", () => {
  const urls: string[] = [];
  const collector = createStyleCollector(
    (url) => urls.push(url),
    undefined,
    "https://ccfolia.com/rooms/test",
  );
  collector.event({
    type: 2,
    data: {
      node: {
        id: 1,
        tagName: "body",
        childNodes: [
          {
            id: 2,
            tagName: "script",
            attributes: { src: "https://www.youtube.com/iframe_api" },
          },
          {
            id: 3,
            tagName: "iframe",
            attributes: { src: "https://www.youtube.com/embed/test" },
          },
          { id: 4, tagName: "img", attributes: { src: "/image.png" } },
        ],
      },
    },
  });
  assert.deepEqual(urls, ["https://ccfolia.com/image.png"]);
});
