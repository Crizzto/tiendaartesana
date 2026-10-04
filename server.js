import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { q, initSchema } from "./db.js";
import { sendMail, orderHtml } from "./mailer.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// El webhook necesita el cuerpo crudo para verificar la firma de PayPal;
// el resto de rutas usa JSON normal. Debe ir ANTES de express.json().
app.use("/api/paypal/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// ---------- Acceso al panel de administración (usuario y contraseña) ----------
function timingSafeEq(a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [user, pass] = Buffer.from(header.replace("Basic ", ""), "base64").toString().split(":");
  if (process.env.ADMIN_USER && user && pass && timingSafeEq(user, process.env.ADMIN_USER) && timingSafeEq(pass, process.env.ADMIN_PASSWORD || "")) {
    return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Panel Ko\'olel"');
  res.status(401).send("Acceso restringido.");
}

app.get("/admin.html", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use("/api/admin", adminAuth);
app.use(express.static(path.join(__dirname, "public")));

// ================== CATÁLOGO PÚBLICO ==================
app.get("/api/products", async (req, res) => {
  const { rows } = await q("SELECT * FROM products ORDER BY category, name");
  res.json(rows);
});
app.get("/api/shipping", async (req, res) => {
  const { rows } = await q("SELECT * FROM shipping_methods ORDER BY cost");
  res.json(rows);
});
app.get("/api/reviews", async (req, res) => {
  const { rows } = await q("SELECT name, location, product, rating, comment FROM reviews WHERE approved ORDER BY created_at DESC LIMIT 12");
  res.json(rows);
});
app.post("/api/reviews", async (req, res) => {
  try {
    const { name, location, product, rating, comment } = req.body;
    if (!name?.trim() || !comment?.trim() || !(rating >= 1 && rating <= 5)) throw new Error("Faltan datos de la opinión.");
    await q("INSERT INTO reviews (name, location, product, rating, comment) VALUES ($1,$2,$3,$4,$5)",
      [name.slice(0, 80), (location || "").slice(0, 80), (product || "").slice(0, 120), Math.round(rating), comment.slice(0, 600)]);
    res.json({ ok: true }); // queda pendiente de aprobación, no se publica sola
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================== PAYPAL ==================
const PAYPAL_API = process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

async function paypalToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("PayPal rechazó las credenciales: " + JSON.stringify(d));
  return d.access_token;
}

app.get("/api/paypal-client-id", (_, res) => res.json({ clientId: process.env.PAYPAL_CLIENT_ID || null }));

app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { items, shippingId, address } = req.body;
    if (!Array.isArray(items) || !items.length) throw new Error("Carrito vacío");
    const a = address || {};
    if (!["nombre", "telefono", "email", "calle", "ciudad", "estado"].every((k) => String(a[k] || "").trim()) || !/^\S+@\S+\.\S+$/.test(a.email) || !/^\d{5}$/.test(a.cp || ""))
      throw new Error("Dirección incompleta");

    const { rows: products } = await q("SELECT * FROM products WHERE id = ANY($1)", [items.map((i) => i.id)]);
    const { rows: [ship] } = await q("SELECT * FROM shipping_methods WHERE id = $1", [shippingId]);
    if (!ship) throw new Error("Método de envío inválido");

    const orderItems = [];
    const ppItems = items.map(({ id, quantity, color }) => {
      const p = products.find((x) => x.id === id);
      const qty = Math.floor(Number(quantity));
      if (!p || !(qty > 0 && qty <= 20)) throw new Error("Producto inválido");
      if (qty > p.stock) throw new Error(p.stock > 0 ? `Solo quedan ${p.stock} de "${p.name}".` : `"${p.name}" está agotado.`);
      // El color solo se acepta si de verdad es una de las opciones configuradas para ese producto (nadie puede inventarse uno).
      const colorLabel = p.customizable && color ? (p.color_options || []).find((c) => c.label === color)?.label : null;
      const displayName = colorLabel ? `${p.name} (${colorLabel})` : p.name;
      orderItems.push({ id: p.id, name: displayName, quantity: qty, price: Number(p.price), color: colorLabel });
      return { name: displayName.slice(0, 127), quantity: String(qty), unit_amount: { currency_code: "MXN", value: Number(p.price).toFixed(2) } };
    });
    const itemTotal = ppItems.reduce((s, i) => s + Number(i.unit_amount.value) * Number(i.quantity), 0);
    const shipCost = Number(ship.cost);
    const money = (v) => ({ currency_code: "MXN", value: v.toFixed(2) });

    const token = await paypalToken();
    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        application_context: { shipping_preference: "SET_PROVIDED_ADDRESS", locale: "es-MX" },
        purchase_units: [{
          description: `Tel ${a.telefono}. ${a.referencias || ""}`.slice(0, 127),
          items: ppItems,
          amount: { ...money(itemTotal + shipCost), breakdown: { item_total: money(itemTotal), shipping: money(shipCost) } },
          shipping: {
            name: { full_name: a.nombre },
            address: { address_line_1: a.calle.slice(0, 300), address_line_2: (a.colonia || "").slice(0, 300), admin_area_2: a.ciudad, admin_area_1: a.estado, postal_code: a.cp, country_code: "MX" },
          },
        }],
      }),
    });
    const order = await r.json();
    if (!order.id) throw new Error("PayPal no creó la orden: " + JSON.stringify(order));

    await q(
      `INSERT INTO orders (id, status, items, address, ship_name, ship_cost, total)
       VALUES ($1,'pendiente',$2,$3,$4,$5,$6)`,
      [order.id, JSON.stringify(orderItems), JSON.stringify(a), ship.name, shipCost, itemTotal + shipCost]
    );
    res.json({ id: order.id });
  } catch (err) {
    console.error("Error creando orden:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// Se llama tanto desde el navegador (al aprobar el pago) como desde el webhook.
// Es idempotente: si la orden ya estaba marcada como pagada, no repite el correo.
async function markOrderPaid(orderId, payerEmail) {
  const { rows } = await q(
    `UPDATE orders SET status = 'pagado', payer_email = $2, updated_at = now()
     WHERE id = $1 AND status = 'pendiente' RETURNING *`,
    [orderId, payerEmail || null]
  );
  const order = rows[0];
  if (!order) return; // ya estaba pagada o no existe: no se duplica el correo
  try {
    const o = { id: order.id, items: order.items, address: order.address, shipName: order.ship_name, shipCost: Number(order.ship_cost), total: Number(order.total), payerEmail };
    await sendMail({ to: o.address?.email || payerEmail, subject: `Confirmación de tu pedido ${o.id}`, html: orderHtml(o) });
    await sendMail({ to: process.env.OWNER_EMAIL, subject: `Nuevo pedido ${o.id}`, html: orderHtml(o, true) });
    await q("UPDATE orders SET emailed = TRUE WHERE id = $1", [orderId]);
  } catch (e) {
    console.error("No se pudo enviar el correo:", e.message);
  }
}

app.post("/api/paypal/capture-order/:orderID", async (req, res) => {
  try {
    const token = await paypalToken();
    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders/${encodeURIComponent(req.params.orderID)}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const c = await r.json();
    if (c.status === "COMPLETED") await markOrderPaid(c.id, c.payer?.email_address);
    res.json({ status: c.status });
  } catch (err) {
    console.error("Error capturando pago:", err.message);
    res.status(500).json({ error: "No se pudo capturar el pago" });
  }
});

// PayPal llama aquí directamente (servidor a servidor). Es la red de seguridad:
// si el navegador se cierra justo después de pagar, esto igual registra la venta.
app.post("/api/paypal/webhook", async (req, res) => {
  try {
    const token = await paypalToken();
    const verifyRes = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        auth_algo: req.headers["paypal-auth-algo"],
        cert_url: req.headers["paypal-cert-url"],
        transmission_id: req.headers["paypal-transmission-id"],
        transmission_sig: req.headers["paypal-transmission-sig"],
        transmission_time: req.headers["paypal-transmission-time"],
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(req.body.toString()),
      }),
    });
    const verify = await verifyRes.json();
    if (verify.verification_status !== "SUCCESS") { console.error("Webhook con firma inválida"); return res.sendStatus(400); }

    const event = JSON.parse(req.body.toString());
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      const payerEmail = event.resource?.payer?.email_address;
      if (orderId) await markOrderPaid(orderId, payerEmail);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook:", err.message);
    res.sendStatus(500);
  }
});

