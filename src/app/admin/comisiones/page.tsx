import Link from "next/link";
import { PagarComision, RegistrarRendicion } from "@/components/admin/SaldoForms";
import { Card, Etiqueta, Titulo, Vacio } from "@/components/admin/ui";
import { formatARS, formatFechaHora } from "@/lib/format";
import { getMovimientos, getSaldos } from "@/lib/admin";

export default async function ComisionesPage() {
  const [saldos, movimientos] = await Promise.all([getSaldos(), getMovimientos()]);

  return (
    <>
      <Titulo extra={<p className="text-[13px] text-ice">Todos los eventos</p>}>Comisiones y rendiciones</Titulo>

      {saldos.length === 0 ? (
        <Card>
          <Vacio>Todavía no hay RRPP.</Vacio>
        </Card>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {saldos.map((s) => {
            const pendiente = s.comisionGenerada - s.comisionPagada;
            const debeEf = Math.max(0, s.cobradoEfectivo - s.rendidoEfectivo);
            const debeTr = Math.max(0, s.cobradoTransferencia - s.rendidoTransferencia);
            return (
              <li key={s.sellerId}>
                <Card
                  titulo={s.nombre}
                  acciones={
                    <span className="flex items-center gap-2">
                      {!s.activo && <Etiqueta tono="void">Inactivo</Etiqueta>}
                      <Link
                        href={`/admin/ventas?vendedor=${s.sellerId}&alcance=todos`}
                        className="text-[13px] font-semibold text-blue underline underline-offset-4"
                      >
                        Ver ventas
                      </Link>
                    </span>
                  }
                >
                  <p className="-mt-2 mb-3 text-[12.5px] text-muted tabular-nums">
                    {s.entradas} entradas aprobadas · {formatARS(s.vendido)}
                  </p>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <Celda label="Generada" valor={formatARS(s.comisionGenerada)} />
                    <Celda label="Pagada" valor={formatARS(s.comisionPagada)} />
                    <Celda label="Pendiente" valor={formatARS(pendiente)} fuerte />
                  </dl>
                  <div className="mt-3">
                    <PagarComision key={`p-${pendiente}`} sellerId={s.sellerId} pendiente={pendiente} nombre={s.nombre} />
                  </div>

                  <div className="mt-4 border-t border-line pt-4">
                    {debeEf + debeTr > 0 ? (
                      <>
                        <p className="text-sm font-bold text-warn">Tiene que rendir {formatARS(debeEf + debeTr)}</p>
                        <p className="text-[12.5px] text-muted tabular-nums">
                          Efectivo {formatARS(debeEf)} · Transferencias a su nombre {formatARS(debeTr)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted">No tiene nada para rendir.</p>
                    )}
                    <div className="mt-3">
                      <RegistrarRendicion
                        key={`r-${debeEf}-${debeTr}`}
                        sellerId={s.sellerId}
                        debeEfectivo={debeEf}
                        debeTransferencia={debeTr}
                        nombre={s.nombre}
                      />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Card titulo="Historial de movimientos" id="historial" className="mt-5">
        {movimientos.length === 0 ? (
          <Vacio>Todavía no hay pagos ni rendiciones.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span>
                  <b>{m.rrpp}</b> · {m.detalle}
                </span>
                <span className="text-muted tabular-nums">
                  {formatARS(m.monto)} · {formatFechaHora(m.fecha)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Celda({ label, valor, fuerte = false }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2.5 ${fuerte ? "bg-frost" : "bg-[#f6f9fc]"}`}>
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className={`mt-0.5 font-bold tabular-nums ${fuerte ? "text-deep" : ""}`}>{valor}</dd>
    </div>
  );
}
