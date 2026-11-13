"use client";

import { useState, useTransition } from "react";
import { pagarConMercadoPago } from "@/app/actions/pedidos";
import { FlechaGl } from "@/components/FlechaGl";

/** Otra forma de pagar el pedido: Mercado Pago (tarjeta o dinero en cuenta). Solo aparece si Nevada lo activó. */
export function PagoMercadoPago({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pagar() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const r = await pagarConMercadoPago(token);
      if (r.ok) window.location.assign(r.url);
      else setError(r.error);
    });
  }

  return (
    <section aria-labelledby="pagar-mp" className="flex flex-col gap-3 rounded-[24px] border border-white/15 bg-white/[0.04] p-5">
      <h2 id="pagar-mp" className="text-xs font-bold uppercase tracking-[0.28em] text-ice">
        O pagá con Mercado Pago
      </h2>
      <p className="text-sm text-frost">Con tarjeta o dinero en cuenta. Se acredita en el momento y no hace falta subir comprobante.</p>
      <button type="button" onClick={pagar} disabled={pending} aria-busy={pending} className="gl w-full [letter-spacing:.12em]">
        <span>{pending ? "Abriendo…" : "Pagar con Mercado Pago"}</span>
        <FlechaGl />
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
