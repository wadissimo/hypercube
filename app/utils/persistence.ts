import { File, Paths } from 'expo-file-system';
import type { CubeSize, CubeState, Face } from './cubeModel';
import type { CubeTimerHistoryEntry, CubeTimerSession } from './cubeTimer';
import { createDefaultCubeTimerSession } from './cubeTimer';
import type { CubeViewSettings } from './cubeViewSettings';
import {
  clampMagicCube4DSettings,
  DEFAULT_MAGICCUBE4D_SETTINGS,
  isHypercubeGestureAction,
  type MagicCube4DSettings,
} from './magiccube4dSettings';
import type { Mat3 } from './math3d';
import type { Mat4 } from './math4d';

export type PersistedCubeKey = '2' | '3' | '4' | '5';
export type PersistedScreenMode = 'cube' | 'hypercube';
export type PersistedHypercubeRotationMode = '4d' | '3d' | null;

export interface PersistedCubeSession {
  cubeState: CubeState;
  scrambleText: string;
  solveCheckArmed?: boolean;
  rotationMode: boolean;
  sliceMask: number;
  viewMatrix: Mat3;
  zoom: number;
  timer?: CubeTimerSession;
}

export interface PersistedHypercubeSession {
  state: number[];
  sliceMask: number;
  solveCheckArmed?: boolean;
  rotation4d: Mat4;
  settings: MagicCube4DSettings;
  savedViewMatrix: Mat3 | null;
  rotationMode: PersistedHypercubeRotationMode;
  selectedFace: number | null;
  lastTurnSliceMask: number;
  timer?: CubeTimerSession;
}

export interface PersistedAppState {
  version: 1;
  mode: PersistedScreenMode;
  cubeSize: CubeSize;
  cubes: Record<PersistedCubeKey, PersistedCubeSession>;
  cubeViewSettings?: CubeViewSettings;
  savedCubeViewMatrix?: Mat3 | null;
  hypercube: PersistedHypercubeSession;
  crossFace?: Face;
}

const AUTOSAVE_FILE = new File(Paths.cache, 'hypercube-session-autosave.json');
const SAVED_FILE = new File(Paths.document, 'hypercube-session-save.json');
const CUBE_KEYS: PersistedCubeKey[] = ['2', '3', '4', '5'];
const VALID_FACES: Face[] = ['U', 'D', 'R', 'L', 'F', 'B'];

export async function loadSavedAppState(): Promise<PersistedAppState | null> {
  return loadStateFromFile(SAVED_FILE);
}

export async function loadAutosavedAppState(): Promise<PersistedAppState | null> {
  return loadStateFromFile(AUTOSAVE_FILE);
}

export async function loadRestorableAppState(): Promise<PersistedAppState | null> {
  return await loadSavedAppState() ?? await loadAutosavedAppState();
}

export async function saveAppState(state: PersistedAppState): Promise<boolean> {
  return saveStateToFile(SAVED_FILE, state);
}

export async function saveAutosavedAppState(state: PersistedAppState): Promise<boolean> {
  return saveStateToFile(AUTOSAVE_FILE, state);
}

