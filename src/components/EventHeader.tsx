import { formatEventDate } from "@/lib/format";

/** Nombre, DJ, fecha y lugar del evento, en el encabezado azul del ticket. */
export function EventHeader({
  event,
}: {
  event: { nombre: string; subtitulo: string | null; fechaInicio: string; lugar: string; ciudad: string };
}) {
  const f = formatEventDate(event.fechaInicio);
  return (
    <div>
      <h1 className="display text-[28px] leading-none text-balance sm:text-[32px]">{event.nombre.toUpperCase()}</h1>
      {event.subtitulo && (
        <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.22em] text-ice">
          {event.subtitulo}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 text-left">
        <div className="bg-night/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice">Fecha</p>
          <p className="mt-1 text-sm font-semibold text-white">{f.dia}</p>
          <p className="text-xs text-frost/80">{f.hora} h</p>
        </div>
        <div className="bg-night/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice">Lugar</p>
          <p className="mt-1 text-sm font-semibold text-white">{event.lugar}</p>
          <p className="text-xs text-frost/80">{event.ciudad}</p>
        </div>
      </div>
    </div>
  );
}
