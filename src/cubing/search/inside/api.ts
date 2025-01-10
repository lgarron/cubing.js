import type { Alg } from "../../alg";
import {
  KPattern,
  KPuzzle,
  type KPatternData,
  type KPuzzleDefinition,
} from "../../kpuzzle";
import { puzzles } from "../../puzzles";
import { setIsInsideWorker } from "./inside-worker";
import { preInitialize222, solve222 } from "./solve/puzzles/2x2x2";
import {
  initialize333,
  random333OrientedScramble,
  random333Scramble,
  solve333,
} from "./solve/puzzles/3x3x3";
import {
  initialize444,
  random444OrientedScramble,
  random444Scramble,
} from "./solve/puzzles/4x4x4";
import { randomFTOScramble } from "./solve/puzzles/fto";
import { randomKilominxScramble } from "./solve/puzzles/kilominx";
import { randomMasterTetraminxScramble } from "./solve/puzzles/master_tetraminx";
import { solveMegaminx } from "./solve/puzzles/megaminx";
import { solvePyraminx } from "./solve/puzzles/pyraminx";
import { randomRediCubeScramble } from "./solve/puzzles/redi_cube";
import { solveSkewb } from "./solve/puzzles/skewb";
import {
  wasmRandomScrambleForEvent,
  wasmTwsearch,
  type TwsearchOptions,
} from "./solve/twsearch";

const IDLE_PREFETCH_TIMEOUT_MS = 1000;

setIsInsideWorker(true);

let DEBUG_MEASURE_PERF = true;
export function setDebugMeasurePerf(newDebugMeasurePerf: boolean): void {
  DEBUG_MEASURE_PERF = newDebugMeasurePerf;
}

function now() {
  return (typeof performance === "undefined" ? Date : performance).now();
}

async function measurePerf<T>(
  name: string,
  f: () => T | Promise<T>,
  options?: { isPrefetch?: boolean },
): Promise<T> {
  if (!DEBUG_MEASURE_PERF) {
    return f();
  }

  const start = now();
  const result = f();
  if ((result as any)?.then) {
    await result;
  }
  const end = now();
  console.warn(
    `${name}${options?.isPrefetch ? " (prefetched)" : ""}: ${Math.round(
      end - start,
    )}ms`,
  );
  return result;
}

const prefetchPromises: Map<string, Promise<Alg>> = new Map();
// This would just be a number, except `node` is extremely silly and returns an object instead.
// https://nodejs.org/api/timers.html#settimeoutcallback-delay-args
let queuedPrefetchTimeoutID: ReturnType<typeof setTimeout> | null = null;

// This is used to ensure only one scramble is running (and measured) at a time, as interleaving scrambles within a single worker isn't supported (yet).
// Scrambles may perform async work (e.g. loading code), and this guard this prevents unintended interleaving.
let scrambleActivityLock: Promise<Alg>;

async function randomScrambleForEvent(
  eventID: string,
  options?: { isPrefetch?: boolean },
): Promise<Alg> {
  return (scrambleActivityLock = (async () => {
    await scrambleActivityLock;
    function wasm(): Promise<Alg> {
      return measurePerf(
        `wasmRandomScrambleForEvent(${JSON.stringify(eventID)})`,
        () => wasmRandomScrambleForEvent(eventID),
        {
          isPrefetch: options?.isPrefetch,
        },
      );
    }

    switch (eventID) {
      // case "333":
      case "222":
        return (await wasm()).experimentalSimplify({
          puzzleSpecificSimplifyOptions: {
            quantumMoveOrder: () => 4,
          },
        });
      // case "444":
      case "555":
      case "666":
      case "777":
      // case "333bf":
      case "333fm":
      // case "333oh":
      // case "clock":
      case "minx":
      case "pyram":
      case "skewb":
      case "sq1":
      // case "444bf":
      case "555bf":
      // case "333mbf":
      // case "fto":
      // case "master_tetraminx":
      // case "kilominx":
      // case "redi_cube":
      case "baby_fto":
        return wasm();
      case "333":
      case "333oh":
      case "333ft":
        return measurePerf("random333Scramble", random333Scramble, {
          isPrefetch: options?.isPrefetch,
        });
      case "333bf":
      case "333mbf":
        return measurePerf(
          "random333OrientedScramble",
          random333OrientedScramble,
        );
      case "444":
        return measurePerf("random444Scramble", random444Scramble, {
          isPrefetch: options?.isPrefetch,
        });
      case "444bf":
        return measurePerf(
          "random444OrientedScramble",
          random444OrientedScramble,
        );
      case "fto":
        return measurePerf("randomFTOScramble", randomFTOScramble, {
          isPrefetch: options?.isPrefetch,
        });
      case "master_tetraminx":
        return measurePerf(
          "randomMasterTetraminxScramble",
          randomMasterTetraminxScramble,
        );
      case "kilominx":
        return measurePerf("randomKilominxScramble", randomKilominxScramble, {
          isPrefetch: options?.isPrefetch,
        });
      case "redi_cube":
        return measurePerf("randomRediCubeScramble", randomRediCubeScramble, {
          isPrefetch: options?.isPrefetch,
        });
      default:
        throw new Error(`unsupported event: ${eventID}`);
    }
  })());
}

