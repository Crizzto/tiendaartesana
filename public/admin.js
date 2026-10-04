const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const mxn = (n) => Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const api = async (url, opts) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Error en el servidor"); }
  return r.status === 204 ? null : r.json();
};

// -------- pestañas --------
$$(".tab").forEach((t) => t.onclick = () => {
  $$(".tab").forEach((x) => x.classList.toggle("on", x === t));
  $$(".panel").forEach((p) => p.classList.toggle("on", p.id === t.dataset.t));
});

// -------- pedidos --------
const ESTADOS = ["pendiente", "pagado", "en_preparacion", "enviado", "entregado", "cancelado"];
async function loadOrders() {
  const orders = await api("/api/admin/orders");
  $("#orders").innerHTML = orders.length ? `<table><tr><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Estado</th></tr>${orders.map((o) => `
    <tr>
      <td>${new Date(o.created_at).toLocaleString("es-MX")}</td>
      <td><b>${o.address?.nombre || ""}</b><br>${o.address?.telefono || ""}<br>${o.address?.email || ""}<br><small>${o.address?.calle || ""}, ${o.address?.ciudad || ""}, ${o.address?.estado || ""} ${o.address?.cp || ""}</small></td>
      <td>${(o.items || []).map((i) => `${i.quantity} × ${i.name}`).join("<br>")}<br><small>Envío: ${o.ship_name}</small></td>
      <td>${mxn(o.total)}</td>
      <td><select data-id="${o.id}">${ESTADOS.map((e) => `<option value="${e}" ${e === o.status ? "selected" : ""}>${e}</option>`).join("")}</select></td>
    </tr>`).join("")}</table>` : "<p>Aún no hay pedidos.</p>";
  $$("#orders select").forEach((s) => s.onchange = () => api(`/api/admin/orders/${s.dataset.id}`, { method: "PATCH", body: JSON.stringify({ status: s.value }) }));
}

// -------- productos --------
async function loadProducts() {
  const products = await api("/api/products");
  $("#products").innerHTML = `<table><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th></th></tr>${products.map((p) => `
    <tr>
      <td><b>${p.name}</b><br><small>${p.id}</small>${p.season ? `<br><span class="tag">${p.season}</span>` : ""}${p.customizable ? ` <span class="tag ok">Personalizable</span>` : ""}</td><td>${p.category || ""}</td><td>${mxn(p.price)}</td>
      <td>${p.stock}${p.stock === 0 ? ' <span class="tag">Agotado</span>' : p.stock <= 3 ? ' <span class="tag">Bajo</span>' : ""}</td>
      <td><button class="rowbtn" data-edit='${JSON.stringify(p).replace(/'/g, "&#39;")}'>Editar</button> <button class="rowbtn" data-del="${p.id}">Eliminar</button></td>
    </tr>`).join("")}</table>`;
  $$("#products [data-edit]").forEach((b) => b.onclick = () => fillProductForm(JSON.parse(b.dataset.edit)));
  $$("#products [data-del]").forEach((b) => b.onclick = async () => { if (confirm("¿Eliminar este producto?")) { await api(`/api/admin/products/${b.dataset.del}`, { method: "DELETE" }); loadProducts(); } });
}
// "Natural | #c98a5a" por línea <-> [{label:"Natural",hex:"#c98a5a"}]
const colorsToText = (arr) => (arr || []).map((c) => `${c.label} | ${c.hex}`).join("\n");
const textToColors = (txt) => txt.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [label, hex] = l.split("|").map((s) => s.trim()); return { label, hex }; }).filter((c) => c.label && c.hex);
// "https://... | Descripción" por línea <-> [{url,caption}]
const galleryToText = (arr) => (arr || []).map((g) => `${g.url} | ${g.caption || ""}`).join("\n");
const textToGallery = (txt) => txt.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [url, ...rest] = l.split("|"); return { url: url.trim(), caption: rest.join("|").trim() }; }).filter((g) => g.url);

