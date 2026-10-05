// Tu número de WhatsApp: 52 + 10 dígitos, sin "+" ni espacios (ej. 529991234567)
const WHATSAPP = "529991234567";

const $ = (s) => document.querySelector(s);
const money = (n) => Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

let products = [], shipping = [], catFilter = "Todo", seasonFilter = "Todo";
// El carrito guarda líneas por clave "idProducto" o "idProducto::colorElegido" (para poder
// tener la misma pieza en dos colores distintos como renglones separados).
let cart = load("cart", {});
let address = load("address", null);
let shipId = load("shipId", "estandar");

const keyOf = (id, color) => (color ? `${id}::${encodeURIComponent(color)}` : id);
const baseIdOf = (key) => key.split("::")[0];
const colorOf = (key) => (key.includes("::") ? decodeURIComponent(key.split("::")[1]) : null);

const requiredOk = () => address && ["nombre", "telefono", "email", "calle", "ciudad", "estado"].every((k) => address[k]?.trim()) && /^\S+@\S+\.\S+$/.test(address.email) && /^\d{5}$/.test(address.cp || "");
const shipCost = () => Number(shipping.find((s) => s.id === shipId)?.cost ?? 0);
const lines = () => Object.entries(cart).map(([key, qty]) => ({ key, p: products.find((p) => p.id === baseIdOf(key)), color: colorOf(key), qty })).filter((l) => l.p);
// Máximo por producto (comparte stock entre todos sus colores; una pieza artesanal es la misma sin importar el tinte elegido)
const maxQty = (p) => (Number.isFinite(p.stock) ? Math.max(0, p.stock) : 20);
const qtyInCartFor = (id, excludeKey) => Object.entries(cart).reduce((s, [k, q]) => (baseIdOf(k) === id && k !== excludeKey ? s + q : s), 0);
const subtotal = () => lines().reduce((s, l) => s + l.p.price * l.qty, 0);

async function init() {
  [products, shipping] = await Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/shipping").then((r) => r.json())]);
  cleanCart(); setupWhatsapp(); renderFilters(); renderCatalog(); renderShipping(); fillForm(); renderCart(); setupPaypal(); loadReviews();
}

// Ajusta un carrito guardado si cambió el stock o se quitó un producto
function cleanCart() {
  for (const id of new Set(Object.keys(cart).map(baseIdOf))) {
    const p = products.find((x) => x.id === id);
    const keys = Object.keys(cart).filter((k) => baseIdOf(k) === id);
    if (!p || maxQty(p) === 0) { keys.forEach((k) => delete cart[k]); continue; }
    let total = keys.reduce((s, k) => s + cart[k], 0), over = total - maxQty(p);
    for (const k of keys) { if (over <= 0) break; const cut = Math.min(cart[k], over); cart[k] -= cut; over -= cut; if (cart[k] <= 0) delete cart[k]; }
  }
  localStorage.setItem("cart", JSON.stringify(cart));
}

function waLink(ls, sub, sc) {
  const s = shipping.find((x) => x.id === shipId);
  const txt = ls.length
    ? `Hola, quiero hacer un pedido:\n${ls.map(({ p, qty, color }) => `• ${qty} × ${p.name}${color ? ` (${color})` : ""} (${money(p.price * qty)})`).join("\n")}\nEnvío: ${s?.name} (${sc ? money(sc) : "gratis"})\nTotal: ${money(sub + sc)}\n¿Cómo puedo pagar?`
    : "Hola, me interesa conocer sus artesanías.";
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;
}
function setupWhatsapp() { $("#wa-float").href = $("#wa-footer").href = waLink([], 0, 0); }

function renderFilters() {
  const cats = ["Todo", ...new Set(products.map((p) => p.category).filter(Boolean))];
  $("#filters").innerHTML = cats.map((c) => `<button class="chip ${c === catFilter ? "on" : ""}" data-c="${c}">${c}</button>`).join("");
  $("#filters").onclick = (e) => { if (e.target.dataset.c) { catFilter = e.target.dataset.c; renderFilters(); renderCatalog(); } };

  const seasons = [...new Set(products.map((p) => p.season).filter(Boolean))];
  const box = $("#season-filters");
  if (seasons.length) {
    box.hidden = false;
    box.innerHTML = ["Todo", ...seasons].map((s) => `<button class="chip ${s === seasonFilter ? "on" : ""}" data-s="${s}">${s}</button>`).join("");
    box.onclick = (e) => { if (e.target.dataset.s) { seasonFilter = e.target.dataset.s; renderFilters(); renderCatalog(); } };
  } else box.hidden = true;
}

