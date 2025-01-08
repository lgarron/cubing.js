import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type Material,
  type Texture,
} from "three";
import { Move } from "../../../../alg";
import type { KPuzzle, KTransformation } from "../../../../kpuzzle";
import type {
  StickerDat,
  StickerDatAxis,
  StickerDatSticker,
} from "../../../../puzzle-geometry";
import type { TextureMapper } from "../../../../puzzle-geometry/PuzzleGeometry";
import {
  experimentalGetFaceletStickeringMask,
  type ExperimentalFaceletMeshStickeringMask,
  type ExperimentalStickeringMask,
} from "../../../../puzzles/cubing-private";
import type { PuzzlePosition } from "../../../controllers/AnimationTypes";
import { smootherStep } from "../../../controllers/easing";
import type { HintFaceletStyle } from "../../../model/props/puzzle/display/HintFaceletProp";
import { TAU } from "../TAU";
import type { Twisty3DPuzzle } from "./Twisty3DPuzzle";

const foundationMaterial = new MeshBasicMaterial({
  side: DoubleSide,
  color: 0x000000,
});
const invisMaterial = new MeshBasicMaterial({
  visible: false,
});
const basicStickerMaterial = new MeshBasicMaterial({
  vertexColors: true,
});

function dist(coords: number[], a: number, b: number): number {
  return Math.hypot(
    coords[3 * a] - coords[3 * b],
    coords[3 * a + 1] - coords[3 * b + 1],
    coords[3 * a + 2] - coords[3 * b + 2],
  );
}

function triarea(coords: number[], a: number, b: number, c: number): number {
  const ab = dist(coords, a, b);
  const bc = dist(coords, b, c);
  const ac = dist(coords, a, c);
  const p = (ab + bc + ac) / 2;
  return Math.sqrt(p * (p - ab) * (p - bc) * (p - ac));
}

function polyarea(coords: number[]): number {
  let sum = 0;
  for (let i = 2; 3 * i < coords.length; i++) {
    sum += triarea(coords, 0, 1, i);
  }
  return sum;
}

function normalize(r: number[]): number[] {
  const m = Math.hypot(r[0], r[1], r[2]);
  r[0] /= m;
  r[1] /= m;
  r[2] /= m;
  return r;
}

function cross(a: number[], b: number[]): number[] {
  const r = new Array<number>(3);
  r[0] = a[1] * b[2] - a[2] * b[1];
  r[1] = a[2] * b[0] - a[0] * b[2];
  r[2] = a[0] * b[1] - a[1] * b[0];
  return r;
}

function normal(c: number[]): number[] {
  const a: number[] = [c[3] - c[0], c[4] - c[1], c[5] - c[2]];
  const b: number[] = [c[6] - c[3], c[7] - c[4], c[8] - c[5]];
  const r = cross(a, b);
  return normalize(r);
}

function trimEdges(face: number[], tr: number): number[] {
  const r: number[] = [];
  const A: number[] = new Array(3);
  const B: number[] = new Array(3);
  for (let iter = 1; iter < 10; iter++) {
    for (let i = 0; i < face.length; i += 3) {
      const pi = (i + face.length - 3) % face.length;
      const ni = (i + 3) % face.length;
      for (let k = 0; k < 3; k++) {
        A[k] = face[pi + k] - face[i + k];
        B[k] = face[ni + k] - face[i + k];
      }
      const alen = Math.hypot(A[0], A[1], A[2]);
      const blen = Math.hypot(B[0], B[1], B[2]);
      for (let k = 0; k < 3; k++) {
        A[k] /= alen;
        B[k] /= blen;
      }
      const d = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
      const m = tr / Math.sqrt(1 - d * d);
      for (let k = 0; k < 3; k++) {
        r[i + k] = face[i + k] + (A[k] + B[k]) * m;
      }
    }
    let good = true;
    for (let i = 0; good && i < r.length; i += 3) {
      const ni = (i + 3) % face.length;
      let t = 0;
      for (let k = 0; k < 3; k++) {
        const a = face[ni + k] - face[i + k];
        const b = r[ni + k] - r[i + k];
        t += a * b;
      }
      if (t <= 0) {
        good = false;
      }
    }
    if (good) {
      return r;
    }
    tr /= 2;
  }
  return face;
}

class Filler {
  pos: number;
  ipos: number;
  vertices: Float32Array;
  colors: Uint8Array;
  uvs?: Float32Array;
  ind: Uint8Array;
  constructor(
    public sz: number,
    public tm: TextureMapper,
  ) {
    this.vertices = new Float32Array(9 * sz);
    this.uvs = undefined;
    this.colors = new Uint8Array(18 * sz);
    this.ind = new Uint8Array(sz);
    this.pos = 0;
    this.ipos = 0;
  }

