import Link from "next/link";
import { duplicarEvento, eliminarEvento, estadoEvento } from "@/app/actions/admin";
import { Accion } from "@/components/admin/Accion";
import { Card, Etiqueta, Titulo, Vacio, boton } from "@/components/admin/ui";
import { formatEventDate } from "@/lib/format";
import { getEventos } from "@/lib/admin";

export default async function EventosPage() {
  const eventos = await getEventos();

  return (
    <>
      <Titulo
        extra={
          <Link href="/admin/eventos/nuevo" className={boton.claro}>
            Crear evento
          </Link>
        }
      >
        Eventos
      </Titulo>

      {eventos.length === 0 ? (
        <Card>
          <Vacio>Todavía no hay eventos.</Vacio>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {eventos.map((e) => {
            const f = formatEventDate(e.fechaInicio);
            return (
              <li key={e.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="display text-[19px] text-deep">{e.nombre}</h2>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {f.dia} · {f.hora} h · {e.lugar}
                        {e.subtitulo ? ` · ${e.subtitulo}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Etiqueta tono={e.publicado ? "ok" : "void"}>{e.publicado ? "En la página" : "Borrador"}</Etiqueta>
                      <Etiqueta tono={e.ventasAbiertas ? "ok" : "warn"}>
                        {e.ventasAbiertas ? "Ventas abiertas" : "Ventas cerradas"}
                      </Etiqueta>
                      {e.acceso !== "publico" && (
                        <Etiqueta>{e.acceso === "lista" ? "Lista de invitados" : "Palabra clave"}</Etiqueta>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Link href={`/admin/eventos/${e.id}`} className={boton.primario}>
                      Editar
                    </Link>
                    <Accion
                      accion={estadoEvento.bind(null, e.id, !e.publicado, null)}
                      confirmar={
                        e.publicado
                          ? `¿Sacar «${e.nombre}» de la página? La página va a quedar sin evento.`
                          : `¿Poner «${e.nombre}» en la página? Reemplaza al evento que está ahora.`
                      }
                    >
                      {e.publicado ? "Sacar de la página" : "Poner en la página"}
                    </Accion>
                    <Accion
                      accion={estadoEvento.bind(null, e.id, null, !e.ventasAbiertas)}
                      confirmar={e.ventasAbiertas ? `¿Cerrar las ventas de «${e.nombre}»?` : `¿Abrir las ventas de «${e.nombre}»?`}
                    >
                      {e.ventasAbiertas ? "Cerrar ventas" : "Abrir ventas"}
                    </Accion>
                    <Accion accion={duplicarEvento.bind(null, e.id)} pendiente="Duplicando…">
                      Duplicar
                    </Accion>
                    <Accion
                      accion={eliminarEvento.bind(null, e.id)}
                      variante="peligro"
                      confirmar={`¿Eliminar «${e.nombre}»? Solo se puede si no tiene ventas. No se puede deshacer.`}
                      pendiente="Eliminando…"
                    >
                      Eliminar
                    </Accion>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
