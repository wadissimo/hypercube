import { useState, useRef, useCallback } from 'react';
import type { Face, CubeState, TwistAnimState } from '../utils/cubeModel';
import { twistFace } from '../utils/cubeModel';

const DURATION = 150;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useTwistAnimation(
  setCubeState: React.Dispatch<React.SetStateAction<CubeState>>,
) {
  const [twistAnim, setTwistAnim] = useState<TwistAnimState | null>(null);
  const animRef = useRef<number | null>(null);

  const twist = useCallback((face: Face, clockwise: boolean, layers: number[]) => {
    if (animRef.current) return;

    const startTime = Date.now();

    const tick = () => {
      const progress = Math.min((Date.now() - startTime) / DURATION, 1);
      const angle = easeOutCubic(progress) * (Math.PI / 2);

      if (progress < 1) {
        setTwistAnim({ face, clockwise, angle, layers });
        animRef.current = requestAnimationFrame(tick);
      } else {
        setTwistAnim(null);
        setCubeState(prev => twistFace(prev, face, clockwise, layers));
        animRef.current = null;
      }
    };

    setTwistAnim({ face, clockwise, angle: 0, layers });
    animRef.current = requestAnimationFrame(tick);
  }, [setCubeState]);

  return { twistAnim, twist };
}
