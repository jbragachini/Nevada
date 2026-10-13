/**
 * Nieve sutil en CSS puro (sin JS en el cliente).
 * Posiciones generadas con una semilla fija para que servidor y navegador coincidan.
 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seeded(2026);
const FLAKES = Array.from({ length: 70 }, (_, i) => {
  const size = 1.5 + rand() * 3.5;
  return {
    key: i,
    left: `${(rand() * 100).toFixed(2)}%`,
    size,
    duration: 9 + rand() * 14,
    delay: -rand() * 20,
    drift: (rand() - 0.5) * 60,
    opacity: 0.25 + rand() * 0.6,
    blur: size > 4 ? 1.2 : 0,
  };
});

export function Snowfall() {
  return (
    <div aria-hidden="true" className="snowfall pointer-events-none fixed inset-0 overflow-hidden">
      {FLAKES.map((f) => (
        <span
          key={f.key}
          className="flake"
          style={
            {
              left: f.left,
              width: f.size,
              height: f.size,
              opacity: f.opacity,
              filter: f.blur ? `blur(${f.blur}px)` : undefined,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              "--drift": `${f.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