  add(pt: number[], i: number, c: number) {
    this.vertices[this.pos] = pt[3 * i + 0];
    this.vertices[this.pos + 1] = pt[3 * i + 1];
    this.vertices[this.pos + 2] = pt[3 * i + 2];
    this.colors[this.pos] = c >> 16;
    this.colors[this.pos + 1] = (c >> 8) & 255;
    this.colors[this.pos + 2] = c & 255;
    this.pos += 3;
  }

  addUncolored(pt: number[], i: number) {
    this.vertices[this.pos] = pt[3 * i + 0];
    this.vertices[this.pos + 1] = pt[3 * i + 1];
    this.vertices[this.pos + 2] = pt[3 * i + 2];
    this.pos += 3;
  }

  setind(i: number) {
    this.ind[this.ipos++] = i;
  }

  makePoly(coords: number[], color: number, ind: number): void {
    const ncoords: number[] = coords;
    for (let g = 1; 3 * (g + 1) < ncoords.length; g++) {
      this.add(ncoords, 0, color);
      this.add(ncoords, g, color);
      this.add(ncoords, g + 1, color);
      this.setind(ind);
    }
  }

  setAttributes(geo: BufferGeometry) {
    geo.setAttribute("position", new BufferAttribute(this.vertices, 3));
    // the geometry only needs the first half of the array
    const sa2 = this.colors.subarray(0, 9 * this.sz);
    geo.setAttribute("color", new BufferAttribute(sa2, 3, true));
  }

  makeGroups(geo: BufferGeometry) {
    geo.clearGroups();
    for (let i = 0; i < this.ipos; ) {
      const si = i++;
      const iv = this.ind[si];
      while (this.ind[i] === iv) {
        i++;
      }
      geo.addGroup(3 * si, 3 * (i - si), iv);
    }
  }

  saveOriginalColors() {
    this.colors.copyWithin(this.pos, 0, this.pos);
  }
}

class StickerDef {
  private origColor: number;
  private origColorStickeringMask: number;
  private faceColor: number;
  private texturePtr?: StickerDef = undefined;
  public twistVal: number = -1;
  public stickerStart: number;
  public stickerEnd: number;
  public hintStart: number;
  public hintEnd: number;
  public foundationStart: number;
  public foundationEnd: number;
  private isDup: boolean;
  private faceNum: number;
  constructor(
    filler: Filler,
    stickerDat: StickerDatSticker,
    trim: number,
    options?: {
      stickeringMask?: ExperimentalFaceletMeshStickeringMask;
    },
  ) {
    this.isDup = !!stickerDat.isDup;
    this.faceNum = stickerDat.face;
    this.stickerStart = filler.ipos;
    const sdColor = new Color(stickerDat.color).getHex();
    this.origColor = sdColor;
    this.origColorStickeringMask = sdColor;
    if (options?.stickeringMask) {
      this.setStickeringMask(filler, options.stickeringMask);
    }
    this.faceColor = sdColor;
    const coords = this.stickerCoords(stickerDat.coords, trim);
    filler.makePoly(coords, this.faceColor, this.isDup ? 4 : 0);
    this.stickerEnd = filler.ipos;
  }

  private stickerCoords(coords: number[], trim: number): number[] {
    return trimEdges(coords.slice(), trim);
  }

  private hintCoords(
    coords: number[],
    hintStickerHeightScale: number,
    trim: number,
    normal: number[],
  ): number[] {
    coords = this.stickerCoords(coords, trim); // pick up trim from stickers
    normal = normal.slice();
    for (let i = 0; i < 3; i++) {
      normal[i] *= 0.5 * hintStickerHeightScale;
    }
    const hCoords = new Array<number>(coords.length);
    for (let i = 0; 3 * i < coords.length; i++) {
      const j = coords.length / 3 - 1 - i;
      hCoords[3 * i] = coords[3 * j] + normal[0];
      hCoords[3 * i + 1] = coords[3 * j + 1] + normal[1];
      hCoords[3 * i + 2] = coords[3 * j + 2] + normal[2];
    }
    return hCoords;
  }

  private foundationCoords(coords: number[]): number[] {
    const ncoords = coords.slice();
    for (let i = 0; i < coords.length; i++) {
      ncoords[i] = coords[i] * 0.999;
    }
    return ncoords;
  }

  addHint(
    filler: Filler,
    stickerDat: StickerDatSticker,
    hintStickers: boolean,
    hintStickerHeightScale: number,
    trim: number,
    normal: number[],
  ): void {
    this.hintStart = filler.ipos;
    const coords = this.hintCoords(
      stickerDat.coords,
      hintStickerHeightScale,
      trim,
      normal,
    );
    filler.makePoly(
      coords,
      this.faceColor,
      hintStickers && !this.isDup ? 2 : 4,
    );
    this.hintEnd = filler.ipos;
  }

