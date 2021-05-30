import { AlgEditor } from "./AlgEditor";
import { TwistyPlayer } from "./TwistyPlayer";
import "../../alg/test/alg-comparison";
import { Alg } from "../../alg";

describe("AlgEditor", () => {
  it("can be constructed without arguments", () => {
    const algEditor = new AlgEditor();
    expect(algEditor.twistyPlayer).toBeNull();
  });
  it("can be constructed with a player", () => {
    const twistyPlayer = new TwistyPlayer();
    const algEditor = new AlgEditor({ twistyPlayer });
    expect(algEditor.twistyPlayer).not.toBeNull();
  });
  it("can have a player set as an attribute", () => {
    // TODO: 2D is to avoid WebGL error. Can we do this in another way?
    const twistyPlayer = new TwistyPlayer({ visualization: "2D" });
    twistyPlayer.id = "test-id-1";
    document.body.appendChild(twistyPlayer);
    const algEditor = new AlgEditor();
    algEditor.setAttribute("for-twisty-player", "test-id-1");
    expect(algEditor.twistyPlayer).not.toBeNull();
  });
  it("sets timestamp from textarea", async () => {
    const twistyPlayer = new TwistyPlayer({ alg: "F2", visualization: "2D" });
    document.body.appendChild(twistyPlayer);
    expect(twistyPlayer.alg).toBeIdentical(new Alg("F2"));
    const algEditor = new AlgEditor({ twistyPlayer });
    algEditor.algString = "R      U R' D2";
    expect(twistyPlayer.alg).toBeIdentical(new Alg("R U R' D2"));

    // TODO: get this working.
    // const textarea = algEditor.shadow.querySelector("textarea");
    // expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    // textarea!.setSelectionRange(8, 8);
    // textarea!.dispatchEvent(new CustomEvent("input"));
    // expect(twistyPlayer.timeline.timestamp).toBe(2000);
  });
});
