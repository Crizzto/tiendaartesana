import nodemailer from "nodemailer";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mxn = (n) => Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

// Elige el proveedor según las variables de entorno:
//  1) BREVO_API_KEY  -> Brevo (funciona en Render, gratis, sin dominio)
//  2) GMAIL_USER + GMAIL_APP_PASSWORD -> Gmail (funciona en tu PC; Render gratis bloquea SMTP)
export async function sendMail({ to, subject, html }) {
  if (!to) return;
  const fromName = process.env.MAIL_FROM_NAME || "Ko'olel Artesanías";
  if (process.env.BREVO_API_KEY) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: { name: fromName, email: process.env.MAIL_FROM_EMAIL }, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!r.ok) throw new Error("Brevo: " + (await r.text()));
  } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
    await t.sendMail({ from: `"${fromName}" <${process.env.GMAIL_USER}>`, to, subject, html });
  } else {
    console.log("Correo no configurado: no se envió a", to);
  }
}

// order: { id, items:[{name,quantity,price}], shipName, shipCost, total, address, payerEmail }
export function orderHtml(o, forOwner = false) {
  const a = o.address || {};
  const rows = (o.items || []).map((i) => `<tr><td style="padding:6px 0">${esc(i.name)} × ${esc(i.quantity)}</td><td align="right">${mxn(i.price * i.quantity)}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#3a2a1e">
  <h2 style="color:#a8532a">${forOwner ? "Nuevo pedido" : "¡Gracias por tu compra en Ko'olel!"}</h2>
  <p>${forOwner ? "Se recibió un pago." : "Recibimos tu pago y estamos preparando tu pedido."} Número de orden: <b>${esc(o.id)}</b></p>
  <table width="100%" style="border-collapse:collapse;border-top:1px solid #ddd;border-bottom:1px solid #ddd">${rows}
    <tr><td style="padding:6px 0">Envío (${esc(o.shipName)})</td><td align="right">${o.shipCost ? mxn(o.shipCost) : "Gratis"}</td></tr>
    <tr><td style="padding:6px 0"><b>Total</b></td><td align="right"><b>${mxn(o.total)}</b></td></tr></table>
  <h3>Entrega</h3>
  <p>${esc(a.nombre)}<br>${esc(a.calle)}${a.colonia ? ", " + esc(a.colonia) : ""}<br>${esc(a.ciudad)}, ${esc(a.estado)} ${esc(a.cp)}<br>Tel: ${esc(a.telefono)}${a.referencias ? "<br>Referencias: " + esc(a.referencias) : ""}</p>
  ${forOwner ? `<p>Correo del cliente: ${esc(a.email)}<br>Correo de su cuenta PayPal: ${esc(o.payerEmail)}</p><p><b>Recuerda descontar el stock en products.json.</b></p>` : "<p>Te contactaremos por teléfono para coordinar el envío.</p>"}</div>`;
}
