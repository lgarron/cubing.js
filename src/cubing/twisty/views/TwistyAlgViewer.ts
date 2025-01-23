import {
  Alg,
  Grouping,
  Pause,
  TraversalDownUp,
  functionFromTraversal,
  type AlgNode,
  type Commutator,
  type Conjugate,
  type LineComment,
  type Move,
  type Newline,
} from "../../alg";
import {
  ExperimentalIterationDirection,
  experimentalDirect,
} from "../../alg/cubing-private";
import { startCharIndexKey, type Parsed } from "../../alg/parseAlg";
import type { MillisecondTimestamp } from "../controllers/AnimationTypes";
import type { CurrentMoveInfo } from "../controllers/indexer/AlgIndexer";
import type { AlgWithIssues } from "../model/props/puzzle/state/AlgProp";
import type { DetailedTimelineInfo } from "../model/props/timeline/DetailedTimelineInfoProp";
import { ManagedCustomElement } from "./ManagedCustomElement";
import { twistyAlgViewerCSS } from "./TwistyAlgViewer.css";
import { TwistyPlayer } from "./TwistyPlayer";
import { firstElementWithId } from "./firstElementWithId";
import {
  HTMLElementShim,
  customElementsShim,
} from "./node-custom-element-shims";

const DEFAULT_OFFSET_MS = 250; // TODO: make this a fraction?

class DataDown {
  earliestMoveIndex: number;
  twistyAlgViewer: TwistyAlgViewer;
  direction: ExperimentalIterationDirection;
  type?: string;
}

class DataUp {
  moveCount: number;
  element: TwistyAlgWrapperElem | TwistyAlgLeafElem;
}

class TwistyAlgLeafElem extends ManagedCustomElement {
  constructor(
    className: string,
    text: string,
    dataDown: DataDown,
    public algOrAlgNode: Alg | AlgNode,
    offsetIntoMove: boolean,
    clickable: boolean,
  ) {
    super({ mode: "open" });
    this.classList.add(className);

    this.addCSS(twistyAlgViewerCSS);
    if (clickable) {
      const anchor = this.contentWrapper.appendChild(
        document.createElement("a"),
      );
      anchor.href = "#";
      anchor.textContent = text;

      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        dataDown.twistyAlgViewer.jumpToIndex(
          dataDown.earliestMoveIndex,
          offsetIntoMove,
        );
      });
    } else {
      this.contentWrapper.appendChild(
        document.createElement("span"),
      ).textContent = text;
    }
  }

  pathToIndex(_index: number): (TwistyAlgWrapperElem | TwistyAlgLeafElem)[] {
    return [];
  }

  setCurrentMove(current: boolean) {
    this.contentWrapper.classList.toggle("current-move", current);
  }
}

customElementsShim.define("twisty-alg-leaf-elem", TwistyAlgLeafElem);

class TwistyAlgWrapperElem extends HTMLElementShim {
  private queue: (Element | Text)[] = [];

  constructor(
    className: string,
    public algOrAlgNode: Alg | AlgNode,
  ) {
    super();
    this.classList.add(className);
  }

  addClass(className: string) {
    this.classList.add(className);
  }

  addString(str: string) {
    this.queue.push(document.createTextNode(str));
  }

  addElem(dataUp: DataUp): number {
    this.queue.push(dataUp.element);
    return dataUp.moveCount;
  }

  flushQueue(
    direction: ExperimentalIterationDirection = ExperimentalIterationDirection.Forwards,
  ): void {
    for (const node of maybeReverseList(this.queue, direction)) {
      this.append(node);
    }
    this.queue = [];
  }

  pathToIndex(_index: number): (TwistyAlgWrapperElem | TwistyAlgLeafElem)[] {
    return [];
  }
}

customElementsShim.define("twisty-alg-wrapper-elem", TwistyAlgWrapperElem);

function oppositeDirection(
  direction: ExperimentalIterationDirection,
): ExperimentalIterationDirection {
  return direction === ExperimentalIterationDirection.Forwards
    ? ExperimentalIterationDirection.Backwards
    : ExperimentalIterationDirection.Forwards;
}

function updateDirectionByAmount(
  currentDirection: ExperimentalIterationDirection,
  amount: number,
): ExperimentalIterationDirection {
  return amount < 0 ? oppositeDirection(currentDirection) : currentDirection;
}

