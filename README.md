<<<<<<< HEAD
# Ko'olel — Tienda de artesanías (Node + Postgres + PayPal)

## Qué hay ahora
- **Catálogo, envíos y opiniones** viven en una base de datos Postgres (antes eran archivos `.json` que se perdían en cada redeploy de Render).
- **Panel de administración** en `/admin.html`, protegido con usuario y contraseña: editar productos y envíos, ver y actualizar el estado de los pedidos, aprobar o eliminar opiniones.
- **Webhook de PayPal**: red de seguridad para que un pedido se registre y se avise aunque el cliente cierre la pestaña justo después de pagar.
- **Opiniones dinámicas**: los clientes pueden dejar su opinión desde la tienda; tú la apruebas antes de que se publique.

## 1. Crea tu base de datos gratis (Neon)
1. Entra a https://neon.tech y crea una cuenta (gratis, sin tarjeta).
2. Crea un proyecto nuevo. Te dará una **cadena de conexión** parecida a:
   `postgres://usuario:contraseña@ep-xxxx.neon.tech/neondb?sslmode=require`
3. Copia esa cadena completa a tu `.env`, en `DATABASE_URL`.

La primera vez que arranques el servidor, se crean solas las tablas y se cargan los 5 productos y 3 envíos de ejemplo. Después edítalos desde el panel.

## 2. Configura el panel de administración
En tu `.env`, pon un usuario y una contraseña que solo tú conozcas:
```
ADMIN_USER=admin
ADMIN_PASSWORD=algo-largo-y-dificil-de-adivinar
```
Entra a `tudominio.com/admin.html` (o `http://localhost:3000/admin.html`). El navegador te pedirá ese usuario y contraseña.

**No compartas ni subas a GitHub esa contraseña.** Cualquiera que la tenga puede editar tus productos y ver las direcciones de tus clientes.

## 3. Configura el webhook de PayPal (recomendado, no obligatorio)
1. En https://developer.paypal.com > tu App (la misma de Sandbox o Live) > sección **Webhooks** > Add Webhook.
2. URL: `https://tudominio.com/api/paypal/webhook` (debe ser tu URL pública real, no localhost).
3. Eventos a marcar: `PAYMENT.CAPTURE.COMPLETED`.
4. Al crearlo te da un **Webhook ID**: cópialo a tu `.env` en `PAYPAL_WEBHOOK_ID`.

Mientras pruebas en tu computadora (localhost), el webhook no puede llegarte —PayPal no puede alcanzar tu PC— así que esto solo funciona una vez publicada la tienda. No pasa nada: sin webhook, el pedido igual se registra en cuanto el navegador confirma el pago; el webhook es un respaldo extra.

## 4. Variables de entorno en Render
Además de las que ya tenías (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`, `OWNER_EMAIL`, correo), agrega:
`DATABASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`, `PAYPAL_WEBHOOK_ID`.

## Temporadas (Navidad, Verano, Otoño...)
En el panel, al editar un producto, el campo **Temporada** es de texto libre: escribe "Navidad", "Verano", lo que quieras. Si lo dejas vacío, la pieza aparece siempre, sin importar la temporada. En la tienda aparece un segundo filtro (debajo de Lámparas/Bolsas) solo cuando al menos un producto tiene una temporada asignada.

## Personalizar el color de una lámpara (o cualquier pieza)
Esto **no es un render 3D fotorrealista como el configurador de Tesla** — te explico por qué y qué sí construí:

Tesla puede hacerlo porque fabrica el mismo auto en serie, con piezas idénticas. Una lámpara artesanal es distinta: cada una la teje una persona a mano, así que dos piezas del "mismo color" siempre van a tener variaciones — es parte de lo que hace especial a lo artesanal. Un render 3D real, además de ser un desarrollo mucho más grande, nunca se vería exactamente como la pieza que reciba el cliente.

Por eso construí una combinación de dos cosas:
1. **Vista previa simulada**: el cliente elige un color (un círculo de color, "swatch") y la foto del producto se tiñe en vivo para dar una idea aproximada. Queda claro que es una simulación, no una foto real (lo dice el texto arriba de la vista previa).
2. **Fotos reales de ejemplo**: debajo, si subiste fotos de piezas ya terminadas en esos colores, se muestran como referencia real. Esta es la parte que de verdad le da confianza al cliente.

**Para activarlo en un producto**, desde el panel:
- Marca la casilla "¿Se puede personalizar el color?"
- En "Colores disponibles", un color por línea así: `Natural | #c98a5a` (nombre, luego `|`, luego el código de color en hexadecimal — puedes buscar "selector de color hex" en Google para elegir uno).
- En "Fotos reales de ejemplo", una foto por línea así: `https://... | Descripción corta`. Si no pones ninguna, la tienda solo muestra la simulación y avisa que aún no hay fotos reales.

**Importante:** el stock se comparte entre todos los colores de una misma pieza (si tienes 3 lámparas en existencia, no importa qué colores elija la gente, no se pueden vender más de 3 en total). Si más adelante necesitas stock por color por separado, o que el precio cambie según el color, eso es una ampliación futura — avísame cuando llegue ese momento.

## Panel de administración: qué puedes hacer
- **Pedidos**: ver todos, con dirección y contacto del cliente, y cambiar su estado (pendiente, pagado, en preparación, enviado, entregado, cancelado). Se actualiza solo cada 30 segundos.
- **Productos**: agregar, editar o eliminar. El stock se controla aquí — ya no se edita a mano ningún archivo.
- **Envíos**: agregar, editar o eliminar métodos y costos.
- **Opiniones**: revisa las que dejan tus clientas y decide cuáles publicar.

## Local
`npm install` → copia `.env.example` a `.env` y llénalo (incluyendo `DATABASE_URL` de Neon) → `npm start` → http://localhost:3000
=======
# tiendaartesaniasjeje
Una tienda de artesanias
>>>>>>> f72d675cdb20b5f35d5bb840ea06a426b6f4fab1
