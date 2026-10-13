"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { formatARS } from "@/lib/format";
import type { StorefrontRrpp, StorefrontTicket } from "@/lib/storefront";

type Props = {
  tickets: StorefrontTicket[];
  /** RRPP activos para elegir quién le vendió (opcional). */
  rrpps: StorefrontRrpp[];
  /** RRPP preseleccionado desde el link personal (?rrpp=codigo). */
  initialRrppId?: string;
  /** false mientras no exista el registro real de pedidos (etapa 2) o sin base conectada. */
  checkoutEnabled: boolean;
  disabledReason?: string;
};

const buyerSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre").max(60),
  apellido: z.string().trim().min(2, "Ingresá tu apellido").max(60),
  email: z.string().trim().email("Revisá el correo electrónico"),
  whatsapp: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]{8,20}$/, "Revisá el número de WhatsApp")
    .optional()
    .or(z.literal("")),
});

export function TicketForm({
  tickets,
  rrpps,
  initialRrppId,
  checkoutEnabled,
  disabledReason,
}: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ nombre: "", apellido: "", email: "", whatsapp: "" });
  const [rrppId, setRrppId] = useState<string>(initialRrppId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touchedSubmit, setTouchedSubmit] = useState(false);

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

  function change(t: StorefrontTicket, delta: number) {
    setQty((prev) => {
      const max = Math.min(t.maxPorCompra, t.disponibles);
      const next = Math.max(0, Math.min(max, (prev[t.id] ?? 0) + delta));
      return { ...prev, [t.id]: next };
    });
  }

  function validate() {
    const res = buyerSchema.safeParse(buyer);
    const e: Record<string, string> = {};
    if (!res.success) {
      for (const issue of res.error.issues) e[String(issue.path[0])] = issue.message;
    }
    if (totalUnidades === 0) e.cantidad = "Elegí al menos una entrada";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouchedSubmit(true);
    if (!validate()) return;
    // El envío real del pedido se conecta en la etapa 2 (registro de pedidos en la base)
    // y el pago con Mercado Pago en la etapa 5. No se simula nada acá.
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
    "w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#8696ab] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* Tipos de entrada */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted">
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
              className={`flex items-center gap-4 rounded-2xl border px-4 py-4 transition ${
                q > 0 ? "border-blue bg-frost" : "border-line bg-white"
              } ${agotada || sinVenta ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{t.nombre}</p>
                {t.descripcion && <p className="text-[13px] text-muted">{t.descripcion}</p>}
                <p className="mt-1 display text-lg text-deep">{formatARS(t.precio)}</p>
                {agotada && <p className="text-xs font-bold uppercase text-danger">Agotada</p>}
                {sinVenta && !agotada && (
                  <p className="text-xs font-bold uppercase text-muted">No disponible</p>
                )}
                {pocas && !sinVenta && (
                  <p className="text-xs font-semibold text-blue">Últimas {t.disponibles}</p>
                )}
              </div>
              {!agotada && !sinVenta && (
                <div className="flex items-center gap-1" aria-label={`Cantidad de ${t.nombre}`}>
                  <button
                    type="button"
                    onClick={() => change(t, -1)}
                    disabled={q === 0}
                    aria-label={`Quitar una ${t.nombre}`}
                    className="grid h-11 w-11 place-items-center rounded-full border border-line text-xl text-deep transition hover:bg-frost disabled:opacity-30"
                  >
                    −
                  </button>
                  <output aria-live="polite" className="w-8 text-center text-lg font-bold text-ink">
                    {q}
                  </output>
                  <button
                    type="button"
                    onClick={() => change(t, 1)}
                    disabled={q >= max}
                    aria-label={`Agregar una ${t.nombre}`}
                    className="grid h-11 w-11 place-items-center rounded-full bg-deep text-xl text-white transition hover:bg-blue disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {touchedSubmit && errors.cantidad && (
          <p className="text-sm font-medium text-danger">{errors.cantidad}</p>
        )}
      </fieldset>

      {/* Datos del comprador */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted">
          Tus datos
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className="sr-only">Nombre</label>
            <input
              id="nombre"
              autoComplete="given-name"
              placeholder="Nombre"
              className={field}
              value={buyer.nombre}
              onChange={(e) => setBuyer({ ...buyer, nombre: e.target.value })}
              aria-invalid={!!errors.nombre}
            />
            {errors.nombre && <p className="mt-1 text-xs text-danger">{errors.nombre}</p>}
          </div>
          <div>
            <label htmlFor="apellido" className="sr-only">Apellido</label>
            <input
              id="apellido"
              autoComplete="family-name"
              placeholder="Apellido"
              className={field}
              value={buyer.apellido}
              onChange={(e) => setBuyer({ ...buyer, apellido: e.target.value })}
              aria-invalid={!!errors.apellido}
            />
            {errors.apellido && <p className="mt-1 text-xs text-danger">{errors.apellido}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="email" className="sr-only">Correo electrónico</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Correo electrónico"
            className={field}
            value={buyer.email}
            onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="whatsapp" className="sr-only">WhatsApp (opcional)</label>
          <input
            id="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="WhatsApp (opcional)"
            className={field}
            value={buyer.whatsapp}
            onChange={(e) => setBuyer({ ...buyer, whatsapp: e.target.value })}
            aria-invalid={!!errors.whatsapp}
          />
          {errors.whatsapp && <p className="mt-1 text-xs text-danger">{errors.whatsapp}</p>}
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
              value={rrppId}
              onChange={(e) => setRrppId(e.target.value)}
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
          <p className="text-xs text-muted">Si un RRPP te pasó la entrada, elegilo acá.</p>
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
          <span className="display text-2xl">{formatARS(total)}</span>
        </div>
        <button
          type="submit"
          disabled={!checkoutEnabled}
          className="h-13 rounded-xl bg-ice py-3.5 text-base font-extrabold uppercase tracking-[0.12em] text-night transition hover:bg-white disabled:cursor-not-allowed disabled:bg-[#5d7fa3] disabled:text-[#e3eefa]"
        >
          Pagar con Mercado Pago
        </button>
        {!checkoutEnabled && disabledReason && (
          <p className="text-center text-xs text-ice">{disabledReason}</p>
        )}
      </div>
    </form>
  );
}
