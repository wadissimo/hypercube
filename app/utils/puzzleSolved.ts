export interface SolveCheckTransition {
  didSolve: boolean;
  nextArmed: boolean;
}

export function resolveSolveCheckTransition(
  armed: boolean,
  isSolved: boolean,
): SolveCheckTransition {
  if (!armed || !isSolved) {
    return {
      didSolve: false,
      nextArmed: armed,
    };
  }

  return {
    didSolve: true,
    nextArmed: false,
  };
}
