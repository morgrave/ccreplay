import type { Page } from "playwright";

/** The native room listener already receives new messages across all tabs. Visit
 * each public tab once to activate CCfolia's own initial history fetch as well.
 * Never send chat, reorder tabs, or subscribe to inaccessible private channels. */
export async function prepareChatTabs(
  page: Page,
  prepared: Set<string>,
  log: (message: string) => void,
  signal: AbortSignal,
) {
  const initial = await page.evaluate(() => window.__ccReplayAuto.chatStatus());
  let changed = false;
  try {
    for (const channel of initial.channels) {
      if (prepared.has(channel) || signal.aborted) continue;
      // Match the native component's channel value, not translated labels/badges.
      // This local click also works when an announcement covers the drawer.
      if (
        !(await page.evaluate(
          (id) => window.__ccReplayAuto.selectChat(id),
          channel,
        ))
      )
        continue;
      changed = true;
      await page.waitForFunction(
        (id) => {
          const state = window.__ccReplayAuto.chatStatus();
          return (
            state.selected === id &&
            !state.loading[id] &&
            (state.loaded[id] || (state.counts[id] || 0) >= 20)
          );
        },
        channel,
        { timeout: 15000 },
      );
      prepared.add(channel);
      log("채팅 탭 초기 대화 준비: " + channel);
    }
  } finally {
    if (changed && !page.isClosed()) {
      await page.evaluate(
        (id) => window.__ccReplayAuto.selectChat(id),
        initial.selected,
      );
    }
  }
}
