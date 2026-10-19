import Link from "next/link";
import { EventoSelector } from "@/components/admin/EventoSelector";
import { Card, Etiqueta, Stat, Titulo, Vacio, boton } from "@/components/admin/ui";
import { formatARS, formatEventDate } from "@/lib/format";
import { getAccesosPendientes, getEventoActual, getEventos, getResumen } from "@/lib/admin";
import { requireAdmin } from "@/lib/sesion";

export default async function ResumenPage() {
  const sesion = await requireAdmin();
  const eventos = await getEventos();
  const actual = await getEventoActual(eventos);
  const [resumen, accesos] = await Promise.all([actual ? getResumen(actual.id) : null, getAccesosPendientes()]);

  return (
    <>
      <Titulo>Hola, {sesion.nombre.split(" ")[0]}</Titulo>
      <EventoSelector eventos={eventos} actual={actual?.id ?? null} />

      {!actual || !resumen ? (
        <Card>
          <Vacio>Todavía no hay eventos.</Vacio>
          <div className="flex justify-center">
            <Link href="/admin/eventos/nuevo" className={boton.primario}>
              Crear el primer evento
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Etiqueta tono={actual.publicado ? "ok" : "void"}>{actual.publicado ? "En la página" : "Fuera de la página"}</Etiqueta>
            <Etiqueta tono={actual.ventasAbiertas ? "ok" : "warn"}>
              {actual.ventasAbiertas ? "Ventas abiertas" : "Ventas cerradas"}
            </Etiqueta>
            <Etiqueta>
              {actual.acceso === "publico" ? "Público" : actual.acceso === "lista" ? "Lista de invitados" : "Palabra clave"}
            </Etiqueta>
            <span className="text-[13px] text-frost/80">
              {formatEventDate(actual.fechaInicio).dia} · {actual.lugar}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Entradas aprobadas" valor={String(resumen.tipos.reduce((a, t) => a + t.vendidas, 0))} />
            <Stat label="Recaudado" valor={formatARS(resumen.recaudado)} />
            <Stat label="Por aprobar" valor={String(resumen.porAprobar)} tono={resumen.porAprobar ? "warn" : undefined} />
            <Stat label="Esperando el pago" valor={String(resumen.esperandoPago)} />
          </dl>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card titulo="Entradas por tipo" id="tipos">
              <ul className="flex flex-col gap-4">
                {resumen.tipos.map((t) => {
                  const pct = t.cupo ? Math.min(100, Math.round((t.ocupadas / t.cupo) * 100)) : 0;
                  return (
                    <li key={t.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-bold">
                          {t.nombre}
                          {!t.enVenta && <span className="ml-2 font-medium text-muted">· no a la venta</span>}
                        </span>
                        <span className="tabular-nums text-muted">
                          <b className="text-ink">{t.vendidas}</b> aprobadas · {t.ocupadas} de {t.cupo} ocupadas
                        </span>
                      </div>
                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-frost"
                        role="img"
                        aria-label={`${t.ocupadas} de ${t.cupo} lugares ocupados`}
                      >
                        <div className="h-full rounded-full bg-blue" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-muted">
                «Ocupadas» suma lo aprobado, lo que espera aprobación y las compras dentro de su plazo para pagar.
              </p>
            </Card>

            <div className="flex min-w-0 flex-col gap-5">
              <Card titulo="Ranking de RRPP" id="ranking">
                {resumen.ranking.length === 0 ? (
                  <Vacio>Todavía no hay ventas aprobadas de RRPP.</Vacio>
                ) : (
                  <ol className="divide-y divide-line">
                    {resumen.ranking.map((r, i) => (
                      <li key={r.nombre} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                        <span>
                          <span className="mr-2 font-bold text-muted tabular-nums">{i + 1}.</span>
                          <b>{r.nombre}</b>
                        </span>
                        <span className="tabular-nums text-muted">
                          {r.entradas} entradas · <b className="text-ink">{formatARS(r.vendido)}</b>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              {(resumen.porAprobar > 0 || accesos.length > 0) && (
                <Card titulo="Para hacer" id="pendientes">
                  <ul className="flex flex-col gap-2 text-sm">
                    {resumen.porAprobar > 0 && (
                      <li>
                        <Link href="/admin/aprobar" className="font-semibold text-blue underline underline-offset-4">
                          {resumen.porAprobar} pedido{resumen.porAprobar === 1 ? "" : "s"} esperando aprobación
                        </Link>
                      </li>
                    )}
                    {accesos.length > 0 && (
                      <li>
                        <Link href="/admin/rrpp" className="font-semibold text-blue underline underline-offset-4">
                          {accesos.length} pedido{accesos.length === 1 ? "" : "s"} de acceso de RRPP
                        </Link>
                      </li>
                    )}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
