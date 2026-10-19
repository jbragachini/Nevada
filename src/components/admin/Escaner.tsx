"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { escanear, type Lectura } from "@/app/actions/puerta";
import { formatHora } from "@/lib/format";

type Resultado = Extract<Lectura, { ok: true }>;

const ESTILO: Record<Resultado["resultado"], { titulo: string; fondo: string; ms: number }> = {
  valida: { titulo: "VÁLIDA", fondo: "bg-ok", ms: 2200 },
  usada: { titulo: "YA UTILIZADA", fondo: "bg-warn", ms: 4000 },
  invalida: { titulo: "INVÁLIDA", fondo: "bg-danger", ms: 4000 },
  anulada: { titulo: "ANULADA", fondo: "bg-void", ms: 4000 },
};

// Sonido corto: agudo si pasa, dos graves si no. Ayuda cuando no se mira la pantalla.
function sonar(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tonos = ok ? [[880, 0]] : [[220, 0], [220, 0.22]];
    for (const [f, t] of tonos) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    }
    setTimeout(() => ctx.close(), 800);
  } catch {
    // Sin audio: queda la pantalla y la vibración.
  }
}

export function Escaner({
  eventId,
  evento,
  ingresosIniciales,
  faltanIniciales,
}: {
  eventId: string;
  evento: string;
  ingresosIniciales: number;
  faltanIniciales: number;
}) {
  const [camara, setCamara] = useState<"apagada" | "iniciando" | "activa" | "error">("apagada");
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingresos, setIngresos] = useState(ingresosIniciales);
  const [faltan, setFaltan] = useState(faltanIniciales);
  const [codigo, setCodigo] = useState("");
  const [validando, setValidando] = useState(false);

  const lector = useRef<{ pause: (b: boolean) => void; resume: () => void; stop: () => Promise<void>; isScanning: boolean } | null>(null);
  const ocupado = useRef(false);
  const ultimo = useRef<{ texto: string; cuando: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispositivo = useRef("");

  useEffect(() => {
    dispositivo.current = navigator.userAgent.slice(0, 120);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const l = lector.current;
      if (l?.isScanning) void l.stop();
    };
  }, []);

  const seguir = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setResultado(null);
    ocupado.current = false;
    try {
      lector.current?.resume();
    } catch {
      // ya estaba leyendo
    }
  }, []);

  const validar = useCallback(
    async (texto: string) => {
      const ahora = Date.now();
      // La cámara lee el mismo QR muchas veces por segundo: se ignora el repetido inmediato.
      if (ocupado.current || (ultimo.current?.texto === texto && ahora - ultimo.current.cuando < 3000)) return;
      ocupado.current = true;
      ultimo.current = { texto, cuando: ahora };
      try {
        lector.current?.pause(true);
      } catch {
        // sin cámara (código a mano)
      }
      setValidando(true);
      setError(null);
      const r = await escanear(eventId, texto, dispositivo.current);
      setValidando(false);
      if (!r.ok) {
        setError(r.error);
        ocupado.current = false;
        lector.current?.resume();
        return;
      }
      setResultado(r);
      if (r.resultado === "valida") {
        setIngresos(r.ingresos);
        setFaltan((f) => Math.max(0, f - 1));
      }
      navigator.vibrate?.(r.resultado === "valida" ? 120 : [80, 80, 80, 80, 200]);
      sonar(r.resultado === "valida");
      timer.current = setTimeout(seguir, ESTILO[r.resultado].ms);
    },
    [eventId, seguir],
  );

  async function prender() {
    setCamara("iniciando");
    setErrorCamara(null);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const l = new Html5Qrcode("lector", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      lector.current = l as unknown as typeof lector.current;
      await l.start(
        { facingMode: "environment" },
        // Sin recuadro: lee el QR en cualquier parte de la imagen (más rápido en la puerta).
        { fps: 12 },
        (texto: string) => void validar(texto),
        () => {},
      );
      setCamara("activa");
    } catch (e) {
      setCamara("error");
      const msg = String(e);
      setErrorCamara(
        /NotAllowed|Permission/i.test(msg)
          ? "No hay permiso para usar la cámara. Habilitalo en el navegador y volvé a intentar."
          : "No pudimos abrir la cámara. Probá con otro navegador o usá el código a mano.",
      );
    }
  }

  async function apagar() {
    const l = lector.current;
    if (l?.isScanning) await l.stop();
    setCamara("apagada");
  }

  function aMano(ev: React.FormEvent) {
    ev.preventDefault();
    const c = codigo.trim();
    if (!c) return;
    ultimo.current = null;
    setCodigo("");
    void validar(c);
  }

  const estilo = resultado ? ESTILO[resultado.resultado] : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 text-white">
        <p className="text-[13px] text-ice">{evento}</p>
        <p className="text-sm tabular-nums" aria-live="polite">
          <b className="display text-xl">{ingresos}</b> <span className="text-frost/80">ingresaron · {faltan} faltan</span>
        </p>
      </div>

      <div className="relative overflow-hidden rounded-[24px] bg-black ring-1 ring-ice/20">
        <div id="lector" className="min-h-[300px] w-full [&_video]:block" />
        {camara !== "activa" && !resultado && (
          <div className="absolute inset-0 z-10 grid place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              {camara === "error" ? (
                <p role="alert" className="text-sm text-[#ffd5d1]">
                  {errorCamara}
                </p>
              ) : (
                <p className="text-sm text-frost/85">Apuntá la cámara al QR de cada entrada.</p>
              )}
              <button
                type="button"
                onClick={prender}
                disabled={camara === "iniciando"}
                className="min-h-12 rounded-xl bg-ice px-6 text-sm font-extrabold uppercase tracking-[0.12em] text-night transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ice disabled:opacity-70"
              >
                {camara === "iniciando" ? "Abriendo cámara…" : "Activar cámara"}
              </button>
            </div>
          </div>
        )}
        {validando && !resultado && (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-night/80 py-3 text-center text-sm font-semibold text-white">Validando…</div>
        )}
        {resultado && estilo && (
          <button
            type="button"
            onClick={seguir}
            aria-label="Seguir escaneando"
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-6 text-center text-white ${estilo.fondo} motion-safe:animate-[aviso_160ms_ease-out]`}
          >
            <Icono r={resultado.resultado} />
            <span role="status" className="display text-[clamp(36px,11vw,56px)] leading-none">
              {estilo.titulo}
            </span>
            {resultado.titular && <span className="mt-1 text-xl font-bold">{resultado.titular}</span>}
            <span className="text-[15px] text-white/90">
              {resultado.resultado === "valida" && resultado.tipo}
              {resultado.resultado === "usada" && resultado.usadaEn && `Ingresó a las ${formatHora(resultado.usadaEn)}`}
              {resultado.resultado === "anulada" && "Esta entrada fue dada de baja"}
              {resultado.resultado === "invalida" &&
                (resultado.otroEvento ? "Es de otro evento" : "No es una entrada de Nevada")}
            </span>
            <span className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">Tocá para seguir</span>
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-[#3b1220] px-4 py-3 text-sm font-medium text-[#ffd5d1]">
          {error}
        </p>
      )}

      <form onSubmit={aMano} className="flex items-end gap-2 rounded-2xl border border-ice/20 bg-deep/55 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="codigo-mano" className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice">
            Código a mano
          </label>
          <input
            id="codigo-mano"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="A1B2-C3D4"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            className="min-h-11 rounded-xl border border-ice/30 bg-night px-3 font-mono text-lg tracking-[0.12em] text-white placeholder:text-frost/60 outline-none focus:border-ice focus:ring-2 focus:ring-ice/40"
          />
        </div>
        <button
          type="submit"
          disabled={validando}
          className="min-h-11 rounded-xl bg-ice px-4 text-sm font-bold text-night transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-ice disabled:opacity-70"
        >
          Validar
        </button>
      </form>

      {camara === "activa" && (
        <button
          type="button"
          onClick={apagar}
          className="self-center text-[13px] font-semibold text-frost underline underline-offset-4 hover:text-white"
        >
          Apagar cámara
        </button>
      )}
    </div>
  );
}

function Icono({ r }: { r: Resultado["resultado"] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {r === "valida" && <path d="m5 12 5 5 9-10" />}
      {r === "usada" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
      {r === "invalida" && <path d="M7 7l10 10M17 7 7 17" />}
      {r === "anulada" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6 18 18 6" />
        </>
      )}
    </svg>
  );
}
