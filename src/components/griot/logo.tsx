export function GriotMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="griot-monochrome" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E4E4E7" />
          <stop offset="100%" stopColor="#91919E" />
        </linearGradient>
        <radialGradient id="ambient-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="#060608" />
      <circle cx="256" cy="256" r="200" fill="url(#ambient-glow)" />
      <g transform="translate(2, 0)">
        <path
          d="M 196 186 C 130 186, 130 256, 196 256 C 262 256, 262 326, 328 326 C 394 326, 394 256, 328 256 C 262 256, 262 186, 196 186 Z"
          fill="none"
          stroke="url(#griot-monochrome)"
          strokeWidth="26"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="328"
          y1="256"
          x2="385"
          y2="256"
          stroke="url(#griot-monochrome)"
          strokeWidth="26"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function GriotLogo({ className = "size-40" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="griot-monochrome-full" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E4E4E7" />
          <stop offset="100%" stopColor="#91919E" />
        </linearGradient>
        <radialGradient id="ambient-glow-full" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="#060608" />
      <circle cx="256" cy="200" r="180" fill="url(#ambient-glow-full)" />
      <g transform="translate(2, -42)">
        <path
          d="M 196 186 C 130 186, 130 256, 196 256 C 262 256, 262 326, 328 326 C 394 326, 394 256, 328 256 C 262 256, 262 186, 196 186 Z"
          fill="none"
          stroke="url(#griot-monochrome-full)"
          strokeWidth="26"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="328"
          y1="256"
          x2="385"
          y2="256"
          stroke="url(#griot-monochrome-full)"
          strokeWidth="26"
          strokeLinecap="round"
        />
      </g>
      <text
        x="256"
        y="352"
        textAnchor="middle"
        fontFamily="'Inter', 'Plus Jakarta Sans', -apple-system, sans-serif"
        fontWeight="800"
        fontSize="44"
        fill="#FFFFFF"
        letterSpacing="8"
      >
        GRIOT
      </text>
      <text
        x="256"
        y="395"
        textAnchor="middle"
        fontFamily="'Inter', -apple-system, sans-serif"
        fontWeight="500"
        fontSize="14"
        fill="#A1A1AA"
        letterSpacing="4.5"
      >
        The AI ModelOS
      </text>
    </svg>
  );
}

export function GriotSymbol({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="100 160 310 190" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="griot-sym-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E4E4E7" />
          <stop offset="100%" stopColor="#91919E" />
        </linearGradient>
      </defs>
      <g transform="translate(2, 0)">
        <path
          d="M 196 186 C 130 186, 130 256, 196 256 C 262 256, 262 326, 328 326 C 394 326, 394 256, 328 256 C 262 256, 262 186, 196 186 Z"
          fill="none"
          stroke="url(#griot-sym-gradient)"
          strokeWidth="28"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="328"
          y1="256"
          x2="385"
          y2="256"
          stroke="url(#griot-sym-gradient)"
          strokeWidth="28"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