function maybeReverseList<T>(
  l: T[],
  direction: ExperimentalIterationDirection,
): T[] {
  if (direction === ExperimentalIterationDirection.Forwards) {
    return l;
  }
  // console.log("rev", Array.from(l).reverse());
  // return Array.from(l).reverse();
  const copy = Array.from(l);
  copy.reverse();
  return copy;
}

class AlgToDOMTree extends TraversalDownUp<DataDown, DataUp, DataUp> {
  public traverseAlg(alg: Alg, dataDown: DataDown): DataUp {
    let moveCount = 0;
    const element = new TwistyAlgWrapperElem("twisty-alg-alg", alg); // TODO: pick a better class name.
    if (dataDown.type) {
      element.addClass(dataDown.type);
    }
    let first = true;
    for (const algNode of experimentalDirect(
      alg.childAlgNodes(),
      dataDown.direction,
    )) {
      if (!first) {
        element.addString(" ");
      }
      first = false;
      if (algNode.as(Pause)?.experimentalNISSGrouping) {
        element.addString("^("); // TODO: Handle this lower down.
      }
      // TODO: Handle this check lower down.
      if (!algNode.as(Grouping)?.experimentalNISSPlaceholder) {
        moveCount += element.addElem(
          this.traverseAlgNode(algNode, {
            earliestMoveIndex: dataDown.earliestMoveIndex + moveCount,
            twistyAlgViewer: dataDown.twistyAlgViewer,
            direction: dataDown.direction,
          }),
        );
      }
      if (algNode.as(Pause)?.experimentalNISSGrouping) {
        element.addString(")"); // TODO: Handle this lower down.
      }
    }
    element.flushQueue(dataDown.direction);
    return {
      moveCount: moveCount,
      element,
    };
  }

  public traverseGrouping(grouping: Grouping, dataDown: DataDown): DataUp {
    const square1Tuple = grouping.experimentalAsSquare1Tuple();
    // if (square1Tuplle) {

    // }

    const direction = updateDirectionByAmount(
      dataDown.direction,
      grouping.amount,
    );
    let moveCount = 0;
    const element = new TwistyAlgWrapperElem("twisty-alg-grouping", grouping);
    element.addString("(");

    if (square1Tuple) {
      moveCount += element.addElem({
        moveCount: 1,
        element: new TwistyAlgLeafElem(
          "twisty-alg-move", // TODO: Mark the tuple with a special class?
          square1Tuple[0].amount.toString(),
          dataDown,
          square1Tuple[0],
          true,
          true,
        ),
      });
      element.addString(", ");
      moveCount += element.addElem({
        moveCount: 1,
        element: new TwistyAlgLeafElem(
          "twisty-alg-move", // TODO: Mark the tuple with a special class?
          square1Tuple[1].amount.toString(),
          dataDown,
          square1Tuple[1],
          true,
          true,
        ),
      });
    } else {
      moveCount += element.addElem(
        this.traverseAlg(grouping.alg, {
          earliestMoveIndex: dataDown.earliestMoveIndex + moveCount,
          twistyAlgViewer: dataDown.twistyAlgViewer,
          direction,
        }),
      );
    }

    element.addString(`)${grouping.experimentalRepetitionSuffix}`);
    element.flushQueue();
    return {
      moveCount: moveCount * Math.abs(grouping.amount),
      element,
    };
  }

  public traverseMove(move: Move, dataDown: DataDown): DataUp {
    const element = new TwistyAlgLeafElem(
      "twisty-alg-move",
      move.toString(),
      dataDown,
      move,
      true,
      true,
    );
    dataDown.twistyAlgViewer.highlighter.addMove(
      (move as Parsed<Move>)[startCharIndexKey],
      element,
    );
    return {
      moveCount: 1,
      element,
    };
  }

  public traverseCommutator(
    commutator: Commutator,
    dataDown: DataDown,
  ): DataUp {
    let moveCount = 0;
    const element = new TwistyAlgWrapperElem(
      "twisty-alg-commutator",
      commutator,
    );
    element.addString("[");
    element.flushQueue();
    const [first, second]: Alg[] = maybeReverseList(
      [commutator.A, commutator.B],
      dataDown.direction,
    );
    moveCount += element.addElem(
      this.traverseAlg(first, {
        earliestMoveIndex: dataDown.earliestMoveIndex + moveCount,
        twistyAlgViewer: dataDown.twistyAlgViewer,
        direction: dataDown.direction,
      }),
    );
    element.addString(", ");
    moveCount += element.addElem(
      this.traverseAlg(second, {
        earliestMoveIndex: dataDown.earliestMoveIndex + moveCount,
        twistyAlgViewer: dataDown.twistyAlgViewer,
        direction: dataDown.direction,
      }),
    );
    element.flushQueue(dataDown.direction);
    element.addString("]");
    element.flushQueue();
    return {
      moveCount: moveCount * 2,
      element,
    };
  }