  public addFoundation(
    filler: Filler,
    stickerDat: StickerDatSticker,
    black: number,
  ) {
    this.foundationStart = filler.ipos;
    const coords = this.foundationCoords(stickerDat.coords);
    filler.makePoly(coords, black, this.isDup ? 4 : 6);
    this.foundationEnd = filler.ipos;
  }

  private setHintStickers(filler: Filler, hintStickers: boolean): void {
    const indv = this.isDup || !hintStickers ? 4 : 2;
    for (let i = this.hintStart; i < this.hintEnd; i++) {
      filler.ind[i] = indv | (filler.ind[i] & 1);
    }
  }

  setStickeringMask(
    filler: Filler,
    faceletMeshStickeringMask: ExperimentalFaceletMeshStickeringMask,
  ): void {
    let c = 0;
    switch (faceletMeshStickeringMask) {
      case "regular": {
        c = this.origColor;
        break;
      }
      case "dim": {
        if (this.origColor === 0xffffff) {
          c = 0xdddddd;
        } else {
          c = new Color(this.origColor).multiplyScalar(0.5).getHex();
        }
        break;
      }
      case "oriented": {
        c = 0x44ddcc;
        break;
      }
      case "experimentalOriented2": {
        c = 0xfffdaa;
        break;
      }
      case "ignored": {
        c = 0x444444;
        break;
      }
      case "mystery": {
        c = 0xf2cbcb;
        break;
      }
      case "invisible":
        c = this.origColor;
    }
    this.origColorStickeringMask = c;
    for (let i = 9 * this.stickerStart; i < 9 * this.stickerEnd; i += 3) {
      filler.colors[filler.pos + i] = c >> 16;
      filler.colors[filler.pos + i + 1] = (c >> 8) & 255;
      filler.colors[filler.pos + i + 2] = c & 255;
    }
    for (let i = 9 * this.hintStart; i < 9 * this.hintEnd; i += 3) {
      filler.colors[filler.pos + i] = c >> 16;
      filler.colors[filler.pos + i + 1] = (c >> 8) & 255;
      filler.colors[filler.pos + i + 2] = c & 255;
    }
    this.setHintStickers(
      filler,
      faceletMeshStickeringMask !== "invisible" && !this.isDup,
    );
  }

  public addUVs(filler: Filler): void {
    const uvs = filler.uvs!;
    const vert = filler.vertices;
    const coords = new Array(3);
    for (let i = 3 * this.stickerStart; i < 3 * this.stickerEnd; i++) {
      coords[0] = vert[3 * i];
      coords[1] = vert[3 * i + 1];
      coords[2] = vert[3 * i + 2];
      const uv = filler.tm.getuv(this.faceNum, coords);
      uvs[2 * i] = uv[0];
      uvs[2 * i + 1] = uv[1];
    }
    for (let i = 3 * this.hintStart; i < 3 * this.hintEnd; i++) {
      coords[0] = vert[3 * i];
      coords[1] = vert[3 * i + 1];
      coords[2] = vert[3 * i + 2];
      const uv = filler.tm.getuv(this.faceNum, coords);
      uvs[2 * i] = uv[0];
      uvs[2 * i + 1] = uv[1];
    }
  }

  public setTexture(filler: Filler, sd: StickerDef): number {
    if (this.texturePtr === sd) {
      return 0;
    }
    this.texturePtr = sd;
    const sz = 6 * filler.sz;
    filler.uvs!.copyWithin(
      6 * this.stickerStart,
      6 * sd.stickerStart + sz,
      6 * sd.stickerEnd + sz,
    );
    filler.uvs!.copyWithin(
      6 * this.hintStart,
      6 * sd.hintStart + sz,
      6 * sd.hintEnd + sz,
    );
    return 1;
  }

  public setColor(filler: Filler, sd: StickerDef): number {
    const c = sd.origColorStickeringMask;
    if (this.faceColor !== c) {
      this.faceColor = c;
      const sz = filler.pos;
      filler.colors.copyWithin(
        9 * this.stickerStart,
        9 * sd.stickerStart + sz,
        9 * sd.stickerEnd + sz,
      );
      filler.colors.copyWithin(
        9 * this.hintStart,
        9 * sd.hintStart + sz,
        9 * sd.hintEnd + sz,
      );
      return 1;
    } else {
      return 0;
    }
  }
}

