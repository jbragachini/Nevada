import { aprobarPedido, rechazarPedido } from "@/app/actions/admin";
import { Accion } from "@/components/admin/Accion";
import { Card, Titulo, Vacio } from "@/components/admin/ui";
import { EstadoPill } from "@/components/EstadoPill";
import { formatARS, formatFechaHora } from "@/lib/format";
import { getPorAprobar, type Pedido } from "@/lib/admin";

function medio(p: Pedido): string {
  switch (p.metodo) {
    case "mercadopago":
      return `Mercado Pago a Nevada${p.mpPaymentId ? ` · operación ${p.mpPaymentId}` : ""}`;
    case "transferencia_nevada":
      return "Transferencia a la cuenta de Nevada: fijate que haya entrado";
    case "transferencia_rrpp":
      return `Transferencia a ${p.vendedor ?? "el RRPP"}: confirmalo con él por WhatsApp`;
    default:
      return "Efectivo al RRPP";
  }
}

export default async function PorAprobarPage() {
  const pedidos = await getPorAprobar();

  return (
    <>
      <Titulo extra={<p className="text-[13px] text-ice">Al aprobar se emiten las entradas con QR</p>}>Por aprobar</Titulo>
      {pedidos.length === 0 ? (
        <Card>
          <Vacio>No hay pedidos esperando aprobación.</Vacio>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {pedidos.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-muted">
                      <span className="font-bold text-ink tabular-nums">{p.numero}</span> · {p.evento} ·{" "}
                      {formatFechaHora(p.creadoEn)}
                    </p>
                    <h2 className="mt-1 text-lg font-bold">{p.comprador}</h2>
                    <p className="text-[13px] text-muted [overflow-wrap:anywhere]">
                      {p.email}
                      {p.whatsapp ? ` · WhatsApp ${p.whatsapp}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="display text-xl text-deep tabular-nums">{formatARS(p.total)}</p>
                    <EstadoPill status={p.status} />
                  </div>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="sr-only">Entradas</dt>
                    <dd>{p.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(" · ")}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Vendedor</dt>
                    <dd className="text-muted">
                      {p.vendedor
                        ? `${p.origen === "rrpp" ? "Cargada por" : "Eligió a"} ${p.vendedor} · comisión ${formatARS(p.comision)}`
                        : "Venta directa"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="sr-only">Pago</dt>
                    <dd className="font-semibold text-blue">{medio(p)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Accion
                    accion={aprobarPedido.bind(null, p.id)}
                    variante="ok"
                    confirmar={`¿Aprobar ${p.numero} de ${p.comprador}? Se emiten las entradas con QR.`}
                    pendiente="Aprobando…"
                  >
                    Aprobar
                  </Accion>
                  <Accion
                    accion={rechazarPedido.bind(null, p.id)}
                    variante="peligro"
                    pedirTexto={`¿Por qué rechazás ${p.numero}? Queda registrado en el pedido.`}
                    pendiente="Rechazando…"
                  >
                    Rechazar
                  </Accion>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
