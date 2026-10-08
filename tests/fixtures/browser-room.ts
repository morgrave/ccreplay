import type { ExternalRecord } from "../../src/core/types.ts";

const runtime = window as unknown as ExternalRecord;
const state: ExternalRecord = {
  entities: {
    rooms: {
      entities: { test: { name: "Test", messageChannels: ["main"] } },
    },
    roomCharacters: {
      entities: {
        token: {
          id: "token",
          active: true,
          name: "Token",
          x: 0,
          y: 0,
          width: 2,
          height: 2,
        },
      },
    },
    roomMessages: {
      entities: {
        initial: { name: "NPC", text: "existing chat", channel: "main" },
      },
    },
  },
};
const listeners = new Set<() => void>();
const store = {
  getState: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
(
  document.querySelector("#root") as unknown as ExternalRecord
).__reactFiber$fixture = { memoizedProps: { store } };
runtime.__updateFixture = () => {
  state.entities.roomCharacters.entities.token.x = 100;
  state.entities.roomMessages.entities.new = {
    name: "NPC",
    text: "new chat",
    channel: "main",
  };
  document.querySelector("[data-field-object]")!.textContent = "changed scene";
  for (const fn of listeners) fn();
};
runtime.__startFixtureAudio = async () => {
  const audio = new Audio("https://ccfolia.com/test.wav");
  audio.loop = true;
  runtime.__fixtureAudio = audio;
  await audio.play();
};
