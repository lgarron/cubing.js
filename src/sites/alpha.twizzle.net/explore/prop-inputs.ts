import type { TwistyPlayer } from "../../../cubing/twisty";
import type { TempoScaleProp } from "../../../cubing/twisty/model/props/timeline/TempoScaleProp";
import type { TwistyPropSource } from "../../../cubing/twisty/model/props/TwistyProp";

// Returns the initial value.
function setupPropCheckbox<T extends string>(
  domID: string,
  prop: TwistyPropSource<T>,
  checkedValue: T,
  uncheckedValue: T,
) {
  const elem = document.getElementById(domID) as HTMLInputElement;
  const update = () => {
    prop.set(elem.checked ? checkedValue : uncheckedValue);
  };
  update();
  prop.addFreshListener((value) => {
    elem.checked = ![uncheckedValue].includes(value);
  });
  elem.addEventListener("change", update);
}

function setupSpriteCheckbox(
  domID: string,
  twistyPlayer: TwistyPlayer,
) {
  const elem = document.getElementById(domID) as HTMLInputElement;
  const update = () => {
    if (elem.checked) {
      twistyPlayer.setAttribute("experimental-stickering", "picture");
      twistyPlayer.setAttribute(
        "experimental-sprite",
        "/experiments.cubing.net/cubing.js/twisty/megaminx2.png",
      );
      twistyPlayer.setAttribute(
        "experimental-hint-sprite",
        "/experiments.cubing.net/cubing.js/twisty/megaminx2.png",
      );
    } else {
      twistyPlayer.setAttribute("experimental-stickering", "full");
    }
  };
  update();
  /*  TODO:  close this loop somehow?
  prop.addFreshListener((value) => {
    elem.checked = ![uncheckedValue].includes(value);
  });
  */
  elem.addEventListener("change", update);
}

function setupTempoScale(tempoScaleProp: TempoScaleProp): void {
  const tempoScaleInput = document.querySelector(
    "#tempo-scale",
  ) as HTMLInputElement;
  const tempoScaleDisplay = document.querySelector(
    "#tempo-scale-display",
  ) as HTMLSpanElement;
  tempoScaleInput.addEventListener("input", () => {
    tempoScaleProp.set(parseFloat(tempoScaleInput.value));
    tempoScaleDisplay.textContent = `${tempoScaleInput.value}×`;
  });
  tempoScaleProp.addFreshListener((tempoScale) => {
    tempoScaleInput.value = tempoScale.toString();
    tempoScaleDisplay.textContent = `${tempoScale}×`;
  });
}

export function setupPropInputs(twistyPlayer: TwistyPlayer): void {
  setupPropCheckbox(
    "visualization-3D",
    twistyPlayer.experimentalModel.visualizationFormat,
    "PG3D",
    "2D",
  );
  setupPropCheckbox(
    "back-view-side-by-side",
    twistyPlayer.experimentalModel.backView,
    "side-by-side",
    "top-right",
  );
  setupPropCheckbox(
    "foundation-display-opaque",
    twistyPlayer.experimentalModel.twistySceneModel.foundationDisplay,
    "opaque",
    "none",
  );
  setupPropCheckbox(
    "hint-facelets-floating",
    twistyPlayer.experimentalModel.twistySceneModel.hintFacelet,
    "floating",
    "none",
  );
  setupSpriteCheckbox(
    "supercube",
    twistyPlayer,
  )
  setupTempoScale(twistyPlayer.experimentalModel.tempoScale);
}
