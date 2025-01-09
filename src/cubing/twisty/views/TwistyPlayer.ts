import type { Object3D } from "three";
import type { ExperimentalStickering } from "..";
import type { Alg, Move } from "../../alg";
import type { AlgLeaf } from "../../alg/alg-nodes/AlgNode";
import type { AppendCancelOptions, AppendOptions } from "../../alg/simplify";
import type { PuzzleDescriptionString } from "../../puzzle-geometry/PGPuzzles";
import type { ExperimentalStickeringMask } from "../../puzzles/cubing-private";
import { RenderScheduler } from "../controllers/RenderScheduler";
import type { TwistyAnimationControllerDelegate } from "../controllers/TwistyAnimationController";
import { TwistyPlayerController } from "../controllers/TwistyPlayerController";
import type { HintFaceletStyleWithAuto } from "../model/props/puzzle/display/HintFaceletProp";
import type { InitialHintFaceletsAnimation } from "../model/props/puzzle/display/InitialHintFaceletsAnimationProp";
import type { DragInputMode } from "../model/props/puzzle/state/DragInputProp";
import type { MovePressInput } from "../model/props/puzzle/state/MovePressInputProp";
import type { SetupToLocation } from "../model/props/puzzle/state/SetupAnchorProp";
import type { PuzzleID } from "../model/props/puzzle/structure/PuzzleIDRequestProp";
import type { BackgroundThemeWithAuto } from "../model/props/viewer/BackgroundProp";
import type { BackViewLayoutWithAuto } from "../model/props/viewer/BackViewProp";
import type {
  ColorScheme,
  ColorSchemeWithAuto,
} from "../model/props/viewer/ColorSchemeRequestProp";
import {
  type ControlPanelThemeWithAuto,
  controlsLocations,
} from "../model/props/viewer/ControlPanelProp";
import type { ViewerLinkPageWithAuto } from "../model/props/viewer/ViewerLinkProp";
import type { VisualizationFormatWithAuto } from "../model/props/viewer/VisualizationProp";
import type { VisualizationStrategy } from "../model/props/viewer/VisualizationStrategyProp";
import { Twisty2DSceneWrapper } from "./2D/Twisty2DSceneWrapper";
import type { Twisty3DPuzzle } from "./3D/puzzles/Twisty3DPuzzle";
import { Twisty3DSceneWrapper } from "./3D/Twisty3DSceneWrapper";
import type { Twisty3DVantage } from "./3D/Twisty3DVantage";
import { ClassListManager } from "./ClassListManager";
import { TwistyButtons } from "./control-panel/TwistyButtons";
import { TwistyScrubber } from "./control-panel/TwistyScrubber";
import { InitialValueTracker } from "./InitialValueTracker";
import { customElementsShim } from "./node-custom-element-shims";
import { downloadURL, getDefaultFilename, screenshot } from "./screenshot";
import { twistyPlayerCSS } from "./TwistyPlayer.css";
import { TwistyPlayerSettable } from "./TwistyPlayerSettable";

const DATA_ATTRIBUTE_PREFIX = "data-";

type Point = { x: number; y: number };

