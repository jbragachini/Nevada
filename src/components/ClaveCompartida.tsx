"use client";

import { createContext, useContext, useState } from "react";

type Valor = { clave: string | null; aceptar: (clave: string) => void };

const Ctx = createContext<Valor | null>(null);

/**
 * Palabra clave aceptada, compartida entre la portada (donde se escribe) y el formulario de compra
 * (que la manda con el pedido para que la base la vuelva a controlar).
 */
export function ClaveCompartida({ children }: { children: React.ReactNode }) {
  const [clave, setClave] = useState<string | null>(null);
  return <Ctx.Provider value={{ clave, aceptar: setClave }}>{children}</Ctx.Provider>;
}

export function useClaveCompartida(): Valor | null {
  return useContext(Ctx);
}
