import type { ReduxStore } from "./types.ts";
import type { ExternalRecord } from "../src/core/types.ts";
export function discoverRoomRuntime() {
  let store: ReduxStore | undefined;
  const classes = new Set<ExternalRecord>();
  let roots: ExternalRecord[];
  roots = [];
  for (const el of [
    document.querySelector("#root"),
    ...Array.from(document.body.children),
  ].filter(Boolean)) {
    for (const key of Object.keys(el!)) {
      if (
        key.startsWith("__reactContainer$") ||
        key.startsWith("__reactFiber$")
      ) {
        let f = (el as unknown as ExternalRecord)[key];
        while (f?.return) f = f.return;
        roots.push(f?.stateNode?.current || f);
      }
    }
  }
  const visited = new Set();
  const todo = [...roots];
  while (todo.length && visited.size < 60000) {
    const f = todo.pop();
    if (!f || visited.has(f)) continue;
    visited.add(f);
    const p = f.memoizedProps;
    const contexts = [];
    let cx = f.dependencies?.firstContext;
    while (cx) {
      contexts.push(cx.memoizedValue);
      cx = cx.next;
    }
    for (const c of [
      p?.store,
      p?.value?.store,
      ...contexts.map((c) => c?.store),
    ])
      if (c?.getState && c?.subscribe && c.getState()?.entities?.rooms)
        store = c;
    let h = f.memoizedState;
    let i = 0;
    while (h && i++ < 100) {
      const v = h.memoizedState;
      const candidates = [v?.current, Array.isArray(v) ? v[0] : null];
      for (const c of candidates)
        if (
          c?.audioElement instanceof HTMLMediaElement &&
          Array.isArray(c.constructor?.players)
        )
          classes.add(c.constructor);
      h = h.next;
    }
    if (f.child) todo.push(f.child);
    if (f.sibling) todo.push(f.sibling);
  }
  return { store, classes };
}
