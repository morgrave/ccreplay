interface ReplayToolActions {
  duration(): number | undefined;
  seek(milliseconds: number): number;
  search(query: string): number;
}

/** Optional browser tool integration. The player owns all state and UI actions. */
export function registerReplayTools(
  context: Document["modelContext"],
  actions: ReplayToolActions,
): () => void {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools = [
    {
      name: "replay_seek",
      description: "열린 리플레이를 지정한 초로 이동합니다.",
      inputSchema: {
        type: "object",
        properties: { seconds: { type: "number", minimum: 0 } },
        required: ["seconds"],
        additionalProperties: false,
      },
      execute: ({ seconds }: { seconds: number }) => {
        const duration = actions.duration();
        if (
          duration === undefined ||
          !Number.isFinite(seconds) ||
          seconds < 0 ||
          seconds * 1000 > duration
        )
          throw Error("기록 범위 안의 시간을 입력하세요.");
        return { seconds: actions.seek(seconds * 1000) / 1000 };
      },
    },
    {
      name: "replay_search_chat",
      description: "채팅을 검색하고 결과를 화면에 표시합니다.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", maxLength: 200 } },
        required: ["query"],
        additionalProperties: false,
      },
      execute: ({ query }: { query: string }) => {
        if (typeof query !== "string" || query.length > 200)
          throw Error("검색어는 200자 이하입니다.");
        if (actions.duration() === undefined)
          throw Error("리플레이를 먼저 열어주세요.");
        return { matches: actions.search(query) };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        context.registerTool(
          {
            ...tool,
            annotations: { readOnlyHint: false, untrustedContentHint: true },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      // Optional browser support must not prevent ordinary playback.
    }
  }
  return () => lifecycle.abort();
}
