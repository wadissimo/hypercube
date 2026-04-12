import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCubeRotationToState,
  applySpatialRotationToState,
  applyTwistToState,
  buildScrambledMagicCube4DState,
  createSolvedMagicCube4DState,
  getFaceCenteringRotationSteps,
  hasValidTwist,
  getStickerGripIndex,
  MAGICCUBE4D_INITIAL_VIEW,
  type MagicCube4DAnimation,
  type MagicCube4DTwistDirection,
  type Mat4,
} from '../utils/magiccube4d';
import { cloneMat4 } from '../utils/math4d';

export interface MagicCube4DSessionSnapshot {
  state: number[];
  sliceMask: number;
  rotation4d: Mat4;
}
interface Params {
  twistDurationMs?: number;
  animationDurationMs?: number;
  onStateCommit?: () => void;
}

type WholeCubeAnimation = Extract<
  MagicCube4DAnimation,
  { kind: 'cubeRotation' } | { kind: 'spatialRotation' }
>;

export function useMagicCube4D({
  twistDurationMs = 260,
  animationDurationMs = 240,
  onStateCommit,
}: Params = {}) {
  const [state, setState] = useState<number[]>(createSolvedMagicCube4DState);
  const [sliceMask, setSliceMask] = useState(0);
  const [twistAnimation, setTwistAnimation] = useState<MagicCube4DAnimation | null>(null);
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

  const runWholeCubeRotation = useCallback((
    animation: WholeCubeAnimation,
    applyRotation: (state: number[]) => number[],
    onComplete?: () => void,
  ) => {
    if (viewFrameRef.current || twistFrameRef.current) {
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min((Date.now() - startedAt) / animationDurationMs, 1);
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      setTwistAnimation({
        ...animation,
        progress: eased,
      });

      if (progress < 1) {
        twistFrameRef.current = requestAnimationFrame(tick);
      } else {
        setState(prev => {
          historyRef.current.push(prev);
          setCanUndo(true);
          onStateCommit?.();
          return applyRotation(prev);
        });
        setTwistAnimation(null);
        twistFrameRef.current = null;
        onComplete?.();
      }
    };

    setTwistAnimation({
      ...animation,
      progress: 0,
    });
    twistFrameRef.current = requestAnimationFrame(tick);
  }, [animationDurationMs, onStateCommit]);

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
        kind: 'twist',
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
          onStateCommit?.();
          return applyTwistToState(prev, gripIndex, dir, sliceMask);
        });
        setTwistAnimation(null);
        twistFrameRef.current = null;
      }
    };

    setTwistAnimation({
      kind: 'twist',
      gripIndex,
      dir,
      sliceMask,
      progress: 0,
    });
    twistFrameRef.current = requestAnimationFrame(tick);
  }, [onStateCommit, sliceMask, twistDurationMs]);

  const twistSticker = useCallback((stickerIndex: number | null, dir: MagicCube4DTwistDirection) => {
    twistGrip(stickerIndex == null ? null : getStickerGripIndex(stickerIndex), dir);
  }, [twistGrip]);

  const rotateFaceToCenter = useCallback((faceIndex: number | null) => {
    if (faceIndex == null || viewFrameRef.current || twistFrameRef.current) {
      return;
    }

    const steps = getFaceCenteringRotationSteps(faceIndex);
    if (steps.length === 0) {
      return;
    }

    const runStep = (index: number) => {
      const step = steps[index];
      const animation: WholeCubeAnimation = {
        kind: 'cubeRotation',
        axisIndex: step.axisIndex,
        dir: step.dir,
        progress: 0,
      };
      runWholeCubeRotation(
        animation,
        prev => applyCubeRotationToState(prev, step.axisIndex, step.dir),
        index + 1 < steps.length ? () => runStep(index + 1) : undefined,
      );
    };

    runStep(0);
  }, [runWholeCubeRotation]);

  const rotateState = useCallback((axisIndex: 0 | 1 | 2, dir: -1 | 1) => {
    runWholeCubeRotation({
      kind: 'cubeRotation',
      axisIndex,
      dir,
      progress: 0,
    }, prev => applyCubeRotationToState(prev, axisIndex, dir));
  }, [runWholeCubeRotation]);

  const rotateSpatialState = useCallback((axisIndex: 0 | 1 | 2, dir: -1 | 1) => {
    runWholeCubeRotation({
      kind: 'spatialRotation',
      axisIndex,
      dir,
      progress: 0,
    }, prev => applySpatialRotationToState(prev, axisIndex, dir));
  }, [runWholeCubeRotation]);

  const restoreSession = useCallback((session: MagicCube4DSessionSnapshot) => {
    if (viewFrameRef.current || twistFrameRef.current) {
      return;
    }

    historyRef.current = [];
    setCanUndo(false);
    setTwistAnimation(null);
    setState([...session.state]);
    setSliceMask(session.sliceMask);
    setBaseView(cloneMat4(session.rotation4d));
  }, []);

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
    rotateState,
    rotateSpatialState,
    restoreSession,
  };
}

function cancelFrame(frame: number | null) {
  if (frame !== null) {
    cancelAnimationFrame(frame);
  }
}
