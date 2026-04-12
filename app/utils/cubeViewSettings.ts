import { mulMat, rotX, rotY, rotZ, type Mat3 } from './math3d';

export interface CubeViewSettings {
  viewPitchDeg: number;
  viewYawDeg: number;
  viewRollDeg: number;
}

export const DEFAULT_CUBE_VIEW_SETTINGS: CubeViewSettings = {
  viewPitchDeg: -32.6795544800386,
  viewYawDeg: 36.03029112148315,
  viewRollDeg: 13.212877111724113,
};

export function clampCubeViewSettings(settings: CubeViewSettings): CubeViewSettings {
  return {
    viewPitchDeg: clamp(settings.viewPitchDeg, -85, 85),
    viewYawDeg: clamp(settings.viewYawDeg, -180, 180),
    viewRollDeg: clamp(settings.viewRollDeg, -180, 180),
  };
}

export function createCubeViewMatrix(settings: CubeViewSettings): Mat3 {
  return mulMat(
    rotZ(toRadians(settings.viewRollDeg)),
    mulMat(
      rotX(toRadians(settings.viewPitchDeg)),
      rotY(toRadians(settings.viewYawDeg)),
    ),
  );
}

export function deriveCubeViewSettings(matrix: Mat3): CubeViewSettings {
  const pitchRad = Math.asin(clampUnit(matrix[2][1]));
  const yawRad = Math.atan2(-matrix[2][0], matrix[2][2]);
  const rollRad = Math.atan2(-matrix[0][1], matrix[1][1]);

  return clampCubeViewSettings({
    viewPitchDeg: toDegrees(pitchRad),
    viewYawDeg: toDegrees(yawRad),
    viewRollDeg: toDegrees(rollRad),
  });
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
