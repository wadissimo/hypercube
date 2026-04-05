import type { CubeSize } from './cubeModel';

export type CubeTimerStatus = 'idle' | 'running' | 'paused';

export interface CubeTimerHistoryEntry {
  id: string;
  elapsedMs: number;
  recordedAt: string;
  scrambleText: string;
}

export interface CubeTimerSession {
  status: CubeTimerStatus;
  elapsedMs: number;
  startedAt: number | null;
  history: CubeTimerHistoryEntry[];
  recordMs: number | null;
}

export type CubeTimerSessionMap = Record<CubeSize, CubeTimerSession>;

const MAX_TIMER_HISTORY = 30;

export function createDefaultCubeTimerSession(): CubeTimerSession {
  return {
    status: 'idle',
    elapsedMs: 0,
    startedAt: null,
    history: [],
    recordMs: null,
  };
}

export function createDefaultCubeTimerSessions(): CubeTimerSessionMap {
  return {
    2: createDefaultCubeTimerSession(),
    3: createDefaultCubeTimerSession(),
    4: createDefaultCubeTimerSession(),
    5: createDefaultCubeTimerSession(),
  };
}

export function cloneCubeTimerSession(session: CubeTimerSession): CubeTimerSession {
  return {
    status: session.status,
    elapsedMs: session.elapsedMs,
    startedAt: session.startedAt,
    history: session.history.map(entry => ({ ...entry })),
    recordMs: session.recordMs,
  };
}

export function getCubeTimerElapsedMs(session: CubeTimerSession, now = Date.now()): number {
  if (session.status !== 'running' || session.startedAt == null) {
    return session.elapsedMs;
  }

  return Math.max(0, session.elapsedMs + (now - session.startedAt));
}

export function startCubeTimerSession(session: CubeTimerSession, now = Date.now()): CubeTimerSession {
  if (session.status === 'running') {
    return session;
  }

  return {
    ...session,
    status: 'running',
    startedAt: now,
  };
}

export function pauseCubeTimerSession(session: CubeTimerSession, now = Date.now()): CubeTimerSession {
  if (session.status !== 'running') {
    return session;
  }

  return {
    ...session,
    status: 'paused',
    elapsedMs: getCubeTimerElapsedMs(session, now),
    startedAt: null,
  };
}

export function stopCubeTimerSession(
  session: CubeTimerSession,
  scrambleText: string,
  now = Date.now(),
): CubeTimerSession {
  const elapsedMs = getCubeTimerElapsedMs(session, now);
  if (elapsedMs <= 0) {
    return {
      ...session,
      status: 'idle',
      elapsedMs: 0,
      startedAt: null,
    };
  }

  const entry: CubeTimerHistoryEntry = {
    id: `${now}-${session.history.length}`,
    elapsedMs,
    recordedAt: new Date(now).toISOString(),
    scrambleText,
  };

  return {
    status: 'idle',
    elapsedMs: 0,
    startedAt: null,
    history: [entry, ...session.history].slice(0, MAX_TIMER_HISTORY),
    recordMs: session.recordMs == null ? elapsedMs : Math.min(session.recordMs, elapsedMs),
  };
}

export function clearCubeTimerHistory(session: CubeTimerSession): CubeTimerSession {
  return {
    ...session,
    history: [],
    recordMs: null,
  };
}

export function sanitizeCubeTimerSessionForPersistence(
  session: CubeTimerSession,
  now = Date.now(),
): CubeTimerSession {
  if (session.status !== 'running') {
    return cloneCubeTimerSession(session);
  }

  return {
    ...cloneCubeTimerSession(session),
    status: 'paused',
    elapsedMs: getCubeTimerElapsedMs(session, now),
    startedAt: null,
  };
}

export function formatCubeTimerElapsed(elapsedMs: number): string {
  const totalCentiseconds = Math.max(0, Math.floor(elapsedMs / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const minutePrefix = minutes > 0 ? `${minutes.toString().padStart(2, '0')}:` : '';
  return `${minutePrefix}${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}
