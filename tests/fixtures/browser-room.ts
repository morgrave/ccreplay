import type { ExternalRecord } from "../../src/core/types.ts";

const runtime = window as unknown as ExternalRecord;
const state: ExternalRecord = {
  app: { state: { roomChatTab: "main" } },
  entities: {
    rooms: {
      entities: {
        test: {
          name: "Test",
          messageChannels: ["main", "info", "other"],
          messageGroups: [
            { id: "qa", name: "QA", kind: "public" },
            {
              id: "private",
              name: "hidden",
              kind: "private",
              uids: ["someone"],
            },
          ],
        },
      },
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
const tabs = document.createElement("div");
tabs.role = "tablist";
document.querySelector("#root")!.append(tabs);
const addTab = (channel: string) => {
  const button = document.createElement("button");
  button.textContent = channel;
  // Sortable CCfolia tabs carry their channel in React props, not a DOM id.
  (button as unknown as ExternalRecord).__reactFiber$fixture = {
    memoizedProps: {},
    return: { memoizedProps: { value: channel } },
  };
  button.onclick = () => {
    state.app.state.roomChatTab = channel;
    state.app.state.roomChatChannelLoaded ||= {};
    state.app.state.roomChatChannelLoaded[channel] = true;
    for (const fn of listeners) fn();
  };
  tabs.append(button);
};
for (const channel of ["main", "info", "other", "qa", "private"])
  addTab(channel);
runtime.__addPublicFixtureTab = () => {
  state.entities.rooms.entities.test.messageGroups.push({
    id: "later",
    name: "Later",
    kind: "public",
  });
  addTab("later");
};
runtime.__prepareLatePanel = () => {
  state.entities.roomItems = {
    entities: {
      oldPanel: {
        active: true,
        imageUrl: "https://ccfolia.com/test.png",
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        updatedAt: 1,
      },
    },
  };
};
runtime.__hydrateLatePanel = () => {
  const panel = document.createElement("div");
  panel.dataset.fieldObject = "oldPanel";
  const image = document.createElement("img");
  image.src = "https://ccfolia.com/test.png";
  panel.append(image);
  document.querySelector("#root")!.append(panel);
  for (const fn of listeners) fn();
};
runtime.__updateFixture = () => {
  state.entities.roomCharacters.entities.token.x = 100;
  state.entities.roomMessages.entities.new = {
    name: "NPC",
    text: "new chat",
    channel: "main",
  };
  document.querySelector("[data-field-object]")!.textContent = "changed scene";
  for (const channel of ["info", "other", "qa", "private"]) {
    state.entities.roomMessages.entities[channel] = {
      name: "NPC",
      text: "new in " + channel,
      channel,
    };
  }
  state.entities.roomMessages.entities.history = {
    name: "NPC",
    text: "older chat loaded later",
    channel: "info",
    removed: true,
    createdAt: { seconds: 1 },
  };
  state.entities.roomMessages.entities.numericHistory = {
    name: "NPC",
    text: "old numeric timestamp",
    channel: "info",
    createdAt: 1,
  };
  for (const fn of listeners) fn();
};
runtime.__startFixtureAudio = async () => {
  Object.assign(state.entities.rooms.entities.test, {
    mediaUrl: "https://ccfolia.com/test.wav",
    mediaRepeat: true,
    mediaVolume: 0.5,
  });
  for (const fn of listeners) fn();
};
runtime.__stopFixtureAudio = () => {
  state.entities.rooms.entities.test.mediaUrl = null;
  for (const fn of listeners) fn();
};
runtime.__editUnselectedChats = () => {
  for (const channel of ["info", "other", "qa"])
    state.entities.roomMessages.entities[channel].text = "edited " + channel;
  state.entities.roomMessages.entities.new.removed = true;
  for (const fn of listeners) fn();
};
