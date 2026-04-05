import { useState, useRef, useCallback } from 'react';
import type { Face, CubeState, TwistAnimState } from '../utils/cubeModel';
import { twistFace } from '../utils/cubeModel';

const DURATION = 150;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useTwistAnimation(
  setCubeState: React.Dispatch<React.SetStateAction<CubeState>>,
  onTwistComplete?: (previousState: CubeState, nextState: CubeState) => void,
) {
  const [twistAnim, setTwistAnim] = useState<TwistAnimState | null>(null);
  const animRef = useRef<number | null>(null);

  const twist = useCallback((face: Face, clockwise: boolean, layers: number[], turns: 1 | 2 = 1) => {
    if (animRef.current) return;

    const startTime = Date.now();
    const targetAngle = (Math.PI / 2) * turns;
    const duration = DURATION * turns;

    const tick = () => {
      const progress = Math.min((Date.now() - startTime) / duration, 1);
      const angle = easeOutCubic(progress) * targetAngle;

      if (progress < 1) {
        setTwistAnim({ face, clockwise, angle, layers });
        animRef.current = requestAnimationFrame(tick);
      } else {
        setTwistAnim(null);
        setCubeState(prev => {
          let next = prev;
          for (let turn = 0; turn < turns; turn++) {
            next = twistFace(next, face, clockwise, layers);
          }
          onTwistComplete?.(prev, next);
          return next;
        });
        animRef.current = null;
      }
    };

    setTwistAnim({ face, clockwise, angle: 0, layers });
    animRef.current = requestAnimationFrame(tick);
  }, [onTwistComplete, setCubeState]);

  return { twistAnim, twist };
}
