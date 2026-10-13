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
