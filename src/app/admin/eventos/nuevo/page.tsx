import Link from "next/link";
import { EventoForm } from "@/components/admin/EventoForm";
import { Card, Titulo } from "@/components/admin/ui";

export default function NuevoEventoPage() {
  return (
    <>
      <Titulo extra={<Link href="/admin/eventos" className="text-sm text-ice underline underline-offset-4">Volver a eventos</Link>}>
        Crear evento
      </Titulo>
      <Card>
        <p className="mb-4 text-sm text-muted">
          Se crea como borrador (fuera de la página y con ventas cerradas) con Entrada General y +25. Después
          ajustás tipos, precios, cupos, comisiones y quién puede comprar.
        </p>
        <EventoForm
          inicial={{
            nombre: "",
            subtitulo: "",
            fecha_inicio: "",
            lugar: "",
            direccion: "",
            ciudad: "Oncativo, Córdoba",
            descripcion: "",
            acceso: "publico",
            clave_acceso: "",
            mostrar_rrpp: true,
            portada: "a",
          }}
        />
      </Card>
    </>
  );
}
