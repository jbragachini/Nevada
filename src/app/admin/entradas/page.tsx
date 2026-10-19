import { anularEntrada } from "@/app/actions/admin";
import { Accion } from "@/components/admin/Accion";
import { EventoSelector } from "@/components/admin/EventoSelector";
import { Card, Stat, Titulo, Vacio, boton, campo } from "@/components/admin/ui";
import { EstadoPill } from "@/components/EstadoPill";
import { formatFechaHora } from "@/lib/format";
import { getEntradas, getEventoActual, getEventos } from "@/lib/admin";

export default async function EntradasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const eventos = await getEventos();
  const actual = await getEventoActual(eventos);
  const entradas = actual ? await getEntradas(actual.id, q) : [];
  const cuenta = (s: string) => entradas.filter((e) => e.status === s).length;

  return (
    <>
      <Titulo>Entradas y QR</Titulo>
      <EventoSelector eventos={eventos} actual={actual?.id ?? null} />

      <dl className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Válidas" valor={String(cuenta("valida"))} tono="ok" />
        <Stat label="Usadas" valor={String(cuenta("usada"))} />
        <Stat label="Anuladas" valor={String(cuenta("anulada"))} />
      </dl>

      <Card>
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <label htmlFor="q" className="text-[12px] font-semibold text-muted">
              Buscar por titular, mail o número de pedido
            </label>
            <input id="q" name="q" type="search" defaultValue={q} className={campo} />
          </div>
          <button type="submit" className={boton.secundario}>
            Buscar
          </button>
        </form>
        {entradas.length === 0 ? (
          <Vacio>{q ? "No hay entradas que coincidan." : "Todavía no hay entradas emitidas."}</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {entradas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-bold">{e.titular}</p>
                  <p className="text-[12.5px] text-muted [overflow-wrap:anywhere]">
                    {e.tipo} · <span className="tabular-nums">{e.numero}</span> · {e.email} · emitida{" "}
                    {formatFechaHora(e.emitidoEn)}
                    {e.usadaEn ? ` · ingresó ${formatFechaHora(e.usadaEn)}` : ""}
                  </p>
                </div>
                <EstadoPill status={e.status} />
                {e.status === "valida" && (
                  <Accion
                    accion={anularEntrada.bind(null, e.id)}
                    variante="peligro"
                    pedirTexto={`¿Por qué anulás la entrada de ${e.titular}? Deja de servir en la puerta.`}
                    pendiente="Anulando…"
                  >
                    Anular
                  </Accion>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