class HitPlaneDef {
  public cubie: Group;
  private geo: BufferGeometry;
  constructor(hitface: any, tm: TextureMapper, stickerDat: StickerDat) {
    this.cubie = new Group();
    const coords = hitface.coords as number[];
    const filler = new Filler(coords.length / 3 - 2, tm);
    for (let g = 1; 3 * g + 3 < coords.length; g++) {
      filler.addUncolored(coords, 0);
      filler.addUncolored(coords, g);
      filler.addUncolored(coords, g + 1);
    }
    this.geo = new BufferGeometry();
    filler.setAttributes(this.geo);
    const obj = new Mesh(this.geo, invisMaterial);
    obj.userData.quantumMove = stickerDat.notationMapper.notationToExternal(
      new Move(hitface.name),
    );
    this.cubie.scale.setScalar(0.99);
    this.cubie.add(obj);
  }
}

class AxisInfo {
  public axis: Vector3;
  public order: number;
  constructor(axisDat: StickerDatAxis) {
    const vec = axisDat.coordinates;
    this.axis = new Vector3(vec[0], vec[1], vec[2]);
    this.order = axisDat.order;
  }
}

export interface PG3DOptions {
  stickeringMask?: ExperimentalStickeringMask;
}

const DEFAULT_COLOR_FRACTION = 0.71;
const PG_SCALE = 0.5;

// TODO: Split into "scene model" and "view".
/*
 *  PG3D uses a single geometry for the puzzle, with all the faces for
 *  each sticker (including the foundation stickers) in a single
 *  geometry.  We use the materialIndex in the face to point to a
 *  specific entry, which is either a colored sticker, invisible, or
 *  black (foundation).
 *
 *  To support general twisting of a subset of the puzzle, we then
 *  instantiate this same geometry in two different meshes with two
 *  distinct material arrays.  One, the fixed mesh, has the material
 *  array set up like:  [colored, invisible, black, invisible].
 *  The twisting mesh has the material array set up as
 *  [invisible, colored, invislble, black].  When not twisted, the
 *  two meshes are directly coincident, and the (shared) materialIndex
 *  in each face points to a non-invisible material in exactly one of
 *  the two meshes.  When we decide to twist some cubies, we make
 *  the cubies that move point to visible materials in the moving
 *  mesh (which makes them point to invisible materials in the static
 *  mesh).  This way, we only need to rotate the moving mesh as a
 *  single object---this should be very fast, and occur entirely in
 *  the GPU.  Unfortunately this doesn't quite work as fast as we'd
 *  like because three.js makes a draw call every time we have a change
 *  in the material index.  By moving the foundation triangles separate
 *  from the sticker triangles, we enhance the probability that many
 *  triangles can be rendered in one call speeding up the render.
 *  We also get some assistance from puzzleGeometry to try to keep
 *  nearby stickers close to each other.
 */
export class PG3D extends Object3D implements Twisty3DPuzzle {
  private stickers: { [key: string]: StickerDef[][] };
  private axesInfo: { [key: string]: AxisInfo };

  private stickerTargets: Object3D[] = [];
  private controlTargets: Object3D[] = [];

  private movingObj: Object3D;
  private filler: Filler;
  private foundationBound: number; // before this: colored; after: black
  private fixedGeo: BufferGeometry;
  private lastPos: PuzzlePosition;
  private lastMoveTransformation: KTransformation;
  private hintMaterial: Material;
  private stickerMaterial: Material;
  private materialArray1: Material[];
  private materialArray2: Material[];
  private textured: boolean = false;
  private showHintStickers: boolean = false;
  private showFoundations: boolean = false;
  private hintMaterialDisposable: boolean;
  private stickerMaterialDisposable: boolean;

  #pendingStickeringUpdate: boolean = false;

  public isPG3DForTwisty3DPuzzleWrapper: true;

