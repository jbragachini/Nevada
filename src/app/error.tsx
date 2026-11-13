"use client";

import { useEffect } from "react";

/** Error inesperado en cualquier pantalla: se avisa sin detalles internos y se puede reintentar. */
export default function ErrorDePagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <div className="fondo-noche" aria-hidden="true" />
      <section className="tema-noche relative z-10 w-full max-w-md">
        <div className="vidrio flex flex-col items-center gap-4 rounded-[28px] px-6 py-10 text-center">
          <h1 className="display text-[22px] leading-none text-deep">ALGO SALIÓ MAL</h1>
          <p className="max-w-[34ch] text-sm leading-relaxed text-muted text-pretty">
            No pudimos cargar esta pantalla. Probá de nuevo; si ya habías hecho un pedido, no se perdió.
          </p>
          <button type="button" onClick={reset} className="mt-2 gl gl-centro w-full">
            <span>Probar de nuevo</span>
          </button>
          {error.digest && <p className="text-[11px] text-muted">Referencia: {error.digest}</p>}
        </div>
      </section>
    </main>
  );
}
