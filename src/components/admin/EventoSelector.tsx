"use client";

import { useTransition } from "react";
import { elegirEvento } from "@/app/actions/admin";

/** Selector del evento sobre el que trabaja todo el panel. */
export function EventoSelector({
  eventos,
  actual,
}: {
  eventos: { id: string; nombre: string; publicado: boolean }[];
  actual: string | null;
}) {
  const [pending, startTransition] = useTransition();
  if (eventos.length === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-ice/20 bg-deep/55 px-4 py-3">
      <label htmlFor="evento-actual" className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice">
        Evento
      </label>
      <select
        id="evento-actual"
        value={actual ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => elegirEvento(id));
        }}
        className="min-h-10 min-w-0 flex-1 rounded-xl border border-ice/30 bg-night px-3 text-sm font-semibold text-white outline-none focus:border-ice focus:ring-2 focus:ring-ice/40 sm:max-w-sm"
      >
        {eventos.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
            {e.publicado ? " · en la página" : ""}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-ice">Cambiando…</span>}
    </div>
  );
}
