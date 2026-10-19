"use client";

import { useRef, useState, useTransition } from "react";
import { verificarClave } from "@/app/actions/pedidos";
import { useClaveCompartida } from "@/components/ClaveCompartida";
import { FlechaGl } from "@/components/FlechaGl";

/** Baja hasta la compra y le pasa el foco, para que el teclado y el lector de pantalla sigan ahí. */
function irAComprar() {
  const destino = document.getElementById("comprar");
  if (!destino) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  destino.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
  destino.focus({ preventScroll: true });
}

/**
 * Botón «Comprar» de la portada. En un evento con palabra clave abre la ventana para escribirla
 * (la verifica la base) y, si es correcta, baja directo a las entradas; en los demás baja directo.
 */
export function BotonComprar({
  eventId,
  pideClave,
  texto,
}: {
  eventId: string;
  pideClave: boolean;
  texto: string;
}) {
  const compartida = useClaveCompartida();
  const dialogo = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function abrir() {
    if (!pideClave || compartida?.clave) return irAComprar();
    setError(null);
    dialogo.current?.showModal();
  }

  function cerrar() {
    dialogo.current?.close();
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    if (!clave.trim()) {
      setError("Escribí la palabra clave para seguir.");
      campo.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await verificarClave({ eventId, clave });
      if (r.ok) {
        compartida?.aceptar(clave);
        cerrar();
        irAComprar();
      } else {
        setError(r.error);
        campo.current?.focus();
      }
    });
  }

  return (
    <>
      <button type="button" className="gl pv-comprar" onClick={abrir}>
        <span>{texto}</span>
        <FlechaGl />
      </button>

      {pideClave && (
        <dialog
          ref={dialogo}
          className="pv-dialogo"
          aria-labelledby="pv-dialogo-titulo"
          onClick={(e) => e.target === dialogo.current && cerrar()}
          onClose={() => setError(null)}
        >
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4 text-left">
            <h2 id="pv-dialogo-titulo" className="pv-dialogo-titulo">
              Palabra clave
            </h2>
            <p className="pv-dialogo-texto">Ingresá la palabra clave para acceder a la compra de entradas.</p>
            <label className="flex flex-col gap-2 text-[13px] font-semibold text-[#e6f2fc]">
              Palabra clave
              <input
                ref={campo}
                className="pv-campo"
                value={clave}
                onChange={(e) => {
                  setClave(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                disabled={pending}
                aria-invalid={!!error}
                aria-describedby={error ? "pv-clave-error" : undefined}
                autoFocus
              />
            </label>
            {error && (
              <p id="pv-clave-error" role="alert" className="m-0 text-sm font-semibold text-[#ffcdc4]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button type="button" className="pv-fantasma" onClick={cerrar}>
                Cancelar
              </button>
              <button type="submit" className="gl gl-sm" disabled={pending} aria-busy={pending}>
                <span>{pending ? "Verificando…" : "Aceptar"}</span>
                <FlechaGl />
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