  constructor(
    private scheduleRenderCallback: () => void,
    private kpuzzle: KPuzzle,
    private stickerDat: StickerDat,
    enableFoundationOpt: boolean = false,
    enableHintStickersOpt: boolean = false,
    hintStickerHeightScale: number = 1,
    private faceletScale: "auto" | number = 1,
    private params: PG3DOptions = {},
  ) {
    super();
    if (stickerDat.stickers.length === 0) {
      throw Error("Reuse of stickerdat from pg; please don't do that.");
    }
    this.hintMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
    });
    this.hintMaterialDisposable = true;
    this.stickerMaterial = basicStickerMaterial;
    this.stickerMaterialDisposable = false;
    this.axesInfo = {};
    const axesDef = this.stickerDat.axis;
    for (const axis of axesDef) {
      this.axesInfo[axis.quantumMove.family] = new AxisInfo(axis);
    }
    const stickers = this.stickerDat.stickers as any[];
    this.stickers = {};
    this.materialArray1 = new Array(8);
    this.materialArray2 = new Array(8);
    // TODO: the argument enableFoundationOpt really means, do we ever want to display
    // foundations.  But it is presently *used* to mean, show foundations initially
    // (and maybe setStickeringMask changes this).  So for now we set up the
    // show flag from the enable flag, and turn on the enable flag so later when it's
    // used we will get the foundations.  What this means is the geometry always "pays"
    // for foundations, even if they aren't displayed.
    this.showFoundation(enableFoundationOpt);
    enableFoundationOpt = true;
    let triangleCount = 0;
    const multiplier = 3;
    for (const sticker of stickers) {
      const sides = sticker.coords.length / 3;
      triangleCount += multiplier * (sides - 2);
    }
    const filler = new Filler(triangleCount, stickerDat.textureMapper);
    const black = 0;
    const normals: number[][] = [];
    let totArea = 0;
    for (const f of stickerDat.faces) {
      normals.push(normal(f.coords));
      totArea += polyarea(f.coords);
    }
    const colorfrac =
      faceletScale !== "auto"
        ? faceletScale * faceletScale
        : DEFAULT_COLOR_FRACTION;
    let nonDupStickers = 0;
    for (const sticker of stickers) {
      if (!sticker.isDup) {
        nonDupStickers++;
      }
    }
    const trim =
      (Math.sqrt(totArea / nonDupStickers) * (1 - Math.sqrt(colorfrac))) / 2;
    for (const sticker of stickers) {
      const orbit = sticker.orbit;
      const ord = sticker.ord;
      const ori = sticker.ori;
      if (!this.stickers[orbit]) {
        this.stickers[orbit] = [];
      }
      if (!this.stickers[orbit][ori]) {
        this.stickers[orbit][ori] = [];
      }
      const options: {
        stickeringMask?: ExperimentalFaceletMeshStickeringMask;
      } = {};
      if (params.stickeringMask) {
        options.stickeringMask = experimentalGetFaceletStickeringMask(
          params.stickeringMask,
          orbit,
          ord,
          ori,
          false,
        );
      }
      const stickerdef = new StickerDef(filler, sticker, trim, options);
      this.stickers[orbit][ori][ord] = stickerdef;
    }
    // TODO: the argument enableHintStickersOpt really means, do we ever want to display
    // hint stickers.  But it is presently *used* to mean, show hint stickers initially
    // (and maybe setStickeringMask changes this).  So for now we set up the
    // show flag from the enable flag, and turn on the enable flag so later when it's
    // used we will get the hint stickers.  What this means is the geometry always "pays"
    // for hint stickers, even if they aren't displayed.
    this.showHintStickers = enableHintStickersOpt;
    enableHintStickersOpt = true;
    for (const sticker of stickers) {
      const orbit = sticker.orbit;
      const ord = sticker.ord;
      const ori = sticker.ori;
      this.stickers[orbit][ori][ord].addHint(
        filler,
        sticker,
        enableHintStickersOpt,
        hintStickerHeightScale,
        trim,
        normals[sticker.face],
      );
    }
    this.foundationBound = filler.ipos;
    for (const sticker of stickers) {
      const orbit = sticker.orbit;
      const ord = sticker.ord;
      const ori = sticker.ori;
      if (enableFoundationOpt) {
        this.stickers[orbit][ori][ord].addFoundation(filler, sticker, black);
      }
    }
    const fixedGeo = new BufferGeometry();
    filler.setAttributes(fixedGeo);
    filler.makeGroups(fixedGeo);
    const obj = new Mesh(fixedGeo, this.materialArray1);
    obj.scale.set(PG_SCALE, PG_SCALE, PG_SCALE);
    this.add(obj);
    const obj2 = new Mesh(fixedGeo, this.materialArray2);
    obj2.scale.set(PG_SCALE, PG_SCALE, PG_SCALE);
    this.add(obj2);
    const hitfaces = this.stickerDat.faces as any[];
    this.movingObj = obj2;
    this.fixedGeo = fixedGeo;
    this.filler = filler;
    for (const hitface of hitfaces) {
      const facedef = new HitPlaneDef(
        hitface,
        stickerDat.textureMapper,
        this.stickerDat,
      );
      facedef.cubie.scale.set(PG_SCALE, PG_SCALE, PG_SCALE);
      this.add(facedef.cubie);
      this.controlTargets.push(facedef.cubie.children[0]);
    }
    filler.saveOriginalColors();
    stickerDat.stickers = []; // don't need these anymore
    this.updateMaterialArrays();
    /*
    this.experimentalUpdateTexture(
      true,
      new TextureLoader().load(
        "/experiments.cubing.net/cubing.js/twisty/mkbhd-sprite-red.png",
      ),
      new TextureLoader().load(
        "/experiments.cubing.net/cubing.js/twisty/mkbhd-sprite-red-hint.png",
      ),
    );
    */
  }

  public dispose(): void {
    if (this.fixedGeo) {
      this.fixedGeo.dispose();
    }
    if (this.stickerMaterialDisposable) {
      this.stickerMaterial.dispose();
      this.stickerMaterial = basicStickerMaterial;
      this.stickerMaterialDisposable = false;
    }
    if (this.hintMaterialDisposable) {
      this.hintMaterial.dispose();
      this.hintMaterial = basicStickerMaterial;
      this.hintMaterialDisposable = false;
    }
  }

  public experimentalGetStickerTargets(): Object3D[] {
    return this.stickerTargets;
  }

  public experimentalGetControlTargets(): Object3D[] {
    return this.controlTargets;
  }

  #isValidMove(move: Move): boolean {
    try {
      this.kpuzzle.moveToTransformation(move);
      return true;
    } catch (_) {
      return false;
    }
  }

  getClosestMoveToAxis(
    point: Vector3,
    transformations: {
      invert: boolean;
      depth?: "secondSlice" | "rotation" | "none";
    },
  ): { move: Move; order: number } | null {
    let closestMove: Move | null = null;
    let closestMoveDotProduct: number = 0;

    let modify: (move: Move) => Move = (m) => m;
    switch (transformations.depth) {
      case "secondSlice": {
        modify = (m: Move) => m.modified({ innerLayer: 2 });
        break;
      }
      case "rotation": {
        modify = (m: Move) => m.modified({ family: `${m.family}v` });
        break;
      }
    }

    for (const axis of this.stickerDat.axis) {
      const product = point.dot(new Vector3(...axis.coordinates));
      if (product > closestMoveDotProduct) {
        const modified = this.stickerDat.notationMapper.notationToExternal(
          modify(axis.quantumMove),
        );
        if (!modified) {
          continue;
        }
        if (this.#isValidMove(modified)) {
          closestMoveDotProduct = product;
          closestMove = modified;
        }
      }
    }

    if (!closestMove) {
      return null;
    }

    if (transformations.invert) {
      closestMove = closestMove.invert();
    }
    const order = this.kpuzzle
      .moveToTransformation(closestMove)
      .repetitionOrder();
    return { move: closestMove, order }; // TODO: push this down
  }

  setStickeringMask(stickeringMask: ExperimentalStickeringMask): void {
    this.params.stickeringMask = stickeringMask;
    if (stickeringMask.specialBehaviour !== "picture") {
      for (const orbitDefinition of this.kpuzzle.definition.orbits) {
        // This isn't strictly necessary, but it keeps the following lines more
        // readable by fitting each `for` loop onto a single line when running
        // `make format`.
        const { numPieces, numOrientations } = orbitDefinition;
        for (let pieceIdx = 0; pieceIdx < numPieces; pieceIdx++) {
          for (let faceletIdx = 0; faceletIdx < numOrientations; faceletIdx++) {
            const faceletStickeringMask = experimentalGetFaceletStickeringMask(
              stickeringMask,
              orbitDefinition.orbitName,
              pieceIdx,
              faceletIdx,
              false,
            );
            const stickerDef =
              this.stickers[orbitDefinition.orbitName][faceletIdx][pieceIdx];
            if (
              this.textured &&
              this.hintMaterialDisposable &&
              faceletStickeringMask === "invisible"
            ) {
              // ignore "invisible" if textured hints
            } else {
              stickerDef.setStickeringMask(this.filler, faceletStickeringMask);
            }
          }
        }
      }
    }
    this.#pendingStickeringUpdate = true;
    if (this.lastPos) {
      this.onPositionChange(this.lastPos);
    }
  }

  public onPositionChange(p: PuzzlePosition): void {
    const transformation = p.pattern.experimentalToTransformation();
    if (!transformation) {
      throw new Error("indistinguishable pieces are not supported by PG3D yet");
    }
    const noRotation = new Euler();
    this.movingObj.rotation.copy(noRotation);
    let colormods = 0;
    const filler = this.filler;
    const ind = filler.ind;
    if (
      !this.lastPos ||
      this.#pendingStickeringUpdate ||
      !this.lastPos.pattern
        .experimentalToTransformation()!
        .isIdentical(transformation)
    ) {
      for (const orbit in this.stickers) {
        const pieces = this.stickers[orbit];
        const pos2 = transformation.transformationData[orbit];
        const orin = pieces.length;
        if (orin === 1) {
          const pieces2 = pieces[0];
          for (let i = 0; i < pieces2.length; i++) {
            const ni = pos2.permutation[i];
            if (this.textured) {
              colormods += pieces2[i].setTexture(filler, pieces2[ni]);
            } else {
              colormods += pieces2[i].setColor(filler, pieces2[ni]);
            }
          }
        } else {
          for (let ori = 0; ori < orin; ori++) {
            const pieces2 = pieces[ori];
            for (let i = 0; i < pieces2.length; i++) {
              const nori = (ori + orin - pos2.orientationDelta[i]) % orin;
              const ni = pos2.permutation[i];
              if (this.textured) {
                colormods += pieces2[i].setTexture(filler, pieces[nori][ni]);
              } else {
                colormods += pieces2[i].setColor(filler, pieces[nori][ni]);
              }
            }
          }
        }
      }
      this.lastPos = p;
    }
    let vismods = 0;
    for (const moveProgress of p.movesInProgress) {
      const externalMove = moveProgress.move;
      // TODO: unswizzle goes external to internal, and so does the call after that
      // and so does the stateForBlockMove call
      const unswizzled = this.stickerDat.unswizzle(externalMove);
      if (!unswizzled) {
        // bad times, but let's not throw.
        return;
      }

      const move = externalMove;
      let quantumTransformation: KTransformation | undefined;
      try {
        quantumTransformation = this.kpuzzle.moveToTransformation(
          move.modified({ amount: 1 }),
        );
      } catch (e) {
        // couldn't get it from a quantum of the external move.  Let's try
        // getting it from a quantum of the internal move, translated back
        // to external so we can get the transformation.  This happens for
        // instance when working with "x2" on megaminx.
        const move1 = this.stickerDat.notationMapper.notationToInternal(move);
        if (move1) {
          const move2 = this.stickerDat.notationMapper.notationToExternal(
            move1.modified({ amount: 1 }),
          );
          if (move2) {
            quantumTransformation = this.kpuzzle.moveToTransformation(move2);
          }
        }
        if (!quantumTransformation) {
          console.log(e);
          throw e;
        }
      }
      const ax = this.axesInfo[unswizzled.family];
      const turnNormal = ax.axis;
      const angle =
        (-this.ease(moveProgress.fraction) *
          moveProgress.direction *
          unswizzled.amount *
          TAU) /
        ax.order;
      this.movingObj.rotateOnAxis(turnNormal, angle);
      if (this.lastMoveTransformation !== quantumTransformation) {
        for (const orbit in this.stickers) {
          const pieces = this.stickers[orbit];
          const orin = pieces.length;
          const bmv = quantumTransformation.transformationData[orbit];
          for (let ori = 0; ori < orin; ori++) {
            const pieces2 = pieces[ori];
            for (let i = 0; i < pieces2.length; i++) {
              const p2 = pieces2[i];
              const ni = bmv.permutation[i];
              let tv = 0;
              if (ni !== i || bmv.orientationDelta[i] !== 0) {
                tv = 1;
              }
              if (tv !== p2.twistVal) {
                if (tv) {
                  for (let j = p2.stickerStart; j < p2.stickerEnd; j++) {
                    ind[j] |= 1;
                  }
                  for (let j = p2.hintStart; j < p2.hintEnd; j++) {
                    ind[j] |= 1;
                  }
                  for (let j = p2.foundationStart; j < p2.foundationEnd; j++) {
                    ind[j] |= 1;
                  }
                } else {
                  for (let j = p2.stickerStart; j < p2.stickerEnd; j++) {
                    ind[j] &= ~1;
                  }
                  for (let j = p2.hintStart; j < p2.hintEnd; j++) {
                    ind[j] &= ~1;
                  }
                  for (let j = p2.foundationStart; j < p2.foundationEnd; j++) {
                    ind[j] &= ~1;
                  }
                }
                p2.twistVal = tv;
                vismods++;
              }
            }
          }
        }
        this.lastMoveTransformation = quantumTransformation;
      }
    }
    if (this.#pendingStickeringUpdate || vismods) {
      this.filler.makeGroups(this.fixedGeo);
    }
    if (this.#pendingStickeringUpdate || colormods) {
      if (this.textured) {
        (this.fixedGeo.getAttribute("uv") as BufferAttribute).addUpdateRange(
          0,
          6 * this.foundationBound,
        );
        (this.fixedGeo.getAttribute("uv") as BufferAttribute).needsUpdate =
          true;
      }
      if (this.#pendingStickeringUpdate || !this.textured) {
        (this.fixedGeo.getAttribute("color") as BufferAttribute).addUpdateRange(
          0,
          9 * this.foundationBound,
        );
        (this.fixedGeo.getAttribute("color") as BufferAttribute).needsUpdate =
          true;
      }
    }
    this.scheduleRenderCallback();
    this.#pendingStickeringUpdate = false;
  }

  private ease(fraction: number): number {
    return smootherStep(fraction);
  }

  private showHintFacelets(v: boolean) {
    this.showHintStickers = v;
  }

  private updateMaterialArrays() {
    for (let i = 0; i < 8; i++) {
      this.materialArray1[i] = invisMaterial;
      this.materialArray2[i] = invisMaterial;
    }
    this.materialArray1[0] = this.stickerMaterial;
    this.materialArray2[1] = this.stickerMaterial;
    if (this.showHintStickers) {
      this.materialArray1[2] = this.hintMaterial;
      this.materialArray2[3] = this.hintMaterial;
    } else {
      this.materialArray1[2] = invisMaterial;
      this.materialArray2[3] = invisMaterial;
    }
    if (this.showFoundations) {
      this.materialArray1[6] = foundationMaterial;
      this.materialArray2[7] = foundationMaterial;
    } else {
      this.materialArray1[6] = invisMaterial;
      this.materialArray2[7] = invisMaterial;
    }
  }

  private showFoundation(v: boolean) {
    this.showFoundations = v;
  }

  private setHintStickerOpacity(v: number): void {
    if (this.hintMaterialDisposable) {
      this.hintMaterial.dispose();
      this.hintMaterialDisposable = false;
    }
    if (v === 0) {
      this.hintMaterial = invisMaterial;
    } else if (v === 1) {
      this.hintMaterial = this.stickerMaterial;
    } else {
      this.hintMaterial = new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: v,
      });
      this.hintMaterialDisposable = true;
    }
  }

  public experimentalUpdateOptions(options: {
    showMainStickers?: boolean;
    hintFacelets?: HintFaceletStyle;
    showFoundation?: boolean; // TODO: better name
    hintStickerOpacity?: number;
    faceletScale?: "auto" | number;
  }): void {
    if (options.hintFacelets !== undefined) {
      this.showHintFacelets(options.hintFacelets !== "none");
    }
    if (options.showFoundation !== undefined) {
      this.showFoundation(options.showFoundation);
    }
    if (options.hintStickerOpacity !== undefined) {
      this.setHintStickerOpacity(options.hintStickerOpacity);
    }
    this.#pendingStickeringUpdate = true;
    if (this.lastPos) {
      this.onPositionChange(this.lastPos);
    }
    if (
      typeof options.faceletScale !== "undefined" &&
      options.faceletScale !== this.faceletScale
    ) {
      console.warn(
        "Dynamic facelet scale is not yet supported for PG3D. For now, re-create the TwistyPlayer to change the facelet scale.",
      );
    }
    this.updateMaterialArrays();
    this.scheduleRenderCallback();
  }

  private adduvs() {
    const filler = this.filler;
    if (filler.uvs) {
      return;
    }
    this.filler.uvs = new Float32Array(12 * filler.sz);
    for (const orbit in this.stickers) {
      const pieces = this.stickers[orbit];
      const orin = pieces.length;
      for (let ori = 0; ori < orin; ori++) {
        const pieces2 = pieces[ori];
        for (const piece2 of pieces2) {
          piece2.addUVs(this.filler);
        }
      }
    }
    filler.uvs!.copyWithin(6 * filler.sz, 0, 6 * filler.sz);
    const sa1 = filler.uvs!.subarray(0, 6 * filler.sz);
    this.fixedGeo.setAttribute("uv", new BufferAttribute(sa1, 2, true));
  }

  public experimentalUpdateTexture(
    enabled: boolean,
    stickerTexture?: Texture | null,
    hintTexture?: Texture | null,
  ) {
    if (!stickerTexture) {
      enabled = false;
    }
    if (enabled && !this.filler.uvs) {
      this.adduvs();
    }
    this.textured = enabled;
    if (this.stickerMaterialDisposable) {
      this.stickerMaterial.dispose();
      this.stickerMaterialDisposable = false;
    }
    if (enabled) {
      this.stickerMaterial = new MeshBasicMaterial({
        map: stickerTexture,
        side: FrontSide,
        transparent: false,
      });
      this.stickerMaterialDisposable = true;
    } else {
      this.stickerMaterial = basicStickerMaterial;
    }
    if (this.hintMaterialDisposable) {
      this.hintMaterial.dispose();
      this.hintMaterialDisposable = false;
    }
    if (enabled) {
      this.hintMaterial = new MeshBasicMaterial({
        map: hintTexture,
        side: FrontSide,
        transparent: true,
      });
      this.hintMaterialDisposable = true;
    } else {
      this.hintMaterial = basicStickerMaterial;
    }
    if (enabled) {
      this.showHintFacelets(hintTexture !== null);
    }
    this.updateMaterialArrays();
    this.#pendingStickeringUpdate = true;
    if (this.lastPos) {
      this.onPositionChange(this.lastPos);
    }
    this.scheduleRenderCallback();
  }
}
