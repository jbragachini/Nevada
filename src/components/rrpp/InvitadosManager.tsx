"use client";

import { useRef, useState, useTransition } from "react";
import { agregarInvitado, borrarInvitado, cambiarInvitado } from "@/app/actions/rrpp";
import type { Invitados } from "@/lib/rrpp";

const campo =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger";

export function InvitadosManager({
  evento,
  lista,
  lleno,
}: {
  evento: { id: string; nombre: string; fecha: string };
  lista: Invitados["lista"];
  lleno: boolean;
}) {
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function agregar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pending) return;
    const f = new FormData(ev.currentTarget);
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await agregarInvitado({
        eventId: evento.id,
        nombre: f.get("nombre"),
        email: f.get("email"),
        maxEntradas: f.get("maxEntradas"),
      });
      if (r.ok) {
        setErrores({});
        setAviso(`Agregaste a ${String(f.get("nombre")).trim()}.`);
        formRef.current?.reset();
        formRef.current?.querySelector<HTMLInputElement>("[name=nombre]")?.focus();
        return;
      }
      setErrores(r.fieldErrors ?? {});
      setError(r.error ?? null);
      const primero = Object.keys(r.fieldErrors ?? {})[0];
      if (primero) formRef.current?.querySelector<HTMLElement>(`[name="${primero}"]`)?.focus();
    });
  }

  function accion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No pudimos guardar.");
    });
  }

  const err = (k: string) =>
    errores[k] ? (
      <p id={`${k}-error`} className="mt-1 text-xs font-medium text-danger">
        {errores[k]}
      </p>
    ) : null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section aria-labelledby="nuevo" className="rounded-[20px] bg-white p-5 text-ink">
        <h2 id="nuevo" className="display text-[19px] text-deep">
          Invitar a alguien
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          {evento.nombre} · {evento.fecha}. Solo compra quien está en la lista, con el mail que cargues acá.
        </p>
        {lleno ? (
          <p className="mt-4 rounded-xl bg-[#fdf1e4] px-4 py-3 text-sm font-medium text-warn">
            Llegaste a tu tope de invitados para este evento. Para sumar más, hablá con Nevada o da de baja a
            alguien.
          </p>
        ) : (
          <form ref={formRef} onSubmit={agregar} noValidate className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="nombre" className="text-[13px] font-semibold">
                Nombre y apellido
              </label>
              <input
                id="nombre"
                name="nombre"
                autoComplete="off"
                required
                aria-invalid={!!errores.nombre}
                aria-describedby={errores.nombre ? "nombre-error" : undefined}
                className={`${campo} mt-1.5`}
              />
              {err("nombre")}
            </div>
            <div>
              <label htmlFor="email" className="text-[13px] font-semibold">
                Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                required
                aria-invalid={!!errores.email}
                aria-describedby={errores.email ? "email-error" : undefined}
                className={`${campo} mt-1.5`}
              />
              {err("email")}
            </div>
            <div>
              <label htmlFor="maxEntradas" className="text-[13px] font-semibold">
                Entradas que puede comprar
              </label>
              <input
                id="maxEntradas"
                name="maxEntradas"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                defaultValue={1}
                required
                aria-invalid={!!errores.maxEntradas}
                aria-describedby={errores.maxEntradas ? "maxEntradas-error" : "maxEntradas-ayuda"}
                className={`${campo} mt-1.5 w-28 tabular-nums`}
              />
              {errores.maxEntradas ? (
                err("maxEntradas")
              ) : (
                <p id="maxEntradas-ayuda" className="mt-1 text-xs text-muted">
                  Por ejemplo 2, si viene con acompañante.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="mt-1 min-h-12 rounded-xl bg-deep px-4 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue disabled:opacity-80"
            >
              {pending ? "Guardando…" : "Agregar a la lista"}
            </button>
          </form>
        )}
        <div aria-live="polite" className="mt-3 text-sm">
          {aviso && <p className="font-medium text-ok">{aviso}</p>}
          {error && (
            <p role="alert" className="font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="lista" className="rounded-[20px] bg-white p-5 text-ink">
        <h2 id="lista" className="display text-[19px] text-deep">
          Mi lista
        </h2>
        {lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Todavía no invitaste a nadie.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {lista.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className={`min-w-[180px] flex-1 ${g.activo ? "" : "opacity-60"}`}>
                  <p className="font-bold">{g.nombre}</p>
                  <p className="text-[12.5px] text-muted [overflow-wrap:anywhere]">
                    {g.email} · hasta {g.maxEntradas} entrada{g.maxEntradas === 1 ? "" : "s"}
                    {g.activo ? "" : " · dado de baja"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => accion(() => cambiarInvitado({ id: g.id, activo: !g.activo }))}
                    className="min-h-10 rounded-xl border border-line px-3 text-[13px] font-semibold text-muted hover:text-deep focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60"
                  >
                    {g.activo ? "Dar de baja" : "Reactivar"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`¿Borrar a ${g.nombre} de la lista?`)) accion(() => borrarInvitado(g.id));
                    }}
                    className="min-h-10 rounded-xl px-3 text-[13px] font-semibold text-danger hover:bg-[#fdecea] focus-visible:outline-2 focus-visible:outline-danger disabled:opacity-60"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
