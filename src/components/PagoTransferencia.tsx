"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FlechaGl } from "@/components/FlechaGl";
import { formatARS } from "@/lib/format";

const MAX = 5 * 1024 * 1024;

type Elegido = { archivo: Blob; nombre: string; vista: string | null };

/**
 * Cómo pagar: transferencia común al alias de Nevada (sin comisión). El comprador copia el alias,
 * transfiere, sube el comprobante y toca «Pagado»; desde ahí el pedido espera que Nevada apruebe.
 * Las fotos se achican en el celular antes de subirlas (más rápido con datos móviles).
 */
export function PagoTransferencia({
  token,
  total,
  alias,
  titular,
  vencido,
}: {
  token: string;
  total: number;
  alias: string;
  titular: string | null;
  vencido: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => () => {
    if (elegido?.vista) URL.revokeObjectURL(elegido.vista);
  }, [elegido]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(alias);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso del portapapeles: queda el alias a la vista para copiarlo a mano.
    }
  }

  async function elegir(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    setError(null);
    const esPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!esPdf && !f.type.startsWith("image/") && f.type !== "") {
      setError("Subí una foto, una captura o un PDF del comprobante.");
      return;
    }
    const archivo = esPdf ? f : await achicar(f);
    if (archivo.size > MAX) {
      setError("El archivo pesa más de 5 MB. Probá con una captura de pantalla.");
      return;
    }
    setElegido({ archivo, nombre: f.name || "Comprobante", vista: esPdf ? null : URL.createObjectURL(archivo) });
  }

  async function pagado() {
    if (!elegido || enviando) return;
    setEnviando(true);
    setError(null);
    const form = new FormData();
    form.set("token", token);
    form.set("archivo", elegido.archivo, elegido.nombre);
    try {
      const res = await fetch("/api/comprobante", { method: "POST", body: form });
      const r = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (r?.ok) {
        router.refresh();
        return;
      }
      setError(r?.error ?? "No pudimos enviar el comprobante. Probá de nuevo en un momento.");
    } catch {
      setError("No hay conexión. Revisá tu internet y probá de nuevo.");
    }
    setEnviando(false);
  }

  return (
    <section aria-labelledby="como-pagar" className="flex flex-col gap-4 rounded-[24px] border border-ice/35 bg-ice/[0.07] p-5">
      <h2 id="como-pagar" className="text-xs font-bold uppercase tracking-[0.28em] text-ice">
        Transferí exactamente
      </h2>
      <p className="text-[clamp(30px,9vw,38px)] font-bold leading-none tabular-nums">{formatARS(total)}</p>

      <div className="flex items-center justify-between gap-3 rounded-full border border-white/15 bg-[#01060e]/55 py-2 pl-5 pr-2">
        <p className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Alias de Nevada{titular ? ` · ${titular}` : ""}
          </span>
          <span className="font-semibold [overflow-wrap:anywhere]">{alias}</span>
        </p>
        <button
          type="button"
          onClick={copiar}
          className="min-h-10 shrink-0 rounded-full border border-white/20 px-4 text-xs font-bold uppercase tracking-[0.1em] text-frost transition-colors hover:border-ice hover:text-white focus-visible:outline-2 focus-visible:outline-ice"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Alias copiado" : ""}
      </span>

      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-frost">
        <li>Copiá el alias <b className="font-semibold text-white">{alias}</b>.</li>
        <li>Transferí {formatARS(total)} desde Mercado Pago o tu banco.</li>
        <li>Subí el comprobante y tocá «Pagado».</li>
      </ol>
      {vencido && (
        <p className="text-[13px] text-warn">
          Se venció la reserva. Si ya transferiste, subí el comprobante: si quedan entradas, lo revisamos igual.
        </p>
      )}

      {elegido ? (
        <div className="flex items-center gap-3 rounded-[18px] border border-white/15 bg-[#01060e]/50 p-2.5">
          {elegido.vista ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local del archivo elegido
            <img src={elegido.vista} alt="Comprobante elegido" className="h-16 w-16 shrink-0 rounded-xl bg-white object-cover" />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-danger text-xs font-bold text-white">PDF</span>
          )}
          <p className="min-w-0 flex-1 text-[13px]">
            <b className="block truncate font-semibold">{elegido.nombre}</b>
            Comprobante cargado
          </p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={enviando}
            className="min-h-10 shrink-0 rounded-full border border-white/20 px-4 text-xs font-bold uppercase tracking-[0.1em] text-frost hover:border-ice hover:text-white focus-visible:outline-2 focus-visible:outline-ice"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-[22px] border-[1.5px] border-dashed border-ice/55 bg-[#01060e]/40 p-4 text-center transition-colors hover:border-ice hover:bg-ice/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
        >
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em]">Subir comprobante</span>
          <span className="text-xs text-muted">Foto o captura (JPG, PNG o PDF, hasta 5 MB)</span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*,application/pdf" onChange={elegir} className="sr-only" tabIndex={-1} aria-hidden="true" />

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={pagado}
        disabled={!elegido || enviando}
        aria-busy={enviando}
        aria-describedby={!elegido ? "pagado-ayuda" : undefined}
        className="gl w-full"
      >
        <span>{enviando ? "Enviando…" : "Pagado"}</span>
        <FlechaGl />
      </button>
      {!elegido && (
        <p id="pagado-ayuda" className="-mt-2 text-center text-xs text-muted">
          Primero subí el comprobante.
        </p>
      )}
      <p className="text-xs text-muted">Sin costo extra: es una transferencia común. Podés pagar desde cualquier banco o billetera.</p>
    </section>
  );
}

/** Achica una foto a 1600 px de lado como máximo, en JPEG. Si el navegador no puede, sube la original. */
async function achicar(f: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    img.close();
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    return b ?? f;
  } catch {
    return f;
  }
}
