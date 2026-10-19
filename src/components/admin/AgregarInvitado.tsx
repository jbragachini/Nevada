"use client";

import { useRef, useState, useTransition } from "react";
import { agregarInvitadoAdmin } from "@/app/actions/admin";
import { boton, campo } from "@/components/admin/ui";

export function AgregarInvitado({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pending) return;
    const datos = Object.fromEntries(new FormData(ev.currentTarget));
    setMsg(null);
    startTransition(async () => {
      const r = await agregarInvitadoAdmin(eventId, datos);
      if (r.ok) {
        setErrores({});
        setMsg({ ok: true, texto: r.mensaje ?? "Agregado." });
        ref.current?.reset();
        ref.current?.querySelector<HTMLInputElement>("[name=nombre]")?.focus();
      } else {
        setErrores(r.fieldErrors ?? {});
        setMsg({ ok: false, texto: r.error });
      }
    });
  }

  const f = (name: string, label: string, extra: React.InputHTMLAttributes<HTMLInputElement>, ancho = "") => (
    <div className={`flex min-w-0 flex-col gap-1 ${ancho}`}>
      <label htmlFor={`inv-${name}`} className="text-[12px] font-semibold text-muted">
        {label}
      </label>
      <input
        id={`inv-${name}`}
        name={name}
        aria-invalid={!!errores[name]}
        aria-describedby={errores[name] ? `inv-${name}-error` : undefined}
        className={campo}
        {...extra}
      />
      {errores[name] && (
        <p id={`inv-${name}-error`} className="text-xs font-medium text-danger">
          {errores[name]}
        </p>
      )}
    </div>
  );

  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1.2fr_1.4fr_110px_auto] sm:items-end">
      {f("nombre", "Nombre y apellido", { autoComplete: "off", required: true })}
      {f("email", "Mail", { type: "email", inputMode: "email", autoComplete: "off", spellCheck: false, required: true })}
      {f("max_entradas", "Entradas", { type: "number", inputMode: "numeric", min: 1, max: 20, defaultValue: 1 })}
      <button type="submit" disabled={pending} className={boton.primario}>
        {pending ? "Guardando…" : "Invitar"}
      </button>
      <p aria-live="polite" className="text-xs font-medium sm:col-span-4">
        {msg && <span className={msg.ok ? "text-ok" : "text-danger"}>{msg.texto}</span>}
      </p>
    </form>
  );
}
