import Link from "next/link";
import { borrarInvitadoAdmin, cambiarInvitadoAdmin } from "@/app/actions/admin";
import { Accion } from "@/components/admin/Accion";
import { AgregarInvitado } from "@/components/admin/AgregarInvitado";
import { EventoSelector } from "@/components/admin/EventoSelector";
import { Card, Etiqueta, Titulo, Vacio } from "@/components/admin/ui";
import { getEventoActual, getEventos, getInvitadosEvento } from "@/lib/admin";

export default async function InvitadosAdminPage() {
  const eventos = await getEventos();
  const actual = await getEventoActual(eventos);
  const lista = actual && actual.acceso === "lista" ? await getInvitadosEvento(actual.id) : [];
  const activos = lista.filter((g) => g.activo);

  return (
    <>
      <Titulo
        extra={
          actual?.acceso === "lista" && (
            <p className="text-[13px] text-ice tabular-nums">
              {activos.length} invitados · hasta {activos.reduce((a, g) => a + g.maxEntradas, 0)} entradas
            </p>
          )
        }
      >
        Invitados
      </Titulo>
      <EventoSelector eventos={eventos} actual={actual?.id ?? null} />

      {!actual ? (
        <Card>
          <Vacio>Todavía no hay eventos.</Vacio>
        </Card>
      ) : actual.acceso !== "lista" ? (
        <Card titulo={actual.acceso === "clave" ? "Evento con palabra clave" : "Evento público"} id="acceso">
          <p className="text-sm leading-relaxed text-muted">
            {actual.acceso === "clave" ? (
              <>
                Compra quien sabe la palabra clave: <b className="text-ink">{actual.claveAcceso}</b>. Los RRPP la ven en
                su panel para compartirla.
              </>
            ) : (
              "Compra cualquiera, así que no hay lista de invitados."
            )}{" "}
            Para cambiar quién puede comprar, editá el evento.
          </p>
          <Link
            href={`/admin/eventos/${actual.id}`}
            className="mt-3 inline-block text-sm font-semibold text-blue underline underline-offset-4"
          >
            Editar el evento
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <Card titulo="Invitar desde Nevada" id="nuevo">
            <AgregarInvitado eventId={actual.id} />
          </Card>
          <Card titulo="Lista completa" id="lista">
            <p className="-mt-1 mb-2 text-xs text-muted">Incluye los invitados de todos los RRPP.</p>
            {lista.length === 0 ? (
              <Vacio>Todavía no hay invitados.</Vacio>
            ) : (
              <ul className="divide-y divide-line">
                {lista.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <div className={`min-w-[200px] flex-1 ${g.activo ? "" : "opacity-60"}`}>
                      <p className="flex flex-wrap items-center gap-2 font-bold">
                        {g.nombre}
                        <Etiqueta tono={g.invitadoPor === "Nevada" ? "info" : "ok"}>{g.invitadoPor}</Etiqueta>
                        {!g.activo && <Etiqueta tono="void">Dado de baja</Etiqueta>}
                      </p>
                      <p className="text-[12.5px] text-muted [overflow-wrap:anywhere]">
                        {g.email} · hasta {g.maxEntradas} entrada{g.maxEntradas === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Accion accion={cambiarInvitadoAdmin.bind(null, g.id, !g.activo)}>
                      {g.activo ? "Dar de baja" : "Reactivar"}
                    </Accion>
                    <Accion
                      accion={borrarInvitadoAdmin.bind(null, g.id)}
                      variante="peligro"
                      confirmar={`¿Borrar a ${g.nombre} de la lista?`}
                    >
                      Borrar
                    </Accion>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