export enum PrefetchLevel {
  Auto = "auto",
  None = "none",
  Immediate = "immediate",
}

let currentPrefetchLevel = PrefetchLevel.Auto;

export const insideAPI = {
  initialize: async (eventID: string) => {
    switch (eventID) {
      case "222":
        return measurePerf("preInitialize222", preInitialize222);
      case "333":
      case "333oh":
      case "333ft":
        return measurePerf("initialize333", initialize333);
      case "444":
        return measurePerf("initialize444", initialize444);
      default:
        throw new Error(`unsupported event: ${eventID}`);
    }
  },

  setScramblePrefetchLevel(prefetchLevel: `${PrefetchLevel}`) {
    currentPrefetchLevel = prefetchLevel as PrefetchLevel;
  },

  randomScrambleForEvent: async (eventID: string): Promise<Alg> => {
    let promise = prefetchPromises.get(eventID);
    if (promise) {
      prefetchPromises.delete(eventID);
    } else {
      promise = randomScrambleForEvent(eventID);
    }
    if (currentPrefetchLevel !== PrefetchLevel.None) {
      promise.then(() => {
        // `queuedPrefetch` could be 0, but:
        // > Passing an invalid ID to clearTimeout() silently does nothing; no exception is thrown.
        // https://developer.mozilla.org/en-US/docs/Web/API/clearTimeout#notes
        if (queuedPrefetchTimeoutID) {
          clearTimeout(queuedPrefetchTimeoutID);
        }
        queuedPrefetchTimeoutID = setTimeout(
          () => {
            prefetchPromises.set(
              eventID,
              randomScrambleForEvent(eventID, {
                isPrefetch: true,
              }),
            );
          },
          currentPrefetchLevel === PrefetchLevel.Immediate
            ? 0
            : IDLE_PREFETCH_TIMEOUT_MS,
        );
      });
    }
    return promise;
  },

  randomScrambleStringForEvent: async (eventID: string): Promise<string> => {
    return (await insideAPI.randomScrambleForEvent(eventID)).toString();
  },

  solve333ToString: async (patternData: KPatternData): Promise<string> => {
    const pattern = new KPattern(await puzzles["3x3x3"].kpuzzle(), patternData);
    return (await solve333(pattern)).toString();
  },

  solve222ToString: async (patternData: KPatternData): Promise<string> => {
    const pattern = new KPattern(await puzzles["2x2x2"].kpuzzle(), patternData);
    return (await solve222(pattern)).toString();
  },

  solveSkewbToString: async (patternData: KPatternData): Promise<string> => {
    const pattern = new KPattern(await puzzles["skewb"].kpuzzle(), patternData);
    return (await solveSkewb(pattern)).toString();
  },

  solvePyraminxToString: async (patternData: KPatternData): Promise<string> => {
    const pattern = new KPattern(
      await puzzles["pyraminx"].kpuzzle(),
      patternData,
    );
    return (await solvePyraminx(pattern)).toString();
  },

  solveMegaminxToString: async (patternData: KPatternData): Promise<string> => {
    const pattern = new KPattern(
      await puzzles["megaminx"].kpuzzle(),
      patternData,
    );
    return (await solveMegaminx(pattern)).toString();
  },

  setDebugMeasurePerf: async (measure: boolean): Promise<void> => {
    setDebugMeasurePerf(measure);
  },

  solveTwsearchToString: async (
    def: KPuzzleDefinition,
    patternData: KPatternData,
    options?: TwsearchOptions,
  ): Promise<string> => {
    const kpuzzle = new KPuzzle(def);
    const pattern = new KPattern(kpuzzle, patternData);
    return (await wasmTwsearch(def, pattern, options)).toString();
  },
};

export type WorkerInsideAPI = typeof insideAPI;
