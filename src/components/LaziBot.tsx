/**
 * LaziBot — fat, playful, slightly dirty bot
 * No hard hat, no IBM/Bob. Overweight chassis, smudgy textures, loose bolts.
 * Pure SVG — no external assets.
 */
export default function LaziBot({
  size = 42,
  mood = 'chill',
  className = '',
}: {
  size?: number
  mood?: 'chill' | 'working' | 'sleepy' | 'hyped'
  className?: string
}) {
  const eyes = mood === 'sleepy' ? '– –' : mood === 'hyped' ? '◉ ◉' : '● ●'
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background:
          'radial-gradient(circle at 28% 18%, #6b7fa3 0%, #2f4366 42%, #16233f 68%, #0c1220 100%)',
        border: '1px solid #2a3d66',
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 4px 18px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={`LaziBot — ${mood} — Monastery of Laziness`}
      aria-label="LaziBot"
    >
      {/* smudge overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120px 60px at 55% 12%, rgba(255,255,255,.07), transparent 60%),' +
            'radial-gradient(90px 50px at 20% 75%, rgba(0,0,0,.18), transparent 60%),' +
            'radial-gradient(70px 40px at 85% 70%, rgba(0,0,0,.14), transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      {/* bot face */}
      <svg
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        viewBox="0 0 64 64"
        role="img"
        aria-hidden
      >
        {/* fat belly chassis */}
        <ellipse cx="32" cy="38" rx="22" ry="18" fill="#0e1a30" opacity={0.95} />
        <ellipse cx="32" cy="36" rx="20" ry="16" fill="#1e2d4a" opacity={0.95} />
        <ellipse cx="32" cy="34" rx="18" ry="14" fill="#2e4266" />
        {/* belly highlight */}
        <ellipse cx="26" cy="30" rx="7" ry="5" fill="rgba(255,255,255,.07)" />
        {/* head dome — slightly squashed, no hat */}
        <ellipse cx="32" cy="18" rx="16" ry="12" fill="#1a2744" />
        <ellipse cx="32" cy="17" rx="14" ry="10" fill="#2f4366" />
        <ellipse cx="28" cy="14" rx="5" ry="3.5" fill="rgba(255,255,255,.09)" />
        {/* visor */}
        <rect x="14" y="15" width="36" height="12" rx="6" fill="#070b14" stroke="#3a4f75" strokeWidth={1.2} />
        <rect x="16" y="17" width="32" height="8" rx="4" fill="#0a66c2" opacity={0.55} />
        {/* eyes */}
        <text
          x="32"
          y="23.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight={800}
          fill="#cfe1ff"
          style={{ letterSpacing: 4, filter: 'drop-shadow(0 0 6px rgba(95,169,255,.9))' }}
        >
          {eyes}
        </text>
        {/* cheek blush — lazy */}
        <ellipse cx="18" cy="26" rx="2.2" ry="1.2" fill="#ff8a7a" opacity={0.22} />
        <ellipse cx="46" cy="26" rx="2.2" ry="1.2" fill="#ff8a7a" opacity={0.22} />
        {/* mouth — slight smirk */}
        <path
          d={mood === 'sleepy' ? 'M26 30 Q32 31 38 30' : mood === 'hyped' ? 'M24 30 Q32 36 40 30' : 'M25 30 Q32 33 39 30'}
          stroke="#9fb0cc"
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />
        {/* belly bolts — loose */}
        <circle cx="20" cy="38" r={1.6} fill="#6b7d9e" />
        <circle cx="44" cy="38" r={1.6} fill="#6b7d9e" />
        <circle cx="21" cy="46" r={1.2} fill="#5a6d90" opacity={0.9} />
        <circle cx="43" cy="46" r={1.2} fill="#5a6d90" opacity={0.9} />
        {/* smudge streaks */}
        <path d="M18 42 Q22 44 20 48" stroke="rgba(0,0,0,.22)" strokeWidth={1.2} strokeLinecap="round" fill="none" />
        <path d="M46 40 Q43 44 45 47" stroke="rgba(0,0,0,.18)" strokeWidth={1} strokeLinecap="round" fill="none" />
        {/* tiny antenna nub — bent */}
        <line x1="32" y1="6" x2="34" y2="2.5" stroke="#5a6d90" strokeWidth={1.4} strokeLinecap="round" />
        <circle cx="34.5" cy="2" r={1.7} fill="#ff6b35" stroke="#3a4f75" strokeWidth={0.7} />
      </svg>
    </div>
  )
}

export function LaziBotInline({ size = 18 }: { size?: number }) {
  return <span style={{ display: 'inline-grid', placeItems: 'center', verticalAlign: 'middle' }}><LaziBot size={size} mood="chill" /></span>
}
