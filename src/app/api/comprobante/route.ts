import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { BUCKET_COMPROBANTES, MAX_COMPROBANTE, tipoDeComprobante } from "@/lib/comprobante";
import { hashDelToken, TOKEN_RE } from "@/lib/pedido-token";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * El comprador sube el comprobante de su transferencia desde el link privado del pedido.
 * Se controla el archivo (tipo real y tamaño), se guarda en el Storage privado y la base lo
 * registra: el pedido pasa a «por confirmar». El mismo archivo no se acepta en dos pedidos.
 */
export const runtime = "nodejs";

type Respuesta = { ok: true } | { ok: false; error: string };

const responder = (r: Respuesta, status = 200) => NextResponse.json(r, { status });

export async function POST(req: Request) {
  const supabase = getAdminSupabase();
  if (!supabase) return responder({ ok: false, error: "La compra todavía no está habilitada." }, 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return responder({ ok: false, error: "No pudimos recibir el archivo. Probá de nuevo." }, 400);
  }
  const token = String(form.get("token") ?? "");
  const archivo = form.get("archivo");
  if (!TOKEN_RE.test(token)) return responder({ ok: false, error: "El link del pedido no es válido." }, 400);
  if (!(archivo instanceof Blob) || archivo.size === 0) {
    return responder({ ok: false, error: "Elegí la foto o el PDF del comprobante." }, 400);
  }
  if (archivo.size > MAX_COMPROBANTE) {
    return responder({ ok: false, error: "El archivo pesa más de 5 MB. Probá con una captura de pantalla." }, 413);
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoDeComprobante(bytes);
  if (!tipo) return responder({ ok: false, error: "Subí una foto, una captura o un PDF del comprobante." }, 415);

  const tokenHash = hashDelToken(token);
  const { data: pedido } = await supabase
    .from("orders")
    .select("id,status")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!pedido) return responder({ ok: false, error: "No encontramos ese pedido." }, 404);
  if (pedido.status === "por_confirmar") return responder({ ok: false, error: "Ya recibimos tu comprobante." }, 409);
  if (pedido.status !== "pendiente_pago" && pedido.status !== "vencido") {
    return responder({ ok: false, error: "Este pedido ya no espera un pago." }, 409);
  }

  const sha = createHash("sha256").update(bytes).digest("hex");
  const path = `${pedido.id}/${sha.slice(0, 16)}.${tipo.ext}`;
  const subir = () =>
    supabase.storage.from(BUCKET_COMPROBANTES).upload(path, bytes, { contentType: tipo.tipo, upsert: true });

  let { error: errSubida } = await subir();
  if (errSubida && /not.?found/i.test(errSubida.message)) {
    // Primera vez: se crea el lugar privado para los comprobantes.
    await supabase.storage.createBucket(BUCKET_COMPROBANTES, { public: false, fileSizeLimit: MAX_COMPROBANTE });
    ({ error: errSubida } = await subir());
  }
  if (errSubida) {
    console.error("comprobante (storage):", errSubida.message);
    return responder({ ok: false, error: "No pudimos guardar el comprobante. Probá de nuevo en un momento." }, 502);
  }

  const { error } = await supabase.rpc("registrar_comprobante", {
    p_token_hash: tokenHash,
    p_path: path,
    p_sha256: sha,
    p_tipo: tipo.tipo,
  });
  if (error) {
    await supabase.storage.from(BUCKET_COMPROBANTES).remove([path]);
    switch (error.message) {
      case "NEV:comprobante_repetido":
        return responder({ ok: false, error: "Este comprobante ya se usó en otro pedido. Subí el de tu transferencia." }, 409);
      case "NEV:ya_enviado":
        return responder({ ok: false, error: "Ya recibimos tu comprobante." }, 409);
      case "NEV:sin_cupo":
        return responder(
          { ok: false, error: "Se venció tu reserva y ya no quedan esas entradas. Escribinos por Instagram con tu número de pedido." },
          409,
        );
      default:
        console.error("registrar_comprobante:", error.message);
        return responder({ ok: false, error: "No pudimos registrar el comprobante. Probá de nuevo en un momento." }, 500);
    }
  }
  return responder({ ok: true });
}
