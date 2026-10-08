/** Executable page dependencies are never needed by a script-free replay. */
export function isScriptResource(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return (
      /\.(?:m?js)$/i.test(path) || path === "/gtag/js" || path === "/iframe_api"
    );
  } catch {
    return false;
  }
}
export function isReplayAsset(mime: string): boolean {
  return !/^(?:text\/(?:html|javascript)|application\/(?:javascript|x-javascript|ecmascript)|text\/ecmascript)$/i.test(
    mime,
  );
}
export function replayWarnings(warnings: string[] = []): string[] {
  return warnings.filter((warning) => {
    const url = /^자산 저장 실패: (https?:\/\/\S+) \(/.exec(warning)?.[1];
    return !url || !isScriptResource(url);
  });
}
