import { EventoSelector } from "@/components/admin/EventoSelector";
import { Card, Stat, Titulo, Vacio, boton, campo } from "@/components/admin/ui";
import { EstadoPill } from "@/components/EstadoPill";
import { formatARS, formatFechaHora } from "@/lib/format";
import { getEventoActual, getEventos, getRrpps, getVentas, type FiltroVentas } from "@/lib/admin";

const COMO: Record<string, string> = {
  mercadopago: "Web · Mercado Pago",
  efectivo_rrpp: "RRPP · efectivo",
  transferencia_rrpp: "RRPP · transferencia al RRPP",
  transferencia_nevada: "RRPP · transferencia a Nevada",
};

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filtro: FiltroVentas = {
    vendedor: sp.vendedor ?? "todos",
    estado: sp.estado ?? "todos",
    alcance: sp.alcance === "todos" ? "todos" : "evento",
    q: sp.q ?? "",
  };
  const eventos = await getEventos();
  const actual = await getEventoActual(eventos);
  const [ventas, rrpps] = await Promise.all([getVentas(filtro, actual?.id ?? null), getRrpps()]);

  const aprobadas = ventas.filter((v) => v.status === "aprobado");
  const entradas = aprobadas.reduce((a, v) => a + v.items.reduce((b, i) => b + i.cantidad, 0), 0);
  const vendido = aprobadas.reduce((a, v) => a + v.total, 0);
  const comision = aprobadas.reduce((a, v) => a + v.comision, 0);

  return (
    <>
      <Titulo>Ventas por vendedor</Titulo>
      <EventoSelector eventos={eventos} actual={actual?.id ?? null} />

      <Card className="mb-5">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] lg:items-end">
          <Filtro id="vendedor" label="Vendedor" valor={filtro.vendedor}>
            <option value="todos">Todos</option>
            <option value="directo">Sin RRPP (directo)</option>
            {rrpps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Filtro>
          <Filtro id="estado" label="Estado" valor={filtro.estado}>
            <option value="todos">Todos</option>
            <option value="por_aprobar">Por aprobar</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="esperando_pago">Esperando el pago</option>
          </Filtro>
          <Filtro id="alcance" label="Alcance" valor={filtro.alcance}>
            <option value="evento">Este evento</option>
            <option value="todos">Todos los eventos</option>
          </Filtro>
          <div className="flex flex-col gap-1">
            <label htmlFor="q" className="text-[12px] font-semibold text-muted">
              Buscar comprador o número
            </label>
            <input id="q" name="q" type="search" defaultValue={filtro.q} className={campo} />
          </div>
          <button type="submit" className={boton.primario}>
            Filtrar
          </button>
        </form>
      </Card>

      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos" valor={String(ventas.length)} />
        <Stat label="Entradas aprobadas" valor={String(entradas)} />
        <Stat label="Vendido (aprobado)" valor={formatARS(vendido)} />
        <Stat label="Comisión generada" valor={formatARS(comision)} />
      </dl>

      <Card>
        {ventas.length === 0 ? (
          <Vacio>No hay ventas con estos filtros.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {ventas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-bold">
                    {v.comprador} <span className="font-medium text-muted tabular-nums">· {v.numero}</span>
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {filtro.alcance === "todos" ? `${v.evento} · ` : ""}
                    {v.items.map((i) => `${i.cantidad} ${i.nombre}`).join(", ")} · {COMO[v.metodo]} ·{" "}
                    {v.vendedor ?? "directo"} · {formatFechaHora(v.creadoEn)}
                  </p>
                  {v.motivoRechazo && <p className="text-[12.5px] text-danger">Motivo: {v.motivoRechazo}</p>}
                </div>
                <span className="text-sm font-bold tabular-nums">{formatARS(v.total)}</span>
                <EstadoPill status={v.status} metodo={v.metodo} origen={v.origen} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Filtro({ id, label, valor, children }: { id: string; label: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-muted">
        {label}
      </label>
      <select id={id} name={id} defaultValue={valor} className={campo}>
        {children}
      </select>
    </div>
  );
}