// ================== PANEL DE ADMINISTRACIÓN (protegido) ==================
app.get("/api/admin/orders", async (req, res) => {
  const { rows } = await q("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
  res.json(rows);
});
app.patch("/api/admin/orders/:id", async (req, res) => {
  const estados = ["pendiente", "pagado", "en_preparacion", "enviado", "entregado", "cancelado"];
  if (!estados.includes(req.body.status)) return res.status(400).json({ error: "Estado inválido" });
  await q("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1", [req.params.id, req.body.status]);
  res.json({ ok: true });
});

app.get("/api/admin/products", async (req, res) => res.json((await q("SELECT * FROM products ORDER BY category, name")).rows));
app.post("/api/admin/products", async (req, res) => {
  try {
    const { id, name, category, price, origin, description, image, stock, season, customizable, color_options, example_gallery } = req.body;
    if (!id?.trim() || !name?.trim() || !(price >= 0)) throw new Error("Faltan datos del producto.");
    await q(`INSERT INTO products (id,name,category,price,origin,description,image,stock,season,customizable,color_options,example_gallery)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
              ON CONFLICT (id) DO UPDATE SET name=$2,category=$3,price=$4,origin=$5,description=$6,image=$7,stock=$8,season=$9,customizable=$10,color_options=$11,example_gallery=$12`,
      [id.trim(), name, category || "", price, origin || "", description || "", image || "", Math.max(0, Math.floor(stock || 0)),
       season?.trim() || null, !!customizable, JSON.stringify(color_options || []), JSON.stringify(example_gallery || [])]);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/admin/products/:id", async (req, res) => { await q("DELETE FROM products WHERE id = $1", [req.params.id]); res.json({ ok: true }); });

app.get("/api/admin/shipping", async (req, res) => res.json((await q("SELECT * FROM shipping_methods ORDER BY cost")).rows));
app.post("/api/admin/shipping", async (req, res) => {
  try {
    const { id, name, detail, cost } = req.body;
    if (!id?.trim() || !name?.trim() || !(cost >= 0)) throw new Error("Faltan datos del envío.");
    await q(`INSERT INTO shipping_methods (id,name,detail,cost) VALUES ($1,$2,$3,$4)
              ON CONFLICT (id) DO UPDATE SET name=$2,detail=$3,cost=$4`, [id.trim(), name, detail || "", cost]);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/admin/shipping/:id", async (req, res) => { await q("DELETE FROM shipping_methods WHERE id = $1", [req.params.id]); res.json({ ok: true }); });

app.get("/api/admin/reviews", async (req, res) => res.json((await q("SELECT * FROM reviews ORDER BY approved, created_at DESC")).rows));
app.patch("/api/admin/reviews/:id", async (req, res) => { await q("UPDATE reviews SET approved = $2 WHERE id = $1", [req.params.id, !!req.body.approved]); res.json({ ok: true }); });
app.delete("/api/admin/reviews/:id", async (req, res) => { await q("DELETE FROM reviews WHERE id = $1", [req.params.id]); res.json({ ok: true }); });

const PORT = process.env.PORT || 3000;
initSchema()
  .then(() => app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`)))
  .catch((err) => {
    console.error("No se pudo preparar la base de datos.");
    console.error("Mensaje:", err?.message || "(vacío)");
    console.error("Código:", err?.code || "(sin código)");
    if (err?.errors?.length) err.errors.forEach((e, i) => console.error(`  causa ${i + 1}:`, e.message || e));
    console.error(err);
    process.exit(1);
  });
