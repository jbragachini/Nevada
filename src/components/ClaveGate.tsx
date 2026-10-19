"use client";

import { useRef, useState, useTransition } from "react";
import { verificarClave } from "@/app/actions/pedidos";
import { TicketForm } from "@/components/TicketForm";

type FormProps = Omit<React.ComponentProps<typeof TicketForm>, "clave" | "invitado">;

/**
 * Evento con palabra clave: primero la palabra. Si es correcta, muestra el formulario de compra
 * y la manda con el pedido para que la base la vuelva a controlar.
 */
export function ClaveGate(props: FormProps) {
  const [clave, setClave] = useState("");
  const [aceptada, setAceptada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    if (!clave.trim()) {
      setError("Ingresá la palabra clave");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await verificarClave({ eventId: props.eventId, clave });
      if (r.ok) {
        setAceptada(clave);
      } else {
        setError(r.error);
        inputRef.current?.focus();
      }
    });
  }

  if (aceptada !== null) {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-frost px-4 py-3 text-sm font-semibold text-deep">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5 5 9-10" />
          </svg>
          Palabra clave correcta. Ya podés comprar.
        </p>
        <TicketForm {...props} clave={aceptada} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="text-center">
        <p className="display text-xl text-deep">EVENTO CON INVITACIÓN</p>
        <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed text-muted text-pretty">
          Para comprar necesitás la palabra clave del evento. Te la pasa quien te invitó.
        </p>
      </div>
      <div>
        <label htmlFor="clave" className="sr-only">
          Palabra clave
        </label>
        <input
          ref={inputRef}
          id="clave"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Palabra clave"
          value={clave}
          onChange={(e) => {
            setClave(e.target.value);
            setError(null);
          }}
          disabled={pending}
          aria-invalid={!!error}
          aria-describedby={error ? "clave-error" : undefined}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-center text-[15px] tracking-[0.04em] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger"
        />
        {error && (
          <p id="clave-error" role="alert" className="mt-1.5 text-center text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-12 items-center justify-center rounded-xl bg-deep px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue disabled:cursor-progress disabled:opacity-80"
      >
        {pending ? "Verificando…" : "Entrar"}
      </button>
    </form>
  );
}
