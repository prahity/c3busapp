/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import type { LatLng } from './surgeData';

/** A path pre-processed with cumulative segment lengths for fast lookup. */
export interface PreparedPath {
  points: LatLng[];
  /** Cumulative distance at each point; last entry is the total length. */
  cumulative: number[];
  total: number;
}

/**
 * Pre-compute cumulative segment lengths for a path so that
 * {@link pointAtFraction} is O(n) per lookup without re-measuring every call.
 *
 * Distances use a flat (equirectangular) approximation — fine for a campus-scale
 * map where we only need relative spacing between buses, not geodesic accuracy.
 */
export function preparePath(points: LatLng[]): PreparedPath {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];
    const dLat = lat2 - lat1;
    // Scale longitude by cos(lat) so east-west distances aren't overstated.
    const dLng = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLng * dLng);
    cumulative.push(cumulative[i - 1] + d);
  }
  const total = cumulative[cumulative.length - 1] || 1;
  return { points, cumulative, total };
}

/**
 * Position along a prepared path at fraction `frac ∈ [0, 1]`, linearly
 * interpolating within the segment the fraction falls on.
 */
export function pointAtFraction(prepared: PreparedPath, frac: number): LatLng {
  const { points, cumulative, total } = prepared;
  if (points.length === 1) return points[0];

  const target = Math.min(1, Math.max(0, frac)) * total;

  // Find the segment that contains `target`.
  let i = 1;
  while (i < cumulative.length && cumulative[i] < target) i += 1;
  if (i >= points.length) return points[points.length - 1];

  const segStart = cumulative[i - 1];
  const segLen = cumulative[i] - segStart || 1;
  const segFrac = (target - segStart) / segLen;

  const [lat1, lng1] = points[i - 1];
  const [lat2, lng2] = points[i];
  return [lat1 + (lat2 - lat1) * segFrac, lng1 + (lng2 - lng1) * segFrac];
}
