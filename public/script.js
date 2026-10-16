// Tu número de WhatsApp: 52 + 10 dígitos, sin "+" ni espacios (ej. 529991234567)
const WHATSAPP = "529852578864";

const $ = (s) => document.querySelector(s);
const money = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

let products = [], shipping = [], filter = "Todo";
let cart = load("cart", {});            // { idProducto: cantidad }
let address = load("address", null);    // datos de entrega
let shipId = load("shipId", "estandar");

const requiredOk = () => address && ["nombre", "telefono", "email", "calle", "ciudad", "estado"].every((k) => address[k]?.trim()) && /^\S+@\S+\.\S+$/.test(address.email) && /^\d{5}$/.test(address.cp || "");
const shipCost = () => (shipping.find((s) => s.id === shipId)?.cost ?? 0);
const lines = () => Object.entries(cart).map(([id, qty]) => ({ p: products.find((p) => p.id === id), qty })).filter((l) => l.p);
// Máximo que se puede comprar de una pieza (usa "stock" de products.json; sin stock = hasta 20)
const maxQty = (p) => (Number.isFinite(p.stock) ? Math.max(0, p.stock) : 20);
const subtotal = () => lines().reduce((s, l) => s + l.p.price * l.qty, 0);

async function init() {
  [products, shipping] = await Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/shipping").then((r) => r.json())]);
  cleanCart(); setupWhatsapp(); renderFilters(); renderCatalog(); renderShipping(); fillForm(); renderCart(); setupPaypal(); loadReviews();
}

// Ajusta un carrito guardado si cambió el stock o se quitó un producto
function cleanCart() {
  for (const id of Object.keys(cart)) {
    const p = products.find((x) => x.id === id);
    if (!p || maxQty(p) === 0) delete cart[id];
    else cart[id] = Math.min(cart[id], maxQty(p));
  }
  localStorage.setItem("cart", JSON.stringify(cart));
}

function waLink(ls, sub, sc) {
  const s = shipping.find((x) => x.id === shipId);
  const txt = ls.length
    ? `Hola, quiero hacer un pedido:\n${ls.map(({ p, qty }) => `• ${qty} × ${p.name} (${money(p.price * qty)})`).join("\n")}\nEnvío: ${s?.name} (${sc ? money(sc) : "gratis"})\nTotal: ${money(sub + sc)}\n¿Cómo puedo pagar?`
    : "Hola, me interesa conocer sus artesanías.";
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;
}
function setupWhatsapp() { $("#wa-float").href = $("#wa-footer").href = waLink([], 0, 0); }

function renderFilters() {
  const cats = ["Todo", ...new Set(products.map((p) => p.category))];
  $("#filters").innerHTML = cats.map((c) => `<button class="chip ${c === filter ? "on" : ""}" data-c="${c}">${c}</button>`).join("");
  $("#filters").onclick = (e) => { if (e.target.dataset.c) { filter = e.target.dataset.c; renderFilters(); renderCatalog(); } };
}

function renderCatalog() {
  $("#catalog").innerHTML = products.filter((p) => filter === "Todo" || p.category === filter).map((p) => `
    <article class="card ${maxQty(p) === 0 ? "sold" : ""}">
      <div class="im"><img src="${p.image}" alt="${p.name}" loading="lazy"></div>
      <div class="b">
        <span class="origin">${p.origin}</span><h3>${p.name}</h3><p class="muted">${p.description}</p>
        ${Number.isFinite(p.stock) && p.stock > 0 && p.stock <= 3 ? `<span class="low">Quedan ${p.stock}</span>` : ""}
        <div class="row"><span class="price">${money(p.price)}</span>${maxQty(p) > 0 ? `<button class="btn sm" data-add="${p.id}">Agregar</button>` : `<button class="btn sm" disabled>Agotado</button>`}</div>
      </div>
    </article>`).join("");
}
$("#catalog").onclick = (e) => {
  const id = e.target.dataset.add; if (!id) return;
  const p = products.find((x) => x.id === id);
  if ((cart[id] || 0) < maxQty(p)) { cart[id] = (cart[id] || 0) + 1; $("#msg").textContent = ""; }
  else $("#msg").textContent = `Solo hay ${maxQty(p)} disponible(s) de "${p.name}".`;
  saveCart(); openCart();
};

function renderShipping() {
  $("#ship-options").innerHTML = shipping.map((s) => `
    <label class="${s.id === shipId ? "on" : ""}"><input type="radio" name="ship" value="${s.id}" ${s.id === shipId ? "checked" : ""}>
      <div><b>${s.name}</b><small>${s.detail}</small></div><span class="price">${s.cost ? money(s.cost) : "Gratis"}</span></label>`).join("");
}
$("#ship-options").onchange = (e) => { shipId = e.target.value; localStorage.setItem("shipId", JSON.stringify(shipId)); renderShipping(); renderCart(); };

function fillForm() {
  if (!address) return;
  for (const [k, v] of Object.entries(address)) { const el = $(`#addr-form [name=${k}]`); if (el) el.value = v; }
}
$("#addr-form").onsubmit = (e) => {
  e.preventDefault();
  address = Object.fromEntries(new FormData(e.target).entries());
  localStorage.setItem("address", JSON.stringify(address));
  renderCart(); openCart();
};

function saveCart() { localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); }

