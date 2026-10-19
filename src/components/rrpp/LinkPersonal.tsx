"use client";

import { useState } from "react";

export function LinkPersonal({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section
      aria-labelledby="mi-link"
      className="flex flex-col gap-3 rounded-[20px] border border-ice/20 bg-deep/55 p-5"
    >
      <h2 id="mi-link" className="display text-[19px] text-white">
        Mi link de venta
      </h2>
      <p className="font-mono text-[13px] tracking-[0.02em] text-white [overflow-wrap:anywhere]">
        {url.replace(/^https?:\/\//, "")}
      </p>
      <p className="text-[12.5px] text-frost/85">Quien compra desde tu link ya te tiene elegido como RRPP.</p>
      <button
        type="button"
        onClick={copiar}
        className="min-h-10 self-start rounded-xl bg-ice px-4 text-[13px] font-bold text-night transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
      >
        {copiado ? "¡Copiado!" : "Copiar link"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Link copiado" : ""}
      </span>
    </section>
  );
}
