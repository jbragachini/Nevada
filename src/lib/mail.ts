import "server-only";
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { mailConfigurado } from "@/lib/contacto";
import { formatARS, formatEventDate } from "@/lib/format";
import { tokenDelPedido, tokenSecretConfigured } from "@/lib/pedido-token";
import { codigoCorto, contenidoQr, qrConfigurado } from "@/lib/qr";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Mails del comprador (Resend). Tres avisos: pedido recibido (con el link para pagar y seguirlo),
 * entradas (un mail por persona, con sus QR) y pedido rechazado. Cada envío queda en email_log.
 * Sin RESEND_API_KEY no se manda nada: las entradas se ven en el link del pedido.
 */

type Tipo = "entradas" | "reenvio" | "pedido_recibido" | "pedido_rechazado";
type Adjunto = { filename: string; content: string; content_id: string };

type PedidoMail = {
  id: string;
  numero: string;
  comprador_nombre: string;
  comprador_email: string;
  total: number;
  status: string;
  motivo_rechazo: string | null;
  idempotency_key: string;
  events: { nombre: string; fecha_inicio: string; lugar: string; ciudad: string } | null;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Marco común: encabezado azul noche con la marca, cuerpo blanco y pie. Tablas, para que se vea igual en todos los correos. */
function marco(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#061a36;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#061a36;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td align="center" style="padding:8px 0 20px;color:#a9dcff;font-size:13px;letter-spacing:6px;font-weight:bold;">NEVADA PRODUCCIONES</td></tr>
<tr><td style="background:#ffffff;border-radius:20px;padding:28px 24px;color:#0b2340;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;color:#061a36;">${titulo}</h1>
${cuerpo}
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;color:#a9dcff;font-size:12px;line-height:1.5;">Nevada Producciones · Oncativo, Córdoba<br>Este mail se envió porque se hizo un pedido con esta dirección.</td></tr>
</table>
</td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0b2340;">${html}</p>`;
const boton = (href: string, texto: string) =>
  `<p style="margin:22px 0 6px;text-align:center;"><a href="${esc(href)}" style="display:inline-block;background:#0c3466;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 26px;border-radius:999px;">${esc(texto)}</a></p>`;

function evento(o: PedidoMail): string {
  if (!o.events) return "";
  const f = formatEventDate(o.events.fecha_inicio);
  return `<p style="margin:0 0 18px;padding:12px 14px;background:#eef6fd;border-radius:12px;font-size:14px;line-height:1.5;color:#0b2340;"><b>${esc(o.events.nombre)}</b><br>${esc(f.dia)} · ${esc(f.hora)} h<br>${esc(o.events.lugar)} · ${esc(o.events.ciudad)}</p>`;
}

async function enviar(input: {
  tipo: Tipo;
  orderId: string;
  para: string;
  asunto: string;
  html: string;
  texto: string;
  adjuntos?: Adjunto[];
  /** Los reenvíos manuales no llevan clave: se mandan siempre. */
  unaSolaVez: boolean;
}): Promise<boolean> {
  const supabase = getAdminSupabase();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!supabase || !key || !from) return false;

  const { data: fila } = await supabase
    .from("email_log")
    .insert({ order_id: input.orderId, tipo: input.tipo, destinatario: input.para })
    .select("id")
    .single();
  const marcar = (campos: Record<string, unknown>) =>
    fila ? supabase.from("email_log").update(campos).eq("id", fila.id) : Promise.resolve();

  try {
    const base = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "");
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    if (input.unaSolaVez) {
      // Si la acción se repite (doble click, reintento), Resend no manda el mismo mail dos veces.
      headers["Idempotency-Key"] = createHash("sha256").update(`${input.tipo}:${input.orderId}:${input.para}`).digest("hex");
    }
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to: [input.para],
        subject: input.asunto,
        html: input.html,
        text: input.texto,
        attachments: input.adjuntos,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const cuerpo = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) throw new Error(`Resend ${res.status}: ${cuerpo?.message ?? "sin detalle"}`);
    await marcar({ status: "enviado", proveedor_id: cuerpo?.id ?? null, enviado_en: new Date().toISOString() });
    return true;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("mail:", input.tipo, error);
    await marcar({ status: "fallido", error: error.slice(0, 500) });
    return false;
  }
}