// TODO: I couldn't figure out how to use use more specific types. Ideally, we'd
// enforce consistency with the model.
export const twistyPlayerAttributeMap = {
  // TODO: We assume each of these can be set using a string or will be automatically converted by JS (e.g. numbers). Can we enforce
  // that with types? Do we need to add a translation mechanism for things we
  // don't want to leave settable as strings?
  // TODO: Enum validation.

  // Alg
  alg: "alg",
  "experimental-setup-alg": "experimentalSetupAlg",

  // String-based
  "experimental-setup-anchor": "experimentalSetupAnchor",
  puzzle: "puzzle",
  "experimental-puzzle-description": "experimentalPuzzleDescription",
  visualization: "visualization",
  "hint-facelets": "hintFacelets",
  "experimental-stickering": "experimentalStickering",
  "experimental-stickering-mask-orbits": "experimentalStickeringMaskOrbits",
  background: "background",
  "color-scheme": "colorScheme",
  "control-panel": "controlPanel",
  "back-view": "backView",
  "experimental-initial-hint-facelets-animation":
    "experimentalInitialHintFaceletsAnimation",
  // "indexer": "indexer",
  "viewer-link": "viewerLink",
  "experimental-move-press-input": "experimentalMovePressInput",
  "experimental-drag-input": "experimentalDragInput",

  // Metadata
  "experimental-title": "experimentalTitle",
  "experimental-video-url": "experimentalVideoURL",
  "experimental-competition-id": "experimentalCompetitionID",

  // Number-based
  "camera-latitude": "cameraLatitude",
  "camera-longitude": "cameraLongitude",
  "camera-distance": "cameraDistance",
  "camera-latitude-limit": "cameraLatitudeLimit",
  "tempo-scale": "tempoScale",

  // URL-based
  "experimental-sprite": "experimentalSprite",
  "experimental-hint-sprite": "experimentalHintSprite",
};

export type TwistyPlayerAttribute = keyof typeof twistyPlayerAttributeMap;

const configKeys: Record<TwistyPlayerAttribute, true> = Object.fromEntries(
  Object.values(twistyPlayerAttributeMap).map((s) => [s, true]),
) as any;

// TODO: Find a way to share this def with `attributeMap`.
/**
 * The config argument passed to {@link TwistyPlayer} when calling the
 * constructor. This interface type be useful for avoiding bugs when you would
 * like to create a {@link TwistyPlayer} using a dynamic config, or by combining
 * configs.
 *
 * ```js
 * import { TwistyPlayer, type TwistyPlayerConfig } from "cubing/twisty";
 *
 * const MY_DEFAULT_CONFIG: TwistyPlayerConfig = {
 *   puzzle: "megaminx",
 *   alg: "R U R'"
 * };
 * export function createTwistyPlayer(overrideConfig: TwistyPlayerConfig) {
 *   const options = { ...MY_DEFAULT_CONFIG, ...overrideConfig };
 *   return new TwistyPlayer(options);
 * }
 *
 * // Example: if the current page is https://alpha.twizzle.net/edit/?alg=M2+E2+S2
 * // then this gives us the "alg" param value "M2 E2 S2".
 * const myOverrideConfig: TwistyPlayerConfig = {};
 * const algParam = new URL(location.href).searchParams.get("alg");
 * if (algParam) {
 *   myOverrideConfig.alg = algParam;
 * }
 * createTwistyPlayer(myOverrideConfig);
 * ```
 *
 * @category TwistyPlayer
 */
export interface TwistyPlayerConfig {
  // Alg
  alg?: Alg | string;
  experimentalSetupAlg?: Alg | string;
  // String-based
  experimentalSetupAnchor?: SetupToLocation; // TODO: "auto"
  puzzle?: PuzzleID;
  experimentalPuzzleDescription?: PuzzleDescriptionString;
  visualization?: VisualizationFormatWithAuto;
  hintFacelets?: HintFaceletStyleWithAuto;
  experimentalStickering?: ExperimentalStickering;
  experimentalStickeringMaskOrbits?: ExperimentalStickeringMask | string;
  background?: BackgroundThemeWithAuto;
  colorScheme?: ColorSchemeWithAuto;
  controlPanel?: ControlPanelThemeWithAuto;
  backView?: BackViewLayoutWithAuto;
  experimentalInitialHintFaceletsAnimation?: InitialHintFaceletsAnimation;
  // "indexer"?: "indexer";
  viewerLink?: ViewerLinkPageWithAuto;
  experimentalMovePressInput?: MovePressInput;
  experimentalDragInput?: DragInputMode;
  // Metadata
  experimentalTitle?: string | null;
  experimentalVideoURL?: string;
  experimentalCompetitionID?: string;
  // Number-based
  cameraLatitude?: number;
  cameraLongitude?: number;
  cameraDistance?: number;
  cameraLatitudeLimit?: number;
  tempoScale?: number;
  // URL-based
  experimentalSprite?: string | null;
  experimentalHintSprite?: string | null;
  // TODO: Not supported as attributes
  experimentalMovePressCancelOptions?: AppendCancelOptions; // TODO: Support setting via a simplified attribute enum?
}

