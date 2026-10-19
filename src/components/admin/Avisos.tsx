"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Aviso = { id: number; texto: string; ok: boolean };

const Ctx = createContext<(texto: string, ok?: boolean) => void>(() => {});

/** Avisos del panel: confirmaciones que siguen visibles aunque la fila que las generó desaparezca. */
export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const n = useRef(0);

  const avisar = useCallback((texto: string, ok = true) => {
    const id = ++n.current;
    setAvisos((a) => [...a.slice(-2), { id, texto, ok }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        {avisos.map((a) => (
          <p
            key={a.id}
            role="status"
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-[0_12px_32px_-8px_rgba(6,26,54,0.55)] motion-safe:animate-[aviso_200ms_ease-out] ${
              a.ok ? "bg-white text-ok" : "bg-[#fdecea] text-danger"
            }`}
          >
            {a.texto}
          </p>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useAvisar() {
  return useContext(Ctx);
}