  public traverseConjugate(conjugate: Conjugate, dataDown: DataDown): DataUp {
    let moveCount = 0;
    const element = new TwistyAlgWrapperElem("twisty-alg-conjugate", conjugate);
    element.addString("[");
    const aLen = element.addElem(
      this.traverseAlg(conjugate.A, {
        earliestMoveIndex: dataDown.earliestMoveIndex + moveCount,
        twistyAlgViewer: dataDown.twistyAlgViewer,
        direction: dataDown.direction,
        type: "setup",
      }),
    );
    moveCount += aLen;
    element.addString(": ");
    moveCount += element.addElem(
      this.traverseAlg(conjugate.B, {
        earliestMoveIndex: dataDown.earliestMoveIndex + moveCount,
        twistyAlgViewer: dataDown.twistyAlgViewer,
        direction: dataDown.direction,
        type: "execution",
      }),
    );
    element.addString("]");
    element.flushQueue();
    return {
      moveCount: moveCount + aLen,
      element,
    };
  }

  public traversePause(pause: Pause, dataDown: DataDown): DataUp {
    if (pause.experimentalNISSGrouping) {
      return this.traverseAlg(pause.experimentalNISSGrouping.alg, dataDown);
    }
    return {
      moveCount: 1,
      element: new TwistyAlgLeafElem(
        "twisty-alg-pause",
        ".",
        dataDown,
        pause,
        true,
        true,
      ),
    };
  }

  public traverseNewline(newline: Newline, _dataDown: DataDown): DataUp {
    const element = new TwistyAlgWrapperElem("twisty-alg-newline", newline);
    element.append(document.createElement("br"));
    return {
      moveCount: 0,
      element,
    };
  }

  public traverseLineComment(
    lineComment: LineComment,
    dataDown: DataDown,
  ): DataUp {
    return {
      moveCount: 0,
      element: new TwistyAlgLeafElem(
        "twisty-alg-line-comment",
        `//${lineComment.text}`,
        dataDown,
        lineComment,
        false,
        false,
      ),
    };
  }
}

const algToDOMTree = functionFromTraversal(AlgToDOMTree);

class MoveHighlighter {
  moveCharIndexMap: Map<number, TwistyAlgLeafElem> = new Map();
  currentElem: TwistyAlgLeafElem | null = null;

  addMove(charIndex: number, elem: TwistyAlgLeafElem): void {
    this.moveCharIndexMap.set(charIndex, elem);
  }

  set(move: Parsed<Move> | null, twistyPlayer: TwistyPlayer): void {
    const newElem = move
      ? (this.moveCharIndexMap.get(move[startCharIndexKey]) ?? null)
      : null;
    if (this.currentElem === newElem) {
      return;
    }
    if (newElem?.parentElement?.classList.contains('execution')) {
      twistyPlayer.tempoScale = 10;
    } else {
      twistyPlayer.tempoScale = 1;
    }
    this.currentElem?.classList.remove("twisty-alg-current-move");
    this.currentElem?.setCurrentMove(false);
    newElem?.classList.add("twisty-alg-current-move");
    newElem?.setCurrentMove(true);
    this.currentElem = newElem;
  }
}

/** @category Other Custom Elements */
export class TwistyAlgViewer extends HTMLElementShim {
  highlighter: MoveHighlighter = new MoveHighlighter();
  #domTree: TwistyAlgWrapperElem | TwistyAlgLeafElem;
  #twistyPlayer: TwistyPlayer | null = null;
  lastClickTimestamp: number | null = null;
  constructor(options?: { twistyPlayer?: TwistyPlayer }) {
    super();
    if (options?.twistyPlayer) {
      this.twistyPlayer = options?.twistyPlayer;
    }
  }

  protected connectedCallback(): void {
    // nothing to do?
  }

