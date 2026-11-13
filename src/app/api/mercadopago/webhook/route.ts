import { NextResponse } from "next/server";
import { consultarPago, firmaValida, mpConfigurado } from "@/lib/mercadopago";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Avisos de Mercado Pago. Se verifica la firma, se consulta el pago en Mercado Pago y la base lo
 * registra (registrar_pago_mp): el pedido pasa a «pagado» y espera la aprobación del admin.
 * Responde 200 a lo que no hay que reintentar y 5xx a lo que sí (Mercado Pago reintenta solo).
 */
export async function POST(request: Request) {
  const supabase = getAdminSupabase();
  if (!mpConfigurado() || !supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const url = new URL(request.url);
  const cuerpo = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string | number } } | null;
  const dataId = url.searchParams.get("data.id") ?? (cuerpo?.data?.id != null ? String(cuerpo.data.id) : null);
  const tipo = url.searchParams.get("type") ?? cuerpo?.type ?? url.searchParams.get("topic");

  if (
    !firmaValida({
      firma: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
    })
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (tipo !== "payment" || !dataId) return NextResponse.json({ ok: true });

  const pago = await consultarPago(dataId);
  if (!pago) return NextResponse.json({ ok: false }, { status: 502 });
  if (!pago.referencia || !/^NEV-\d{6,}$/.test(pago.referencia) || pago.moneda !== "ARS") {
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase.rpc("registrar_pago_mp", {
    p_numero: pago.referencia,
    p_mp_payment_id: pago.id,
    p_monto: pago.monto,
    p_estado: pago.estado,
    p_raw: { id: pago.id, status: pago.estado, monto: pago.monto },
  });
  if (error) {
    // Pedido inexistente: no tiene sentido reintentar. Cualquier otra falla, sí.
    if (error.message.startsWith("NEV:")) return NextResponse.json({ ok: true });
    console.error("registrar_pago_mp:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, resultado: data });
}
