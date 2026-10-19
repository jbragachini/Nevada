"use client";

import { useRef, useState, useTransition } from "react";
import { verificarInvitacion } from "@/app/actions/pedidos";
import { TicketForm } from "@/components/TicketForm";

type FormProps = Omit<React.ComponentProps<typeof TicketForm>, "invitado">;

type Invitado = { nombre: string; email: string; restantes: number };

/**
 * Evento con invitación: primero el mail. Si está en la lista, muestra para quién es la invitación
 * y el formulario de compra con el mail fijo y el tope de entradas del invitado.
 */
export function InvitacionGate(props: FormProps) {
  const [invitado, setInvitado] = useState<Invitado | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Revisá el correo electrónico");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await verificarInvitacion({ eventId: props.eventId, email });
      if (r.ok) {
        setInvitado({ nombre: r.nombre, email: r.email, restantes: r.restantes });
      } else {
        setError(r.error);
        inputRef.current?.focus();
      }
    });
  }

  function cambiarMail() {
    setInvitado(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (invitado) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-frost px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Invitación para</p>
            <p className="mt-1 font-bold text-ink">{invitado.nombre}</p>
            <p className="text-[13px] text-muted [overflow-wrap:anywhere]">{invitado.email}</p>
          </div>
          <button
            type="button"
            onClick={cambiarMail}
            className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-blue underline underline-offset-4 hover:text-deep focus-visible:outline-2 focus-visible:outline-blue"
          >
            Cambiar mail
          </button>
        </div>

        {invitado.restantes > 0 ? (
          <TicketForm {...props} invitado={{ email: invitado.email, restantes: invitado.restantes }} />
        ) : (
          <div className="rounded-2xl border border-line px-5 py-6 text-center">
            <p className="display text-lg text-deep">YA USASTE TU INVITACIÓN</p>
            <p className="mt-2 text-sm text-muted">
              Las entradas de esta invitación ya están compradas o esperando el pago. Si necesitás más,
              hablá con quien te invitó.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="text-center">
        <p className="display text-xl text-deep">EVENTO CON INVITACIÓN</p>
        <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed text-muted text-pretty">
          Solo pueden comprar las personas invitadas. Ingresá el mail con el que te invitaron.
        </p>
      </div>
      <div>
        <label htmlFor="invitacion-email" className="sr-only">
          Mail de tu invitación
        </label>
        <input
          ref={inputRef}
          id="invitacion-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          disabled={pending}
          aria-invalid={!!error}
          aria-describedby={error ? "invitacion-error" : undefined}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger"
        />
        {error && (
          <p id="invitacion-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
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
        {pending ? "Buscando tu invitación…" : "Ver mi invitación"}
      </button>
    </form>
  );
}
