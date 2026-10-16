// Mirrors the open "layers" (a non-menu screen, the help overlay) in the browser history, so Back closes the top layer
// instead of leaving the site. The wanted layers are kept apart from the real history entries and reconciled in a
// microtask, so close() followed by open() in the same tick (menu flicker between screens) costs no history traffic.
export function createNav({ history, onBack }) {
  let actual = [], desired = [], syncing = false, scheduled = false;

  function sync() {
    scheduled = false;
    if (syncing) return;
    let i = 0;
    while (i < actual.length && i < desired.length && actual[i] === desired[i]) i++;
    if (actual.length > i) {
      const n = actual.length - i;
      actual.length = i;
      syncing = true;
      history.go(-n);
      return;
    }
    for (; i < desired.length; i++) {
      actual.push(desired[i]);
      history.pushState({ layer: desired[i] }, "");
    }
  }
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(sync);
  };

  return {
    open(kind) {
      if (!desired.includes(kind)) desired.push(kind);
      schedule();
    },
    close(kind) {
      const i = desired.lastIndexOf(kind);
      if (i < 0) return;
      desired.splice(i, 1);
      schedule();
    },
    // popstate handler: a pop we caused only lets the pending pushes through; otherwise it was the user's Back.
    pop() {
      if (syncing) {
        syncing = false;
        schedule();
        return;
      }
      const top = actual.pop();
      if (top === undefined) return;
      const i = desired.lastIndexOf(top);
      if (i >= 0) desired.splice(i, 1);
      onBack(top);
    },
  };
}
