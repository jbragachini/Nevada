import { Escaner } from "@/components/admin/Escaner";
import { EventoSelector } from "@/components/admin/EventoSelector";
import { Card, Titulo, Vacio } from "@/components/admin/ui";
import { getEventoActual, getEventos } from "@/lib/admin";
import { qrConfigurado } from "@/lib/qr";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function PuertaPage() {
  const eventos = await getEventos();
  const actual = await getEventoActual(eventos);
  let resumen = { ingresos: 0, faltan: 0 };
  if (actual) {
    const supabase = await getServerSupabase();
    const { data } = (await supabase?.rpc("admin_puerta_resumen", { p_event_id: actual.id })) ?? { data: null };
    if (data) resumen = data as typeof resumen;
  }

  return (
    <>
      <Titulo>Puerta</Titulo>
      <EventoSelector eventos={eventos} actual={actual?.id ?? null} />
      {!actual ? (
        <Card>
          <Vacio>Todavía no hay eventos.</Vacio>
        </Card>
      ) : !qrConfigurado() ? (
        <Card>
          <Vacio>Falta configurar la firma de los QR (QR_SIGNING_SECRET) en el servidor.</Vacio>
        </Card>
      ) : (
        <Escaner
          key={actual.id}
          eventId={actual.id}
          evento={actual.nombre}
          ingresosIniciales={resumen.ingresos}
          faltanIniciales={resumen.faltan}
        />
      )}
    </>
  );
}
