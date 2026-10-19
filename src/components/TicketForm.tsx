"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { crearPedido } from "@/app/actions/pedidos";
import { formatARS } from "@/lib/format";
import { buyerSchema } from "@/lib/pedido-schema";
import type { StorefrontRrpp, StorefrontTicket } from "@/lib/storefront";

type Props = {
  eventId: string;
  tickets: StorefrontTicket[];
  /** RRPP activos para elegir quién le vendió (opcional). */
  rrpps: StorefrontRrpp[];
  /** RRPP preseleccionado desde el link personal (?rrpp=codigo). */
  initialRrppId?: string;
  /** "prueba": registra pedidos sin cobrar (hasta que esté Mercado Pago). null: compra apagada. */
  checkout: "prueba" | null;
  disabledReason?: string;
};

type Buyer = { nombre: string; apellido: string; email: string; whatsapp: string };

// Orden de los campos en pantalla: al fallar el envío, el foco va al primero con error.
const CAMPOS = ["cantidad", "nombre", "apellido", "email", "whatsapp", "rrpp"] as const;

export function TicketForm({ eventId, tickets, rrpps, initialRrppId, checkout, disabledReason }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState<Buyer>({ nombre: "", apellido: "", email: "", whatsapp: "" });
  const [rrppId, setRrppId] = useState<string>(initialRrppId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Una clave por compra: si el pedido se manda dos veces, la base devuelve el mismo.
  const idempotencyKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const purchasable = tickets.filter((t) => t.enVenta && t.disponibles > 0);

  const { totalUnidades, total } = useMemo(() => {
    let u = 0;
    let s = 0;
    for (const t of tickets) {
      const q = qty[t.id] ?? 0;
      u += q;
      s += q * t.precio;
    }
    return { totalUnidades: u, total: s };
  }, [qty, tickets]);

  function clearError(campo: string) {
    setErrors((prev) => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  }

  function change(t: StorefrontTicket, delta: number) {
    setQty((prev) => {
      const max = Math.min(t.maxPorCompra, t.disponibles);
      const next = Math.max(0, Math.min(max, (prev[t.id] ?? 0) + delta));
      return { ...prev, [t.id]: next };
    });
    clearError("cantidad");
  }

  function setField(campo: keyof Buyer, value: string) {
    setBuyer((prev) => ({ ...prev, [campo]: value }));
    clearError(campo);
  }

  function showErrors(e: Record<string, string>) {
    setErrors(e);
    const primero = CAMPOS.find((c) => e[c]);
    if (!primero) return;
    // Espera al render para que el mensaje ya esté conectado al campo cuando recibe el foco.
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`);
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!checkout || pending) return;
    setServerError(null);

    const e: Record<string, string> = {};
    const res = buyerSchema.safeParse(buyer);
    if (!res.success) {
      for (const issue of res.error.issues) e[String(issue.path[0])] ??= issue.message;
    }
    if (totalUnidades === 0) e.cantidad = "Elegí al menos una entrada";
    if (Object.keys(e).length > 0) return showErrors(e);

    idempotencyKey.current ??= crypto.randomUUID();
    const pedido = {
      eventId,
      ...buyer,
      rrppId,
      items: tickets
        .filter((t) => (qty[t.id] ?? 0) > 0)
        .map((t) => ({ ticketTypeId: t.id, cantidad: qty[t.id] })),
      idempotencyKey: idempotencyKey.current,
    };

    startTransition(async () => {
      // Si sale bien, el servidor redirige al link privado del pedido.
      const r = await crearPedido(pedido);
      if (r.fieldErrors) showErrors(r.fieldErrors);
      if (r.error) setServerError(r.error);
    });
  }

  if (purchasable.length === 0) {
    return (
      <div className="rounded-2xl bg-frost px-5 py-6 text-center">
        <p className="display text-xl text-deep">ENTRADAS AGOTADAS</p>
        <p className="mt-2 text-sm text-muted">No quedan entradas disponibles para este evento.</p>
      </div>
    );
  }

  const field =
    "w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15";

  const errorText = (campo: string) =>
    errors[campo] ? (
      <p id={`${campo}-error`} className="mt-1.5 text-xs font-medium text-danger">
        {errors[campo]}
      </p>
    ) : null;

  const inputProps = (campo: keyof Buyer) => ({
    id: campo,
    "data-campo": campo,
    className: field,
    value: buyer[campo],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField(campo, e.target.value),
    "aria-invalid": !!errors[campo],
    "aria-describedby": errors[campo] ? `${campo}-error` : undefined,
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* Tipos de entrada */}
      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={errors.cantidad ? "cantidad-error" : undefined}
      >
        <legend
          tabIndex={-1}
          data-campo="cantidad"
          className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted outline-none"
        >
          Elegí tus entradas
        </legend>
        {tickets.map((t) => {
          const q = qty[t.id] ?? 0;
          const agotada = t.disponibles <= 0;
          const sinVenta = !t.enVenta;
          const max = Math.min(t.maxPorCompra, t.disponibles);
          const pocas = !agotada && t.disponibles <= 20;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-4 rounded-2xl border px-4 py-4 transition-colors ${
                q > 0 ? "border-blue bg-frost" : "border-line bg-white"
              } ${agotada || sinVenta ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{t.nombre}</p>
                {t.descripcion && <p className="text-[13px] text-muted">{t.descripcion}</p>}
                <p className="mt-1 display text-lg text-deep tabular-nums">{formatARS(t.precio)}</p>
                {agotada && <p className="text-xs font-bold uppercase text-danger">Agotada</p>}
                {sinVenta && !agotada && (
                  <p className="text-xs font-bold uppercase text-muted">No disponible</p>
                )}
                {pocas && !sinVenta && (
                  <p className="text-xs font-semibold text-blue">Últimas {t.disponibles}</p>
                )}
              </div>
              {!agotada && !sinVenta && (
                <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${t.nombre}`}>
                  <button
                    type="button"
                    onClick={() => change(t, -1)}
                    disabled={q === 0 || pending}
                    aria-label={`Quitar una ${t.nombre}`}
                    className="grid h-11 w-11 place-items-center rounded-full border border-line text-deep transition-colors hover:bg-frost disabled:opacity-30"
                  >
                    <StepIcon />
                  </button>
                  <output aria-live="polite" className="w-8 text-center text-lg font-bold text-ink tabular-nums">
                    {q}
                  </output>
                  <button
                    type="button"
                    onClick={() => change(t, 1)}
                    disabled={q >= max || pending}
                    aria-label={`Agregar una ${t.nombre}`}
                    className="grid h-11 w-11 place-items-center rounded-full bg-deep text-white transition-colors hover:bg-blue disabled:opacity-30"
                  >
                    <StepIcon plus />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {errorText("cantidad")}
      </fieldset>

      {/* Datos del comprador */}
      <fieldset className="flex flex-col gap-3" disabled={pending}>
        <legend className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted">
          Tus datos
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className="sr-only">Nombre</label>
            <input {...inputProps("nombre")} autoComplete="given-name" placeholder="Nombre" />
            {errorText("nombre")}
          </div>
          <div>
            <label htmlFor="apellido" className="sr-only">Apellido</label>
            <input {...inputProps("apellido")} autoComplete="family-name" placeholder="Apellido" />
            {errorText("apellido")}
          </div>
        </div>
        <div>
          <label htmlFor="email" className="sr-only">Correo electrónico</label>
          <input
            {...inputProps("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="Correo electrónico"
          />
          {errorText("email")}
        </div>
        <div>
          <label htmlFor="whatsapp" className="sr-only">WhatsApp (opcional)</label>
          <input
            {...inputProps("whatsapp")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="WhatsApp (opcional)"
          />
          {errorText("whatsapp")}
        </div>
      </fieldset>

      {/* RRPP (opcional) */}
      {rrpps.length > 0 && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="rrpp"
            className="text-xs font-bold uppercase tracking-[0.18em] text-muted"
          >
            ¿Quién te vendió? <span className="font-medium normal-case tracking-normal">(opcional)</span>
          </label>
          <div className="relative">
            <select
              id="rrpp"
              data-campo="rrpp"
              value={rrppId}
              disabled={pending}
              onChange={(e) => {
                setRrppId(e.target.value);
                clearError("rrpp");
              }}
              aria-invalid={!!errors.rrpp}
              aria-describedby={errors.rrpp ? "rrpp-error" : "rrpp-ayuda"}
              className={`${field} appearance-none pr-10`}
            >
              <option value="">Nadie, compro directo</option>
              {rrpps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          {errors.rrpp ? (
            errorText("rrpp")
          ) : (
            <p id="rrpp-ayuda" className="text-xs text-muted">Si un RRPP te pasó la entrada, elegilo acá.</p>
          )}
        </div>
      )}

      {/* Total + continuar */}
      <div className="flex flex-col gap-3 rounded-2xl bg-night px-5 py-5 text-white">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ice">
            {totalUnidades === 0
              ? "Sin entradas seleccionadas"
              : `${totalUnidades} entrada${totalUnidades > 1 ? "s" : ""}`}
          </span>
          <span className="display text-2xl tabular-nums">{formatARS(total)}</span>
        </div>

        {serverError && (
          <p role="alert" className="rounded-xl bg-[#3b1220] px-4 py-3 text-sm font-medium text-[#ffd5d1]">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={!checkout || pending}
          aria-busy={pending}
          className="flex min-h-13 items-center justify-center gap-3 rounded-xl text-balance bg-ice px-4 py-3.5 text-base font-extrabold uppercase tracking-[0.12em] text-night transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ice disabled:cursor-not-allowed disabled:bg-[#5d7fa3] disabled:text-[#e3eefa] aria-busy:disabled:cursor-progress aria-busy:disabled:bg-ice/80 aria-busy:disabled:text-night"
        >
          {pending && <Spinner />}
          {pending
            ? "Registrando pedido…"
            : checkout === "prueba"
              ? "Registrar pedido de prueba"
              : "Pagar con Mercado Pago"}
        </button>

        {checkout === "prueba" ? (
          <p className="text-center text-xs leading-relaxed text-ice">
            Modo prueba: no se cobra nada. El pedido queda esperando el pago y se libera a los 30 minutos.
          </p>
        ) : (
          disabledReason && <p className="text-center text-xs text-ice">{disabledReason}</p>
        )}
      </div>
    </form>
  );
}

function StepIcon({ plus = false }: { plus?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <path d="M5 12h14" />
      {plus && <path d="M12 5v14" />}
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 animate-spin motion-reduce:animate-none" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
