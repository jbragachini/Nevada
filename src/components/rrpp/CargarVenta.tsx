"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { cargarVenta } from "@/app/actions/rrpp";
import { formatARS } from "@/lib/format";
import type { EventoCarga } from "@/lib/rrpp";

type Metodo = "efectivo_rrpp" | "transferencia_rrpp" | "transferencia_nevada";
type Persona = { ticketTypeId: string; nombre: string; email: string };

const METODOS: { id: Metodo; label: string; ayuda: string }[] = [
  { id: "efectivo_rrpp", label: "Efectivo", ayuda: "Las entradas con QR se generan al instante y rendís el total." },
  {
    id: "transferencia_rrpp",
    label: "Transferencia a mí",
    ayuda: "Queda pendiente hasta que Nevada la confirme con vos por WhatsApp, y rendís el total.",
  },
  {
    id: "transferencia_nevada",
    label: "Transferencia a Nevada",
    ayuda: "Queda pendiente hasta que el admin vea el pago. No rendís nada.",
  },
];

const campo =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger";

export function CargarVenta({ eventos }: { eventos: EventoCarga[] }) {
  const [eventId, setEventId] = useState(eventos[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [metodo, setMetodo] = useState<Metodo>("efectivo_rrpp");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ numero: string; status: string; total: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const clave = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const evento = eventos.find((e) => e.id === eventId);
  const tipos = useMemo(() => evento?.tipos ?? [], [evento]);
  const nombreTipo = (id: string) => tipos.find((t) => t.id === id)?.nombre ?? "";

  const { total, comision } = useMemo(() => {
    let t = 0;
    let c = 0;
    for (const tipo of tipos) {
      t += (qty[tipo.id] ?? 0) * tipo.precio;
      c += (qty[tipo.id] ?? 0) * tipo.comision;
    }
    return { total: t, comision: c };
  }, [qty, tipos]);

  if (eventos.length === 0) {
    return <p className="mt-3 py-4 text-center text-sm text-muted">No hay eventos con ventas abiertas.</p>;
  }

  // Una persona por entrada, en el orden de los tipos; conserva lo que ya se escribió.
  function sincronizar(nuevoQty: Record<string, number>, actuales: Persona[]) {
    const out: Persona[] = [];
    for (const t of tipos) {
      const previas = actuales.filter((p) => p.ticketTypeId === t.id);
      for (let i = 0; i < (nuevoQty[t.id] ?? 0); i++) {
        out.push(previas[i] ?? { ticketTypeId: t.id, nombre: "", email: "" });
      }
    }
    return out;
  }

  function nueva() {
    clave.current = null;
    setHecho(null);
  }

  function cambiar(id: string, delta: number, max: number) {
    nueva();
    const next = { ...qty, [id]: Math.max(0, Math.min(max, (qty[id] ?? 0) + delta)) };
    setQty(next);
    setPersonas((p) => sincronizar(next, p));
    setErrores((e) => ({ ...e, cantidad: "" }));
  }

  function editar(i: number, k: "nombre" | "email", valor: string) {
    nueva();
    setPersonas((p) => p.map((x, j) => (j === i ? { ...x, [k]: valor } : x)));
    setErrores((e) => ({ ...e, [`persona-${i}-${k}`]: "" }));
  }

  function mostrar(e: Record<string, string>) {
    setErrores(e);
    const primero = Object.keys(e).find((k) => e[k]);
    if (primero) {
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`);
        el?.focus();
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    setError(null);
    const e: Record<string, string> = {};
    if (personas.length === 0) e.cantidad = "Elegí al menos una entrada";
    personas.forEach((p, i) => {
      if (!/^\S{2,}(\s+\S+)*\s+\S{2,}$/.test(p.nombre.trim())) e[`persona-${i}-nombre`] = "Nombre y apellido";
      const mail = p.email.trim();
      if (i === 0 && !mail) e["persona-0-email"] = "El mail de la persona 1 es obligatorio";
      else if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) e[`persona-${i}-email`] = "Revisá el mail";
    });
    if (Object.keys(e).length) return mostrar(e);

    clave.current ??= crypto.randomUUID();
    const datos = { eventId, personas, metodo, whatsapp: "", idempotencyKey: clave.current };
    startTransition(async () => {
      const r = await cargarVenta(datos);
      if (r.ok) {
        setHecho({ numero: r.numero, status: r.status, total: r.total });
        setQty({});
        setPersonas([]);
        clave.current = null;
        return;
      }
      if (r.fieldErrors) mostrar(r.fieldErrors);
      if (r.error) setError(r.error);
    });
  }

  const ayudaMetodo = METODOS.find((m) => m.id === metodo)!.ayuda;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-5">
      {hecho && (
        <div role="status" className="rounded-2xl bg-[#e5f4ea] px-4 py-3 text-sm text-ink">
          <p className="font-bold text-ok">
            {hecho.status === "aprobado" ? "Entradas generadas" : "Venta enviada para aprobar"} · {hecho.numero}
          </p>
          <p className="mt-0.5 text-[13px]">
            {hecho.status === "aprobado"
              ? `Ya podés ver los QR en «Mis ventas». Cobraste ${formatARS(hecho.total)} y los rendís a Nevada.`
              : "Cuando Nevada la apruebe se generan los QR."}
          </p>
        </div>
      )}

      {eventos.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="evento" className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            Evento
          </label>
          <select
            id="evento"
            value={eventId}
            onChange={(e) => {
              nueva();
              setEventId(e.target.value);
              setQty({});
              setPersonas([]);
            }}
            className={campo}
          >
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2.5">
        <legend
          tabIndex={-1}
          data-campo="cantidad"
          className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted outline-none"
        >
          Entradas{eventos.length === 1 ? ` · ${evento?.nombre}` : ""}
        </legend>
        {tipos.map((t) => {
          const q = qty[t.id] ?? 0;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                q > 0 ? "border-blue bg-frost" : "border-line"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t.nombre}</p>
                <p className="text-[13px] text-muted tabular-nums">
                  {formatARS(t.precio)} · tu comisión {formatARS(t.comision)}
                </p>
              </div>
              <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${t.nombre}`}>
                <button
                  type="button"
                  onClick={() => cambiar(t.id, -1, t.maxPorCompra)}
                  disabled={q === 0 || pending}
                  aria-label={`Quitar una ${t.nombre}`}
                  className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-deep transition-colors hover:bg-frost disabled:opacity-30"
                >
                  <Icono />
                </button>
                <output aria-live="polite" className="w-7 text-center text-lg font-bold tabular-nums">
                  {q}
                </output>
                <button
                  type="button"
                  onClick={() => cambiar(t.id, 1, t.maxPorCompra)}
                  disabled={q >= t.maxPorCompra || personas.length >= 20 || pending}
                  aria-label={`Agregar una ${t.nombre}`}
                  className="grid h-11 w-11 place-items-center rounded-full bg-deep text-white transition-colors hover:bg-blue disabled:opacity-30"
                >
                  <Icono mas />
                </button>
              </div>
            </div>
          );
        })}
        {errores.cantidad && <p className="text-xs font-medium text-danger">{errores.cantidad}</p>}
      </fieldset>

      {personas.length > 0 && (
        <fieldset className="flex flex-col gap-3" disabled={pending}>
          <legend className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            Una persona por entrada
          </legend>
          <p className="-mt-1 text-xs text-muted">
            Cada persona recibe su propia entrada con QR a su nombre. Si dejás un mail vacío, le llega a la
            persona 1.
          </p>
          {personas.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">Persona {i + 1}</span>
                <span className="rounded-full bg-frost px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-blue">
                  {nombreTipo(p.ticketTypeId).replace(/^Entrada /, "")}
                </span>
              </div>
              <PersonaInput
                id={`persona-${i}-nombre`}
                label={`Nombre y apellido de la persona ${i + 1}`}
                placeholder="Nombre y apellido"
                autoComplete="off"
                value={p.nombre}
                onChange={(v) => editar(i, "nombre", v)}
                error={errores[`persona-${i}-nombre`]}
              />
              <PersonaInput
                id={`persona-${i}-email`}
                label={`Mail de la persona ${i + 1}`}
                placeholder={i === 0 ? "Mail (obligatorio)" : "Mail (opcional)"}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={p.email}
                onChange={(v) => editar(i, "email", v)}
                error={errores[`persona-${i}-email`]}
              />
            </div>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">¿Cómo te pagó?</legend>
        <div className="grid grid-cols-2 gap-2">
          {METODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metodo === m.id}
              onClick={() => {
                nueva();
                setMetodo(m.id);
              }}
              className={`min-h-11 rounded-xl px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
                m.id === "transferencia_nevada" ? "col-span-2" : ""
              } ${metodo === m.id ? "bg-deep text-white" : "border border-line text-muted hover:text-deep"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{ayudaMetodo}</p>
      </fieldset>

      <div className="flex flex-col gap-1 rounded-xl bg-frost px-4 py-3">
        <div className="flex items-baseline justify-between gap-3 font-bold">
          <span>{metodo === "transferencia_nevada" ? "Le pagan directo a Nevada" : "Cobrás y rendís a Nevada"}</span>
          <span className="tabular-nums">{formatARS(total)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[13px] text-blue">
          <span>Tu comisión (te la paga Nevada después)</span>
          <span className="font-bold tabular-nums">{formatARS(comision)}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-[#fdecea] px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-12 items-center justify-center rounded-xl bg-deep px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue disabled:cursor-progress disabled:opacity-80"
      >
        {pending ? "Guardando…" : metodo === "efectivo_rrpp" ? "Generar entradas" : "Enviar para aprobar"}
      </button>
    </form>
  );
}

function PersonaInput({
  id,
  label,
  error,
  onChange,
  ...rest
}: {
  id: string;
  label: string;
  error?: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        data-campo={id}
        className={campo}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Icono({ mas = false }: { mas?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M5 12h14" />
      {mas && <path d="M12 5v14" />}
    </svg>
  );
}
