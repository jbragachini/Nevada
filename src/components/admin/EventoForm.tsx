"use client";

import { useState, useTransition } from "react";
import { crearEvento, editarEvento } from "@/app/actions/admin";
import { boton, campo, etiqueta } from "@/components/admin/ui";

type Valores = {
  nombre: string;
  subtitulo: string;
  fecha_inicio: string;
  lugar: string;
  direccion: string;
  ciudad: string;
  descripcion: string;
  acceso: "publico" | "lista" | "clave";
  clave_acceso: string;
  mostrar_rrpp: boolean;
  portada: "a" | "c";
};

const ACCESOS: { id: Valores["acceso"]; titulo: string; ayuda: string }[] = [
  { id: "publico", titulo: "Público", ayuda: "Compra cualquiera." },
  {
    id: "lista",
    titulo: "Lista de invitados",
    ayuda: "Solo compra quien está en la lista (por mail), hasta su máximo de entradas. La arman Nevada y los RRPP.",
  },
  { id: "clave", titulo: "Palabra clave", ayuda: "Solo compra quien sabe la palabra. No importan mayúsculas ni acentos." },
];

const PORTADAS: { id: Valores["portada"]; titulo: string; foto: string }[] = [
  { id: "a", titulo: "A · Camino a la montaña", foto: "/portadas/a-escritorio.jpg" },
  { id: "c", titulo: "C · Contraluz azul", foto: "/portadas/c-escritorio.jpg" },
];

/** Datos del evento. Sin id crea uno nuevo (borrador); con id edita, incluido el acceso. */
export function EventoForm({ id, inicial }: { id?: string; inicial: Valores }) {
  const [v, setV] = useState<Valores>(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof Valores>(k: K, valor: Valores[K]) {
    setV((p) => ({ ...p, [k]: valor }));
    setErrores((e) => ({ ...e, [k]: "" }));
    setMsg(null);
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    setMsg(null);
    startTransition(async () => {
      const r = id ? await editarEvento(id, v) : await crearEvento(v);
      if (r.ok) {
        setErrores({});
        setMsg({ ok: true, texto: r.mensaje ?? "Guardado." });
      } else {
        setErrores(r.fieldErrors ?? {});
        setMsg({ ok: false, texto: r.error });
        const primero = Object.keys(r.fieldErrors ?? {})[0];
        if (primero) document.getElementById(`ev-${primero}`)?.focus();
      }
    });
  }

  const input = (k: keyof Valores, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`ev-${k}`} className={etiqueta}>
        {label}
      </label>
      <input
        id={`ev-${k}`}
        value={String(v[k])}
        onChange={(e) => set(k, e.target.value as never)}
        aria-invalid={!!errores[k]}
        aria-describedby={errores[k] ? `ev-${k}-error` : undefined}
        className={campo}
        {...extra}
      />
      {errores[k] && (
        <p id={`ev-${k}-error`} className="text-xs font-medium text-danger">
          {errores[k]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("nombre", "Nombre del evento", { required: true, maxLength: 120 })}
        {input("subtitulo", "DJ o subtítulo (opcional)", { maxLength: 120 })}
        {input("fecha_inicio", "Fecha y hora", { type: "datetime-local", required: true })}
        {input("lugar", "Lugar", { required: true, maxLength: 120 })}
        {input("direccion", "Dirección (opcional)", { maxLength: 200 })}
        {input("ciudad", "Ciudad", { required: true, maxLength: 120 })}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ev-descripcion" className={etiqueta}>
          Descripción (opcional)
        </label>
        <textarea
          id="ev-descripcion"
          rows={3}
          maxLength={2000}
          value={v.descripcion}
          onChange={(e) => set("descripcion", e.target.value)}
          className={campo}
        />
      </div>

      {id && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className={`${etiqueta} mb-1`}>¿Quién puede comprar?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {ACCESOS.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue ${
                    v.acceso === a.id ? "border-blue bg-frost" : "border-line hover:border-blue/50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="acceso"
                      value={a.id}
                      checked={v.acceso === a.id}
                      onChange={() => set("acceso", a.id)}
                      className="h-4 w-4 accent-[var(--deep)]"
                    />
                    {a.titulo}
                  </span>
                  <span className="text-xs leading-relaxed text-muted">{a.ayuda}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {v.acceso === "clave" && (
            <div className="sm:max-w-sm">
              {input("clave_acceso", "Palabra clave", { required: true, maxLength: 40, autoComplete: "off" })}
            </div>
          )}
          <label className="flex items-start gap-3 rounded-2xl border border-line p-3.5">
            <input
              type="checkbox"
              checked={v.mostrar_rrpp}
              onChange={(e) => set("mostrar_rrpp", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--deep)]"
            />
            <span>
              <span className="text-sm font-bold">Mostrar «¿Quién te vendió?»</span>
              <span className="block text-xs text-muted">
                Si lo ocultás, el link personal de cada RRPP le sigue asignando la venta.
              </span>
            </span>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className={`${etiqueta} mb-1`}>Portada de la página</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PORTADAS.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue ${
                    v.portada === p.id ? "border-blue bg-frost" : "border-line hover:border-blue/50"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="aspect-[16/10] w-full rounded-xl bg-night bg-cover bg-center"
                    style={{ backgroundImage: `url(${p.foto})` }}
                  />
                  <span className="flex items-center gap-2 px-1 text-sm font-bold">
                    <input
                      type="radio"
                      name="portada"
                      value={p.id}
                      checked={v.portada === p.id}
                      onChange={() => set("portada", p.id)}
                      className="h-4 w-4 accent-[var(--deep)]"
                    />
                    {p.titulo}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">
              Para ver cómo queda cada una sin cambiarla: <span className="font-mono">/?portada=a</span> o{" "}
              <span className="font-mono">/?portada=c</span>.
            </p>
          </fieldset>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className={boton.primario}>
          {pending ? "Guardando…" : id ? "Guardar cambios" : "Crear evento"}
        </button>
        <span aria-live="polite" className="text-sm font-medium">
          {msg && <span className={msg.ok ? "text-ok" : "text-danger"}>{msg.texto}</span>}
        </span>
      </div>
    </form>
  );
}
