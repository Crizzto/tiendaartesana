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

## Panel de administración: qué puedes hacer
- **Pedidos**: ver todos, con dirección y contacto del cliente, y cambiar su estado (pendiente, pagado, en preparación, enviado, entregado, cancelado). Se actualiza solo cada 30 segundos.
- **Productos**: agregar, editar o eliminar. El stock se controla aquí — ya no se edita a mano ningún archivo.
- **Envíos**: agregar, editar o eliminar métodos y costos.
- **Opiniones**: revisa las que dejan tus clientas y decide cuáles publicar.

## Local
`npm install` → copia `.env.example` a `.env` y llénalo (incluyendo `DATABASE_URL` de Neon) → `npm start` → http://localhost:3000
