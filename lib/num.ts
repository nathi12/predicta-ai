// lib/num.ts
// Small numeric helpers shared by the model and the trackers. Pure.

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const round1 = (x: number): number => Math.round(x * 10) / 10;
export const round2 = (x: number): number => Math.round(x * 100) / 100;
export const round3 = (x: number): number => Math.round(x * 1000) / 1000;
