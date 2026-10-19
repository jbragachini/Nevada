import Link from "next/link";
import { notFound } from "next/navigation";
import { estadoEvento } from "@/app/actions/admin";
import { Accion } from "@/components/admin/Accion";
import { EventoForm } from "@/components/admin/EventoForm";
import { TiposEditor } from "@/components/admin/TiposEditor";
import { Card, Etiqueta, Titulo } from "@/components/admin/ui";
import { aInputFecha } from "@/lib/format";
import { getEventos, getTipos } from "@/lib/admin";

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evento = (await getEventos()).find((e) => e.id === id);
  if (!evento) notFound();
  const tipos = await getTipos(id);

  return (
    <>
      <Titulo extra={<Link href="/admin/eventos" className="text-sm text-ice underline underline-offset-4">Volver a eventos</Link>}>
        {evento.nombre}
      </Titulo>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Etiqueta tono={evento.publicado ? "ok" : "void"}>{evento.publicado ? "En la página" : "Borrador"}</Etiqueta>
        <Etiqueta tono={evento.ventasAbiertas ? "ok" : "warn"}>
          {evento.ventasAbiertas ? "Ventas abiertas" : "Ventas cerradas"}
        </Etiqueta>
        <span className="flex-1" />
        <span className="flex flex-wrap gap-2">
          <Accion
            variante="oscuro"
            accion={estadoEvento.bind(null, evento.id, !evento.publicado, null)}
            confirmar={evento.publicado ? "¿Sacar este evento de la página?" : "¿Poner este evento en la página? Reemplaza al actual."}
          >
            {evento.publicado ? "Sacar de la página" : "Poner en la página"}
          </Accion>
          <Accion
            variante="oscuro"
            accion={estadoEvento.bind(null, evento.id, null, !evento.ventasAbiertas)}
            confirmar={evento.ventasAbiertas ? "¿Cerrar las ventas?" : "¿Abrir las ventas?"}
          >
            {evento.ventasAbiertas ? "Cerrar ventas" : "Abrir ventas"}
          </Accion>
        </span>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card titulo="Datos y acceso" id="datos">
          <EventoForm
            id={evento.id}
            inicial={{
              nombre: evento.nombre,
              subtitulo: evento.subtitulo ?? "",
              fecha_inicio: aInputFecha(evento.fechaInicio),
              lugar: evento.lugar,
              direccion: evento.direccion ?? "",
              ciudad: evento.ciudad,
              descripcion: evento.descripcion ?? "",
              acceso: evento.acceso,
              clave_acceso: evento.claveAcceso ?? "",
              mostrar_rrpp: evento.mostrarRrpp,
            }}
          />
        </Card>
        <Card titulo="Tipos de entrada" id="tipos">
          <p className="mb-3 text-xs text-muted">
            La comisión es en pesos por entrada para el RRPP. Un tipo con ventas no se borra: queda «no a la venta».
            El cupo no puede quedar por debajo de lo vendido.
          </p>
          <TiposEditor eventId={evento.id} tipos={tipos} />
        </Card>
      </div>
    </>
  );
}