function fillProductForm(p) {
  const f = $("#p-form");
  for (const k of ["id", "name", "category", "price", "stock", "origin", "description", "image", "season"]) f[k].value = p[k] ?? "";
  f.customizable.checked = !!p.customizable;
  f.color_options.value = colorsToText(p.color_options);
  f.example_gallery.value = galleryToText(p.example_gallery);
  f.id.disabled = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("#p-cancel").onclick = () => { $("#p-form").reset(); $("#p-form").id.disabled = false; };
$("#p-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    id: f.get("id"), name: f.get("name"), category: f.get("category"), price: Number(f.get("price")), stock: Number(f.get("stock")),
    origin: f.get("origin"), description: f.get("description"), image: f.get("image"), season: f.get("season") || null,
    customizable: f.get("customizable") === "on", color_options: textToColors(f.get("color_options") || ""), example_gallery: textToGallery(f.get("example_gallery") || ""),
  };
  try { await api("/api/admin/products", { method: "POST", body: JSON.stringify(body) }); e.target.reset(); e.target.id.disabled = false; loadProducts(); }
  catch (err) { alert(err.message); }
};

// -------- envíos --------
async function loadShipping() {
  const methods = await api("/api/shipping");
  $("#shipping").innerHTML = `<table><tr><th>Nombre</th><th>Detalle</th><th>Costo</th><th></th></tr>${methods.map((s) => `
    <tr><td><b>${s.name}</b><br><small>${s.id}</small></td><td>${s.detail || ""}</td><td>${s.cost ? mxn(s.cost) : "Gratis"}</td>
    <td><button class="rowbtn" data-del="${s.id}">Eliminar</button></td></tr>`).join("")}</table>`;
  $$("#shipping [data-del]").forEach((b) => b.onclick = async () => { if (confirm("¿Eliminar este método de envío?")) { await api(`/api/admin/shipping/${b.dataset.del}`, { method: "DELETE" }); loadShipping(); } });
}
$("#s-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try { await api("/api/admin/shipping", { method: "POST", body: JSON.stringify({ id: f.get("id"), name: f.get("name"), detail: f.get("detail"), cost: Number(f.get("cost")) }) }); e.target.reset(); loadShipping(); }
  catch (err) { alert(err.message); }
};

// -------- opiniones --------
async function loadReviews() {
  const reviews = await api("/api/admin/reviews");
  $("#reviews").innerHTML = reviews.length ? `<table><tr><th>Cliente</th><th>Opinión</th><th>Estado</th><th></th></tr>${reviews.map((r) => `
    <tr>
      <td><b>${r.name}</b><br><small>${r.location || ""}${r.product ? " · " + r.product : ""}</small><br><span class="stars-sm">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span></td>
      <td>${r.comment}</td>
      <td><span class="tag ${r.approved ? "ok" : ""}">${r.approved ? "Publicada" : "Pendiente"}</span></td>
      <td><button class="rowbtn" data-tog="${r.id}" data-v="${!r.approved}">${r.approved ? "Ocultar" : "Publicar"}</button> <button class="rowbtn" data-del="${r.id}">Eliminar</button></td>
    </tr>`).join("")}</table>` : "<p>Aún no hay opiniones.</p>";
  $$("#reviews [data-tog]").forEach((b) => b.onclick = async () => { await api(`/api/admin/reviews/${b.dataset.tog}`, { method: "PATCH", body: JSON.stringify({ approved: b.dataset.v === "true" }) }); loadReviews(); });
  $$("#reviews [data-del]").forEach((b) => b.onclick = async () => { if (confirm("¿Eliminar esta opinión?")) { await api(`/api/admin/reviews/${b.dataset.del}`, { method: "DELETE" }); loadReviews(); } });
}

loadOrders(); loadProducts(); loadShipping(); loadReviews();
setInterval(loadOrders, 30000); // revisa pedidos nuevos cada 30s sin recargar la página
