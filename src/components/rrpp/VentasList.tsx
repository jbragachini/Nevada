"use client";

import { useRef, useState, useTransition } from "react";
import { qrDeEntrada } from "@/app/actions/rrpp";
import { formatARS } from "@/lib/format";
import type { Venta } from "@/lib/rrpp";

const COMO: Record<Venta["metodo"], string> = {
  efectivo_rrpp: "Cargada por vos · efectivo · la rendís",
  transferencia_rrpp: "Cargada por vos · transferencia a vos · la rendís",
  transferencia_nevada: "Cargada por vos · transferencia a Nevada · no rendís",
  mercadopago: "Compró en la web y pagó a Nevada · no rendís, cobrás comisión",
};

function Estado({ v }: { v: Venta }) {
  const [texto, clase] = (() => {
    switch (v.status) {
      case "aprobado":
        return [v.metodo === "efectivo_rrpp" ? "Efectivo · QR generados" : "Aprobado", "bg-[#e5f4ea] text-ok"];
      case "por_confirmar":
        return ["Por aprobar", "bg-[#fdf1e4] text-warn"];
      case "pagado":
        return ["Pagado · por aprobar", "bg-[#fdf1e4] text-warn"];
      case "pendiente_pago":
        return ["Esperando el pago", "bg-frost text-blue"];
      case "rechazado":
        return ["Rechazado", "bg-[#fbe7e5] text-danger"];
      case "vencido":
        return ["Vencido", "bg-[#eceef1] text-void"];
      default:
        return ["Cancelado", "bg-[#eceef1] text-void"];
    }
  })();
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] ${clase}`}
    >
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
      {texto}
    </span>
  );
}

export function VentasList({ ventas, porAprobar }: { ventas: Venta[]; porAprobar: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState<{ svg: string; titular: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  function verQr(id: string) {
    setQr(null);
    setError(null);
    dialogRef.current?.showModal();
    startTransition(async () => {
      const r = await qrDeEntrada(id);
      if (r.ok) setQr({ svg: r.svg, titular: r.titular });
      else setError(r.error ?? "No pudimos mostrar el QR.");
    });
  }

  return (
    <section aria-labelledby="mis-ventas" className="rounded-[20px] bg-white p-5 text-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mis-ventas" className="display text-[19px] text-deep">
          Mis ventas
        </h2>
        {porAprobar > 0 && (
          <span className="text-[12.5px] font-semibold text-warn">
            {porAprobar} esperando aprobación
          </span>
        )}
      </div>

      {ventas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Todavía no tenés ventas.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {ventas.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 py-3.5">
              <div className="min-w-[180px] flex-1">
                <p className="font-bold">{v.comprador}</p>
                <p className="text-[12.5px] text-muted">
                  {v.evento} · <span className="tabular-nums">{v.numero}</span> ·{" "}
                  {v.items.map((i) => `${i.cantidad} ${i.nombre}`).join(", ")} ·{" "}
                  <span className="tabular-nums">{formatARS(v.total)}</span>
                </p>
                <p className="text-[12.5px] text-muted">{COMO[v.metodo]}</p>
              </div>
              <Estado v={v} />
              {v.entradas.length > 0 && (
                <div className="flex basis-full flex-wrap gap-2">
                  {v.entradas.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => verQr(t.id)}
                      disabled={t.status === "anulada"}
                      className="min-h-10 rounded-xl border border-line px-3 text-[13px] font-semibold text-muted transition-colors hover:border-blue hover:text-deep focus-visible:outline-2 focus-visible:outline-blue disabled:line-through disabled:opacity-60"
                    >
                      QR · {t.titular}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="qr-titulo"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="m-auto w-[min(92vw,360px)] rounded-[20px] bg-white p-0 text-ink backdrop:bg-night/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <h3 id="qr-titulo" className="display text-lg text-deep">
            {qr ? qr.titular.toUpperCase() : "ENTRADA"}
          </h3>
          <div className="grid aspect-square w-full max-w-[240px] place-items-center rounded-xl border border-line">
            {qr ? (
              <div
                className="w-full [&>svg]:h-auto [&>svg]:w-full"
                role="img"
                aria-label={`Código QR de la entrada de ${qr.titular}`}
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />
            ) : (
              <p className="px-4 text-sm text-muted" role={error ? "alert" : "status"}>
                {error ?? (cargando ? "Cargando…" : "")}
              </p>
            )}
          </div>
          <p className="text-[12.5px] text-muted">Mostralo en la puerta. Es único y vale para una sola persona.</p>
          <form method="dialog" className="w-full">
            <button
              type="submit"
              className="min-h-11 w-full rounded-xl border border-line text-sm font-semibold text-muted hover:text-deep focus-visible:outline-2 focus-visible:outline-blue"
            >
              Cerrar
            </button>
          </form>
        </div>
      </dialog>
    </section>
  );
}
