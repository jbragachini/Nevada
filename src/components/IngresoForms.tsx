"use client";

import { useRef, useState, useTransition } from "react";
import { ingresar, pedirAcceso, type AuthResult } from "@/app/actions/auth";
import { FlechaGl } from "@/components/FlechaGl";

type Modo = "ingresar" | "acceso";

const input =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger";

export function IngresoForms({ inicial = "ingresar" }: { inicial?: Modo }) {
  const [modo, setModo] = useState<Modo>(inicial);

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Ingreso" className="grid grid-cols-2 gap-1 rounded-xl bg-frost p-1">
        {(
          [
            ["ingresar", "Ingresar"],
            ["acceso", "Pedir acceso"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`tab-${m}`}
            aria-selected={modo === m}
            aria-controls={`panel-${m}`}
            onClick={() => setModo(m)}
            className={`min-h-11 rounded-lg text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-blue ${
              modo === m ? "bg-white text-deep shadow-[0_1px_3px_rgba(6,26,54,0.12)]" : "text-muted hover:text-deep"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${modo}`} aria-labelledby={`tab-${modo}`}>
        {modo === "ingresar" ? <FormIngreso /> : <FormAcceso />}
      </div>
    </div>
  );
}

function useEnvio(accion: (datos: Record<string, string>) => Promise<AuthResult>) {
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pending) return;
    const datos = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>;
    setError(null);
    setErrores({});
    startTransition(async () => {
      // Si sale bien, el servidor redirige al panel.
      const r = await accion(datos);
      setErrores(r.fieldErrors ?? {});
      setError(r.error ?? null);
      const primero = Object.keys(r.fieldErrors ?? {})[0];
      if (primero) formRef.current?.querySelector<HTMLElement>(`[name="${primero}"]`)?.focus();
    });
  }

  return { errores, error, pending, formRef, onSubmit };
}

function Campo({
  name,
  label,
  errores,
  ayuda,
  ...rest
}: {
  name: string;
  label: string;
  errores: Record<string, string>;
  ayuda?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const err = errores[name];
  const describe = err ? `${name}-error` : ayuda ? `${name}-ayuda` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <input id={name} name={name} aria-invalid={!!err} aria-describedby={describe} className={input} {...rest} />
      {err ? (
        <p id={`${name}-error`} className="text-xs font-medium text-danger">
          {err}
        </p>
      ) : (
        ayuda && (
          <p id={`${name}-ayuda`} className="text-xs text-muted">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}

function Password({ errores, nueva = false }: { errores: Record<string, string>; nueva?: boolean }) {
  const [ver, setVer] = useState(false);
  const err = errores.password;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="password" className="text-[13px] font-semibold text-ink">
        Contraseña
      </label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={ver ? "text" : "password"}
          autoComplete={nueva ? "new-password" : "current-password"}
          required
          minLength={nueva ? 8 : undefined}
          aria-invalid={!!err}
          aria-describedby={err ? "password-error" : nueva ? "password-ayuda" : undefined}
          className={`${input} pr-24`}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-pressed={ver}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-[13px] font-semibold text-blue hover:text-deep focus-visible:outline-2 focus-visible:outline-blue"
        >
          {ver ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {err ? (
        <p id="password-error" className="text-xs font-medium text-danger">
          {err}
        </p>
      ) : (
        nueva && (
          <p id="password-ayuda" className="text-xs text-muted">
            Al menos 8 caracteres.
          </p>
        )
      )}
    </div>
  );
}

function Enviar({ pending, children, ocupado }: { pending: boolean; children: string; ocupado: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-2 gl w-full"
    >
      <span>{pending ? ocupado : children}</span>
      <FlechaGl />
    </button>
  );
}

function Alerta({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-[#fdecea] px-4 py-3 text-sm font-medium text-danger">
      {error}
    </p>
  );
}

function FormIngreso() {
  const { errores, error, pending, formRef, onSubmit } = useEnvio(ingresar);
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Campo
        name="usuario"
        label="Usuario o mail"
        errores={errores}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <Password errores={errores} />
      <Alerta error={error} />
      <Enviar pending={pending} ocupado="Ingresando…">
        Ingresar
      </Enviar>
    </form>
  );
}

function FormAcceso() {
  const { errores, error, pending, formRef, onSubmit } = useEnvio(pedirAcceso);
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        Para vender como RRPP. Tu pedido queda pendiente hasta que Nevada lo apruebe.
      </p>
      <Campo name="nombre" label="Nombre y apellido" errores={errores} autoComplete="name" required />
      <Campo
        name="usuario"
        label="Usuario"
        errores={errores}
        ayuda="Con este nombre vas a ingresar. Sin espacios."
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <Campo
        name="email"
        label="Mail"
        type="email"
        inputMode="email"
        errores={errores}
        autoComplete="email"
        spellCheck={false}
        required
      />
      <Campo name="whatsapp" label="WhatsApp" type="tel" inputMode="tel" errores={errores} autoComplete="tel" required />
      <Password errores={errores} nueva />
      <Alerta error={error} />
      <Enviar pending={pending} ocupado="Enviando…">
        Pedir acceso
      </Enviar>
    </form>
  );
}
