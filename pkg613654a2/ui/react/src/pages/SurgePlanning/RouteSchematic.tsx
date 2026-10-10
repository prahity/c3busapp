/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React from 'react';
import { LOAD_COLORS, loadLevel, type Schematic } from './surgeData';

interface RouteSchematicProps {
  schematic: Schematic;
  title: string;
}

/**
 * Compact abstract diagram of passenger flow for an optimization opportunity.
 * Edges are colored and weighted by load so the "before" (one overloaded red
 * corridor) vs. "after" (balanced green flows) story reads at a glance.
 */
export default function RouteSchematic({ schematic, title }: RouteSchematicProps) {
  const nodeById = new Map(schematic.nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox="0 0 200 120"
      role="img"
      aria-label={title}
      className="h-40 w-full rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)]"
    >
      {schematic.edges.map((edge, i) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        const color = LOAD_COLORS[loadLevel(edge.load)];
        return (
          <line
            key={`e${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={edge.dashed ? 'var(--c3-style-basic-fg-neutral)' : color}
            strokeWidth={edge.dashed ? 2 : 2 + edge.load * 7}
            strokeLinecap="round"
            strokeDasharray={edge.dashed ? '4 5' : undefined}
            opacity={edge.dashed ? 0.6 : 0.9}
          />
        );
      })}

      {schematic.nodes.map((node) => (
        <g key={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            r={node.hub ? 7 : 5}
            fill="var(--c3-style-basic-bg-primary)"
            stroke="var(--c3-style-basic-fg-primary)"
            strokeWidth={node.hub ? 2.5 : 1.5}
          />
          <text
            x={node.x}
            y={node.y - 11}
            textAnchor="middle"
            fontSize="9"
            fill="var(--c3-style-basic-fg-secondary)"
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
