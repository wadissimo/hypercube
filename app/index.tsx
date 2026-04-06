import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppInfoSheet, { type InfoSection } from './components/AppInfoSheet';
import AppOverflowMenuSheet, { type OverflowMenuAction } from './components/AppOverflowMenuSheet';
import CubeCanvas from './components/CubeCanvas';
import CubeNotationPanel from './components/CubeNotationPanel';
import CubeTimerOverlay from './components/CubeTimerOverlay';
import CubeTimerSheet from './components/CubeTimerSheet';
import HypercubeViewport, { type HypercubeViewportHandle } from './components/HypercubeViewport';
import MagicCube4DSettingsSheet from './components/MagicCube4DSettingsSheet';
import type { Axis, CubeSize, CubeState, Face } from './utils/cubeModel';
import {
  ALL_FACES,
  FACE_COLORS,
  SUPPORTED_CUBE_SIZES,
  createSolvedCube,
  faceLayers,
  faceSign,
  twistFace,
  faceAxis,
} from './utils/cubeModel';
import { createDefaultCubeViewMatrix, INITIAL_CUBE_ZOOM, useCubeGesture } from './hooks/useCubeGesture';
import { createHypercubeViewMatrix } from './hooks/useHypercubeGesture';
import { useMagicCube4D } from './hooks/useMagicCube4D';
import { useTwistAnimation } from './hooks/useTwistAnimation';
import { resolve3DNotationMove } from './utils/cubeNotation';
import { resolveScreenRelativeMapping } from './utils/cubeControls';
import {
  getFaceCenter,
  getFaceCenterStickerIndex,
  getGripTwistMatrix,
  getFaceTwistAxisOptions,
  getSpatialRotationMatrix,
  mulRowVec4,
  type MagicCube4DPickInfo,
  type MagicCube4DTwistDirection,
  MAGICCUBE4D_DEFAULT_SLICE_MASK,
  MAGICCUBE4D_FACE_COLORS,
  MAGICCUBE4D_FACE_LABELS,
  MAGICCUBE4D_SLICE_BITS,
  MAGICCUBE4D_SLICE_LABELS,
} from './utils/magiccube4d';
import {
  clampMagicCube4DSettings,
  DEFAULT_MAGICCUBE4D_SETTINGS,
} from './utils/magiccube4dSettings';
import { MAGICCUBE4D_HYPERCUBE_DATA } from './utils/magiccube4dData';
import { cloneMat3, mulVec, type Mat3 } from './utils/math3d';
import { cloneMat4 } from './utils/math4d';
import {
  loadRestorableAppState,
  loadSavedAppState,
  normalizePersistedCubeSession,
  normalizePersistedHypercubeSession,
  saveAppState,
  saveAutosavedAppState,
  type PersistedAppState,
  type PersistedCubeSession,
} from './utils/persistence';
import {
  clearCubeTimerHistory,
  cloneCubeTimerSession,
  createDefaultCubeTimerSession,
  pauseCubeTimerSession,
  sanitizeCubeTimerSessionForPersistence,
  startCubeTimerSession,
  stopCubeTimerSession,
} from './utils/cubeTimer';

const SCRAMBLE_MOVES = 20;
const GRIP_FACE_GRID_ROWS = [
  [6, 4, 5],
  [7, null, 0],
  [2, 3, 1],
] as const;
const GRIP_FACE_BUTTON_LABELS: Record<number, string> = {
  0: 'I',
  1: 'R',
  2: 'F',
  3: 'D',
  4: 'U',
  5: 'B',
  6: 'L',
  7: 'O',
};
const GLOBAL_4D_AXIS_OPTIONS = [
  { axisIndex: 0 },
  { axisIndex: 1 },
  { axisIndex: 2 },
] as const;
const ROTATION_ROW_LABELS = ['X', 'Y', 'Z'] as const;
const MAGICCUBE4D_SCALE_4D = 1 / MAGICCUBE4D_HYPERCUBE_DATA.circumRadius;
const MAGICCUBE4D_EYE_W = MAGICCUBE4D_HYPERCUBE_DATA.eyeW;
const AXIS_SAMPLE_OFFSET = 0.2;
const FACE_PROBE_OFFSETS = [0.24, 0.11, 0.17] as const;
const TWIST_SAMPLE_FRACTION = 0.12;

type Displayed4DControlAction =
  | { kind: 'rotation'; axisIndex: 0 | 1 | 2; dir: -1 | 1 }
  | { kind: 'faceTurn'; gripIndex: number; dir: MagicCube4DTwistDirection };

const ALL_CUBE_SLICES_MASK = -1;
interface Displayed4DControlRow {
  key: string;
  slotLabel: string;
  negativeAction: Displayed4DControlAction;
  positiveAction: Displayed4DControlAction;
}

type ScreenMode = 'cube' | 'hypercube';
type HypercubeAction = { type: 'state' } | { type: 'view'; previousViewMatrix: Mat3 };
type HypercubeRotationMode = '4d' | '3d' | null;
const DEFAULT_CUBE_SLICE_MASK = 1;
const DEFAULT_HYPERCUBE_ROTATION_MODE: Exclude<HypercubeRotationMode, null> = '3d';
const AUTOSAVE_DELAY_MS = 350;

type CubeSessionMap = Record<CubeSize, PersistedCubeSession>;

function createDefaultCubeSession(size: CubeSize): PersistedCubeSession {
  return {
    cubeState: createSolvedCube(size),
    scrambleText: '',
    rotationMode: false,
    sliceMask: DEFAULT_CUBE_SLICE_MASK,
    viewMatrix: createDefaultCubeViewMatrix(),
    zoom: INITIAL_CUBE_ZOOM,
    timer: createDefaultCubeTimerSession(),
  };
}

function createDefaultCubeSessions(): CubeSessionMap {
  return {
    2: createDefaultCubeSession(2),
    3: createDefaultCubeSession(3),
    4: createDefaultCubeSession(4),
    5: createDefaultCubeSession(5),
  };
}

function createEmptyCubeHistories(): Record<CubeSize, CubeState[]> {
  return {
    2: [],
    3: [],
    4: [],
    5: [],
  };
}

function cloneCubeState(state: CubeState): CubeState {
  return state.map(cubie => ({
    position: [...cubie.position] as [number, number, number],
    faces: { ...cubie.faces },
  }));
}

function cloneCubeSession(session: PersistedCubeSession): PersistedCubeSession {
  return {
    cubeState: cloneCubeState(session.cubeState),
    scrambleText: session.scrambleText,
    rotationMode: session.rotationMode,
    sliceMask: session.sliceMask,
    viewMatrix: cloneMat3(session.viewMatrix),
    zoom: session.zoom,
    timer: cloneCubeTimerSession(session.timer ?? createDefaultCubeTimerSession()),
  };
}

function cloneCubeSessions(sessions: CubeSessionMap): CubeSessionMap {
  return {
    2: cloneCubeSession(sessions[2]),
    3: cloneCubeSession(sessions[3]),
    4: cloneCubeSession(sessions[4]),
    5: cloneCubeSession(sessions[5]),
  };
}

