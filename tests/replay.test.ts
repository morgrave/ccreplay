import type { ExternalRecord } from "../src/core/types.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  frameAt,
  messagesAt,
  audioAt,
  mediaPosition,
  pickState,
  pickMessages,
  validateRecording,
} from "../src/core/model.ts";
import {
  makeArchive,
  readArchive,
  sanitizeEvents,
} from "../src/core/archive.ts";
import { demoRecording, demoSound } from "../src/core/demo.ts";
test("seeking backwards restores token position and HP at that time", () => {
  const d = demoRecording();
  assert.equal(frameAt(d.frames, 60000)!.tokens[0].status[1].value, 56);
  assert.equal(frameAt(d.frames, 10000)!.tokens[0].status[1].value, 58);
  assert.equal(frameAt(d.frames, 0)!.t, 0);
});
test("chat edits and removals are time dependent", () => {
  const e = [
    { id: "a", t: 0, text: "old" },
    { id: "a", t: 10, text: "new" },
    { id: "a", t: 20, removed: true },
  ];
  assert.equal(messagesAt(e, 5)[0].text, "old");
  assert.equal(messagesAt(e, 15)[0].text, "new");
  assert.equal(messagesAt(e, 21).length, 0);
});
test("simultaneous BGM tracks, pause and stop restore at seek", () => {
  const e = [
    { id: "a", t: 0, position: 20, rate: 1 },
    { id: "b", t: 1000, position: 0, rate: 1 },
    { id: "a", t: 2000, position: 22, paused: true },
    { id: "b", t: 3000, stopped: true },
  ];
  assert.equal(audioAt(e, 1500).length, 2);
  assert.equal(
    mediaPosition(
      { ...audioAt(e, 1500)[0], position: audioAt(e, 1500)[0].position! },
      1500,
    ),
    21.5,
  );
  assert.equal(
    mediaPosition(
      { ...audioAt(e, 4000)[0], position: audioAt(e, 4000)[0].position! },
      4000,
    ),
    22,
  );
  assert.equal(audioAt(e, 4000).length, 1);
});
function state() {
  return {
    app: { user: { uid: "me" }, state: { roomScreenCellSize: 24 } },
    entities: {
      rooms: {
        entities: {
          room: {
            name: "test",
            owner: "SECRET",
            soundMasterToken: "NEVER_EXPORT",
            fieldWidth: 40,
            fieldHeight: 30,
            messageGroups: [
              { id: "private", kind: "private", uids: ["someone"] },
              { id: "joined", kind: "private", uids: ["me"] },
            ],
            markers: {},
          },
        },
      },
      roomCharacters: {
        entities: {
          c: {
            active: true,
            name: "name",
            memo: "memo",
            hideStatus: true,
            status: [{ label: "HP", value: 99 }],
            commands: "SECRET",
            owner: "SECRET",
          },
        },
      },
      roomItems: {
        entities: {
          card: {
            closed: true,
            imageUrl: "https://ccfolia.com/front.png",
            memo: "HIDDEN",
            coverImageUrl: "https://ccfolia.com/back.png",
          },
        },
      },
      roomMessages: { entities: {} },
    },
  };
}
test("state whitelist excludes auth data and hidden card face/status", () => {
  const s = state();
  const d = pickState(s, "room", {
    card: { imageUrl: "https://ccfolia.com/back.png" },
  });
  assert.equal(d.items[0].imageUrl, "https://ccfolia.com/back.png");
  assert.equal(d.items[0].text, "");
  assert.equal(d.tokens[0].status.length, 0);
  assert(!JSON.stringify(d).includes("SECRET"));
  assert(!JSON.stringify(d).includes("NEVER_EXPORT"));
  assert(!JSON.stringify(d).includes("front.png"));
});
test("messages enforce recipient, channel membership and secret dice visibility", () => {
  const s = state();
  s.entities.roomMessages.entities = {
    public: { channel: "main", text: "hello" },
    dm: { channel: "dm", to: "other", from: "third", text: "hidden" },
    mine: { channel: "dm", to: "me", from: "third", text: "mine" },
    private: { channel: "private", text: "hidden" },
    joined: { channel: "joined", text: "ok" },
    unknown: { channel: "unknown", text: "hidden" },
    secret: {
      channel: "main",
      from: "other",
      text: "SENSITIVE DICE",
      extend: { roll: { secret: true } },
    },
    removed: { channel: "main", text: "secret deleted", removed: true },
  };
  const result = pickMessages(s, "room", true);
  assert.deepEqual(
    result.map((x) => x.id),
    ["public", "mine", "joined", "secret", "removed"],
  );
  assert.equal(result.find((x) => x.id === "secret")!.text, "Secret dice 🎲");
  assert.equal(result.find((x) => x.id === "removed")!.text, "");
  assert(!JSON.stringify(result).includes("SENSITIVE"));
  assert(!JSON.stringify(result).includes("third"));
});
test("archive round-trip embeds BGM bytes and retains events", async () => {
  const d = demoRecording(),
    audio = demoSound();
  d.assets = [
    {
      url: "demo:audio",
      path: "assets/tone",
      mime: "audio/wav",
      size: audio.size,
    },
  ];
  const blob = await makeArchive(d, [{ path: "assets/tone", blob: audio }]);
  const loaded = await readArchive(new File([blob], "session.ccreplay"));
  assert.equal(loaded.data.frames.length, 31);
  assert.equal(loaded.data.messages.length, 11);
  assert.equal(
    (await (await fetch(loaded.assets.get("demo:audio")!)).blob()).size,
    audio.size,
  );
  loaded.release();
});
test("malformed archives and future versions fail explicitly", async () => {
  await assert.rejects(() => readArchive(new File(["bad"], "bad.ccreplay")));
  const d = demoRecording();
  d.version = 100;
  assert.throws(() => validateRecording(d), /지원하지/);
  d.version = 1;
  d.frames[2].t = -1;
  assert.throws(() => validateRecording(d), /시간 순서/);
});
test("untrusted rrweb scripts and network CSS are neutralized", () => {
  const el = (
    tagName: string,
    id: number,
    attributes = {},
    childNodes: ExternalRecord[] = [],
  ): ExternalRecord => ({
    type: 2,
    id,
    tagName,
    attributes,
    childNodes,
  });
  const head = el("head", 3);
  const body = el("body", 4, {}, [
    el("script", 5, { src: "https://evil/script" }),
    el("img", 6, {
      src: "https://evil/beacon",
      onerror: "steal()",
      style: "background:url(https://evil/bg)",
    }),
  ]);
  const e = [
    {
      type: 2,
      timestamp: 1,
      data: {
        node: { type: 0, id: 1, childNodes: [el("html", 2, {}, [head, body])] },
      },
    },
    {
      type: 3,
      timestamp: 2,
      data: {
        source: 13,
        set: { property: "background", value: "url(https://evil/a)" },
      },
    },
    {
      type: 3,
      timestamp: 3,
      data: { source: 10, fontSource: "url(https://evil/font)" },
    },
  ];
  const result = sanitizeEvents(e, new Map());
  assert.equal(result.length, 2);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("evil"));
  assert(!serialized.includes("steal()"));
  assert(serialized.includes("content-security-policy"));
  assert(serialized.includes("connect-src 'none'"));
});
