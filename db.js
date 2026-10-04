import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

// Neon (y la mayoría de proveedores gratuitos) exige conexión SSL.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

export const q = (text, params) => pool.query(text, params);

export async function initSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      price NUMERIC NOT NULL CHECK (price >= 0),
      origin TEXT,
      description TEXT,
      image TEXT,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      season TEXT,
      customizable BOOLEAN NOT NULL DEFAULT FALSE,
      color_options JSONB NOT NULL DEFAULT '[]',
      example_gallery JSONB NOT NULL DEFAULT '[]'
    );
    -- Por si la tabla ya existía de antes (bases ya publicadas), agrega lo que falte:
    ALTER TABLE products ADD COLUMN IF NOT EXISTS season TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS customizable BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS color_options JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS example_gallery JSONB NOT NULL DEFAULT '[]';
    CREATE TABLE IF NOT EXISTS shipping_methods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      detail TEXT,
      cost NUMERIC NOT NULL DEFAULT 0 CHECK (cost >= 0)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pendiente',
      items JSONB NOT NULL,
      address JSONB NOT NULL,
      ship_name TEXT,
      ship_cost NUMERIC,
      total NUMERIC,
      payer_email TEXT,
      emailed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      product TEXT,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows: [{ count }] } = await q("SELECT count(*)::int FROM products");
  if (count === 0) {
    const colores = JSON.stringify([
      { label: "Natural", hex: "#c98a5a" },
      { label: "Café oscuro", hex: "#6b4226" },
      { label: "Negro", hex: "#2b2b2b" },
    ]);
    const galeria = JSON.stringify([
      { url: "https://placehold.co/500x500/c98a5a/fff5e6?text=Ejemplo+Natural", caption: "Ejemplo real en Natural" },
      { url: "https://placehold.co/500x500/6b4226/fff5e6?text=Ejemplo+Cafe", caption: "Ejemplo real en Café oscuro" },
    ]);
    const seedProducts = [
      ["lampara-henequen", "Lámpara colgante Henequén", "Lámparas", 1890, "Tejida en Muna, Yucatán", "Pantalla grande tejida en fibra de henequén, luz cálida y filtrada.", "https://placehold.co/800x800/c98a5a/fff5e6?text=Lampara+Henequen", 3, "", true, colores, galeria],
      ["lampara-mesa", "Lámpara de mesa Sisal", "Lámparas", 1250, "Tejida en Ticul, Yucatán", "Base de madera de tzalam con pantalla cilíndrica de fibra natural.", "https://placehold.co/800x800/d9b78a/4a2e1c?text=Lampara+Sisal", 2, "", true, colores, "[]"],
      ["bolsa-bordada", "Bolsa bordada Flores", "Bolsas", 980, "Bordada en Tekit, Yucatán", "Palma tejida con bordado floral a mano y asas de piel.", "https://placehold.co/800x800/e8c5b0/7a3b22?text=Bolsa+Bordada", 5, "", false, "[]", "[]"],
      ["bolsa-palma", "Canasta de palma Xibalbá", "Bolsas", 640, "Tejida en Halachó, Yucatán", "Tejido de palma con grecas mayas en tinte natural negro.", "https://placehold.co/800x800/b8c9b0/2b4a3a?text=Canasta+Palma", 4, "", false, "[]", "[]"],
      ["bolsa-cruzada", "Bolsa cruzada Sac Nicté", "Bolsas", 760, "Tejida en Maxcanú, Yucatán", "Sisal tejido con greca bordada en rojo y negro, correa ajustable.", "https://placehold.co/800x800/e0d0b0/8a2b22?text=Bolsa+Cruzada", 6, "", false, "[]", "[]"],
      ["lampara-navidad", "Lámpara colgante Estrella Navideña", "Lámparas", 2150, "Tejida en Muna, Yucatán", "Edición de temporada: pantalla en forma de estrella con detalles rojos.", "https://placehold.co/800x800/a83232/fff5e6?text=Lampara+Navidad", 4, "Navidad", true, colores, "[]"],
    ];
    for (const p of seedProducts) await q(
      "INSERT INTO products (id,name,category,price,origin,description,image,stock,season,customizable,color_options,example_gallery) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", p);

    const seedShipping = [["estandar", "Estándar nacional", "3 a 6 días hábiles", 149], ["express", "Express nacional", "1 a 2 días hábiles", 299], ["local", "Entrega local en Mérida", "24 h, sin costo", 0]];
    for (const s of seedShipping) await q("INSERT INTO shipping_methods (id,name,detail,cost) VALUES ($1,$2,$3,$4)", s);

    const seedReviews = [
      ["Daniela Pacheco", "Ciudad de México", "Lámpara colgante Henequén", 5, "La lámpara llegó perfecta, bien empacada y antes de lo esperado. En la sala se ve hermosa de noche."],
      ["Mariana Couoh", "Mérida, Yucatán", "Bolsa bordada Flores", 5, "Compré la bolsa bordada y me la piden todos los días. Se nota que es trabajo hecho a mano con cariño."],
      ["Rodrigo Yam", "Guadalajara, Jalisco", "Canasta de palma Xibalbá", 5, "La canasta es más bonita que en las fotos. Llena toda la cocina de estilo. Súper recomendable."],
    ];
    for (const r of seedReviews) await q("INSERT INTO reviews (name,location,product,rating,comment,approved) VALUES ($1,$2,$3,$4,$5,TRUE)", r);
  }

  // Si tu base ya existía de antes (Neon ya tenía tus 5 productos), aquí se agregan
  // ejemplos de temporada y personalización SOLO en los campos que sigan vacíos,
  // para no pisar nada que ya hayas editado desde el panel.
  await q(`UPDATE products SET season = 'Navidad' WHERE id = 'bolsa-bordada' AND season IS NULL`);
  await q(`UPDATE products SET season = 'Verano' WHERE id = 'lampara-mesa' AND season IS NULL`);
  await q(
    `UPDATE products SET customizable = TRUE, color_options = $2
     WHERE id = $1 AND customizable = FALSE AND color_options = '[]'::jsonb`,
    ["lampara-henequen", JSON.stringify([
      { label: "Natural", hex: "#c98a5a" },
      { label: "Café oscuro", hex: "#6b4226" },
      { label: "Negro", hex: "#2b2b2b" },
    ])]
  );
  await q(
    `INSERT INTO products (id,name,category,price,origin,description,image,stock,season,customizable,color_options)
     VALUES ('lampara-navidad','Lámpara colgante Estrella Navideña','Lámparas',2150,'Tejida en Muna, Yucatán','Edición de temporada: pantalla en forma de estrella con detalles rojos.','https://placehold.co/800x800/a83232/fff5e6?text=Lampara+Navidad',4,'Navidad',TRUE,$1)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify([{ label: "Natural", hex: "#c98a5a" }, { label: "Café oscuro", hex: "#6b4226" }, { label: "Negro", hex: "#2b2b2b" }])]
  );
}
