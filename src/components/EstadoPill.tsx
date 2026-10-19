/** Etiqueta de estado de un pedido, con los colores de la demo. */
export function EstadoPill({
  status,
  metodo,
  origen,
}: {
  status: string;
  metodo?: string;
  origen?: string;
}) {
  const [texto, clase] = (() => {
    switch (status) {
      case "aprobado":
        return [
          metodo === "efectivo_rrpp" && origen === "rrpp" ? "Efectivo · QR generados" : "Aprobado",
          "bg-[#e5f4ea] text-ok",
        ];
      case "por_confirmar":
        return ["Por aprobar", "bg-[#fdf1e4] text-warn"];
      case "pagado":
        return ["Pagado · por aprobar", "bg-[#fdf1e4] text-warn"];
      case "pendiente_pago":
        return ["Esperando el pago", "bg-frost text-blue"];
      case "rechazado":
        return ["Rechazado", "bg-[#fbe7e5] text-danger"];
      case "vencido":
        return ["Vencido", "bg-[#eceef1] text-void"];
      case "valida":
        return ["Válida", "bg-[#e5f4ea] text-ok"];
      case "usada":
        return ["Usada", "bg-frost text-blue"];
      case "anulada":
        return ["Anulada", "bg-[#eceef1] text-void"];
      default:
        return ["Cancelado", "bg-[#eceef1] text-void"];
    }
  })();
  return (
    <span
      className={`pill-estado inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] ${clase}`}
    >
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
      {texto}
    </span>
  );
}
