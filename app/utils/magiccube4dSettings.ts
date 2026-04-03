export interface MagicCube4DSettings {
  dragSensitivity: number;
  twistDurationMs: number;
  animationDurationMs: number;
  viewPitchDeg: number;
  viewYawDeg: number;
  projectionScale: number;
  projection4d: number;
  faceSpacing: number;
  stickerSpacing: number;
}

export const DEFAULT_MAGICCUBE4D_SETTINGS: MagicCube4DSettings = {
  dragSensitivity: 1,
  twistDurationMs: 260,
  animationDurationMs: 240,
  viewPitchDeg: 33,
  viewYawDeg: -36,
  projectionScale: 1,
  projection4d: 1,
  faceSpacing: 1,
  stickerSpacing: 1,
};

export function clampMagicCube4DSettings(settings: MagicCube4DSettings): MagicCube4DSettings {
  return {
    dragSensitivity: clamp(settings.dragSensitivity, 0.4, 1.8),
    twistDurationMs: clamp(settings.twistDurationMs, 120, 600),
    animationDurationMs: clamp(settings.animationDurationMs, 120, 600),
    viewPitchDeg: clamp(settings.viewPitchDeg, -85, 85),
    viewYawDeg: clamp(settings.viewYawDeg, -180, 180),
    projectionScale: clamp(settings.projectionScale, 0.6, 1.8),
    projection4d: clamp(settings.projection4d, 0.6, 1.6),
    faceSpacing: clamp(settings.faceSpacing, 0.7, 1.6),
    stickerSpacing: clamp(settings.stickerSpacing, 0.7, 1.6),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