async function leerPedido(por: { id: string } | { tokenHash: string }): Promise<PedidoMail | null> {
  const supabase = getAdminSupabase();
  if (!supabase) return null;
  const q = supabase
    .from("orders")
    .select("id,numero,comprador_nombre,comprador_email,total,status,motivo_rechazo,idempotency_key,events(nombre,fecha_inicio,lugar,ciudad)");
  const { data, error } = await ("id" in por ? q.eq("id", por.id) : q.eq("token_hash", por.tokenHash)).maybeSingle();
  if (error) console.error("mail: pedido:", error.message);
  return (data as unknown as PedidoMail | null) ?? null;
}

function link(o: PedidoMail): string | null {
  return tokenSecretConfigured() ? `${sitio()}/pedido/${tokenDelPedido(o.idempotency_key)}` : null;
}

/** Al crear el pedido web: el link privado, para volver a pagar o a ver el estado. */
export async function mailPedidoRecibido(tokenHash: string): Promise<void> {
  if (!mailConfigurado()) return;
  const o = await leerPedido({ tokenHash });
  const url = o && link(o);
  if (!o || !url || o.status !== "pendiente_pago") return;
  await enviar({
    tipo: "pedido_recibido",
    orderId: o.id,
    para: o.comprador_email,
    asunto: `Tu pedido ${o.numero} · falta el pago`,
    unaSolaVez: true,
    html: marco(
      "Recibimos tu pedido",
      p(`Hola ${esc(o.comprador_nombre)}: tu pedido <b>${esc(o.numero)}</b> por <b>${esc(formatARS(o.total))}</b> está reservado.`) +
        evento(o) +
        p("Para terminar, entrá a tu pedido, hacé el pago y subí el comprobante. Cuando lo aprobemos te mandamos las entradas a este mail.") +
        boton(url, "Ver mi pedido y pagar") +
        p(`<span style="font-size:13px;color:#4a6382;">Guardá este mail: el link es privado y te deja ver tu pedido cuando quieras.</span>`),
    ),
    texto: `Hola ${o.comprador_nombre}: recibimos tu pedido ${o.numero} por ${formatARS(o.total)}.\nPara terminar, entrá a tu pedido, hacé el pago y subí el comprobante:\n${url}\n\nNevada Producciones`,
  });
}