function renderCatalog() {
  const list = products.filter((p) => (catFilter === "Todo" || p.category === catFilter) && (seasonFilter === "Todo" || p.season === seasonFilter));
  $("#catalog").innerHTML = list.map((p) => `
    <article class="card ${maxQty(p) === 0 ? "sold" : ""}">
      <div class="im"><img src="${p.image}" alt="${p.name}" loading="lazy"></div>
      <div class="b">
        <span class="origin">${p.origin}</span>${p.season ? `<span class="tag-season">${p.season}</span>` : ""}<h3>${p.name}</h3><p class="muted">${p.description}</p>
        ${Number.isFinite(p.stock) && p.stock > 0 && p.stock <= 3 ? `<span class="low">Quedan ${p.stock}</span>` : ""}
        <div class="row"><span class="price">${money(p.price)}</span>${maxQty(p) === 0 ? `<button class="btn sm" disabled>Agotado</button>` : p.customizable ? `<button class="btn sm" data-custom="${p.id}">Personalizar</button>` : `<button class="btn sm" data-add="${p.id}">Agregar</button>`}</div>
      </div>
    </article>`).join("");
}
function addToCart(id, color) {
  const p = products.find((x) => x.id === id), key = keyOf(id, color);
  if (qtyInCartFor(id) < maxQty(p)) { cart[key] = (cart[key] || 0) + 1; $("#msg").textContent = ""; }
  else $("#msg").textContent = `Solo hay ${maxQty(p)} disponible(s) de "${p.name}".`;
  saveCart(); openCart();
}
$("#catalog").onclick = (e) => {
  if (e.target.dataset.add) addToCart(e.target.dataset.add, null);
  if (e.target.dataset.custom) openCustomize(e.target.dataset.custom);
};

// ---- Personalizar (vista previa simulada + fotos reales de ejemplo) ----
function openCustomize(id) {
  const p = products.find((x) => x.id === id);
  const colors = p.color_options?.length ? p.color_options : [{ label: "Como se muestra", hex: "#ffffff00" }];
  let chosen = colors[0];
  const gallery = p.example_gallery || [];

  $("#cz-title").textContent = p.name;
  $("#cz-swatches").innerHTML = colors.map((c, i) => `<button class="swatch ${i === 0 ? "on" : ""}" data-i="${i}" style="background:${c.hex}" title="${c.label}"></button>`).join("");
  $("#cz-color-label").textContent = chosen.label;
  $("#cz-img").src = p.image;
  $("#cz-tint").style.background = chosen.hex;
  $("#cz-gallery").innerHTML = gallery.length
    ? gallery.map((g) => `<figure><img src="${g.url}" alt="${g.caption || p.name}" loading="lazy"><figcaption>${g.caption || ""}</figcaption></figure>`).join("")
    : `<p class="muted">Aún no hay fotos de ejemplo para esta pieza; la vista de arriba es una simulación de color.</p>`;

  $("#cz-swatches").onclick = (e) => {
    const i = e.target.dataset.i; if (i === undefined) return;
    chosen = colors[i];
    $("#cz-color-label").textContent = chosen.label;
    $("#cz-tint").style.background = chosen.hex;
    document.querySelectorAll("#cz-swatches .swatch").forEach((b, idx) => b.classList.toggle("on", idx == i));
  };
  $("#cz-add").onclick = () => { addToCart(p.id, colors.length > 1 || colors[0].label !== "Como se muestra" ? chosen.label : null); closeCustomize(); };
  $("#customize-modal").classList.add("on"); $("#veil").classList.add("on");
}
function closeCustomize() { $("#customize-modal").classList.remove("on"); $("#veil").classList.remove("on"); }
$("#cz-close").onclick = closeCustomize;

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
  $("#items").innerHTML = ls.length ? ls.map(({ key, p, qty, color }) => `
    <div class="line"><img src="${p.image}" alt=""><div><b>${p.name}</b>${color ? `<br><small class="muted">Color: ${color}</small>` : ""}<div class="muted">${money(p.price)}</div>
      <div class="qty"><button data-q="${key}" data-d="-1">−</button><span>${qty}</span><button data-q="${key}" data-d="1">+</button><button class="rm" data-rm="${key}">Eliminar</button></div>
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
    const p = products.find((x) => x.id === baseIdOf(d.q)), n = (cart[d.q] || 0) + Number(d.d);
    if (n <= 0) delete cart[d.q]; else if (qtyInCartFor(p.id, d.q) + n <= maxQty(p)) cart[d.q] = n; else $("#msg").textContent = `Solo hay ${maxQty(p)} disponible(s) de esta pieza.`;
    saveCart();
  }
  if (d.rm) { delete cart[d.rm]; saveCart(); }
  if (e.target.id === "go-addr") closeCart();
};

const openCart = () => { $("#drawer").classList.add("on"); $("#veil").classList.add("on"); };
const closeCart = () => { $("#drawer").classList.remove("on"); $("#veil").classList.remove("on"); };
$("#open-cart").onclick = openCart; $("#close-cart").onclick = closeCart;
$("#veil").onclick = () => { closeCart(); closeCustomize(); };

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
        const items = Object.entries(cart).map(([key, quantity]) => ({ id: baseIdOf(key), quantity, color: colorOf(key) }));
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
