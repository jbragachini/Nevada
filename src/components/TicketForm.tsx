"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { formatARS } from "@/lib/format";
import type { StorefrontTicket } from "@/lib/storefront";

type Props = {
  tickets: StorefrontTicket[];
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

type PaymentMethod = "mercadopago" | "transferencia";

export function TicketForm({ tickets, checkoutEnabled, disabledReason }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ nombre: "", apellido: "", email: "", whatsapp: "" });
  const [method, setMethod] = useState<PaymentMethod>("mercadopago");
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
    // y el cobro en la etapa 5 (Mercado Pago / transferencia). No se simula nada acá.
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

      {/* Medio de pago */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted">
          Medio de pago
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { id: "mercadopago", label: "Mercado Pago", hint: "Tarjeta, débito o dinero en cuenta" },
              { id: "transferencia", label: "Transferencia", hint: "Subís el comprobante" },
            ] as const
          ).map((m) => (
            <label
              key={m.id}
              className={`cursor-pointer rounded-2xl border px-4 py-3 transition ${
                method === m.id ? "border-blue bg-frost ring-2 ring-ice/50" : "border-line bg-white"
              }`}
            >
              <input
                type="radio"
                name="metodo"
                value={m.id}
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
                className="sr-only"
              />
              <span className="block font-bold text-ink">{m.label}</span>
              <span className="block text-xs text-muted">{m.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

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
          {method === "mercadopago" ? "Continuar al pago" : "Ver datos para transferir"}
        </button>
        {!checkoutEnabled && disabledReason && (
          <p className="text-center text-xs text-ice">{disabledReason}</p>
        )}
      </div>
    </form>
  );
}
