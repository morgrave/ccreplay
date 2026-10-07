import type { Session } from "./types.ts";
let creating: Promise<void> | null;
async function offscreen() {
  if (
    (
      await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL("offscreen.html")],
      })
    ).length
  )
    return;
  if (!creating)
    creating = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: ["BLOBS"],
        justification:
          "기록 데이터와 자산을 로컬에 보관하고 리플레이 파일을 만듭니다.",
      })
      .finally(() => (creating = null));
  await creating;
}
async function send(type: string, data = {}) {
  await offscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", type, ...data });
}
async function stop() {
  const { session } = await chrome.storage.local.get<{ session?: Session }>(
    "session",
  );
  if (session?.tabId)
    try {
      await chrome.tabs.sendMessage(session.tabId, {
        type: "stop",
        channel: session.channel,
      });
    } catch {}
  const result = await send("stop");
  await chrome.storage.local.set({ session: { ...session, active: false } });
  await chrome.action.setBadgeText({ text: "" });
  return result;
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.target === "background") {
    (async () => {
      if (msg.type === "status") {
        const result = await send("status");
        return result;
      }
      if (msg.type === "start") {
        const current = await send("status");
        if (current.active) throw Error("이미 기록 중인 방이 있습니다.");
        if (current.exists && !current.exported)
          throw Error(
            "이전 기록을 먼저 파일로 저장하세요. 저장 후 새 기록을 시작할 수 있습니다.",
          );
        const tab = await chrome.tabs.get(msg.tabId);
        if (!/^https:\/\/ccfolia\.com\/rooms\/[^/?#]+/.test(tab.url || ""))
          throw Error("코코포리아 방 탭에서 기록기를 열어주세요.");
        const session = {
          tabId: tab.id!,
          channel: crypto.randomUUID(),
          startedAt: Date.now(),
          active: true,
        };
        const started = await send("start", { session, roomUrl: tab.url });
        if (started?.error) throw Error(started.error);
        await chrome.storage.local.set({ session });
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ["bridge.js"],
          });
          await chrome.tabs.sendMessage(tab.id!, {
            type: "init",
            channel: session.channel,
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            world: "MAIN",
            files: ["recorder.js"],
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            world: "MAIN",
            func: (channel) =>
              window.dispatchEvent(
                new CustomEvent("ccreplay-start", { detail: { channel } }),
              ),
            args: [session.channel],
          });
          await chrome.action.setBadgeBackgroundColor({ color: "#b74545" });
          await chrome.action.setBadgeText({ text: "REC" });
          return { ok: true };
        } catch (e) {
          await stop();
          throw e;
        }
      }
      if (msg.type === "stop") return stop();
      if (msg.type === "export") return send("export");
    })()
      .then(respond)
      .catch((e) => respond({ error: e.message }));
    return true;
  }
  if (msg.target === "capture") {
    (async () => {
      const { session } = await chrome.storage.local.get<{ session?: Session }>(
        "session",
      );
      if (
        !session?.active ||
        sender.tab?.id !== session.tabId ||
        msg.channel !== session.channel
      )
        return { error: "inactive" };
      return send("batch", { batch: msg.batch });
    })()
      .then(respond)
      .catch((e) => respond({ error: e.message }));
    return true;
  }
  if (msg.target === "download") {
    chrome.downloads
      .download({ url: msg.url, filename: msg.filename, saveAs: true })
      .then((id) => respond({ id }))
      .catch((e) => respond({ error: e.message }));
    return true;
  }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { session } = await chrome.storage.local.get<{ session?: Session }>(
    "session",
  );
  if (session?.active && session.tabId === tabId) await stop();
});
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "loading") return;
  const { session } = await chrome.storage.local.get<{ session?: Session }>(
    "session",
  );
  if (session?.active && session.tabId === tabId) await stop();
});
chrome.downloads.onChanged.addListener((delta) => {
  if (
    delta.state?.current === "complete" ||
    delta.state?.current === "interrupted"
  )
    send("download-finished", {
      id: delta.id,
      complete: delta.state.current === "complete",
    }).catch(() => {});
});
