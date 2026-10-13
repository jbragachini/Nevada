import { NEVADA_LETTERS_PATH, NEVADA_LETTERS_VIEWBOX } from "./nevada-letters-path";

const MOUNTAIN = [
  "85,295 235,158 278,192 256,206 238,192 196,236 216,232 130,290",
  "280,300 435,40 548,152 506,146 440,92 425,152 335,216 352,222 305,300",
  "500,140 595,118 795,300 748,286 606,176 600,212 580,196 562,172 545,152",
];

export function Mountain({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="70 30 740 280"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill="currentColor">
        {MOUNTAIN.map((p) => (
          <polygon key={p} points={p} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Logo oficial: montaña arriba + NE/VA/DA apilado + "PRODUCCIONES" vertical.
 * `height` es la altura de las letras en px; todo escala proporcionalmente.
 */
export function NevadaLogo({ height = 120, className = "" }: { height?: number; className?: string }) {
  const lettersWidth = (height * 530) / 1498;
  const prodSize = Math.max(7, height * 0.085);
  return (
    <div
      className={`inline-flex flex-col items-center text-white ${className}`}
      style={{ gap: height * 0.06 }}
      role="img"
      aria-label="Nevada Producciones"
    >
      <div className="text-ice" style={{ width: lettersWidth * 2.3 }}>
        <Mountain className="block w-full h-auto" />
      </div>
      <div className="flex items-end" style={{ gap: height * 0.03 }}>
        <svg
          viewBox={NEVADA_LETTERS_VIEWBOX}
          width={lettersWidth}
          height={height}
          aria-hidden="true"
        >
          <path d={NEVADA_LETTERS_PATH} fill="currentColor" fillRule="evenodd" />
        </svg>
        <span
          aria-hidden="true"
          className="font-light italic tracking-[0.12em] leading-none"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: prodSize,
            fontFamily: "var(--font-body)",
          }}
        >
          PRODUCCIONES
        </span>
      </div>
    </div>
  );
}