function renderCart() {
  const ls = lines(), sub = subtotal(), sc = ls.length ? shipCost() : 0;
  $("#cart-count").textContent = ls.reduce((s, l) => s + l.qty, 0);
  $("#items").innerHTML = ls.length ? ls.map(({ p, qty }) => `
    <div class="line"><img src="${p.image}" alt=""><div><b>${p.name}</b><div class="muted">${money(p.price)}</div>
      <div class="qty"><button data-q="${p.id}" data-d="-1">−</button><span>${qty}</span><button data-q="${p.id}" data-d="1">+</button><button class="rm" data-rm="${p.id}">Eliminar</button></div>
    </div></div>`).join("") + `<div class="box"><b>Entrega</b><p class="muted" id="addr-sum"></p></div>` : `<p class="muted">Aún no has agregado piezas. Explora la tienda y elige tu favorita.</p>`;
  const sum = $("#addr-sum");
  if (sum) requiredOk() ? (sum.textContent = `${address.nombre} · ${address.calle}${address.colonia ? ", " + address.colonia : ""} · ${address.ciudad}, ${address.estado} ${address.cp}`)
    : (sum.innerHTML = `Completa tu <a href="#entrega" id="go-addr">dirección de entrega</a> para poder pagar.`);
  $("#t-sub").textContent = money(sub);
  $("#t-ship").textContent = sc ? money(sc) : "Gratis";
  $("#t-total").textContent = money(sub + sc);
  $("#wa-order").href = waLink(ls, sub, sc);
}
$("#items").onclick = (e) => {
  const d = e.target.dataset;
  if (d.q) {
    const p = products.find((x) => x.id === d.q), n = (cart[d.q] || 0) + Number(d.d);
    if (n <= 0) delete cart[d.q]; else if (n <= maxQty(p)) cart[d.q] = n; else $("#msg").textContent = `Solo hay ${maxQty(p)} disponible(s) de esta pieza.`;
    saveCart();
  }
  if (d.rm) { delete cart[d.rm]; saveCart(); }
  if (e.target.id === "go-addr") closeCart();
};

const openCart = () => { $("#drawer").classList.add("on"); $("#veil").classList.add("on"); };
const closeCart = () => { $("#drawer").classList.remove("on"); $("#veil").classList.remove("on"); };
$("#open-cart").onclick = openCart; $("#close-cart").onclick = closeCart; $("#veil").onclick = closeCart;

// ---- PayPal ----
async function setupPaypal() {
  try {
    const { clientId } = await fetch("/api/paypal-client-id").then((r) => r.json());
    if (!clientId) { $("#msg").textContent = "El pago con PayPal aún no está configurado."; return; }
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=MXN`;
    s.onload = renderPaypal;
    document.body.appendChild(s);
  } catch (err) { console.error(err); }
}

// Evita clics dobles y muestra "Procesando..." mientras se crea o confirma el pago
function setBusy(on) {
  $("#paypal-btn").style.pointerEvents = on ? "none" : "";
  $("#paypal-btn").style.opacity = on ? ".5" : "";
  $("#msg").className = on ? "info" : "";
  $("#msg").textContent = on ? "Procesando, no cierres esta ventana..." : "";
}

function renderPaypal() {
  paypal.Buttons({
    style: { color: "gold", shape: "pill", height: 45 },
    onClick: (_, actions) => {
      $("#msg").textContent = "";
      if (!lines().length) { $("#msg").textContent = "Tu carrito está vacío."; return actions.reject(); }
      if (!requiredOk()) { $("#msg").textContent = "Completa tu dirección de entrega antes de pagar."; return actions.reject(); }
      return actions.resolve();
    },
    createOrder: async () => {
      setBusy(true);
      try {
        const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
        const res = await fetch("/api/paypal/create-order", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, shippingId: shipId, address }),
        });
        const data = await res.json();
        if (!data.id) throw new Error(data.error || "No se pudo crear la orden.");
        setBusy(false);
        return data.id;
      } catch (e) {
        setBusy(false);
        $("#msg").textContent = e.message === "Failed to fetch" ? "Error de conexión. Intenta de nuevo." : e.message;
        throw e;
      }
    },
    onApprove: async (data) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/paypal/capture-order/${data.orderID}`, { method: "POST" });
        const out = await res.json();
        if (out.status !== "COMPLETED") throw new Error("no completado");
        localStorage.removeItem("cart");
        location.href = "success.html";
      } catch {
        setBusy(false);
        $("#msg").textContent = "No pudimos confirmar tu pago. Si ves un cobro, escríbenos por WhatsApp.";
      }
    },
    onCancel: () => setBusy(false),
    onError: (err) => {
      console.error(err);
      if (!$("#msg").textContent || $("#msg").className === "info") { setBusy(false); $("#msg").textContent = "Ocurrió un error con PayPal. Intenta de nuevo."; }
    },
  }).render("#paypal-btn");
}

async function loadReviews() {
  try {
    const reviews = await fetch("/api/reviews").then((r) => r.json());
    $("#reviews-grid").innerHTML = reviews.length ? reviews.map((r) => `
      <figure class="card"><div class="b"><span class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        <blockquote>"${r.comment.replace(/</g, "&lt;")}"</blockquote>
        <p><b>${r.name}</b>${r.location ? `<br><small class="muted">${r.location}${r.product ? " · " + r.product : ""}</small>` : ""}</p>
      </div></figure>`).join("") : "<p class=\"muted\">Sé la primera persona en dejar tu opinión.</p>";
  } catch (e) { console.error(e); }
}

$("#review-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = $("#review-msg");
  try {
    const res = await fetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), location: f.get("location"), product: f.get("product"), rating: Number(f.get("rating")), comment: f.get("comment") }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    e.target.reset();
    msg.textContent = "¡Gracias! Tu opinión se publicará en cuanto la revisemos.";
    msg.style.color = "var(--accent)";
  } catch (err) { msg.textContent = err.message || "No se pudo enviar tu opinión."; msg.style.color = "#c0392b"; }
};

init();
