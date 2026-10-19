const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatARS(value: number): string {
  return ars.format(value);
}

const TZ = "America/Argentina/Cordoba";

export function formatEventDate(iso: string): { dia: string; hora: string; corta: string } {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(d);
  const hora = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
  const corta = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: TZ,
  })
    .format(d)
    .replace(".", "")
    .toUpperCase();
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), hora, corta };
}

/** Hora en Córdoba, «23:41». */
export function formatHora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

/** Fecha y hora de Córdoba para un <input type="datetime-local">: «2026-12-24T23:59». */
export function aInputFecha(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: TZ,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** Fecha corta con hora: «24/12 23:59». */
export function formatFechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

/** Día de la semana y fecha corta de Córdoba, para la portada: «Jueves 24.12». */
export function formatDiaPortada(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: TZ })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday.charAt(0).toUpperCase()}${p.weekday.slice(1)} ${p.day}.${p.month}`;
}
