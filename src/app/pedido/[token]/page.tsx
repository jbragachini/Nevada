import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NevadaLogo } from "@/components/NevadaLogo";
import { TicketShell } from "@/components/TicketShell";
import { getCheckout } from "@/lib/checkout";
import { formatARS, formatEventDate, formatHora } from "@/lib/format";
import { getPedido, type EstadoPedido, type Pedido } from "@/lib/pedido";
import { contenidoQr, qrConfigurado, qrSvg } from "@/lib/qr";

export const dynamic = "force-dynamic";

// Link privado: que no lo indexen ni lo filtre el Referer al salir a otro sitio.
export const metadata: Metadata = {
  title: "Tu pedido · Nevada Producciones",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Tono = "ok" | "espera" | "mal" | "apagado";

const ESTADOS: Record<EstadoPedido, { titulo: string; tono: Tono; paso: number }> = {
  pendiente_pago: { titulo: "ESPERANDO EL PAGO", tono: "espera", paso: 1 },
  pagado: { titulo: "¡PAGO RECIBIDO!", tono: "ok", paso: 2 },
  por_confirmar: { titulo: "PAGO EN VERIFICACIÓN", tono: "espera", paso: 2 },
  aprobado: { titulo: "¡ENTRADAS LISTAS!", tono: "ok", paso: 4 },
  rechazado: { titulo: "PEDIDO RECHAZADO", tono: "mal", paso: 0 },
  cancelado: { titulo: "PEDIDO CANCELADO", tono: "mal", paso: 0 },
  vencido: { titulo: "PEDIDO VENCIDO", tono: "apagado", paso: 0 },
};

const PASOS = ["Pedido creado", "Pago recibido", "Aprobado por Nevada", "Entradas listas"];

export default async function PedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pedido = await getPedido(token);
  if (!pedido) notFound();

  const estado = ESTADOS[pedido.status];
  const enCurso = estado.paso > 0 && estado.paso < 4;
  const checkout = getCheckout();
  const dePrueba = pedido.status === "pendiente_pago" && checkout.habilitado && checkout.modo === "prueba";
  const f = formatEventDate(pedido.evento.fechaInicio);

  return (
    <TicketShell
      head={
        <>
          <div className="flex justify-center">
            <NevadaLogo height={72} />
          </div>
          <p className="mt-6 display text-xl leading-tight text-balance">{pedido.evento.nombre.toUpperCase()}</p>
          <p className="mt-2 text-[13px] text-frost/80">
            {f.dia} · {f.hora} h · {pedido.evento.lugar}
          </p>
        </>
      }
      footer={<p>Guardá este link: es privado y te deja ver tu pedido cuando quieras.</p>}
    >
      {enCurso && <AutoRefresh seconds={20} />}

      <div className="flex flex-col gap-7">
        <header className="flex flex-col items-center gap-3 text-center">
          <EstadoIcono tono={estado.tono} />
          <h1 className="display text-[22px] leading-none text-deep">{estado.titulo}</h1>
          <p className="text-[13px] text-muted">
            Pedido <span className="font-bold text-ink tabular-nums">{pedido.numero}</span>
          </p>
          <p className="max-w-[34ch] text-sm leading-relaxed text-ink text-pretty">
            <Explicacion pedido={pedido} />
          </p>
        </header>

        {dePrueba && (
          <p className="rounded-xl border border-line bg-frost px-4 py-3 text-[13px] leading-relaxed text-ink">
            <strong className="font-bold">Pedido de prueba.</strong> El pago con Mercado Pago todavía no está
            conectado, así que este pedido no se puede pagar: se libera solo a las{" "}
            {pedido.venceEn ? formatHora(pedido.venceEn) : "—"}.
          </p>
        )}

        {estado.paso > 0 && <Pasos actual={estado.paso} />}

        <section aria-labelledby="resumen" className="flex flex-col gap-3">
          <h2 id="resumen" className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
            Tu compra
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {pedido.items.map((i) => (
              <li key={i.nombre} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="text-sm text-ink">
                  <span className="font-bold tabular-nums">{i.cantidad} ×</span> {i.nombre}
                </span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatARS(i.subtotal)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-4 rounded-b-2xl bg-night px-4 py-4 text-white">
              <span className="text-sm text-ice">Total</span>
              <span className="display text-xl tabular-nums">{formatARS(pedido.total)}</span>
            </li>
          </ul>
          <p className="text-xs leading-relaxed text-muted">
            A nombre de <span className="font-semibold text-ink">{pedido.compradorNombre}</span>
            <br />
            Mail <span className="font-semibold text-ink [overflow-wrap:anywhere]">{pedido.compradorEmail}</span>
          </p>
        </section>

        {pedido.status === "aprobado" && pedido.entradas.length > 0 && <Entradas pedido={pedido} />}

        {(pedido.status === "vencido" || pedido.status === "rechazado" || pedido.status === "cancelado") && (
          <Link
            href="/"
            className="flex min-h-12 items-center justify-center rounded-xl bg-deep px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue"
          >
            Volver a las entradas
          </Link>
        )}
      </div>
    </TicketShell>
  );
}

async function Entradas({ pedido }: { pedido: Pedido }) {
  const conQr = qrConfigurado();
  const svgs = conQr ? await Promise.all(pedido.entradas.map((e) => qrSvg(contenidoQr(e.qrToken)))) : [];
  return (
    <section aria-labelledby="entradas" className="flex flex-col gap-3">
      <h2 id="entradas" className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
        Tus entradas
      </h2>
      {!conQr && (
        <p className="rounded-xl bg-frost px-4 py-3 text-[13px] text-ink">
          Los QR todavía no se pueden mostrar: falta configurar su firma en el servidor.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {pedido.entradas.map((e, i) => (
          <li
            key={e.qrToken}
            className={`flex flex-col items-center gap-2 rounded-2xl border border-line p-4 text-center ${
              e.status === "valida" ? "" : "opacity-60"
            }`}
          >
            <p className="display text-base text-deep">{e.titular.toUpperCase()}</p>
            <p className="text-[12.5px] text-muted">
              {e.tipo} · entrada {i + 1} de {pedido.entradas.length}
            </p>
            {conQr && e.status === "valida" && (
              <div
                role="img"
                aria-label={`Código QR de la entrada de ${e.titular}`}
                className="w-full max-w-[220px] [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svgs[i] }}
              />
            )}
            {e.status !== "valida" && (
              <p className="text-sm font-bold text-muted">{e.status === "usada" ? "Ya ingresó" : "Anulada"}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Explicacion({ pedido }: { pedido: Pedido }) {
  switch (pedido.status) {
    case "pendiente_pago":
      return (
        <>
          Reservamos tus entradas hasta las {pedido.venceEn ? formatHora(pedido.venceEn) : "—"}. Si el pago no se
          completa antes, se liberan.
        </>
      );
    case "pagado":
      return <>Estamos revisando tu pago. Cuando lo aprobemos, tus entradas con QR aparecen en este link.</>;
    case "por_confirmar":
      return <>Estamos confirmando tu pago. Cuando lo aprobemos, tus entradas con QR aparecen en este link.</>;
    case "aprobado":
      return <>Tus entradas están abajo, una por persona. Cada uno muestra su QR en la puerta.</>;
    case "rechazado":
    case "cancelado":
      return <>No pudimos aprobar este pedido. Escribinos por Instagram con tu número de pedido y lo vemos.</>;
    case "vencido":
      return <>Pasó el plazo para pagar y las entradas se liberaron. Podés hacer una compra nueva.</>;
  }
}

function Pasos({ actual }: { actual: number }) {
  return (
    <ol className="flex flex-col" aria-label="Estado del pedido">
      {PASOS.map((nombre, i) => {
        const hecho = i < actual;
        const ahora = i === actual;
        const ultimo = i === PASOS.length - 1;
        return (
          <li key={nombre} className="flex gap-3" aria-current={ahora ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  hecho
                    ? "bg-deep text-white"
                    : ahora
                      ? "border-2 border-blue bg-white"
                      : "border-2 border-line bg-white"
                }`}
              >
                {hecho ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                ) : (
                  ahora && <span className="h-2 w-2 rounded-full bg-blue motion-safe:animate-pulse" />
                )}
              </span>
              {!ultimo && <span className={`w-0.5 flex-1 ${hecho ? "bg-deep" : "bg-line"} min-h-5`} />}
            </div>
            <p
              className={`pb-4 pt-0.5 text-sm ${
                hecho ? "font-semibold text-ink" : ahora ? "font-bold text-blue" : "text-muted"
              }`}
            >
              {nombre}
              <span className="sr-only">{hecho ? " (listo)" : ahora ? " (en curso)" : " (pendiente)"}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function EstadoIcono({ tono }: { tono: Tono }) {
  const fondo = { ok: "bg-deep", espera: "bg-blue", mal: "bg-danger", apagado: "bg-muted" }[tono];
  return (
    <div className={`grid h-16 w-16 place-items-center rounded-full ${fondo}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tono === "ok" && <path d="m5 12 5 5 9-10" />}
        {tono === "espera" && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </>
        )}
        {tono === "mal" && <path d="M7 7l10 10M17 7 7 17" />}
        {tono === "apagado" && (
          <>
            <path d="M7 3.5h10M7 20.5h10" />
            <path d="M8 3.5c0 5 8 4 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 4-8 8.5s8 3.5 8 8.5" />
          </>
        )}
      </svg>
    </div>
  );
}
