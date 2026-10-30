// Small helpers the 3D saga files share.

/** Wraps an angle to -PI..PI, so the difference of two headings is always the short way round. */
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
