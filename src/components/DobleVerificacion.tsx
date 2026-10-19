"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { confirmarAlta, iniciarAlta, verificarCodigo } from "@/app/actions/auth";

const campoCodigo =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] text-ink tabular-nums outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger";
const botonPrincipal =
  "flex min-h-12 items-center justify-center rounded-xl bg-deep px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue disabled:cursor-progress disabled:opacity-80";

function Codigo({
  enviar,
  boton,
}: {
  enviar: (codigo: string) => Promise<{ ok: false; error?: string; fieldErrors?: Record<string, string> }>;
  boton: string;
}) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (pending) return;
    if (!/^\d{6}$/.test(codigo)) {
      setError("Son 6 números");
      ref.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      // Si sale bien, el servidor lleva al panel.
      const r = await enviar(codigo);
      setError(r.fieldErrors?.codigo ?? r.error ?? null);
      setCodigo("");
      ref.current?.focus();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <label htmlFor="codigo" className="text-[13px] font-semibold text-ink">
        Código de 6 números
      </label>
      <input
        ref={ref}
        id="codigo"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={(e) => {
          setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6));
          setError(null);
        }}
        disabled={pending}
        aria-invalid={!!error}
        aria-describedby={error ? "codigo-error" : undefined}
        className={campoCodigo}
      />
      {error && (
        <p id="codigo-error" role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className={botonPrincipal}>
        {pending ? "Verificando…" : boton}
      </button>
    </form>
  );
}

/** Cada ingreso: el código que muestra la app. */
export function PedirCodigo() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        Abrí la app autenticadora del celular y escribí el código de Nevada.
      </p>
      <Codigo enviar={verificarCodigo} boton="Entrar" />
    </div>
  );
}

/** Primera vez: escanear el QR con la app y confirmar con el primer código. */
export function ActivarDobleVerificacion() {
  const [alta, setAlta] = useState<{ factorId: string; qr: string; secreto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function empezar() {
    setError(null);
    startTransition(async () => {
      const r = await iniciarAlta();
      if (r.ok) setAlta({ factorId: r.factorId, qr: r.qr, secreto: r.secreto });
      else setError(r.error);
    });
  }

  if (!alta) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted">
          Para entrar como admin hace falta la doble verificación: además de la contraseña, un código que cambia
          cada 30 segundos en tu celular. Necesitás una app autenticadora (Google Authenticator, Microsoft
          Authenticator o similar).
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-[#fdecea] px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="button" onClick={empezar} disabled={pending} className={botonPrincipal}>
          {pending ? "Preparando…" : "Activar"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm leading-relaxed text-muted">
        <li>En la app autenticadora, tocá «Agregar» y escaneá este QR.</li>
        <li>Escribí abajo el código de 6 números que aparece.</li>
      </ol>
      <div className="mx-auto w-full max-w-[220px] rounded-xl border border-line bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={alta.qr} alt="Código QR para la app autenticadora" className="h-auto w-full" />
      </div>
      <p className="text-center text-xs text-muted">
        ¿No podés escanear? Cargá esta clave a mano:
        <span className="mt-1 block font-mono text-[13px] font-semibold tracking-[0.08em] text-ink [overflow-wrap:anywhere]">
          {alta.secreto}
        </span>
      </p>
      <Codigo enviar={(c) => confirmarAlta(alta.factorId, c)} boton="Confirmar y entrar" />
    </div>
  );
}
