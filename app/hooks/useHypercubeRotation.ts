import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HyperAxis } from '../utils/hypercubeModel';
import type { Mat4, Vec4 } from '../utils/math4d';
import { identity4, mulMat4, mulVec4, planeRotation4 } from '../utils/math4d';

const DURATION_MS = 220;
const QUARTER_TURN = Math.PI / 2;

interface RotationAnim {
  axis: HyperAxis;
  angle: number;
}

export function useHypercubeRotation() {
  const [baseRotation, setBaseRotation] = useState<Mat4>(identity4);
  const [anim, setAnim] = useState<RotationAnim | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => (
    () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    }
  ), []);

  const rotateCellToInner = useCallback((currentCenter: Vec4) => {
    if (animRef.current) return;

    const move = chooseRotationToInner(currentCenter);
    if (!move) return;

    const startTime = Date.now();

    const tick = () => {
      const progress = Math.min((Date.now() - startTime) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnim({ axis: move.axis, angle: move.angle * eased });

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setBaseRotation(prev => mulMat4(rotationForAxis(move.axis, move.angle), prev));
        setAnim(null);
        animRef.current = null;
      }
    };

    setAnim({ axis: move.axis, angle: 0 });
    animRef.current = requestAnimationFrame(tick);
  }, []);

  const rotationMatrix = useMemo(() => {
    if (!anim) {
      return baseRotation;
    }

    return mulMat4(rotationForAxis(anim.axis, anim.angle), baseRotation);
  }, [anim, baseRotation]);

  return {
    rotationMatrix,
    isAnimating: !!anim,
    rotateCellToInner,
  };
}

function chooseRotationToInner(center: Vec4): { axis: HyperAxis; angle: number } | null {
  if (center[3] < -1.2) {
    return null;
  }

  let best: { axis: HyperAxis; angle: number; score: number } | null = null;
  for (const axis of ['x', 'y', 'z'] as HyperAxis[]) {
    if (Math.abs(center[axisIndex(axis)]) < 0.2) {
      continue;
    }

    for (const angle of [QUARTER_TURN, -QUARTER_TURN]) {
      const rotated = mulVec4(rotationForAxis(axis, angle), center);
      const score = scoreInnerPlacement(rotated);
      if (!best || score > best.score) {
        best = { axis, angle, score };
      }
    }
  }

  return best ? { axis: best.axis, angle: best.angle } : null;
}

function scoreInnerPlacement(center: Vec4): number {
  const spatialMagnitude = Math.abs(center[0]) + Math.abs(center[1]) + Math.abs(center[2]);
  return (-center[3] * 10) - spatialMagnitude;
}

function rotationForAxis(axis: HyperAxis, angle: number): Mat4 {
  return planeRotation4(axisIndex(axis), axisIndex('w'), angle);
}

function axisIndex(axis: HyperAxis): 0 | 1 | 2 | 3 {
  switch (axis) {
    case 'x':
      return 0;
    case 'y':
      return 1;
    case 'z':
      return 2;
    case 'w':
      return 3;
  }
}
