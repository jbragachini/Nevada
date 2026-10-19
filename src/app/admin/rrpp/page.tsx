import Link from "next/link";
import { editarRrpp } from "@/app/actions/admin";
import { Accion } from "@/components/admin/Accion";
import { AprobarAcceso, TopeInvitados } from "@/components/admin/AccesoForm";
import { Card, Etiqueta, Titulo, Vacio } from "@/components/admin/ui";
import { formatFechaHora } from "@/lib/format";
import { getAccesosPendientes, getRrpps } from "@/lib/admin";

export default async function RrppPage() {
  const [accesos, rrpps] = await Promise.all([getAccesosPendientes(), getRrpps()]);

  return (
    <>
      <Titulo>RRPP y accesos</Titulo>

      <Card titulo="Pedidos de acceso" id="accesos" className="mb-5">
        {accesos.length === 0 ? (
          <Vacio>No hay pedidos de acceso pendientes.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {accesos.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 py-4">
                <div>
                  <p className="font-bold">
                    {a.nombre} <span className="font-medium text-muted">· usuario {a.usuario}</span>
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {a.whatsapp ? `WhatsApp ${a.whatsapp} · ` : ""}pidió acceso el {formatFechaHora(a.creadoEn)}
                  </p>
                </div>
                <AprobarAcceso id={a.id} usuario={a.usuario} nombre={a.nombre} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="RRPP" id="rrpp">
        {rrpps.length === 0 ? (
          <Vacio>Todavía no hay RRPP aprobados.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {rrpps.map((r) => (
              <li key={r.id} className="flex flex-wrap items-end gap-x-5 gap-y-3 py-4">
                <div className="min-w-[200px] flex-1 self-center">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {r.nombre}
                    {!r.activo && <Etiqueta tono="void">Inactivo</Etiqueta>}
                    {r.activo && !r.puedeCargarVentas && <Etiqueta tono="warn">Solo link</Etiqueta>}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {r.usuario ? `usuario ${r.usuario} · ` : "sin usuario · "}link /?rrpp={r.codigo} ·{" "}
                    <Link
                      href={`/admin/ventas?vendedor=${r.id}&alcance=todos`}
                      className="font-semibold text-blue underline underline-offset-4"
                    >
                      Ver ventas
                    </Link>
                  </p>
                </div>
                <TopeInvitados key={`t-${r.maxInvitados}`} id={r.id} tope={r.maxInvitados} nombre={r.nombre} />
                <Accion
                  accion={editarRrpp.bind(null, r.id, { puede_cargar_ventas: !r.puedeCargarVentas })}
                >
                  {r.puedeCargarVentas ? "Quitar carga de ventas" : "Permitir cargar ventas"}
                </Accion>
                <Accion
                  accion={editarRrpp.bind(null, r.id, { activo: !r.activo })}
                  variante={r.activo ? "peligro" : "secundario"}
                  confirmar={
                    r.activo
                      ? `¿Desactivar a ${r.nombre}? Pierde el acceso al instante y sale de «¿Quién te vendió?».`
                      : `¿Reactivar a ${r.nombre}?`
                  }
                >
                  {r.activo ? "Desactivar" : "Reactivar"}
                </Accion>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
