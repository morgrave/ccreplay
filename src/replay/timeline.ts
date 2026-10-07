/** Preview input locally; rebuild the room only when a gesture finishes. */
export function bindTimeline(
  input: HTMLInputElement,
  actions: {
    begin(): void;
    preview(time: number): void;
    commit(time: number): void;
  },
) {
  let active = false;
  let holding = false;
  let pending: number | null = null;
  const begin = () => {
    if (active) return;
    active = true;
    pending = Number(input.value);
    actions.begin();
  };
  const finish = () => {
    if (!active) return;
    active = false;
    holding = false;
    const value = pending;
    pending = null;
    if (value !== null) actions.commit(value);
  };
  input.addEventListener("pointerdown", (event) => {
    holding = true;
    begin();
    input.setPointerCapture?.(event.pointerId);
  });
  input.addEventListener("input", () => {
    begin();
    pending = Number(input.value);
    actions.preview(pending);
  });
  input.addEventListener("keydown", (event) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(event.key)
    ) {
      holding = true;
      begin();
    }
  });
  input.addEventListener("keyup", finish);
  input.addEventListener("pointerup", finish);
  input.addEventListener("pointercancel", finish);
  input.addEventListener("lostpointercapture", finish);
  input.addEventListener("blur", finish);
  // Accessible controls may emit change without a pointer or keyboard gesture.
  input.addEventListener("change", () => {
    if (!active || holding) return;
    pending ??= Number(input.value);
    finish();
  });
  return {
    get active() {
      return active;
    },
  };
}
