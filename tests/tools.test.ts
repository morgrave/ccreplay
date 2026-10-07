import test from "node:test";
import assert from "node:assert/strict";
import { registerReplayTools } from "../src/replay/tools.ts";

test("browser tools use current episode bounds and dispose their registrations", () => {
  type Tool = Parameters<
    NonNullable<Document["modelContext"]>["registerTool"]
  >[0];
  const tools = new Map<string, Tool>();
  const signals: AbortSignal[] = [];
  let duration: number | undefined = 5000;
  let position = 0;
  const dispose = registerReplayTools(
    {
      registerTool(tool, { signal }) {
        tools.set(tool.name, tool);
        signals.push(signal);
      },
    },
    {
      duration: () => duration,
      seek(time) {
        position = time;
        return position;
      },
      search: (query) => (query === "hello" ? 2 : 0),
    },
  );
  const seek = tools.get("replay_seek")!.execute as (input: {
    seconds: number;
  }) => { seconds: number };
  const search = tools.get("replay_search_chat")!.execute as (input: {
    query: string;
  }) => { matches: number };
  assert.deepEqual(seek({ seconds: 2 }), { seconds: 2 });
  assert.equal(position, 2000);
  assert.throws(() => seek({ seconds: 6 }));
  assert.throws(() => seek({ seconds: NaN }));
  assert.deepEqual(search({ query: "hello" }), { matches: 2 });
  assert.throws(() => search({ query: "x".repeat(201) }));
  duration = undefined;
  assert.throws(() => search({ query: "hello" }));
  assert.throws(() => seek({ seconds: 0 }));
  dispose();
  assert.ok(signals.every((signal) => signal.aborted));
});

test("unsupported browser tool APIs do not prevent playback", () => {
  const actions = { duration: () => 0, seek: () => 0, search: () => 0 };
  assert.doesNotThrow(() => registerReplayTools(undefined, actions)());
  assert.doesNotThrow(() =>
    registerReplayTools(
      {
        registerTool() {
          throw Error("unsupported");
        },
      },
      actions,
    )(),
  );
});
