"use client";

import { useId, type SVGProps } from "react";

export function OrchestrYXLogo(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  const gid = `ol${id}`;

  return (
    <svg viewBox="0 0 48 48" fill="none" {...props}>
      <defs>
        <linearGradient
          id={gid}
          x1="4"
          y1="44"
          x2="44"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--logo-from, #2563eb)" />
          <stop offset="1" stopColor="var(--logo-to, #06b6d4)" />
        </linearGradient>
      </defs>
      {/* Circular arc */}
      <path
        d="M35 38A17 17 0 1 0 13 14"
        stroke={`url(#${gid})`}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Diagonal slash */}
      <line
        x1="13"
        y1="38"
        x2="38"
        y2="10"
        stroke={`url(#${gid})`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Arrow */}
      <path d="M14 30l7-14H7z" fill={`url(#${gid})`} />
      {/* Nodes */}
      <circle cx="38" cy="10" r="4" fill={`url(#${gid})`} />
      <circle cx="35" cy="38" r="3.5" fill={`url(#${gid})`} />
      <circle cx="13" cy="14" r="3.5" fill={`url(#${gid})`} />
    </svg>
  );
}
