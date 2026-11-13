"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlechaGl } from "@/components/FlechaGl";

const CLAVE = "nevada:pedido";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type Guardado = { token: string; numero: string };

function leer(): Guardado | null {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Guardado | null;
    return g && TOKEN_RE.test(g.token) && typeof g.numero === "string" ? g : null;
  } catch {
    return null;
  }
}

/**
 * En la página del pedido: recuerda el link en este dispositivo, para que el comprador lo
 * encuentre al volver a la página de venta aunque haya cerrado la pestaña. No sale del navegador.
 */
export function RecordarPedido({ token, numero, olvidar }: { token: string; numero: string; olvidar: boolean }) {
  useEffect(() => {
    try {
      if (olvidar) {
        if (leer()?.token === token) localStorage.removeItem(CLAVE);
      } else {
        localStorage.setItem(CLAVE, JSON.stringify({ token, numero }));
      }
    } catch {
      // Navegación privada o almacenamiento bloqueado: el link sigue andando igual.
    }
  }, [token, numero, olvidar]);
  return null;
}

/** En la página de venta: acceso al último pedido hecho desde este dispositivo. */
export function PedidoGuardado() {
  const [g, setG] = useState<Guardado | null>(null);
  useEffect(() => setG(leer()), []);
  if (!g) return null;
  return (
    <aside aria-label="Tu pedido" className="mb-6 flex flex-col gap-3 rounded-[22px] border border-ice/35 bg-ice/[0.07] p-4 text-center">
      <p className="text-sm text-frost">
        Tenés el pedido <b className="font-bold text-white tabular-nums">{g.numero}</b> en este dispositivo.
      </p>
      <Link href={`/pedido/${g.token}`} className="gl gl-sm gl-centro">
        <span>Ver mi pedido</span>
        <FlechaGl />
      </Link>
    </aside>
  );
}