const propOnly: Record<string, boolean> = {
  experimentalMovePressCancelOptions: true,
};

/**
 * TwistyPlayer is the heart of `cubing.js`. It can be used to display a puzzle on a web page like this:
 *
 *     <script src="path/to/cubing/twisty" type="module"></script>
 *     <twisty-player alg="R U R'"></twisty-player>
 *
 * You can also construct it directly in JavaScript:
 *
 * ```js
 * import { TwistyPlayer } from "cubing/twisty";
 * const twistyPlayer = new TwistyPlayer({alg: "R U R'"});
 * // Once the page has loaded, you can do this:
 * document.body.appendChild(twistyPlayer);
 * ```
 *
 * See {@link https://js.cubing.net/cubing/} for more examples.
 *
 * @category TwistyPlayer
 */
export class TwistyPlayer
  extends TwistyPlayerSettable
  implements TwistyAnimationControllerDelegate
{
  controller: TwistyPlayerController = new TwistyPlayerController(
    this.experimentalModel,
    this,
  );

  buttons: TwistyButtons;

  public onMouseDown?: (event: MouseEvent) => void;
  public onMouseUp?: (event: MouseEvent) => void;
  public onTouchStart?: (event: TouchEvent) => void;
  public onTouchEnd?: (event: TouchEvent) => void;
  public onClick?: (event: MouseEvent | TouchEvent) => void;

  private clickCoordinatesStart: Point = { x: 0, y: 0 };

  constructor(config: TwistyPlayerConfig = {}) {
    super();

    // TODO: double-check that these are all getting set sync without causing extra work.
    for (const [propName, value] of Object.entries(config)) {
      if (
        !(configKeys[propName as TwistyPlayerAttribute] || propOnly[propName])
      ) {
        console.warn(`Invalid config passed to TwistyPlayer: ${propName}`);
        break;
      }
      (this as any)[propName] = value;
    }
    this.addEventListeners();
  }

  #controlsManager: ClassListManager<ControlPanelThemeWithAuto> =
    new ClassListManager<ControlPanelThemeWithAuto>(
      this,
      "controls-",
      (["auto"] as ControlPanelThemeWithAuto[]).concat(
        Object.keys(controlsLocations) as ControlPanelThemeWithAuto[],
      ),
    );

  #visualizationWrapperElem = document.createElement("div"); // TODO: Better pattern.
  #errorElem = document.createElement("div"); // TODO: Better pattern.
  #alreadyConnected = false; // TODO: support resetting
  async connectedCallback(): Promise<void> {
    if (this.#alreadyConnected) {
      return;
    }
    this.#alreadyConnected = true;
    this.addCSS(twistyPlayerCSS);

    this.addElement(this.#visualizationWrapperElem).classList.add(
      "visualization-wrapper",
    );
    this.addElement(this.#errorElem).classList.add("error-elem");
    this.#errorElem.textContent = "Error";
    this.experimentalModel.userVisibleErrorTracker.addFreshListener(
      (userVisibleError) => {
        const errorString: string | null = userVisibleError.errors[0] ?? null;
        this.contentWrapper.classList.toggle("error", !!errorString);
        if (errorString) {
          this.#errorElem.textContent = errorString;
        }
      },
    );

    const scrubber = new TwistyScrubber(
      this.experimentalModel,
      this.controller,
    );
    this.contentWrapper.appendChild(scrubber);

    this.buttons = new TwistyButtons(
      this.experimentalModel,
      this.controller,
      this,
    );
    this.contentWrapper.appendChild(this.buttons);

    this.experimentalModel.twistySceneModel.background.addFreshListener(
      (backgroundTheme: BackgroundThemeWithAuto) => {
        this.contentWrapper.classList.toggle(
          "checkered",
          ["auto", "checkered"].includes(backgroundTheme),
        );
        this.contentWrapper.classList.toggle(
          "checkered-transparent",
          backgroundTheme === "checkered-transparent",
        );
      },
    );

    this.experimentalModel.twistySceneModel.colorScheme.addFreshListener(
      (colorScheme: ColorScheme) => {
        this.contentWrapper.classList.toggle(
          "dark-mode",
          ["dark"].includes(colorScheme),
        );
      },
    );

    this.experimentalModel.controlPanel.addFreshListener(
      (controlPanel: ControlPanelThemeWithAuto) => {
        this.#controlsManager.setValue(controlPanel);
      },
    );

    this.experimentalModel.visualizationStrategy.addFreshListener(
      this.#setVisualizationWrapper.bind(this),
    );

    this.experimentalModel.puzzleID.addFreshListener(this.flash.bind(this));
  }

  #flashLevel: "auto" | "none" = "auto";
  /** @deprecated */
  experimentalSetFlashLevel(newLevel: "auto" | "none"): void {
    this.#flashLevel = newLevel;
  }

  flash() {
    if (this.#flashLevel === "auto") {
      this.#visualizationWrapper?.animate([{ opacity: 0.25 }, { opacity: 1 }], {
        duration: 250,
        easing: "ease-out",
      });
    }
  }

  #visualizationWrapper: Twisty2DSceneWrapper | Twisty3DSceneWrapper | null =
    null;
  #initial3DVisualizationWrapper =
    new InitialValueTracker<Twisty3DSceneWrapper>();

  #visualizationStrategy: VisualizationStrategy | null = null;
  #setVisualizationWrapper(strategy: VisualizationStrategy): void {
    if (strategy !== this.#visualizationStrategy) {
      this.#visualizationWrapper?.remove();
      this.#visualizationWrapper?.disconnect();
      let newWrapper: Twisty2DSceneWrapper | Twisty3DSceneWrapper;
      switch (strategy) {
        case "2D":
        case "experimental-2D-LL":
        case "experimental-2D-LL-face": {
          newWrapper = new Twisty2DSceneWrapper(
            this.experimentalModel.twistySceneModel,
            strategy,
          );
          break;
        }
        case "Cube3D":
        case "PG3D": {
          // TODO: Properly wire this up so we can set PG3D for the cube.
          newWrapper = new Twisty3DSceneWrapper(this.experimentalModel);
          this.#initial3DVisualizationWrapper.handleNewValue(newWrapper);
          break;
        }
        default:
          throw new Error("Invalid visualization");
      }
      this.#visualizationWrapperElem.appendChild(newWrapper);
      this.#visualizationWrapper = newWrapper;
      this.#visualizationStrategy = strategy;
    }
  }

  async experimentalCurrentVantages(): Promise<Iterable<Twisty3DVantage>> {
    this.connectedCallback();
    const wrapper = this.#visualizationWrapper;
    if (wrapper instanceof Twisty3DSceneWrapper) {
      return wrapper.experimentalVantages();
    }
    return [];
  }

  async experimentalCurrentCanvases(): Promise<HTMLCanvasElement[]> {
    const vantages = await this.experimentalCurrentVantages();
    const canvases: HTMLCanvasElement[] = [];
    for (const vantage of vantages) {
      canvases.push((await vantage.canvasInfo()).canvas);
    }
    return canvases;
  }

  /**
   * Get the first available puzzle `Object3D`. This can be inserted into
   * another `three.js` scene, essentially "adopting" it from the
   * `TwistyPlayer`'s scenes while still allowing the `TwistyPlayer` to animate
   * it. The function returns a `Promise` that returns if and when the
   * `Object3D` is available, and accepts a callback that is called whenever a
   * render is scheduled for the puzzle (essentially, if something about the
   * puzzle has changed, like its appearance or current animated state).
   *
   * Note:
   * - This may never resolve if the player never creates the relevant 3D object
   *   under the hood (e.g. if the config is set to 2D, or is not valid for
   *   rendering a puzzle)
   * - The architecture of `cubing.js` may change significantly, so it is not
   *   guaranteed that a `three.js` `Object3D` will be available from the main
   *   thread in the future.
   * - This function only returns the current `three.js` puzzle object (once one
   *   exists). If you change e.g. the `puzzle` config for the player, then the
   *   object will currently become stale. This may be replaced with more
   *   convenient behaviour in the future.
   *
   * @deprecated */
  async experimentalCurrentThreeJSPuzzleObject(
    puzzleRenderScheduledCallback?: () => void,
  ): Promise<Object3D> {
    this.connectedCallback();
    const sceneWrapper = await this.#initial3DVisualizationWrapper.promise;
    const puzzleWrapper =
      await sceneWrapper.experimentalTwisty3DPuzzleWrapper();
    const twisty3DPuzzlePromise: Promise<Twisty3DPuzzle> =
      puzzleWrapper.twisty3DPuzzle();
    const safeToCallback = (async () => {
      await twisty3DPuzzlePromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    })();
    if (puzzleRenderScheduledCallback) {
      // We want to notify the callback when the render is *scheduled* (once per
      // render), not when it is run. So we have a stub callback for the
      // scheduler itself, and rely on `scheduler.requestIsPending()` to dedup
      // requests below.
      const scheduler = new RenderScheduler(async () => {});
      puzzleWrapper.addEventListener("render-scheduled", async () => {
        if (!scheduler.requestIsPending()) {
          scheduler.requestAnimFrame();
          await safeToCallback;
          puzzleRenderScheduledCallback();
        }
      });
    }
    return twisty3DPuzzlePromise;
  }

  jumpToStart(options?: { flash: boolean }): void {
    this.controller.jumpToStart(options);
  }

  jumpToEnd(options?: { flash: boolean }): void {
    this.controller.jumpToEnd(options);
  }

  play(): void {
    this.controller.togglePlay(true);
  }

  pause(): void {
    this.controller.togglePlay(false);
  }

  // Inspiration:
  // - https://developer.mozilla.org/en-US/docs/Web/API/Element/toggleAttribute (`force` argument)
  // - https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/toggle (`force` argument)
  // We still provide `play()` and `pause()` individually for convenience, though.
  togglePlay(play?: boolean): void {
    this.controller.togglePlay(play);
  }

  // TODO: Animate the new move.
  // TODO: Automatically handle puzzle.
  experimentalAddMove(
    flexibleMove: Move | string,
    options?: AppendOptions,
  ): void {
    this.experimentalModel.experimentalAddMove(flexibleMove, options);
  }

  // TODO: Animate the new move.
  // TODO: Automatically handle puzzle.
  experimentalAddAlgLeaf(algLeaf: AlgLeaf, options?: AppendOptions): void {
    this.experimentalModel.experimentalAddAlgLeaf(algLeaf, options);
  }

  static get observedAttributes(): string[] {
    const observed: string[] = [];
    for (const key of Object.keys(twistyPlayerAttributeMap)) {
      observed.push(key, DATA_ATTRIBUTE_PREFIX + key);
    }
    return observed;
  }

  experimentalRemoveFinalChild(): void {
    this.experimentalModel.experimentalRemoveFinalChild();
  }

  attributeChangedCallback(
    attributeName: string,
    _oldValue: string,
    newValue: string,
  ): void {
    if (attributeName.startsWith(DATA_ATTRIBUTE_PREFIX)) {
      attributeName = attributeName.slice(DATA_ATTRIBUTE_PREFIX.length);
    }
    const setterName =
      twistyPlayerAttributeMap[attributeName as TwistyPlayerAttribute];
    if (!setterName) {
      return;
    }

    (this as any)[setterName] = newValue;
  }

  // TODO: Make this more ergonomic and flexible.
  // TODO: dimensions.
  async experimentalScreenshot(options?: {
    width: number;
    height: number;
  }): Promise<string> {
    return (await screenshot(this.experimentalModel, options)).dataURL;
  }

  // TODO: Make this more ergonomic and flexible.
  // TODO: dimensions.
  async experimentalDownloadScreenshot(filename?: string): Promise<void> {
    if (
      ["2D", "experimental-2D-LL", "experimental-2D-LL-face"].includes(
        await this.experimentalModel.visualizationStrategy.get(),
      )
    ) {
      // TODO: This has lots of async issues. It should also go into the screenshot impl file.
      const wrapper2D = this.#visualizationWrapper as Twisty2DSceneWrapper;
      const twisty2DPuzzle = await wrapper2D
        .currentTwisty2DPuzzleWrapper()!
        .twisty2DPuzzle();
      const str = new XMLSerializer().serializeToString(
        twisty2DPuzzle.svgWrapper.svgElement,
      );
      const url = URL.createObjectURL(new Blob([str]));
      downloadURL(
        url,
        filename ?? (await getDefaultFilename(this.experimentalModel)),
        "svg",
      );
    } else {
      await (await screenshot(this.experimentalModel)).download(filename);
    }
  }

  private addEventListeners(): void {
    // Using mousedown/mouseup & touchstart/touchend to detect clicks, since click event would always trigger on mouseup.
    // Bind native DOM events to internal handlers
    this.#visualizationWrapperElem.addEventListener("mousedown", (event) =>
      this.handleMouseDown(event),
    );
    this.#visualizationWrapperElem.addEventListener("mouseup", (event) =>
      this.handleMouseUp(event),
    );
    this.#visualizationWrapperElem.addEventListener("touchstart", (event) =>
      this.handleTouchStart(event),
    );
    this.#visualizationWrapperElem.addEventListener("touchend", (event) =>
      this.handleTouchEnd(event),
    );
  }

  private handleMouseDown(event: MouseEvent): void {
    // Call the onMouseDown callback if it exists, passing the event as an argument.
    this.onMouseDown?.(event);

    // Save the mousedown point.
    this.clickCoordinatesStart = { x: event.clientX, y: event.clientY };
  }

  private handleMouseUp(event: MouseEvent): void {
    // Call the onMouseUp callback if it exists, passing the event as an argument.
    this.onMouseUp?.(event);

    // Check if mousedown & mouseup are on the same point.
    if (
      this.isSamePoint(this.clickCoordinatesStart, {
        x: event.clientX,
        y: event.clientY,
      })
    ) {
      // Call the onClick callback if it exists, passing the event as an argument.
      this.onClick?.(event);
    }
  }

  private handleTouchStart(event: TouchEvent): void {
    // Call the onTouchStart callback if it exists, passing the event as an argument.
    this.onTouchStart?.(event);

    // Save the touch point.
    const touch = event.touches[0];
    this.clickCoordinatesStart = { x: touch.clientX, y: touch.clientY };
  }

  private handleTouchEnd(event: TouchEvent): void {
    // Call the onTouchEnd callback if it exists, passing the event as an argument.
    this.onTouchEnd?.(event);

    // Check if touchstart & touchend are on the same point.
    const touch = event.changedTouches[0];
    if (
      this.isSamePoint(this.clickCoordinatesStart, {
        x: touch.clientX,
        y: touch.clientY,
      })
    ) {
      // Call the onClick callback if it exists, passing the event as an argument.
      this.onClick?.(event);
    }
  }

  private isSamePoint(point1: Point, point2: Point): boolean {
    return point1.x === point2.x && point1.y === point2.y;
  }
}

customElementsShim.define("twisty-player", TwistyPlayer);
declare global {
  interface HTMLElementTagNameMap {
    "twisty-player": TwistyPlayer;
  }
}