export default function Index() {
  const [mode, setMode] = useState<ScreenMode>('cube');
  const [cubeSize, setCubeSize] = useState<CubeSize>(3);
  const [cubeSessions, setCubeSessions] = useState<CubeSessionMap>(createDefaultCubeSessions);
  const [cubeCanUndo, setCubeCanUndo] = useState(false);
  const [cubeCanvasSize, setCubeCanvasSize] = useState({ width: 0, height: 0 });
  const [selected4DFace, setSelected4DFace] = useState<number | null>(null);
  const [hypercubeRotationMode, setHypercubeRotationMode] = useState<HypercubeRotationMode>(DEFAULT_HYPERCUBE_ROTATION_MODE);
  const [magicCube4DSettingsOpen, setMagicCube4DSettingsOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  const [cubeTimerSheetOpen, setCubeTimerSheetOpen] = useState(false);
  const [hypercubeTimerSheetOpen, setHypercubeTimerSheetOpen] = useState(false);
  const [magicCube4DSettings, setMagicCube4DSettings] = useState(DEFAULT_MAGICCUBE4D_SETTINGS);
  const [saved4DViewMatrix, setSaved4DViewMatrix] = useState<Mat3 | null>(null);
  const [show4DViewReset, setShow4DViewReset] = useState(false);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [hypercubeTimer, setHypercubeTimer] = useState(createDefaultCubeTimerSession);
  const cubeHistoryRef = useRef<Record<CubeSize, CubeState[]>>(createEmptyCubeHistories());
  const current4DViewMatrixRef = useRef<Mat3 | null>(null);
  const hypercubeViewportRef = useRef<HypercubeViewportHandle | null>(null);
  const hypercubeHistoryRef = useRef<HypercubeAction[]>([]);
  const lastTurnSliceMaskRef = useRef<number>(MAGICCUBE4D_DEFAULT_SLICE_MASK);
  const [hypercubeCanUndo, setHypercubeCanUndo] = useState(false);
  const currentCubeSession = cubeSessions[cubeSize];
  const cubeState = currentCubeSession.cubeState;
  const scrambleText = currentCubeSession.scrambleText;
  const cubeAllSlicesSelected = currentCubeSession.sliceMask === ALL_CUBE_SLICES_MASK;
  const cubeSliceMask = currentCubeSession.sliceMask;
  const cubeTimer = currentCubeSession.timer ?? createDefaultCubeTimerSession();
  const updateCubeSession = useCallback((
    size: CubeSize,
    updater: (session: PersistedCubeSession) => PersistedCubeSession,
  ) => {
    setCubeSessions(current => {
      const nextSession = updater(current[size]);
      if (nextSession === current[size]) {
        return current;
      }

      return {
        ...current,
        [size]: nextSession,
      };
    });
  }, []);
  const updateCurrentCubeSession = useCallback((
    updater: (session: PersistedCubeSession) => PersistedCubeSession,
  ) => {
    updateCubeSession(cubeSize, updater);
  }, [cubeSize, updateCubeSession]);
  const setCurrentCubeState = useCallback((nextState: React.SetStateAction<CubeState>) => {
    updateCurrentCubeSession(session => ({
      ...session,
      cubeState: typeof nextState === 'function'
        ? nextState(session.cubeState)
        : nextState,
    }));
  }, [updateCurrentCubeSession]);
  const { twistAnim, twist } = useTwistAnimation(setCurrentCubeState, previousState => {
    cubeHistoryRef.current[cubeSize].push(previousState);
    setCubeCanUndo(true);
  });
  const {
    state: magicCube4DState,
    sliceMask,
    setSliceMask,
    rotation4d,
    twistAnimation: magicCube4DTwistAnimation,
    isAnimating: magicCube4DAnimating,
    reset: resetMagicCube4D,
    scramble: scrambleMagicCube4D,
    undo: undoMagicCube4D,
    twistGrip,
    rotateFaceToCenter,
    rotateState,
    rotateSpatialState,
    restoreSession: restoreMagicCube4DSession,
  } = useMagicCube4D({
    twistDurationMs: magicCube4DSettings.twistDurationMs,
    animationDurationMs: magicCube4DSettings.animationDurationMs,
    onStateCommit: () => {
      hypercubeHistoryRef.current.push({ type: 'state' });
      setHypercubeCanUndo(true);
    },
  });
  const magicCube4DPickRef = useRef<(x: number, y: number) => MagicCube4DPickInfo | null>(() => null);
  const base4DViewMatrix = useMemo(
    () => saved4DViewMatrix ?? createHypercubeViewMatrix(
      magicCube4DSettings.viewPitchDeg,
      magicCube4DSettings.viewYawDeg,
    ),
    [magicCube4DSettings.viewPitchDeg, magicCube4DSettings.viewYawDeg, saved4DViewMatrix],
  );
  const [live4DViewMatrix, setLive4DViewMatrix] = useState<Mat3>(base4DViewMatrix);
  useEffect(() => {
    const nextViewMatrix = cloneMat3(base4DViewMatrix);
    current4DViewMatrixRef.current = nextViewMatrix;
    setLive4DViewMatrix(nextViewMatrix);
  }, [base4DViewMatrix]);
  useEffect(() => {
    setShow4DViewReset(!mat3EqualsWithinTolerance(live4DViewMatrix, base4DViewMatrix));
  }, [base4DViewMatrix, live4DViewMatrix]);
  const displayed4DControlRows = useMemo(
    () => buildDisplayed4DControlRows(
      selected4DFace,
      rotation4d,
      live4DViewMatrix,
    ),
    [live4DViewMatrix, rotation4d, selected4DFace],
  );
  const current4DFaceColors = useMemo(
    () => MAGICCUBE4D_FACE_COLORS.map((_, faceIndex) => {
      const centerStickerIndex = getFaceCenterStickerIndex(faceIndex);
      const colorIndex = magicCube4DState[centerStickerIndex] % MAGICCUBE4D_FACE_COLORS.length;
      return MAGICCUBE4D_FACE_COLORS[colorIndex];
    }),
    [magicCube4DState],
  );
  const selected4DFaceColor = selected4DFace == null ? null : current4DFaceColors[selected4DFace];
  const applyPersistedState = useCallback((persisted: PersistedAppState) => {
    const next4DSettings = clampMagicCube4DSettings(persisted.hypercube.settings);
    const nextSaved4DViewMatrix = persisted.hypercube.savedViewMatrix
      ? cloneMat3(persisted.hypercube.savedViewMatrix)
      : null;
    const nextLive4DViewMatrix = nextSaved4DViewMatrix
      ?? createHypercubeViewMatrix(next4DSettings.viewPitchDeg, next4DSettings.viewYawDeg);

    cubeHistoryRef.current = createEmptyCubeHistories();
    hypercubeHistoryRef.current = [];
    setCubeCanUndo(false);
    setHypercubeCanUndo(false);
    setMagicCube4DSettingsOpen(false);
    setOverflowMenuOpen(false);
    setInfoSheetOpen(false);
    setCubeTimerSheetOpen(false);
    setHypercubeTimerSheetOpen(false);
    setMode(persisted.mode);
    setCubeSize(persisted.cubeSize);
    setCubeSessions(cloneCubeSessions({
      2: normalizePersistedCubeSession(persisted.cubes['2']),
      3: normalizePersistedCubeSession(persisted.cubes['3']),
      4: normalizePersistedCubeSession(persisted.cubes['4']),
      5: normalizePersistedCubeSession(persisted.cubes['5']),
    }));
    const normalizedHypercube = normalizePersistedHypercubeSession(persisted.hypercube);
    setSelected4DFace(persisted.hypercube.selectedFace);
    setHypercubeRotationMode(persisted.hypercube.rotationMode);
    setMagicCube4DSettings(next4DSettings);
    setSaved4DViewMatrix(nextSaved4DViewMatrix);
    setHypercubeTimer(cloneCubeTimerSession(normalizedHypercube.timer));
    current4DViewMatrixRef.current = cloneMat3(nextLive4DViewMatrix);
    setLive4DViewMatrix(cloneMat3(nextLive4DViewMatrix));
    lastTurnSliceMaskRef.current = persisted.hypercube.lastTurnSliceMask;
    restoreMagicCube4DSession({
      state: [...normalizedHypercube.state],
      sliceMask: normalizedHypercube.sliceMask,
      rotation4d: cloneMat4(normalizedHypercube.rotation4d),
    });
  }, [restoreMagicCube4DSession]);
  const buildPersistedState = useCallback((): PersistedAppState => ({
    version: 1,
    mode,
    cubeSize,
    cubes: {
      '2': {
        ...cloneCubeSession(cubeSessions[2]),
        timer: sanitizeCubeTimerSessionForPersistence(cubeSessions[2].timer ?? createDefaultCubeTimerSession()),
      },
      '3': {
        ...cloneCubeSession(cubeSessions[3]),
        timer: sanitizeCubeTimerSessionForPersistence(cubeSessions[3].timer ?? createDefaultCubeTimerSession()),
      },
      '4': {
        ...cloneCubeSession(cubeSessions[4]),
        timer: sanitizeCubeTimerSessionForPersistence(cubeSessions[4].timer ?? createDefaultCubeTimerSession()),
      },
      '5': {
        ...cloneCubeSession(cubeSessions[5]),
        timer: sanitizeCubeTimerSessionForPersistence(cubeSessions[5].timer ?? createDefaultCubeTimerSession()),
      },
    },
    hypercube: {
      state: [...magicCube4DState],
      sliceMask,
      rotation4d: cloneMat4(rotation4d),
      settings: { ...magicCube4DSettings },
      savedViewMatrix: saved4DViewMatrix ? cloneMat3(saved4DViewMatrix) : null,
      rotationMode: hypercubeRotationMode,
      selectedFace: selected4DFace,
      lastTurnSliceMask: lastTurnSliceMaskRef.current,
      timer: sanitizeCubeTimerSessionForPersistence(hypercubeTimer),
    },
  }), [
    cubeSessions,
    cubeSize,
    hypercubeTimer,
    hypercubeRotationMode,
    magicCube4DSettings,
    magicCube4DState,
    mode,
    rotation4d,
    saved4DViewMatrix,
    selected4DFace,
    sliceMask,
  ]);
  const persistAutosaveNow = useCallback(async () => {
    const didSave = await saveAutosavedAppState(buildPersistedState());
    return didSave;
  }, [buildPersistedState]);
  const persistSavedSessionNow = useCallback(async () => {
    const didSave = await saveAppState(buildPersistedState());
    setHasSavedSession(didSave);
    return didSave;
  }, [buildPersistedState]);
  useEffect(() => {
    let isMounted = true;

    const restore = async () => {
      const [savedState, persisted] = await Promise.all([
        loadSavedAppState(),
        loadRestorableAppState(),
      ]);
      if (!isMounted) {
        return;
      }

      setHasSavedSession(savedState !== null);
      if (persisted) {
        applyPersistedState(persisted);
      }

      setPersistenceReady(true);
    };

    restore();
    return () => {
      isMounted = false;
    };
  }, [applyPersistedState]);
  useEffect(() => {
    if (!persistenceReady || twistAnim || magicCube4DAnimating) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void persistAutosaveNow();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [cubeSessions, cubeSize, hypercubeRotationMode, magicCube4DAnimating, magicCube4DSettings, magicCube4DState, mode, persistAutosaveNow, persistenceReady, rotation4d, saved4DViewMatrix, selected4DFace, sliceMask, twistAnim]);
  const cubeDisabled = !!twistAnim || mode !== 'cube';
  const cubeGesture = useCubeGesture({
    cubeState,
    cubeSize,
    width: cubeCanvasSize.width,
    height: cubeCanvasSize.height,
    onTwist: twist,
    disabled: cubeDisabled,
    rotationOnly: false,
    initialViewMatrix: currentCubeSession.viewMatrix,
    initialZoom: currentCubeSession.zoom,
    onViewStateChange: ({ viewMatrix, zoom }) => {
      updateCurrentCubeSession(session => {
        if (mat3EqualsWithinTolerance(session.viewMatrix, viewMatrix) && Math.abs(session.zoom - zoom) < 1e-4) {
          return session;
        }

        return {
          ...session,
          viewMatrix: cloneMat3(viewMatrix),
          zoom,
        };
      });
    },
  });
  const cubeButtonFaceColors = useMemo(() => {
    if (cubeSize % 2 === 0) {
      return undefined;
    }

    const mapping = resolveScreenRelativeMapping(cubeGesture.viewMatrix, cubeSize);
    return ALL_FACES.reduce<Partial<Record<Face, string>>>((result, slotFace) => {
      result[slotFace] = FACE_COLORS[mapping[slotFace]];
      return result;
    }, {});
  }, [cubeGesture.viewMatrix, cubeSize]);
  const handleCubeSliceButtonPress = useCallback((bit: number) => {
    updateCurrentCubeSession(session => {
      if (bit === ALL_CUBE_SLICES_MASK) {
        return {
          ...session,
          rotationMode: false,
          sliceMask: ALL_CUBE_SLICES_MASK,
        };
      }

      const sourceMask = session.sliceMask === ALL_CUBE_SLICES_MASK
        ? DEFAULT_CUBE_SLICE_MASK
        : clampCubeSliceMask(session.sliceMask, cubeSize);
      const allowedBits = getCubeSliceBitMask(cubeSize);
      const nextMask = (sourceMask ^ bit) & allowedBits;
      const resolvedMask = nextMask === 0 ? bit : nextMask;
      return {
        ...session,
        rotationMode: false,
        sliceMask: clampCubeSliceMask(resolvedMask, cubeSize),
      };
    });
  }, [cubeSize, updateCurrentCubeSession]);
  const pauseTimerForSize = useCallback((size: CubeSize) => {
    updateCubeSession(size, session => {
      const timer = session.timer ?? createDefaultCubeTimerSession();
      if (timer.status !== 'running') {
        return session;
      }

      return {
        ...session,
        timer: pauseCubeTimerSession(timer),
      };
    });
  }, [updateCubeSession]);
  const handleCubeTimerStart = useCallback(() => {
    updateCurrentCubeSession(session => ({
      ...session,
      timer: startCubeTimerSession(session.timer ?? createDefaultCubeTimerSession()),
    }));
  }, [updateCurrentCubeSession]);
  const handleCubeTimerPause = useCallback(() => {
    updateCurrentCubeSession(session => ({
      ...session,
      timer: pauseCubeTimerSession(session.timer ?? createDefaultCubeTimerSession()),
    }));
  }, [updateCurrentCubeSession]);
  const handleCubeTimerStop = useCallback(() => {
    updateCurrentCubeSession(session => ({
      ...session,
      timer: stopCubeTimerSession(
        session.timer ?? createDefaultCubeTimerSession(),
        session.scrambleText,
      ),
    }));
  }, [updateCurrentCubeSession]);
  const handleClearCubeTimerHistory = useCallback(() => {
    updateCurrentCubeSession(session => ({
      ...session,
      timer: clearCubeTimerHistory(session.timer ?? createDefaultCubeTimerSession()),
    }));
  }, [updateCurrentCubeSession]);
  const pauseHypercubeTimer = useCallback(() => {
    setHypercubeTimer(current => pauseCubeTimerSession(current));
  }, []);
  const handleHypercubeTimerStart = useCallback(() => {
    setHypercubeTimer(current => startCubeTimerSession(current));
  }, []);
  const handleHypercubeTimerPause = useCallback(() => {
    setHypercubeTimer(current => pauseCubeTimerSession(current));
  }, []);
  const handleHypercubeTimerStop = useCallback(() => {
    setHypercubeTimer(current => stopCubeTimerSession(current, 'Magic Cube 4D'));
  }, []);
  const handleClearHypercubeTimerHistory = useCallback(() => {
    setHypercubeTimer(current => clearCubeTimerHistory(current));
  }, []);
  const activateDefaultRotationMode = useCallback(() => {
    setHypercubeRotationMode(DEFAULT_HYPERCUBE_ROTATION_MODE);
    setSelected4DFace(null);
    setSliceMask(mask => {
      if (mask !== 0) {
        lastTurnSliceMaskRef.current = mask;
      }
      return 0;
    });
  }, [setSliceMask]);
  const select4DFace = useCallback((faceIndex: number) => {
    if (hypercubeRotationMode !== null) {
      setHypercubeRotationMode(null);
      setSliceMask(mask => {
        const restoredMask = mask === 0 ? lastTurnSliceMaskRef.current : mask;
        lastTurnSliceMaskRef.current = restoredMask;
        return restoredMask;
      });
    }
    setSelected4DFace(faceIndex);
  }, [hypercubeRotationMode, setSliceMask]);
  const toggle4DFace = useCallback((faceIndex: number) => {
    if (selected4DFace === faceIndex) {
      activateDefaultRotationMode();
      return;
    }
    if (hypercubeRotationMode !== null) {
      setHypercubeRotationMode(null);
      setSliceMask(mask => {
        const restoredMask = mask === 0 ? lastTurnSliceMaskRef.current : mask;
        lastTurnSliceMaskRef.current = restoredMask;
        return restoredMask;
      });
    }
    setSelected4DFace(faceIndex);
  }, [activateDefaultRotationMode, hypercubeRotationMode, selected4DFace, setSliceMask]);

  const handleHypercubeDoubleTap = useCallback((point: [number, number]) => {
    const pickInfo = magicCube4DPickRef.current(point[0], point[1]);
    if (pickInfo) {
      select4DFace(pickInfo.faceIndex);
    }
    rotateFaceToCenter(pickInfo?.stickerIndex ?? null);
  }, [rotateFaceToCenter, select4DFace]);
  const handleHypercubeTap = useCallback((point: [number, number]) => {
    const pickInfo = magicCube4DPickRef.current(point[0], point[1]);
    if (pickInfo) {
      select4DFace(pickInfo.faceIndex);
    }
    twistGrip(pickInfo?.gripIndex ?? null, 1);
  }, [select4DFace, twistGrip]);
  const handleHypercubeLongTap = useCallback((point: [number, number]) => {
    const pickInfo = magicCube4DPickRef.current(point[0], point[1]);
    if (pickInfo) {
      select4DFace(pickInfo.faceIndex);
    }
    twistGrip(pickInfo?.gripIndex ?? null, -1);
  }, [select4DFace, twistGrip]);
  const handle4DViewMatrixChange = useCallback((nextViewMatrix: Mat3) => {
    const cloned = cloneMat3(nextViewMatrix);
    current4DViewMatrixRef.current = cloned;
    setLive4DViewMatrix(cloned);
  }, []);
  const actionDisabled = mode === 'cube' ? !!twistAnim : magicCube4DAnimating;
  const modeSwitchDisabled = !!twistAnim || magicCube4DAnimating;
  const persistenceActionDisabled = !persistenceReady || !!twistAnim || magicCube4DAnimating;

  const handleSizeChange = (size: CubeSize) => {
    if (modeSwitchDisabled) return;
    if (mode === 'cube' && size !== cubeSize) {
      pauseTimerForSize(cubeSize);
    } else if (mode === 'hypercube') {
      pauseHypercubeTimer();
      setHypercubeTimerSheetOpen(false);
    }
    setMode('cube');
    if (size === cubeSize) return;
    setCubeSize(size);
    setCubeCanUndo(cubeHistoryRef.current[size].length > 0);
  };

  const handleHypercubeMode = () => {
    if (modeSwitchDisabled) return;
    pauseTimerForSize(cubeSize);
    setOverflowMenuOpen(false);
    setInfoSheetOpen(false);
    setCubeTimerSheetOpen(false);
    setMode('hypercube');
  };

  const handleOpen4DSettings = useCallback(() => {
    if (mode !== 'hypercube') {
      return;
    }
    setMagicCube4DSettingsOpen(true);
  }, [mode]);
  const handleUseCurrent4DView = useCallback(() => {
    const currentViewMatrix = current4DViewMatrixRef.current;
    if (!currentViewMatrix) {
      return;
    }
    setSaved4DViewMatrix(cloneMat3(currentViewMatrix));
  }, []);
  const handleRestoreSaved4DView = useCallback(() => {
    setSaved4DViewMatrix(current => (current ? cloneMat3(current) : current));
  }, []);
  const handleClearSaved4DView = useCallback(() => {
    setSaved4DViewMatrix(null);
  }, []);
  const handleSaveSession = useCallback(() => {
    if (persistenceActionDisabled) {
      return;
    }

    void persistSavedSessionNow();
  }, [persistSavedSessionNow, persistenceActionDisabled]);
  const handleLoadSession = useCallback(async () => {
    if (persistenceActionDisabled) {
      return;
    }

    const persisted = await loadSavedAppState();
    if (!persisted) {
      setHasSavedSession(false);
      return;
    }

    applyPersistedState(persisted);
    setHasSavedSession(true);
  }, [applyPersistedState, persistenceActionDisabled]);

  const handleReset = useCallback(() => {
    if (actionDisabled) return;
    if (mode === 'cube') {
      updateCurrentCubeSession(session => ({
        ...session,
        cubeState: createSolvedCube(cubeSize),
        scrambleText: '',
        rotationMode: false,
        sliceMask: DEFAULT_CUBE_SLICE_MASK,
      }));
      cubeHistoryRef.current[cubeSize] = [];
      setCubeCanUndo(false);
      return;
    }

    hypercubeHistoryRef.current = [];
    setHypercubeCanUndo(false);
    setHypercubeRotationMode(DEFAULT_HYPERCUBE_ROTATION_MODE);
    setSelected4DFace(null);
    lastTurnSliceMaskRef.current = MAGICCUBE4D_DEFAULT_SLICE_MASK;
    setSliceMask(0);
    resetMagicCube4D();
  }, [
    actionDisabled,
    cubeSize,
    mode,
    resetMagicCube4D,
    setSliceMask,
    updateCurrentCubeSession,
  ]);

  const handleScramble = () => {
    if (actionDisabled) return;
    if (mode === 'hypercube') {
      hypercubeHistoryRef.current = [];
      setHypercubeCanUndo(false);
      setHypercubeRotationMode(DEFAULT_HYPERCUBE_ROTATION_MODE);
      setSelected4DFace(null);
      setSliceMask(0);
      scrambleMagicCube4D();
      return;
    }

    const scramble = createScramble(SCRAMBLE_MOVES, cubeSize);
    cubeHistoryRef.current[cubeSize] = [];
    setCubeCanUndo(false);
    updateCurrentCubeSession(session => ({
      ...session,
      cubeState: applyMoves(createSolvedCube(cubeSize), scramble.moves),
      scrambleText: scramble.notation,
      rotationMode: false,
      sliceMask: DEFAULT_CUBE_SLICE_MASK,
    }));
  };

  const handleUndo = () => {
    if (mode === 'cube') {
      if (!!twistAnim) {
        return;
      }
      const previous = cubeHistoryRef.current[cubeSize].pop();
      if (!previous) {
        return;
      }
      updateCurrentCubeSession(session => ({
        ...session,
        cubeState: previous,
      }));
      setCubeCanUndo(cubeHistoryRef.current[cubeSize].length > 0);
      return;
    }

    const previousAction = hypercubeHistoryRef.current.pop();
    if (!previousAction) {
      return;
    }

    if (previousAction.type === 'view') {
      hypercubeViewportRef.current?.setViewMatrix(previousAction.previousViewMatrix);
    } else {
      undoMagicCube4D();
    }

    setHypercubeCanUndo(hypercubeHistoryRef.current.length > 0);
  };

  const handle3DNotationMove = useCallback((face: Face, clockwise: boolean, turns: 1 | 2 = 1) => {
    const resolvedMove = resolve3DNotationMove(face, clockwise, cubeSize, cubeGesture.viewMatrix);

    if (cubeAllSlicesSelected) {
      cubeGesture.rotateCube(resolvedMove.face, resolvedMove.clockwise, turns);
      return;
    }

    const layers = getCubeSelectedLayers(resolvedMove.face, cubeSize, cubeSliceMask);
    twist(resolvedMove.face, resolvedMove.clockwise, layers, turns);
  }, [cubeAllSlicesSelected, cubeGesture, cubeSize, cubeSliceMask, twist]);
  const handle4DControlPress = useCallback((
    action: Displayed4DControlAction,
  ) => {
    if (action.kind === 'faceTurn') {
      twistGrip(action.gripIndex, action.dir);
      return;
    }

    if (hypercubeRotationMode === null) {
      return;
    }

    const nextDir = (-action.dir) as -1 | 1;
    if (hypercubeRotationMode === '4d') {
      rotateState(action.axisIndex, nextDir);
    } else {
      rotateSpatialState(action.axisIndex, nextDir);
    }
  }, [hypercubeRotationMode, rotateSpatialState, rotateState, twistGrip]);
  const handleSliceButtonPress = useCallback((bit: number) => {
    setHypercubeRotationMode(null);
    setSelected4DFace(null);
    setSliceMask(mask => {
      const sourceMask = mask === 0 ? lastTurnSliceMaskRef.current : mask;
      const nextMask = (sourceMask ^ bit) & 0b111;
      const resolvedMask = nextMask === 0 ? bit : nextMask;
      lastTurnSliceMaskRef.current = resolvedMask;
      return resolvedMask;
    });
  }, [setSliceMask]);
  const handleRotationModePress = useCallback((nextMode: Exclude<HypercubeRotationMode, null>) => {
    setHypercubeRotationMode(nextMode);
    setSelected4DFace(null);
    setSliceMask(mask => {
      if (mask !== 0) {
        lastTurnSliceMaskRef.current = mask;
      }
      return 0;
    });
  }, [setSliceMask]);
  const openCubeHistory = useCallback(() => {
    setCubeTimerSheetOpen(true);
  }, []);
  const openHypercubeHistory = useCallback(() => {
    setHypercubeTimerSheetOpen(true);
  }, []);
  const openMenuThen = useCallback((action: () => void) => {
    setOverflowMenuOpen(false);
    setTimeout(action, 120);
  }, []);
  const infoSections = useMemo<InfoSection[]>(() => {
    if (mode === 'cube') {
      return [
        {
          key: 'scramble',
          title: 'Scramble',
          body: scrambleText.trim().length > 0
            ? scrambleText
            : `No scramble saved. Current mode: notation turns with slices ${formatCubeSliceMask(cubeSliceMask, cubeSize)}.`,
        },
        {
          key: 'controls',
          title: 'Controls',
          body: 'Drag to rotate the cube. Use notation buttons below for turns, slice selection, and view rotation. The timer overlay stays on the canvas: play starts or resumes, pause freezes the current solve, and stop records it.',
        },
        {
          key: 'session',
          title: 'Session',
          body: 'Undo returns the previous cube state. Shuffle makes a fresh scramble. Save and Load are in the menu, and History opens your recorded solve list and personal best.',
        },
      ];
    }

    return [
      {
        key: 'controls',
        title: 'Controls',
        body: 'Tap for counterclockwise turns, long-press for clockwise turns, and double-tap to center a face. Slice chips switch active layers, and 3D or 4D rotation modes change what the lower controls do.',
      },
      {
        key: 'timer',
        title: 'Timer',
        body: 'The canvas timer works like the 3D one: play starts, pause freezes, and stop records the solve. History in the menu shows your 4D solve list and best time.',
      },
      {
        key: 'session',
        title: 'Session',
        body: 'Undo reverts the last 4D move. Shuffle creates a new randomized state. Settings, Save, Load, Reset, and History all live in the menu to keep the top bar compact.',
      },
    ];
  }, [cubeSize, cubeSliceMask, mode, scrambleText]);
  const overflowActions = useMemo<OverflowMenuAction[]>(() => {
    const baseActions: OverflowMenuAction[] = [
      {
        key: 'info',
        label: 'Info',
        icon: 'information-circle-outline',
        onPress: () => openMenuThen(() => setInfoSheetOpen(true)),
      },
      {
        key: 'save',
        label: 'Save session',
        icon: 'save-outline',
        onPress: () => openMenuThen(handleSaveSession),
        disabled: persistenceActionDisabled,
      },
      {
        key: 'load',
        label: 'Load session',
        icon: 'download-outline',
        onPress: () => openMenuThen(() => {
          void handleLoadSession();
        }),
        disabled: !hasSavedSession || persistenceActionDisabled,
      },
      {
        key: 'history',
        label: mode === 'cube' ? `${cubeSize}x${cubeSize} history` : '4D history',
        icon: 'time-outline',
        onPress: () => openMenuThen(mode === 'cube' ? openCubeHistory : openHypercubeHistory),
      },
      {
        key: 'reset',
        label: 'Reset puzzle',
        icon: 'refresh',
        onPress: () => openMenuThen(handleReset),
        disabled: actionDisabled,
        tone: 'danger',
      },
    ];

    if (mode === 'hypercube') {
      baseActions.splice(3, 0, {
        key: 'settings',
        label: '4D settings',
        icon: 'options-outline',
        onPress: () => openMenuThen(handleOpen4DSettings),
      });
    }

    return baseActions;
  }, [
    actionDisabled,
    cubeSize,
    handleLoadSession,
    handleOpen4DSettings,
    handleReset,
    handleSaveSession,
    hasSavedSession,
    mode,
    openCubeHistory,
    openHypercubeHistory,
    openMenuThen,
    persistenceActionDisabled,
  ]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <View style={styles.modeBar}>
            {SUPPORTED_CUBE_SIZES.map((size, i) => (
              <Pressable
                key={size}
                style={[
                  styles.modeButton,
                  mode === 'cube' && size === cubeSize && styles.modeButtonActive,
                  i === 0 && styles.modeButtonFirst,
                ]}
                onPress={() => handleSizeChange(size)}
                disabled={modeSwitchDisabled}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === 'cube' && size === cubeSize && styles.modeButtonTextActive,
                  ]}
                >
                  {size}x{size}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[
                styles.modeButton,
                styles.modeButtonLast,
                mode === 'hypercube' && styles.modeButtonActive,
              ]}
              onPress={handleHypercubeMode}
              disabled={modeSwitchDisabled}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'hypercube' && styles.modeButtonTextActive,
                ]}
              >
                4D
              </Text>
            </Pressable>
          </View>
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <ActionButton
                icon="arrow-undo"
                label="Undo"
                onPress={handleUndo}
                disabled={mode === 'cube' ? !cubeCanUndo || !!twistAnim : !hypercubeCanUndo || magicCube4DAnimating}
              />
              <ActionButton
                icon="shuffle"
                label="Scramble"
                onPress={handleScramble}
                disabled={actionDisabled}
              />
            </View>
            <View style={styles.topBarRight}>
              <ActionButton
                icon="ellipsis-horizontal"
                label="Menu"
                onPress={() => setOverflowMenuOpen(true)}
                disabled={false}
              />
            </View>
          </View>
          <View style={styles.canvas}>
            {mode === 'cube' ? (
              <GestureDetector gesture={cubeGesture.gesture}>
                <View
                  style={styles.canvas}
                  onLayout={e => {
                    const { width: nextWidth, height: nextHeight } = e.nativeEvent.layout;
                    setCubeCanvasSize(current => (
                      current.width === nextWidth && current.height === nextHeight
                        ? current
                        : { width: nextWidth, height: nextHeight }
                    ));
                  }}
                >
                  <CubeCanvas
                    cubeState={cubeState}
                    cubeSize={cubeSize}
                    viewMatrix={cubeGesture.viewMatrix}
                    zoom={cubeGesture.zoom}
                    twistAnim={twistAnim}
                    width={cubeCanvasSize.width}
                    height={cubeCanvasSize.height}
                  />
                  <CubeTimerOverlay
                    timer={cubeTimer}
                    onStart={handleCubeTimerStart}
                    onPause={handleCubeTimerPause}
                    onStop={handleCubeTimerStop}
                  />
                </View>
              </GestureDetector>
            ) : (
              <View style={styles.canvas}>
                <HypercubeViewport
                  ref={hypercubeViewportRef}
                  state={magicCube4DState}
                  rotation4d={rotation4d}
                  twistAnimation={magicCube4DTwistAnimation}
                  settings={magicCube4DSettings}
                  dragSensitivity={magicCube4DSettings.dragSensitivity}
                  viewPitchDeg={magicCube4DSettings.viewPitchDeg}
                  viewYawDeg={magicCube4DSettings.viewYawDeg}
                  initialViewMatrix={saved4DViewMatrix ?? undefined}
                  onViewMatrixChange={handle4DViewMatrixChange}
                  onTap={handleHypercubeTap}
                  onLongTap={handleHypercubeLongTap}
                  onDoubleTap={handleHypercubeDoubleTap}
                  onPickReady={(picker) => {
                    magicCube4DPickRef.current = picker;
                  }}
                  disabled={magicCube4DAnimating}
                  showResetButton={show4DViewReset}
                  resetViewMatrix={base4DViewMatrix}
                />
                <CubeTimerOverlay
                  timer={hypercubeTimer}
                  onStart={handleHypercubeTimerStart}
                  onPause={handleHypercubeTimerPause}
                  onStop={handleHypercubeTimerStop}
                />
              </View>
            )}
          </View>
          {mode === 'cube' && (
            <View style={styles.cubeControlsWrap}>
              <CubeNotationPanel
                cubeSize={cubeSize}
                disabled={!!twistAnim}
                sliceMask={cubeSliceMask}
                useFaceColors={cubeSize % 2 !== 0}
                faceColors={cubeButtonFaceColors}
                onCubeSlicePress={handleCubeSliceButtonPress}
                onNotationMove={handle3DNotationMove}
              />
            </View>
          )}
          {mode === 'hypercube' && (
            <View style={styles.hypercubeControls}>
              <View style={styles.sliceBar}>
                {MAGICCUBE4D_SLICE_BITS.map(bit => {
                  const active = (sliceMask & bit) !== 0;
                  return (
                    <Pressable
                      key={bit}
                      style={[
                        styles.sliceButton,
                        active && styles.sliceButtonActive,
                      ]}
                      onPress={() => handleSliceButtonPress(bit)}
                      disabled={magicCube4DAnimating}
                    >
                      <Text style={[
                        styles.sliceButtonText,
                        active && styles.sliceButtonTextActive,
                      ]}
                      >
                        Slice {MAGICCUBE4D_SLICE_LABELS[bit]}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[
                    styles.sliceButton,
                    hypercubeRotationMode === '4d' && styles.sliceButtonActive,
                  ]}
                  onPress={() => handleRotationModePress('4d')}
                  disabled={magicCube4DAnimating}
                >
                  <Text
                    style={[
                      styles.sliceButtonText,
                      hypercubeRotationMode === '4d' && styles.sliceButtonTextActive,
                    ]}
                  >
                    4D Rot
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.sliceButton,
                    hypercubeRotationMode === '3d' && styles.sliceButtonActive,
                  ]}
                  onPress={() => handleRotationModePress('3d')}
                  disabled={magicCube4DAnimating}
                >
                  <Text
                    style={[
                      styles.sliceButtonText,
                      hypercubeRotationMode === '3d' && styles.sliceButtonTextActive,
                    ]}
                  >
                    3D Rot
                  </Text>
                </Pressable>
              </View>
              <View style={styles.bottomControls}>
                <View style={styles.bottomControlSplit}>
                  <View style={[styles.controlPanel, styles.faceControlPanel]}>
                    <View style={styles.facePickerGrid}>
                      {GRIP_FACE_GRID_ROWS.map((row, rowIndex) => (
                        <View key={`grip-row-${rowIndex}`} style={styles.faceChipRow}>
                          {row.map((faceIndex, colIndex) => (
                            faceIndex == null ? (
                              <View key={`empty-${rowIndex}-${colIndex}`} style={styles.faceChipPlaceholder} />
                            ) : (
                              <Pressable
                                key={MAGICCUBE4D_FACE_LABELS[faceIndex]}
                                style={({ pressed }) => [
                                  styles.faceChip,
                                  { backgroundColor: current4DFaceColors[faceIndex] },
                                  selected4DFace === faceIndex && styles.faceChipActive,
                                  pressed && !magicCube4DAnimating && styles.faceChipPressed,
                                ]}
                                onPress={() => toggle4DFace(faceIndex)}
                                disabled={magicCube4DAnimating}
                              >
                                <Text style={[styles.faceChipText, { color: getButtonTextColor(current4DFaceColors[faceIndex]) }]}>
                                  {GRIP_FACE_BUTTON_LABELS[faceIndex]}
                                </Text>
                              </Pressable>
                            )
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={[styles.controlPanel, styles.turnControlPanel]}>
                    <View style={styles.turnButtonColumn}>
                      {displayed4DControlRows.map(row => (
                        <View
                          key={row.key}
                          style={styles.turnButtonPair}
                        >
                          <CompactControlButton
                            label={`${row.slotLabel}-`}
                            onPress={() => handle4DControlPress(row.negativeAction)}
                            disabled={magicCube4DAnimating || (selected4DFace == null && hypercubeRotationMode === null)}
                            color={selected4DFaceColor}
                          />
                          <CompactControlButton
                            label={`${row.slotLabel}+`}
                            onPress={() => handle4DControlPress(row.positiveAction)}
                            disabled={magicCube4DAnimating || (selected4DFace == null && hypercubeRotationMode === null)}
                            color={selected4DFaceColor}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}
          <MagicCube4DSettingsSheet
            visible={magicCube4DSettingsOpen}
            settings={magicCube4DSettings}
            onChange={(nextSettings) => {
              if (
                nextSettings.viewPitchDeg !== magicCube4DSettings.viewPitchDeg ||
                nextSettings.viewYawDeg !== magicCube4DSettings.viewYawDeg
              ) {
                setSaved4DViewMatrix(null);
              }
              setMagicCube4DSettings(clampMagicCube4DSettings(nextSettings));
            }}
            onUseCurrentView={handleUseCurrent4DView}
            onRestoreSavedView={handleRestoreSaved4DView}
            onClearSavedView={handleClearSaved4DView}
            hasSavedView={saved4DViewMatrix !== null}
            onClose={() => setMagicCube4DSettingsOpen(false)}
            onReset={() => {
              setSaved4DViewMatrix(null);
              setMagicCube4DSettings(DEFAULT_MAGICCUBE4D_SETTINGS);
            }}
          />
          <AppOverflowMenuSheet
            visible={overflowMenuOpen}
            actions={overflowActions}
            onClose={() => setOverflowMenuOpen(false)}
          />
          <AppInfoSheet
            visible={infoSheetOpen}
            title={mode === 'cube' ? `${cubeSize}x${cubeSize} Info` : 'Magic Cube 4D Info'}
            sections={infoSections}
            onClose={() => setInfoSheetOpen(false)}
          />
          <CubeTimerSheet
            visible={mode === 'cube' && cubeTimerSheetOpen}
            title={`${cubeSize}x${cubeSize} Timer`}
            timer={cubeTimer}
            onClose={() => setCubeTimerSheetOpen(false)}
            onClearHistory={handleClearCubeTimerHistory}
          />
          <CubeTimerSheet
            visible={mode === 'hypercube' && hypercubeTimerSheetOpen}
            title="Magic Cube 4D Timer"
            timer={hypercubeTimer}
            onClose={() => setHypercubeTimerSheetOpen(false)}
            onClearHistory={handleClearHypercubeTimerHistory}
          />
        </SafeAreaView>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
}

function ActionButton({ icon, label, onPress, disabled }: ActionButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color="#f5f7ff" />
    </Pressable>
  );
}

interface CompactControlButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
  color?: string | null;
}

function CompactControlButton({ label, onPress, disabled, color = null }: CompactControlButtonProps) {
  const textColor = color ? getButtonTextColor(color) : '#f5f7ff';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.compactControlButton,
        color ? { backgroundColor: color, borderColor: color } : null,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.compactControlButtonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function getButtonTextColor(backgroundColor: string): string {
  const normalized = backgroundColor.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111111' : '#f5f7ff';
}

function clampCubeSliceMask(mask: number, cubeSize: CubeSize): number {
  const allowedBits = getCubeSliceBitMask(cubeSize);
  if (allowedBits === 0) {
    return 0;
  }
  const normalized = mask & allowedBits;
  return normalized === 0 ? 0b001 : normalized;
}

function getCubeSelectedLayers(face: Face, cubeSize: CubeSize, sliceMask: number): number[] {
  if (cubeSize === 2) {
    return faceLayers(face, cubeSize, false);
  }

  const clampedMask = clampCubeSliceMask(sliceMask, cubeSize);
  const outer = (cubeSize - 1) / 2;
  const direction = faceSign(face);
  const layers: number[] = [];
  const availableBits = getAvailableCubeSliceBits(cubeSize);

  availableBits.forEach((bit, index) => {
    if ((clampedMask & bit) !== 0) {
      layers.push(direction * (outer - index));
    }
  });

  if (layers.length === 0) {
    layers.push(direction * outer);
  }

  return layers;
}

function getCubeSliceBitMask(cubeSize: CubeSize): number {
  return getAvailableCubeSliceBits(cubeSize).reduce((mask, bit) => mask | bit, 0);
}

function getAvailableCubeSliceBits(cubeSize: CubeSize): number[] {
  if (cubeSize === 5) {
    return [0b001, 0b010, 0b100];
  }
  if (cubeSize === 4) {
    return [0b001, 0b010];
  }
  if (cubeSize === 3) {
    return [0b001];
  }
  return [];
}

function formatCubeSliceMask(sliceMask: number, cubeSize: CubeSize): string {
  if (sliceMask === ALL_CUBE_SLICES_MASK) {
    return 'All';
  }

  if (cubeSize < 3) {
    return 'outer';
  }

  const active = getAvailableCubeSliceBits(cubeSize)
    .filter(bit => (clampCubeSliceMask(sliceMask, cubeSize) & bit) !== 0)
    .map(bit => Math.log2(bit) + 1);

  return active.join('+');
}

function buildDisplayed4DControlRows(
  selected4DFace: number | null,
  rotation4d: readonly (readonly number[])[],
  viewMatrix: Mat3,
): Displayed4DControlRow[] {
  if (selected4DFace == null) {
    return GLOBAL_4D_AXIS_OPTIONS.map(option => ({
      key: `rotation-${option.axisIndex}`,
      slotLabel: ROTATION_ROW_LABELS[option.axisIndex],
      negativeAction: { kind: 'rotation', axisIndex: option.axisIndex, dir: -1 },
      positiveAction: { kind: 'rotation', axisIndex: option.axisIndex, dir: 1 },
    }));
  }

  const faceCenter = getFaceCenter(selected4DFace);
  const faceAxisOptions = [...getFaceTwistAxisOptions(selected4DFace)];
  const probePoint = buildFaceProbePoint(faceCenter, faceAxisOptions.map(option => option.axisIndex));
  const globalAxisRows = buildGlobalAxisRows(rotation4d, viewMatrix, probePoint);
  const localCandidates = faceAxisOptions.map(option => ({
    option,
    positiveMotion: getLocalTurnMotionVector(option.gripIndex, 1, probePoint, rotation4d, viewMatrix),
    negativeMotion: getLocalTurnMotionVector(option.oppositeGripIndex, 1, probePoint, rotation4d, viewMatrix),
  }));

  const remaining = [...localCandidates];
  const rows: Displayed4DControlRow[] = [];

  globalAxisRows.forEach(globalRow => {
    const bestIndex = remaining.length === 1
      ? 0
      : findBestAxisMatchIndex(remaining, globalRow.positiveMotion);
    const [selected] = remaining.splice(bestIndex, 1);
    const positiveMatchesPositiveBase = signedMotionSimilarity(selected.positiveMotion, globalRow.positiveMotion)
      >= signedMotionSimilarity(selected.negativeMotion, globalRow.positiveMotion);
    const positiveMatchesPositive = globalRow.slotLabel === 'U'
      ? positiveMatchesPositiveBase
      : !positiveMatchesPositiveBase;
    rows.push({
      key: `face-${selected4DFace}-${globalRow.axisIndex}`,
      slotLabel: globalRow.slotLabel,
      negativeAction: positiveMatchesPositive
        ? { kind: 'faceTurn', gripIndex: selected.option.oppositeGripIndex, dir: 1 }
        : { kind: 'faceTurn', gripIndex: selected.option.gripIndex, dir: 1 },
      positiveAction: positiveMatchesPositive
        ? { kind: 'faceTurn', gripIndex: selected.option.gripIndex, dir: 1 }
        : { kind: 'faceTurn', gripIndex: selected.option.oppositeGripIndex, dir: 1 },
    });
  });

  return rows;
}

function buildGlobalAxisRows(
  rotation4d: readonly (readonly number[])[],
  viewMatrix: Mat3,
  probePoint: readonly number[],
): {
  axisIndex: 0 | 1 | 2;
  slotLabel: 'U' | 'R' | 'F';
  positiveMotion: [number, number, number];
}[] {
  const globalAxes = GLOBAL_4D_AXIS_OPTIONS.map(option => ({
    axisIndex: option.axisIndex,
    viewVector: getGlobalAxisViewVector(option.axisIndex, rotation4d, viewMatrix),
    positiveMotion: getGlobalRotationMotionVector(option.axisIndex, 1, probePoint, rotation4d, viewMatrix),
  }));
  const remaining = [...globalAxes];
  const rows: {
    axisIndex: 0 | 1 | 2;
    slotLabel: 'U' | 'R' | 'F';
    positiveMotion: [number, number, number];
  }[] = [];

  const uIndex = findBestViewAlignmentIndex(remaining, 1);
  rows.push({ axisIndex: remaining[uIndex].axisIndex, slotLabel: 'U', positiveMotion: remaining[uIndex].positiveMotion });
  remaining.splice(uIndex, 1);

  const rIndex = remaining.length === 1 ? 0 : findBestViewAlignmentIndex(remaining, 0);
  rows.push({ axisIndex: remaining[rIndex].axisIndex, slotLabel: 'F', positiveMotion: remaining[rIndex].positiveMotion });
  remaining.splice(rIndex, 1);

  rows.push({ axisIndex: remaining[0].axisIndex, slotLabel: 'R', positiveMotion: remaining[0].positiveMotion });
  return rows;
}

function getGlobalAxisViewVector(
  axisIndex: number,
  rotation4d: readonly (readonly number[])[],
  viewMatrix: Mat3,
): [number, number, number] {
  const positivePoint = offsetPoint4([0, 0, 0, 0], axisIndex, AXIS_SAMPLE_OFFSET);
  const negativePoint = offsetPoint4([0, 0, 0, 0], axisIndex, -AXIS_SAMPLE_OFFSET);
  return subtract3(
    projectPointToView(positivePoint, rotation4d, viewMatrix),
    projectPointToView(negativePoint, rotation4d, viewMatrix),
  );
}

function findBestViewAlignmentIndex(
  candidates: { viewVector: [number, number, number] }[],
  componentIndex: 0 | 1 | 2,
): number {
  let bestIndex = 0;
  let bestScore = Math.abs(candidates[0].viewVector[componentIndex]);
  for (let index = 1; index < candidates.length; index++) {
    const score = Math.abs(candidates[index].viewVector[componentIndex]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildFaceProbePoint(
  faceCenter: readonly number[],
  faceAxisIndices: readonly number[],
): [number, number, number, number] {
  let point = [...faceCenter] as [number, number, number, number];
  faceAxisIndices.forEach((axisIndex, index) => {
    point = offsetPoint4(point, axisIndex, FACE_PROBE_OFFSETS[index] ?? FACE_PROBE_OFFSETS[FACE_PROBE_OFFSETS.length - 1]);
  });
  return point;
}

function getGlobalRotationMotionVector(
  axisIndex: 0 | 1 | 2,
  buttonDir: -1 | 1,
  probePoint: readonly number[],
  rotation4d: readonly (readonly number[])[],
  viewMatrix: Mat3,
): [number, number, number] {
  const rotation = getSpatialRotationMatrix(axisIndex, (-buttonDir * Math.PI / 2) * TWIST_SAMPLE_FRACTION);
  return subtract3(
    projectPointToView(mulRowVec4(probePoint as [number, number, number, number], rotation), rotation4d, viewMatrix),
    projectPointToView(probePoint, rotation4d, viewMatrix),
  );
}

function getLocalTurnMotionVector(
  gripIndex: number,
  dir: MagicCube4DTwistDirection,
  probePoint: readonly number[],
  rotation4d: readonly (readonly number[])[],
  viewMatrix: Mat3,
): [number, number, number] {
  const twistMatrix = getGripTwistMatrix(gripIndex, dir, TWIST_SAMPLE_FRACTION);
  return subtract3(
    projectPointToView(mulRowVec4(probePoint as [number, number, number, number], twistMatrix), rotation4d, viewMatrix),
    projectPointToView(probePoint, rotation4d, viewMatrix),
  );
}

function findBestAxisMatchIndex(
  candidates: { positiveMotion: [number, number, number]; negativeMotion: [number, number, number] }[],
  globalMotion: [number, number, number],
): number {
  let bestIndex = 0;
  let bestScore = Math.max(
    motionSimilarity(candidates[0].positiveMotion, globalMotion),
    motionSimilarity(candidates[0].negativeMotion, globalMotion),
  );
  for (let index = 1; index < candidates.length; index++) {
    const score = Math.max(
      motionSimilarity(candidates[index].positiveMotion, globalMotion),
      motionSimilarity(candidates[index].negativeMotion, globalMotion),
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function motionSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  const leftLength = Math.hypot(left[0], left[1], left[2]);
  const rightLength = Math.hypot(right[0], right[1], right[2]);
  if (leftLength < 1e-6 || rightLength < 1e-6) {
    return -1;
  }
  return Math.abs(dot3(left, right) / (leftLength * rightLength));
}

function signedMotionSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  const leftLength = Math.hypot(left[0], left[1], left[2]);
  const rightLength = Math.hypot(right[0], right[1], right[2]);
  if (leftLength < 1e-6 || rightLength < 1e-6) {
    return -1;
  }
  return dot3(left, right) / (leftLength * rightLength);
}

function offsetPoint4(
  point: readonly number[],
  axisIndex: number,
  amount: number,
): [number, number, number, number] {
  const next = [...point] as [number, number, number, number];
  next[axisIndex as 0 | 1 | 2 | 3] += amount;
  return next;
}

function projectPointToView(
  point: readonly number[],
  rotation4d: readonly (readonly number[])[],
  viewMatrix: Mat3,
): [number, number, number] {
  const rotated = mulRowVec4(point as [number, number, number, number], rotation4d as never);
  const scaled = rotated.map(value => value * MAGICCUBE4D_SCALE_4D) as [number, number, number, number];
  const denom = Math.max(MAGICCUBE4D_EYE_W - scaled[3], 0.15);
  const factor = MAGICCUBE4D_EYE_W / denom;
  const projected = [scaled[0] * factor, scaled[1] * factor, scaled[2] * factor] as const;
  const rotated3d = mulVec(viewMatrix, [projected[0], projected[1], -projected[2]]);
  return [rotated3d[0], rotated3d[1], -rotated3d[2]];
}

function subtract3(
  left: readonly number[],
  right: readonly number[],
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot3(
  left: readonly number[],
  right: readonly number[],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function mat3EqualsWithinTolerance(left: Mat3, right: Mat3, epsilon = 1e-4): boolean {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (Math.abs(left[row][col] - right[row][col]) > epsilon) {
        return false;
      }
    }
  }
  return true;
}

function applyMoves(state: CubeState, moves: Move[]): CubeState {
  let next = state;
  for (const { face, clockwise, layers } of moves) {
    next = twistFace(next, face, clockwise, layers);
  }
  return next;
}

interface Move {
  face: Face;
  clockwise: boolean;
  layers: number[];
}

function createScramble(length: number, size: CubeSize): { moves: Move[]; notation: string } {
  const moves: Move[] = [];
  let previousFace: Face | null = null;
  let previousAxis: Axis | null = null;

  while (moves.length < length) {
    const face = ALL_FACES[Math.floor(Math.random() * ALL_FACES.length)];
    const axis = faceAxis(face);
    if (face === previousFace || axis === previousAxis) {
      continue;
    }

    const clockwise = Math.random() >= 0.5;
    const wide = size >= 4 && Math.random() < 0.3;
    const layers = faceLayers(face, size, wide);
    moves.push({ face, clockwise, layers });
    previousFace = face;
    previousAxis = axis;
  }

  return {
    moves,
    notation: moves.map(m => formatMove(m, size)).join(' '),
  };
}

function formatMove({ face, clockwise, layers }: Move, size: CubeSize): string {
  const isWide = size >= 4 && layers.length > 1;
  const name = isWide ? `${face}w` : face;
  return clockwise ? name : `${name}'`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  safeArea: {
    flex: 1,
  },
  modeBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 0,
  },
  modeButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  modeButtonFirst: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  modeButtonLast: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  modeButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#f5f7ff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 12,
  },
  topBarLeft: {
    flexDirection: 'row',
    gap: 10,
    flexShrink: 0,
  },
  topBarRight: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  sliceBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  cubeControlsWrap: {
    gap: 4,
  },
  hypercubeControls: {
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  sliceButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sliceButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sliceButtonText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  sliceButtonTextActive: {
    color: '#f5f7ff',
  },
  bottomControls: {
    paddingHorizontal: 12,
    gap: 6,
  },
  bottomControlSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  controlPanel: {
    flex: 1,
    gap: 8,
  },
  faceControlPanel: {
    flex: 0.95,
  },
  turnControlPanel: {
    flex: 1.05,
  },
  facePickerGrid: {
    gap: 4,
  },
  faceChipRow: {
    flexDirection: 'row',
    gap: 4,
  },
  turnButtonColumn: {
    gap: 4,
    justifyContent: 'flex-start',
    flex: 1,
  },
  turnButtonPair: {
    flexDirection: 'row',
    gap: 4,
  },
  faceChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceChipPlaceholder: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
  },
  faceChipActive: {
    borderColor: '#f5f7ff',
    transform: [{ scale: 1.03 }],
  },
  faceChipPressed: {
    opacity: 0.92,
  },
  faceChipText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  compactControlButton: {
    flex: 1,
    minWidth: 0,
    height: 34,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactControlButtonText: {
    color: '#f5f7ff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.96 }],
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  scrambleText: {
    flex: 1,
    color: '#f5f7ff',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    opacity: 0.9,
    paddingHorizontal: 8,
  },
  canvas: {
    flex: 1,
    minHeight: 160,
  },
});