  private setAlg(alg: Alg): void {
    this.#domTree = algToDOMTree(alg, {
      earliestMoveIndex: 0,
      twistyAlgViewer: this,
      direction: ExperimentalIterationDirection.Forwards,
    }).element;
    this.textContent = "";
    this.appendChild(this.#domTree);
  }

  get twistyPlayer(): TwistyPlayer | null {
    return this.#twistyPlayer;
  }

  set twistyPlayer(twistyPlayer: TwistyPlayer | null) {
    this.#setTwistyPlayer(twistyPlayer);
  }

  async #setTwistyPlayer(twistyPlayer: TwistyPlayer | null) {
    if (this.#twistyPlayer) {
      console.warn("twisty-player reassignment is not supported");
      return;
    }
    if (twistyPlayer === null) {
      throw new Error("clearing twistyPlayer is not supported");
    }
    this.#twistyPlayer = twistyPlayer;

    this.#twistyPlayer.experimentalModel.alg.addFreshListener(
      (algWithIssues: AlgWithIssues) => {
        this.setAlg(algWithIssues.alg);
      },
    );

    const sourceAlg = (await this.#twistyPlayer.experimentalModel.alg.get())
      .alg;
    // TODO: Use proper architecture instead of a heuristic to ensure we have a parsed alg annotated with char indices.
    const parsedAlg =
      startCharIndexKey in (sourceAlg as Partial<Parsed<Alg>>)
        ? sourceAlg
        : Alg.fromString(sourceAlg.toString());
    this.setAlg(parsedAlg);

    twistyPlayer.experimentalModel.currentMoveInfo.addFreshListener(
      (currentMoveInfo: CurrentMoveInfo) => {
        let moveInfo = currentMoveInfo.currentMoves[0];
        moveInfo ??= currentMoveInfo.movesStarting[0];
        moveInfo ??= currentMoveInfo.movesFinishing[0];
        if (!moveInfo) {
          this.highlighter.set(null, twistyPlayer);
        } else {
          const mainCurrentMove = moveInfo.move; // TODO
          this.highlighter.set(mainCurrentMove as Parsed<Move>, twistyPlayer);
        }
      },
    );

    twistyPlayer.experimentalModel.detailedTimelineInfo.addFreshListener(
      (detailedTimelineInfo: DetailedTimelineInfo) => {
        if (detailedTimelineInfo.timestamp !== this.lastClickTimestamp) {
          this.lastClickTimestamp = null;
        }
      },
    );
  }

  async jumpToIndex(index: number, offsetIntoMove: boolean): Promise<void> {
    // TODO: Fix async issues.
    const twistyPlayer = this.#twistyPlayer;
    if (twistyPlayer) {
      twistyPlayer.pause();
      const timestampPromise = (async (): Promise<MillisecondTimestamp> => {
        const indexer = await twistyPlayer.experimentalModel.indexer.get();
        const offset = offsetIntoMove ? DEFAULT_OFFSET_MS : 0;
        return (
          indexer.indexToMoveStartTimestamp(index) +
          indexer.moveDuration(index) -
          offset
        );
      })();
      twistyPlayer.experimentalModel.timestampRequest.set(
        await timestampPromise, // TODO
      );
      if (this.lastClickTimestamp === (await timestampPromise)) {
        twistyPlayer.play();
        this.lastClickTimestamp = null;
      } else {
        this.lastClickTimestamp = await timestampPromise;
      }
    }
  }

  protected async attributeChangedCallback(
    attributeName: string,
    _oldValue: string,
    newValue: string,
  ): Promise<void> {
    if (attributeName === "for") {
      let elem: Element | null = document.getElementById(newValue);
      if (!elem) {
        console.info("for= elem does not exist, waiting for one");
      }
      await customElements.whenDefined("twisty-player");
      // TODO: handle intermediate attribute changes
      elem = await firstElementWithId(newValue);
      if (!(elem instanceof TwistyPlayer)) {
        console.warn("for= elem is not a twisty-player");
        return;
      }
      this.twistyPlayer = elem;
    }
  }

  static get observedAttributes(): string[] {
    return ["for"];
  }
}

customElementsShim.define("twisty-alg-viewer", TwistyAlgViewer);
declare global {
  interface HTMLElementTagNameMap {
    "twisty-alg-viewer": TwistyAlgViewer;
  }
}
