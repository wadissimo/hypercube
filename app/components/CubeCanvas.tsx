import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { Mat3, Vec3 } from '../utils/math3d';
import { mulMat, mulVec, project } from '../utils/math3d';
import type { CubeState, Face, TwistAnimState } from '../utils/cubeModel';
import { FACE_COLORS, isInLayer, twistRotationMatrix } from '../utils/cubeModel';

interface Props {
  cubeState: CubeState;
  viewMatrix: Mat3;
  zoom: number;
  twistAnim: TwistAnimState | null;
  width: number;
  height: number;
}

const GAP = 0.07;
const HALF = 0.5 - GAP;
const FOV = 400;
const VIEW_DIST = 6;

function stickerQuad(cx: number, cy: number, cz: number, face: Face): Vec3[] {
  const h = HALF;
  switch (face) {
    case 'U': return [[cx-h, cy+.5, cz-h], [cx+h, cy+.5, cz-h], [cx+h, cy+.5, cz+h], [cx-h, cy+.5, cz+h]];
    case 'D': return [[cx-h, cy-.5, cz+h], [cx+h, cy-.5, cz+h], [cx+h, cy-.5, cz-h], [cx-h, cy-.5, cz-h]];
    case 'R': return [[cx+.5, cy-h, cz+h], [cx+.5, cy-h, cz-h], [cx+.5, cy+h, cz-h], [cx+.5, cy+h, cz+h]];
    case 'L': return [[cx-.5, cy-h, cz-h], [cx-.5, cy-h, cz+h], [cx-.5, cy+h, cz+h], [cx-.5, cy+h, cz-h]];
    case 'F': return [[cx-h, cy-h, cz+.5], [cx+h, cy-h, cz+.5], [cx+h, cy+h, cz+.5], [cx-h, cy+h, cz+.5]];
    case 'B': return [[cx+h, cy-h, cz-.5], [cx-h, cy-h, cz-.5], [cx-h, cy+h, cz-.5], [cx+h, cy+h, cz-.5]];
  }
}

function avgZ(verts: Vec3[]): number {
  return (verts[0][2] + verts[1][2] + verts[2][2] + verts[3][2]) / 4;
}

export default function CubeCanvas({ cubeState, viewMatrix, zoom, twistAnim, width, height }: Props) {
  const faces = useMemo(() => {
    const cx = width / 2;
    const cy = height / 2;

    const result: { vertices: Vec3[]; color: string }[] = [];

    for (const cubie of cubeState) {
      const inTwist = twistAnim && isInLayer(cubie, twistAnim.face);
      let mat = viewMatrix;
      if (inTwist) {
        const dir = twistAnim!.clockwise ? 1 : -1;
        mat = mulMat(viewMatrix, twistRotationMatrix(twistAnim!.face, twistAnim!.angle * dir));
      }

      for (const [dir, color] of Object.entries(cubie.faces) as [Face, Face][]) {
        const [px, py, pz] = cubie.position;
        const verts = stickerQuad(px, py, pz, dir).map(v => mulVec(mat, v)) as [Vec3, Vec3, Vec3, Vec3];
        result.push({ vertices: verts, color: FACE_COLORS[color] });
      }
    }

    result.sort((a, b) => avgZ(b.vertices) - avgZ(a.vertices));

    return result.map(({ vertices, color }) => {
      const pts = vertices.map(v => project(v, FOV * zoom, VIEW_DIST, cx, cy));
      const path = Skia.Path.Make();
      path.moveTo(pts[0][0], pts[0][1]);
      path.lineTo(pts[1][0], pts[1][1]);
      path.lineTo(pts[2][0], pts[2][1]);
      path.lineTo(pts[3][0], pts[3][1]);
      path.close();
      return { path, color };
    });
  }, [cubeState, viewMatrix, zoom, twistAnim, width, height]);

  return (
    <Canvas style={{ width, height }}>
      {faces.map((face, i) => (
        <React.Fragment key={i}>
          <Path path={face.path} color={face.color} style="fill" />
          <Path path={face.path} color="#111111" style="stroke" strokeWidth={2} />
        </React.Fragment>
      ))}
    </Canvas>
  );
}
