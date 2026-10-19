"use client";

import { useState, useTransition } from "react";
import { borrarTipo, guardarTipo } from "@/app/actions/admin";
import { boton, campo } from "@/components/admin/ui";
import type { Tipo } from "@/lib/admin";

type Fila = {
  nombre: string;
  descripcion: string;
  precio: string;
  cupo_total: string;
  comision_rrpp: string;
  max_por_compra: string;
  en_venta: boolean;
};

const vacia: Fila = {
  nombre: "",
  descripcion: "",
  precio: "",
  cupo_total: "",
  comision_rrpp: "0",
  max_por_compra: "10",
  en_venta: true,
};

function aFila(t: Tipo): Fila {
  return {
    nombre: t.nombre,
    descripcion: t.descripcion ?? "",
    precio: String(t.precio),
    cupo_total: String(t.cupoTotal),
    comision_rrpp: String(t.comision),
    max_por_compra: String(t.maxPorCompra),
    en_venta: t.enVenta,
  };
}

/** Tipos de entrada libres: agregar, renombrar, precio, cupo, comisión y a la venta sí/no. */
export function TiposEditor({ eventId, tipos }: { eventId: string; tipos: Tipo[] }) {
  return (
    <div className="flex flex-col gap-3">
      {tipos.map((t) => (
        <TipoFila key={t.id} eventId={eventId} id={t.id} inicial={aFila(t)} />
      ))}
      <TipoFila eventId={eventId} id={null} inicial={vacia} />
    </div>
  );
}

function TipoFila({ eventId, id, inicial }: { eventId: string; id: string | null; inicial: Fila }) {
  const [f, setF] = useState<Fila>(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const nuevo = id === null;
  const pref = id ?? "nuevo";

  function set<K extends keyof Fila>(k: K, v: Fila[K]) {
    setF((p) => ({ ...p, [k]: v }));
    setErrores((e) => ({ ...e, [k]: "" }));
    setMsg(null);
  }

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const r = await guardarTipo(id, eventId, f);
      if (r.ok) {
        setErrores({});
        setMsg({ ok: true, texto: r.mensaje ?? "Guardado." });
        if (nuevo) setF(vacia);
      } else {
        setErrores(r.fieldErrors ?? {});
        setMsg({ ok: false, texto: r.error });
      }
    });
  }

  function borrar() {
    if (!id || !window.confirm(`¿Borrar «${f.nombre}»? Si tiene ventas, queda «no a la venta».`)) return;
    startTransition(async () => {
      const r = await borrarTipo(id);
      setMsg(r.ok ? { ok: true, texto: r.mensaje ?? "" } : { ok: false, texto: r.error });
    });
  }

  const num = (k: "precio" | "cupo_total" | "comision_rrpp" | "max_por_compra", label: string, ayuda?: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`${pref}-${k}`} className="text-[12px] font-semibold text-muted">
        {label}
      </label>
      <input
        id={`${pref}-${k}`}
        type="number"
        inputMode="numeric"
        min={k === "max_por_compra" ? 1 : 0}
        value={f[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={!!errores[k]}
        aria-describedby={errores[k] ? `${pref}-${k}-error` : undefined}
        className={`${campo} tabular-nums`}
        title={ayuda}
      />
      {errores[k] && (
        <p id={`${pref}-${k}-error`} className="text-xs font-medium text-danger">
          {errores[k]}
        </p>
      )}
    </div>
  );

  return (
    <form
      onSubmit={guardar}
      noValidate
      aria-label={nuevo ? "Agregar un tipo de entrada" : `Tipo ${inicial.nombre}`}
      className={`rounded-2xl border p-4 ${nuevo ? "border-dashed border-blue/40 bg-frost/50" : "border-line"} ${
        !nuevo && !f.en_venta ? "opacity-75" : ""
      }`}
    >
      {nuevo && <p className="mb-3 text-sm font-bold text-deep">Agregar un tipo de entrada</p>}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${pref}-nombre`} className="text-[12px] font-semibold text-muted">
            Nombre
          </label>
          <input
            id={`${pref}-nombre`}
            value={f.nombre}
            maxLength={60}
            placeholder={nuevo ? "VIP, Preventa…" : undefined}
            onChange={(e) => set("nombre", e.target.value)}
            aria-invalid={!!errores.nombre}
            className={campo}
          />
          {errores.nombre && <p className="text-xs font-medium text-danger">{errores.nombre}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${pref}-descripcion`} className="text-[12px] font-semibold text-muted">
            Descripción (opcional)
          </label>
          <input
            id={`${pref}-descripcion`}
            value={f.descripcion}
            maxLength={200}
            onChange={(e) => set("descripcion", e.target.value)}
            className={campo}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {num("precio", "Precio $")}
        {num("cupo_total", "Cupo")}
        {num("comision_rrpp", "Comisión RRPP $", "Pesos por entrada para el RRPP")}
        {num("max_por_compra", "Máx. por compra")}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={f.en_venta}
            onChange={(e) => set("en_venta", e.target.checked)}
            className="h-4 w-4 accent-[var(--deep)]"
          />
          A la venta
        </label>
        <span className="flex-1" />
        <span aria-live="polite" className="text-xs font-medium">
          {msg && <span className={msg.ok ? "text-ok" : "text-danger"}>{msg.texto}</span>}
        </span>
        {!nuevo && (
          <button type="button" onClick={borrar} disabled={pending} className={boton.peligro}>
            Borrar
          </button>
        )}
        <button type="submit" disabled={pending} aria-busy={pending} className={boton.primario}>
          {pending ? "Guardando…" : nuevo ? "Agregar" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
