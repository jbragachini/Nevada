"use client";

import { useState, useTransition } from "react";
import { pagarComision, registrarRendicion, type Respuesta } from "@/app/actions/admin";
import { useAvisar } from "@/components/admin/Avisos";
import { boton, campo } from "@/components/admin/ui";

function useEnvio(accion: (datos: Record<string, string>) => Promise<Respuesta>) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const avisar = useAvisar();
  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pending) return;
    const form = ev.currentTarget;
    const datos = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setMsg(null);
    startTransition(async () => {
      const r = await accion(datos);
      // Al guardar cambia el saldo y el formulario se renueva: la confirmación va como aviso.
      if (r.ok) avisar(r.mensaje ?? "Listo.");
      else setMsg({ ok: false, texto: r.error });
    });
  }
  return { pending, msg, onSubmit };
}

function Resultado({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  return (
    <p aria-live="polite" className="text-xs font-medium">
      {msg && <span className={msg.ok ? "text-ok" : "text-danger"}>{msg.texto}</span>}
    </p>
  );
}

export function PagarComision({ sellerId, pendiente, nombre }: { sellerId: string; pendiente: number; nombre: string }) {
  const { pending, msg, onSubmit } = useEnvio((d) => pagarComision(sellerId, d));
  if (pendiente <= 0) return null;
  return (
    <form onSubmit={onSubmit} aria-label={`Pagar comisión a ${nombre}`} className="flex flex-wrap items-end gap-2">
      <div className="flex w-32 flex-col gap-1">
        <label htmlFor={`pago-${sellerId}`} className="text-[12px] font-semibold text-muted">
          Monto $
        </label>
        <input
          id={`pago-${sellerId}`}
          name="monto"
          type="number"
          inputMode="numeric"
          min={1}
          max={pendiente}
          defaultValue={pendiente}
          className={`${campo} tabular-nums`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`medio-${sellerId}`} className="text-[12px] font-semibold text-muted">
          Medio
        </label>
        <select id={`medio-${sellerId}`} name="medio" className={campo}>
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
        </select>
      </div>
      <input type="hidden" name="nota" value="" />
      <button type="submit" disabled={pending} className={boton.primario}>
        {pending ? "Guardando…" : "Pagar"}
      </button>
      <Resultado msg={msg} />
    </form>
  );
}

export function RegistrarRendicion({
  sellerId,
  debeEfectivo,
  debeTransferencia,
  nombre,
}: {
  sellerId: string;
  debeEfectivo: number;
  debeTransferencia: number;
  nombre: string;
}) {
  const { pending, msg, onSubmit } = useEnvio((d) => registrarRendicion(sellerId, d));
  if (debeEfectivo <= 0 && debeTransferencia <= 0) return null;
  return (
    <form onSubmit={onSubmit} aria-label={`Registrar lo que rindió ${nombre}`} className="flex flex-wrap items-end gap-2">
      <div className="flex w-32 flex-col gap-1">
        <label htmlFor={`ef-${sellerId}`} className="text-[12px] font-semibold text-muted">
          Efectivo $
        </label>
        <input
          id={`ef-${sellerId}`}
          name="efectivo"
          type="number"
          inputMode="numeric"
          min={0}
          max={debeEfectivo}
          defaultValue={debeEfectivo}
          className={`${campo} tabular-nums`}
        />
      </div>
      <div className="flex w-32 flex-col gap-1">
        <label htmlFor={`tr-${sellerId}`} className="text-[12px] font-semibold text-muted">
          Transferencias $
        </label>
        <input
          id={`tr-${sellerId}`}
          name="transferencia"
          type="number"
          inputMode="numeric"
          min={0}
          max={debeTransferencia}
          defaultValue={debeTransferencia}
          className={`${campo} tabular-nums`}
        />
      </div>
      <input type="hidden" name="nota" value="" />
      <button type="submit" disabled={pending} className={boton.primario}>
        {pending ? "Guardando…" : "Recibí"}
      </button>
      <Resultado msg={msg} />
    </form>
  );
}