/** Al aprobar (o al vender en efectivo): un mail por persona con sus entradas y sus QR. */
export async function mailEntradas(orderId: string, reenvio = false): Promise<{ enviados: number; fallidos: number }> {
  const resultado = { enviados: 0, fallidos: 0 };
  const supabase = getAdminSupabase();
  if (!mailConfigurado() || !qrConfigurado() || !supabase) return resultado;
  const o = await leerPedido({ id: orderId });
  if (!o || o.status !== "aprobado") return resultado;

  const { data: entradas, error } = await supabase
    .from("tickets")
    .select("titular_nombre,titular_email,qr_token,status,ticket_types(nombre)")
    .eq("order_id", orderId)
    .eq("status", "valida")
    .order("emitido_en", { ascending: true });
  if (error || !entradas?.length) {
    if (error) console.error("mail: entradas:", error.message);
    return resultado;
  }

  type Fila = { titular_nombre: string; titular_email: string; qr_token: string; ticket_types: { nombre: string } | null };
  const porMail = new Map<string, Fila[]>();
  for (const e of entradas as unknown as Fila[]) {
    const k = e.titular_email.toLowerCase();
    porMail.set(k, [...(porMail.get(k) ?? []), e]);
  }
  const url = link(o);

  for (const [para, suyas] of porMail) {
    const adjuntos: Adjunto[] = [];
    let bloques = "";
    for (const [i, e] of suyas.entries()) {
      const png = await QRCode.toBuffer(contenidoQr(e.qr_token), { errorCorrectionLevel: "M", margin: 2, width: 440 });
      const cid = `qr${i + 1}`;
      adjuntos.push({ filename: `entrada-${i + 1}.png`, content: png.toString("base64"), content_id: cid });
      bloques += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #d5e3f1;border-radius:16px;"><tr><td align="center" style="padding:18px 14px;">
<p style="margin:0;font-size:17px;font-weight:bold;color:#061a36;text-transform:uppercase;">${esc(e.titular_nombre)}</p>
<p style="margin:4px 0 12px;font-size:13px;color:#4a6382;">${esc(e.ticket_types?.nombre ?? "Entrada")} · entrada ${i + 1} de ${suyas.length}</p>
<img src="cid:${cid}" width="220" height="220" alt="Código QR de la entrada de ${esc(e.titular_nombre)}" style="display:block;border:0;">
<p style="margin:12px 0 0;font-size:13px;color:#4a6382;">Código <b style="font-family:monospace;letter-spacing:2px;color:#061a36;">${esc(codigoCorto(e.qr_token))}</b></p>
</td></tr></table>`;
    }
    const n = suyas.length;
    const ok = await enviar({
      tipo: reenvio ? "reenvio" : "entradas",
      orderId: o.id,
      para,
      asunto: `${n === 1 ? "Tu entrada" : `Tus ${n} entradas`} · ${o.events?.nombre ?? "Nevada Producciones"}`,
      unaSolaVez: !reenvio,
      adjuntos,
      html: marco(
        n === 1 ? "¡Tu entrada está lista!" : "¡Tus entradas están listas!",
        p(`Pedido <b>${esc(o.numero)}</b>. Mostrá ${n === 1 ? "este QR" : "cada QR"} en la puerta, desde el celular o impreso. Cada QR sirve para una sola persona y un solo ingreso.`) +
          evento(o) +
          bloques +
          (url ? boton(url, "Ver mis entradas en la web") : "") +
          p(`<span style="font-size:13px;color:#4a6382;">No compartas ${n === 1 ? "el QR" : "los QR"}: quien lo muestre primero es quien entra.</span>`),
      ),
      texto: `Pedido ${o.numero}. ${n === 1 ? "Tu entrada está lista" : `Tus ${n} entradas están listas`}.\n${suyas.map((e, i) => `Entrada ${i + 1}: ${e.titular_nombre} · código ${codigoCorto(e.qr_token)}`).join("\n")}${url ? `\n\nVer las entradas con su QR: ${url}` : ""}\n\nNevada Producciones`,
    });
    if (ok) resultado.enviados++;
    else resultado.fallidos++;
  }
  return resultado;
}

/** Al rechazar un pedido web: el aviso, con el motivo si el admin lo escribió. */
export async function mailPedidoRechazado(orderId: string): Promise<void> {
  if (!mailConfigurado()) return;
  const o = await leerPedido({ id: orderId });
  if (!o || o.status !== "rechazado") return;
  await enviar({
    tipo: "pedido_rechazado",
    orderId: o.id,
    para: o.comprador_email,
    asunto: `Tu pedido ${o.numero} no fue aprobado`,
    unaSolaVez: true,
    html: marco(
      "No pudimos aprobar tu pedido",
      p(`Hola ${esc(o.comprador_nombre)}: revisamos tu pedido <b>${esc(o.numero)}</b> y no lo pudimos aprobar.`) +
        (o.motivo_rechazo ? p(`<b>Motivo:</b> ${esc(o.motivo_rechazo)}`) : "") +
        p("Si creés que es un error, respondé este mail o escribinos con tu número de pedido.") +
        boton(sitio(), "Volver a las entradas"),
    ),
    texto: `Hola ${o.comprador_nombre}: revisamos tu pedido ${o.numero} y no lo pudimos aprobar.${o.motivo_rechazo ? `\nMotivo: ${o.motivo_rechazo}` : ""}\nSi creés que es un error, respondé este mail.\n\nNevada Producciones`,
  });
}
