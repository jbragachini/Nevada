import { Card, Titulo, Vacio } from "@/components/admin/ui";
import { formatFechaHora } from "@/lib/format";
import { getAuditoria } from "@/lib/admin";

const ACCIONES: Record<string, string> = {
  evento_creado: "Creó un evento",
  evento_editado: "Editó un evento",
  evento_estado: "Cambió página o ventas",
  evento_duplicado: "Duplicó un evento",
  evento_eliminado: "Eliminó un evento",
  tipo_creado: "Agregó un tipo de entrada",
  tipo_editado: "Editó un tipo de entrada",
  tipo_borrado: "Borró un tipo de entrada",
  tipo_sin_venta: "Sacó un tipo de la venta",
  pedido_aprobado: "Aprobó un pedido",
  pedido_rechazado: "Rechazó un pedido",
  entrada_anulada: "Anuló una entrada",
  acceso_aprobado: "Aprobó un acceso de RRPP",
  acceso_rechazado: "Rechazó un acceso de RRPP",
  rrpp_editado: "Editó un RRPP",
  comision_pagada: "Pagó una comisión",
  rendicion_registrada: "Registró una rendición",
  venta_rrpp_cargada: "Cargó una venta",
};

export default async function AuditoriaPage() {
  const filas = await getAuditoria();
  return (
    <>
      <Titulo extra={<p className="text-[13px] text-ice">Nadie la puede modificar ni borrar</p>}>Auditoría</Titulo>
      <Card>
        {filas.length === 0 ? (
          <Vacio>Todavía no hay movimientos.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {filas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-[12.5px] text-muted tabular-nums">{formatFechaHora(f.fecha)}</span>
                <span className="min-w-[200px] flex-1">
                  <b>{f.actor}</b> · {ACCIONES[f.accion] ?? f.accion}
                  {f.detalle && <span className="block text-[12.5px] text-muted">{f.detalle}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
