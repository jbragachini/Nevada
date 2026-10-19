"use client";

import { useState, useTransition } from "react";
import type { Respuesta } from "@/app/actions/admin";
import { useAvisar } from "@/components/admin/Avisos";
import { boton } from "@/components/admin/ui";

/**
 * Botón que ejecuta una acción del admin. Puede pedir confirmación o un texto (por ejemplo, el motivo
 * de un rechazo) y muestra el resultado al lado.
 */
export function Accion({
  accion,
  children,
  variante = "secundario",
  confirmar,
  pedirTexto,
  pendiente = "Guardando…",
}: {
  accion: (texto: string) => Promise<Respuesta>;
  children: React.ReactNode;
  variante?: keyof typeof boton;
  confirmar?: string;
  pedirTexto?: string;
  pendiente?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const avisar = useAvisar();

  function click() {
    let texto = "";
    if (pedirTexto) {
      const t = window.prompt(pedirTexto);
      if (t === null) return;
      texto = t;
    } else if (confirmar && !window.confirm(confirmar)) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await accion(texto);
      if (r.ok) {
        setMsg(null);
        if (r.mensaje) avisar(r.mensaje);
      } else setMsg({ ok: false, texto: r.error });
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={click} disabled={pending} aria-busy={pending} className={boton[variante]}>
        {pending ? pendiente : children}
      </button>
      <span aria-live="polite" className="text-xs font-medium">
        {msg && (
          <span
            className={
              variante === "oscuro" ? (msg.ok ? "text-ice" : "text-[#ffb4ab]") : msg.ok ? "text-ok" : "text-danger"
            }
          >
            {msg.texto}
          </span>
        )}
      </span>
    </span>
  );
}
