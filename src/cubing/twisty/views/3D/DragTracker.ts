// export class Drag() {

// }

interface DragInfo {
  attachedInfo: Record<any, any>;
  hasMoved: boolean;
  lastTimeStamp: number;
}

type PointerID = number;

export interface DragMovementInfo {
  attachedInfo: Record<any, any>;
  movementX: number;
  movementY: number;
  elapsedMs: number;
}

export interface UpInfo {
  attachedInfo: Record<any, any>;
}

export interface PressInfo {
  normalizedX: number;
  normalizedY: number;
  rightClick: boolean;
  keys: {
    // TODO: group these
    altKey: boolean;
    ctrlOrMetaKey: boolean;
    shiftKey: boolean;
  };
}

// Chrome can report movements as low as `0.0000152587890625` even if the cursor did not move at all. So we need a treshold insteadl.
const MOVEMENT_EPSILON = 0.1; // px

export class DragTracker extends EventTarget {
  #dragInfoMap: Map<PointerID, DragInfo> = new Map();

  constructor(public readonly target: HTMLElement) {
    super();
  }

  // Idempotent
  start() {
    this.addTargetListener("pointerdown", this.onPointerDown.bind(this));
    // Prevent right-click on desktop (only tested on macOS Chrome/Safari/Firefox) so we can detect right-click moves.
    // TODO: Can we do this selectively, e.g. only on the puzzle? That way we could allow right-click to download the canvas. Unfortunately, it would probably require a sync calculation.
    this.addTargetListener("contextmenu", (e) => {
      e.preventDefault();
    });
    // Prevent touch scrolling (preventing default on `pointermove` doesn't work).
    this.addTargetListener("touchmove", (e) => e.preventDefault());
    // Prevent zooming on double-tap (iOS).
    // This is because `dblclick` works to zoom in, but does *not* work to zoom out. So the user can get stuck zoomed into the player without a way to zoom out.
    this.addTargetListener("dblclick", (e) => e.preventDefault());
  }

  // Idempotent
  stop(): void {
    for (const [eventType, listener] of this.#targetListeners.entries()) {
      this.target.removeEventListener(eventType, listener);
    }
    this.#targetListeners.clear();
    this.#lazyListenersRegistered = false;
  }

  #targetListeners = new Map<string, (e: MouseEvent) => any>();
  addTargetListener(eventType: string, listener: (e: MouseEvent) => any) {
    if (!this.#targetListeners.has(eventType)) {
      this.target.addEventListener(eventType, listener);
      this.#targetListeners.set(eventType, listener);
    }
  }

  // This allows us to avoid getting a callback every time the pointer moves over the canvas, until we have a down event.
  // TODO: Ideally we'd also support unregistering when we're certain there are no more active touches. But this means we need to properly handle every way a pointer "click" can end, which is tricky across environments (due to e.g. mouse vs. touch vs. stylues, canvas/viewport/window/scroll boundaries, right-click and other ways of losing focus, etc.), so we conservatively leave the listeners on.
  #lazyListenersRegistered: boolean = false;
  #registerLazyListeners(): void {
    if (this.#lazyListenersRegistered) {
      return;
    }
    this.addTargetListener("pointermove", this.onPointerMove.bind(this)); // TODO: only register this after pointer down.
    this.addTargetListener("pointerup", this.onPointerUp.bind(this));
    this.#lazyListenersRegistered = true;
  }

  #clear(e: PointerEvent): void {
    this.#dragInfoMap.delete(e.pointerId);
  }

  // `null`: means: ignore this result (no movement, or not
  #trackDrag(e: PointerEvent): {
    movementInfo: DragMovementInfo | null;
    hasMoved: boolean;
  } {
    // TODO: Find a way to detect if this is an active press, in a way that works cross-platform.
    // if (e.buttons === 0) {
    //   return { movementInfo: null, hasMoved: false };
    // }
    const existing = this.#dragInfoMap.get(e.pointerId);
    if (!existing) {
      return { movementInfo: null, hasMoved: false };
    }
    // We optimistically try to catch sub-pixel movements in Chrome.
    const movementInfo: DragMovementInfo = {
      attachedInfo: existing.attachedInfo,
      movementX: e.movementX,
      movementY: e.movementY,
      elapsedMs: e.timeStamp - existing.lastTimeStamp,
    };
    existing.lastTimeStamp = e.timeStamp;
    if (
      Math.abs(movementInfo.movementX) < MOVEMENT_EPSILON &&
      Math.abs(movementInfo.movementY) < MOVEMENT_EPSILON
    ) {
      return { movementInfo: null, hasMoved: existing.hasMoved };
    } else {
      existing.hasMoved = true;
      return { movementInfo, hasMoved: existing.hasMoved };
    }
  }

  private onPointerDown(e: PointerEvent) {
    this.#registerLazyListeners();
    const newDragInfo: DragInfo = {
      attachedInfo: {},
      hasMoved: false,
      lastTimeStamp: e.timeStamp,
    };
    this.#dragInfoMap.set(e.pointerId, newDragInfo);
    this.target.setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent) {
    const movementInfo = this.#trackDrag(e).movementInfo;
    if (movementInfo) {
      e.preventDefault();
      this.dispatchEvent(
        new CustomEvent("move", {
          detail: movementInfo,
        }),
      );
    }
  }

  private onPointerUp(e: PointerEvent) {
    const trackDragResult = this.#trackDrag(e);
    const existing = this.#dragInfoMap.get(e.pointerId)!; // TODO
    this.#clear(e);
    this.target.releasePointerCapture(e.pointerId); // TODO: unnecessary?
    let event: CustomEvent;
    if (trackDragResult.hasMoved) {
      // TODO: send proper movement/momentum since last move event.
      event = new CustomEvent<UpInfo>("up", {
        detail: { attachedInfo: existing.attachedInfo },
      });
    } else {
      const { altKey, ctrlKey, metaKey, shiftKey } = e;
      event = new CustomEvent<PressInfo>("press", {
        detail: {
          normalizedX: (e.offsetX / this.target.offsetWidth) * 2 - 1,
          normalizedY: 1 - (e.offsetY / this.target.offsetHeight) * 2,
          rightClick: !!(e.button & 2),
          keys: {
            altKey,
            ctrlOrMetaKey: ctrlKey || metaKey,
            shiftKey,
          },
        },
      });
    }
    this.dispatchEvent(event);
  }
}
