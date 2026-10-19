"use client";

import { useState, useTransition } from "react";
import { aprobarAcceso, editarRrpp, rechazarAcceso } from "@/app/actions/admin";
import { useAvisar } from "@/components/admin/Avisos";
import { boton, campo } from "@/components/admin/ui";

/** Aprobar un pedido de acceso: código del link personal, si puede cargar ventas y tope de invitados. */
export function AprobarAcceso({ id, usuario, nombre }: { id: string; usuario: string; nombre: string }) {
  const sugerido = usuario.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 30);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [error, setError] = useState<string>("");
  const avisar = useAvisar();

  function aprobar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    startTransition(async () => {
      const r = await aprobarAcceso(id, {
        codigo: String(f.get("codigo") ?? ""),
        puede_cargar: f.get("puede_cargar") === "on",
        max_invitados: String(f.get("max_invitados") ?? ""),
      });
      setError(r.ok ? "" : (r.fieldErrors?.codigo ?? ""));
      if (r.ok) avisar(`Aprobaste a ${nombre}.`);
      else setMsg({ ok: false, texto: r.error });
    });
  }

  function rechazar() {
    if (!window.confirm(`¿Rechazar el acceso de ${nombre}?`)) return;
    startTransition(async () => {
      const r = await rechazarAcceso(id);
      if (r.ok) avisar(`Rechazaste el acceso de ${nombre}.`);
      else setMsg({ ok: false, texto: r.error });
    });
  }

  return (
    <form onSubmit={aprobar} aria-label={`Aprobar a ${nombre}`} className="flex flex-wrap items-end gap-3">
      <div className="flex w-40 flex-col gap-1">
        <label htmlFor={`codigo-${id}`} className="text-[12px] font-semibold text-muted">
          Código del link
        </label>
        <input
          id={`codigo-${id}`}
          name="codigo"
          defaultValue={sugerido}
          aria-invalid={!!error}
          aria-describedby={error ? `codigo-${id}-error` : `codigo-${id}-ayuda`}
          className={campo}
        />
      </div>
      <div className="flex w-28 flex-col gap-1">
        <label htmlFor={`tope-${id}`} className="text-[12px] font-semibold text-muted">
          Tope invitados
        </label>
        <input
          id={`tope-${id}`}
          name="max_invitados"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Sin tope"
          className={`${campo} tabular-nums`}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="puede_cargar" defaultChecked className="h-4 w-4 accent-[var(--deep)]" />
        Puede cargar ventas
      </label>
      <button type="submit" disabled={pending} className={boton.ok}>
        {pending ? "Guardando…" : "Aprobar"}
      </button>
      <button type="button" onClick={rechazar} disabled={pending} className={boton.peligro}>
        Rechazar
      </button>
      <p className="basis-full text-xs" aria-live="polite">
        {error ? (
          <span id={`codigo-${id}-error`} className="font-medium text-danger">
            {error}
          </span>
        ) : (
          <span id={`codigo-${id}-ayuda`} className="text-muted">
            Su link va a ser nevadaproducciones.com/?rrpp=código.
          </span>
        )}
        {msg && <span className={`ml-2 font-medium ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.texto}</span>}
      </p>
    </form>
  );
}

/** Tope de invitados de un RRPP (vacío = sin tope). */
export function TopeInvitados({ id, tope, nombre }: { id: string; tope: number | null; nombre: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <form
      aria-label={`Tope de invitados de ${nombre}`}
      className="flex items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        const v = String(new FormData(ev.currentTarget).get("tope") ?? "");
        startTransition(async () => {
          const r = await editarRrpp(id, { max_invitados: v });
          setMsg(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
        });
      }}
    >
      <div className="flex w-28 flex-col gap-1">
        <label htmlFor={`tope-rrpp-${id}`} className="text-[12px] font-semibold text-muted">
          Tope invitados
        </label>
        <input
          id={`tope-rrpp-${id}`}
          name="tope"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={tope ?? ""}
          placeholder="Sin tope"
          className={`${campo} tabular-nums`}
        />
      </div>
      <button type="submit" disabled={pending} className={boton.secundario}>
        {pending ? "…" : "Guardar"}
      </button>
      <span aria-live="polite" className="pb-2.5 text-xs font-medium">
        {msg && <span className={msg.ok ? "text-ok" : "text-danger"}>{msg.texto}</span>}
      </span>
    </form>
  );
}