async function loadStateFromFile(file: File): Promise<PersistedAppState | null> {
  if (!file.exists) {
    return null;
  }

  try {
    const raw = JSON.parse(await file.text()) as unknown;
    return isPersistedAppState(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function saveStateToFile(file: File, state: PersistedAppState): Promise<boolean> {
  try {
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(state), { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function isPersistedAppState(value: unknown): value is PersistedAppState {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }

  if ((value.mode !== 'cube' && value.mode !== 'hypercube') || !isCubeSize(value.cubeSize)) {
    return false;
  }

  if (!isRecord(value.cubes) || !isPersistedHypercubeSession(value.hypercube)) {
    return false;
  }

  if (value.cubeViewSettings !== undefined && !isCubeViewSettings(value.cubeViewSettings)) {
    return false;
  }

  if (value.savedCubeViewMatrix !== undefined && value.savedCubeViewMatrix !== null && !isMat3(value.savedCubeViewMatrix)) {
    return false;
  }

  if (value.crossFace !== undefined && !VALID_FACES.includes(value.crossFace as Face)) {
    return false;
  }

  return CUBE_KEYS.every(key => isPersistedCubeSession(value.cubes[key]));
}

function isPersistedCubeSession(value: unknown): value is PersistedCubeSession {
  return isRecord(value)
    && isCubeState(value.cubeState)
    && typeof value.scrambleText === 'string'
    && (value.solveCheckArmed === undefined || typeof value.solveCheckArmed === 'boolean')
    && typeof value.rotationMode === 'boolean'
    && isFiniteNumber(value.sliceMask)
    && isMat3(value.viewMatrix)
    && isFiniteNumber(value.zoom)
    && (value.timer === undefined || isCubeTimerSession(value.timer));
}

export function normalizePersistedCubeSession(
  session: PersistedCubeSession,
): PersistedCubeSession & { timer: CubeTimerSession } {
  const timer = session.timer ?? createDefaultCubeTimerSession();
  return {
    ...session,
    solveCheckArmed: session.solveCheckArmed ?? false,
    timer: timer.status === 'running'
      ? {
        ...timer,
        status: 'paused',
        startedAt: null,
      }
      : timer,
  };
}

export function normalizePersistedHypercubeSession(
  session: PersistedHypercubeSession,
): PersistedHypercubeSession & { timer: CubeTimerSession } {
  const timer = session.timer ?? createDefaultCubeTimerSession();
  return {
    ...session,
    settings: normalizeMagicCube4DSettings(session.settings),
    solveCheckArmed: session.solveCheckArmed ?? false,
    timer: timer.status === 'running'
      ? {
        ...timer,
        status: 'paused',
        startedAt: null,
      }
      : timer,
  };
}

function isPersistedHypercubeSession(value: unknown): value is PersistedHypercubeSession {
  return isRecord(value)
    && isNumberArray(value.state)
    && isFiniteNumber(value.sliceMask)
    && (value.solveCheckArmed === undefined || typeof value.solveCheckArmed === 'boolean')
    && isMat4(value.rotation4d)
    && isMagicCube4DSettings(value.settings)
    && (value.savedViewMatrix === null || isMat3(value.savedViewMatrix))
    && (value.rotationMode === null || value.rotationMode === '3d' || value.rotationMode === '4d')
    && (value.selectedFace === null || isFiniteNumber(value.selectedFace))
    && isFiniteNumber(value.lastTurnSliceMask)
    && (value.timer === undefined || isCubeTimerSession(value.timer));
}

function isMagicCube4DSettings(value: unknown): value is MagicCube4DSettings {
  return isRecord(value)
    && isFiniteNumber(value.dragSensitivity)
    && isFiniteNumber(value.twistDurationMs)
    && isFiniteNumber(value.animationDurationMs)
    && isFiniteNumber(value.viewPitchDeg)
    && isFiniteNumber(value.viewYawDeg)
    && isFiniteNumber(value.projectionScale)
    && isFiniteNumber(value.projection4d)
    && isFiniteNumber(value.faceSpacing)
    && isFiniteNumber(value.stickerSpacing)
    && isFiniteNumber(value.shadowLight)
    && (value.singleTapAction === undefined || isHypercubeGestureAction(value.singleTapAction))
    && (value.longTapAction === undefined || isHypercubeGestureAction(value.longTapAction))
    && (value.doubleTapAction === undefined || isHypercubeGestureAction(value.doubleTapAction));
}

function normalizeMagicCube4DSettings(settings: MagicCube4DSettings): MagicCube4DSettings {
  return clampMagicCube4DSettings({
    ...DEFAULT_MAGICCUBE4D_SETTINGS,
    ...settings,
  });
}

function isCubeViewSettings(value: unknown): value is CubeViewSettings {
  return isRecord(value)
    && isFiniteNumber(value.viewPitchDeg)
    && isFiniteNumber(value.viewYawDeg)
    && isFiniteNumber(value.viewRollDeg);
}

function isCubeTimerSession(value: unknown): value is CubeTimerSession {
  return isRecord(value)
    && (value.status === 'idle' || value.status === 'running' || value.status === 'paused')
    && isFiniteNumber(value.elapsedMs)
    && (value.startedAt === null || isFiniteNumber(value.startedAt))
    && Array.isArray(value.history)
    && value.history.every(isCubeTimerHistoryEntry)
    && (value.recordMs === null || isFiniteNumber(value.recordMs));
}

function isCubeTimerHistoryEntry(value: unknown): value is CubeTimerHistoryEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && isFiniteNumber(value.elapsedMs)
    && typeof value.recordedAt === 'string'
    && typeof value.scrambleText === 'string';
}

function isCubeState(value: unknown): value is CubeState {
  return Array.isArray(value) && value.every(cubie => (
    isRecord(cubie)
    && isVec3(cubie.position)
    && isFacesRecord(cubie.faces)
  ));
}

function isFacesRecord(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(([face, color]) => (
    VALID_FACES.includes(face as Face)
    && VALID_FACES.includes(color as Face)
  ));
}

function isMat3(value: unknown): value is Mat3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every(isVec3);
}

function isMat4(value: unknown): value is Mat4 {
  return Array.isArray(value)
    && value.length === 4
    && value.every(isVec4);
}

function isVec3(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every(isFiniteNumber);
}

function isVec4(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value)
    && value.length === 4
    && value.every(isFiniteNumber);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isCubeSize(value: unknown): value is CubeSize {
  return value === 2 || value === 3 || value === 4 || value === 5;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
