import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTwistToState,
  buildScrambledMagicCube4DState,
  createRotateFaceToCenterMatrix,
  createSolvedMagicCube4DState,
  hasValidTwist,
  getStickerFaceIndex,
  getStickerGripIndex,
  MAGICCUBE4D_DEFAULT_SLICE_MASK,
  MAGICCUBE4D_INITIAL_VIEW,
  type MagicCube4DTwistDirection,
  type MagicCube4DTwistAnimation,
  type Mat4,
} from '../utils/magiccube4d';
interface Params {
  twistDurationMs?: number;
  animationDurationMs?: number;
}

export function useMagicCube4D({
  twistDurationMs = 260,
  animationDurationMs = 240,
}: Params = {}) {
  const [state, setState] = useState<number[]>(createSolvedMagicCube4DState);
  const [sliceMask, setSliceMask] = useState(MAGICCUBE4D_DEFAULT_SLICE_MASK);
  const [twistAnimation, setTwistAnimation] = useState<MagicCube4DTwistAnimation | null>(null);
  const [baseView, setBaseView] = useState<Mat4>(MAGICCUBE4D_INITIAL_VIEW);
  const [canUndo, setCanUndo] = useState(false);

  const twistFrameRef = useRef<number | null>(null);
  const viewFrameRef = useRef<number | null>(null);
  const historyRef = useRef<number[][]>([]);

  useEffect(() => (
    () => {
      cancelFrame(twistFrameRef.current);
      cancelFrame(viewFrameRef.current);
    }
  ), []);

  const reset = useCallback(() => {
    if (twistFrameRef.current || viewFrameRef.current) {
      return;
    }
    historyRef.current = [];
    setCanUndo(false);
    setState(createSolvedMagicCube4DState());
  }, []);

  const scramble = useCallback((length = 28) => {
    if (twistFrameRef.current || viewFrameRef.current) {
      return;
    }
    historyRef.current = [];
    setCanUndo(false);
    setState(buildScrambledMagicCube4DState(length));
  }, []);

  const undo = useCallback(() => {
    if (twistFrameRef.current || viewFrameRef.current) {
      return;
    }

    const previous = historyRef.current.pop();
    if (!previous) {
      return;
    }

    setState(previous);
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const rotateFaceToCenter = useCallback((stickerIndex: number | null) => {
    if (stickerIndex == null || viewFrameRef.current || twistFrameRef.current) {
      return;
    }

    const faceIndex = getStickerFaceIndex(stickerIndex);
    const startView = baseView;
    const endView = createRotateFaceToCenterMatrix(startView, faceIndex, 1);
    if (!endView) {
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min((Date.now() - startedAt) / animationDurationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextView = createRotateFaceToCenterMatrix(startView, faceIndex, eased);
      if (nextView) {
        setBaseView(nextView);
      }

      if (progress < 1) {
        viewFrameRef.current = requestAnimationFrame(tick);
      } else {
        setBaseView(endView);
        viewFrameRef.current = null;
      }
    };

    viewFrameRef.current = requestAnimationFrame(tick);
  }, [animationDurationMs, baseView]);

  const twistGrip = useCallback((gripIndex: number | null, dir: MagicCube4DTwistDirection) => {
    if (gripIndex == null || twistFrameRef.current || viewFrameRef.current) {
      return;
    }

    if (!hasValidTwist(gripIndex, sliceMask)) {
      return;
    }
    const startedAt = Date.now();

    const tick = () => {
      const progress = Math.min((Date.now() - startedAt) / twistDurationMs, 1);
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      setTwistAnimation({
        gripIndex,
        dir,
        sliceMask,
        progress: eased,
      });

      if (progress < 1) {
        twistFrameRef.current = requestAnimationFrame(tick);
      } else {
        setState(prev => {
          historyRef.current.push(prev);
          setCanUndo(true);
          return applyTwistToState(prev, gripIndex, dir, sliceMask);
        });
        setTwistAnimation(null);
        twistFrameRef.current = null;
      }
    };

    setTwistAnimation({
      gripIndex,
      dir,
      sliceMask,
      progress: 0,
    });
    twistFrameRef.current = requestAnimationFrame(tick);
  }, [sliceMask, twistDurationMs]);

  const twistSticker = useCallback((stickerIndex: number | null, dir: MagicCube4DTwistDirection) => {
    twistGrip(stickerIndex == null ? null : getStickerGripIndex(stickerIndex), dir);
  }, [twistGrip]);

  return {
    state,
    sliceMask,
    setSliceMask,
    rotation4d: baseView,
    twistAnimation,
    canUndo,
    isAnimating: twistAnimation !== null || viewFrameRef.current !== null,
    reset,
    scramble,
    undo,
    twistGrip,
    twistSticker,
    rotateFaceToCenter,
  };
}

function cancelFrame(frame: number | null) {
  if (frame !== null) {
    cancelAnimationFrame(frame);
  }
}
