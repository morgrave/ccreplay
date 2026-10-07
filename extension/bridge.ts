(() => {
  if (window.__ccReplayBridge) return;
  window.__ccReplayBridge = true;
  let channel = "";
  let queue = Promise.resolve();
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.source !== "ccreplay" ||
      event.data.channel !== channel
    )
      return;
    const batch = event.data.batch;
    if (!Array.isArray(batch)) return;
    queue = queue
      .then(() =>
        chrome.runtime.sendMessage({ target: "capture", channel, batch }),
      )
      .catch(() => {});
  });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.type === "init") {
      channel = msg.channel;
      respond({ ok: true });
    }
    if (msg.type === "stop" && msg.channel === channel) {
      window.dispatchEvent(new CustomEvent("ccreplay-stop"));
      setTimeout(() => queue.then(() => respond({ ok: true })), 100);
      return true;
    }
  });
})();
