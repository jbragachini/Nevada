"use client";

import { useState } from "react";

export function ClaveEvento({ evento, clave }: { evento: string; clave: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section aria-labelledby="clave-titulo" className="max-w-xl rounded-[20px] bg-white p-5 text-ink">
      <h2 id="clave-titulo" className="display text-[19px] text-deep">
        Evento con palabra clave
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Para comprar entradas de {evento} hay que saber la palabra clave. Pasala solo a quien quieras invitar;
        si compran desde tu link, la venta queda a tu nombre.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-frost px-4 py-3">
        <p className="display min-w-0 flex-1 text-xl tracking-[0.02em] text-deep [overflow-wrap:anywhere]">{clave}</p>
        <button
          type="button"
          onClick={copiar}
          className="min-h-10 rounded-xl bg-deep px-4 text-[13px] font-bold text-white transition-colors hover:bg-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          {copiado ? "¡Copiada!" : "Copiar"}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Palabra clave copiada" : ""}
      </span>
    </section>
  );
}
