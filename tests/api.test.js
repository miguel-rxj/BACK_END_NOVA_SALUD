// Pruebas de integración. Requieren una BD con schema.sql + seed.sql (admin y vendedor activos).
// Ejecutar SOLO contra una base de desarrollo: crean productos, lotes y ventas reales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { app } from '../src/app.js';
import { pool, query } from '../src/db.js';

const run = Date.now().toString(36);
const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
const sign = (sub, { exp = '1h' } = {}) =>
  new SignJWT({ role: 'authenticated', email: 'test@botica.com' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(sub)
    .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`).setAudience('authenticated')
    .setIssuedAt().setExpirationTime(exp).sign(secret);
const dias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let server, base, A, V, adminId, vendId;
const ctx = {};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const a = await query("SELECT id FROM public.perfiles WHERE rol='admin' AND estado='activo' LIMIT 1");
  const v = await query("SELECT id FROM public.perfiles WHERE rol='vendedor' AND estado='activo' LIMIT 1");
  assert.ok(a.rows[0] && v.rows[0], 'Falta un admin y un vendedor activos (ejecuta seed.sql)');
  adminId = a.rows[0].id; vendId = v.rows[0].id;
  A = await sign(adminId); V = await sign(vendId);
});
after(async () => { server.close(); await pool.end(); });

test('health y ruta inexistente', async () => {
  const h = await fetch(base.replace('/api/v1', '/health'));
  assert.equal(h.status, 200);
  const r = await api('GET', '/no-existe', { token: A });
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'RUTA_NO_ENCONTRADA');
});

test('autenticación: sin token, token basura, expirado, rol insuficiente', async () => {
  assert.equal((await api('GET', '/productos')).status, 401);
  const bad = await api('GET', '/productos', { token: 'abc.def.ghi' });
  assert.equal(bad.body.error.code, 'TOKEN_INVALIDO');
  const old = await api('GET', '/productos', { token: await sign(adminId, { exp: Math.floor(Date.now() / 1000) - 60 }) });
  assert.equal(old.body.error.code, 'TOKEN_EXPIRADO');
  const forb = await api('POST', '/categorias', { token: V, body: { nombre: 'X' + run } });
  assert.equal(forb.status, 403);
  const me = await api('GET', '/auth/me', { token: V });
  assert.equal(me.body.data.rol, 'vendedor');
});

test('login valida el cuerpo antes de llamar a Supabase', async () => {
  const r = await api('POST', '/auth/login', { body: { email: 'no-es-correo' } });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'VALIDACION');
  assert.ok(r.body.error.details.length >= 1);
});

test('catálogo: crear categoría, proveedor, cliente y producto; duplicados y validación', async () => {
  const c = await api('POST', '/categorias', { token: A, body: { nombre: `Cat ${run}` } });
  assert.equal(c.status, 201);
  assert.equal((await api('POST', '/categorias', { token: A, body: { nombre: `Cat ${run}` } })).status, 409);

  const prov = await api('POST', '/contactos', { token: A, body: { tipo: 'proveedor', nombre: `Prov ${run}`, documento: `2${run}`.slice(0, 11).padEnd(11, '0') } });
  assert.equal(prov.status, 201);
  ctx.prov = prov.body.data.id_contacto;

  const cli = await api('POST', '/contactos', { token: V, body: { tipo: 'cliente', nombre: `Cliente ${run}` } });
  assert.equal(cli.status, 201, 'el vendedor puede crear clientes');
  ctx.cli = cli.body.data.id_contacto;
  assert.equal((await api('POST', '/contactos', { token: V, body: { tipo: 'proveedor', nombre: 'No' } })).status, 403);

  const p = await api('POST', '/productos', { token: A, body: { codigo_barras: `T-${run}`, nombre: `Producto ${run}`, id_categoria: c.body.data.id_categoria, precio_venta: 2.5, stock_minimo: 10 } });
  assert.equal(p.status, 201);
  ctx.prod = p.body.data.id_producto;
  assert.equal(p.body.data.stock_disponible, 0);
  assert.equal((await api('POST', '/productos', { token: A, body: { codigo_barras: `T-${run}`, nombre: 'Otro', precio_venta: 1 } })).status, 409);

  const bad = await api('POST', '/productos', { token: A, body: { nombre: 'a', precio_venta: -1 } });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.error.details.some((d) => d.campo === 'precio_venta'));
  assert.equal((await api('POST', '/productos', { token: A, body: { nombre: 'Decimales', precio_venta: 1.234 } })).status, 422);
  assert.equal((await api('POST', '/productos', { token: V, body: { nombre: 'Nope', precio_venta: 1 } })).status, 403);
});

test('seguridad: intentos de inyección SQL', async () => {
  const inj = encodeURIComponent("' OR 1=1; DROP TABLE productos;--");
  const r = await api('GET', `/productos?search=${inj}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 0, 'el texto se trata como literal');
  assert.equal((await api('GET', '/productos?page_size=5', { token: A })).status, 200, 'la tabla sigue existiendo');

  assert.equal((await api('GET', `/productos?sort=${encodeURIComponent('nombre;DROP TABLE productos')}`, { token: A })).status, 422);
  assert.equal((await api('GET', `/productos?id_categoria=${encodeURIComponent('1 OR 1=1')}`, { token: A })).status, 422);
  assert.equal((await api('GET', `/productos/${encodeURIComponent('1;select 1')}`, { token: A })).status, 422);
  assert.equal((await api('GET', '/productos?sort=constructor', { token: A })).status, 422);

  // Un % o _ del usuario no actúa como comodín
  const w = await api('GET', `/productos?search=${encodeURIComponent('%')}`, { token: A });
  assert.equal(w.body.data.length, 0);

  // Texto malicioso guardado como dato, nunca ejecutado
  const nombre = `Robert'); DROP TABLE productos;-- ${run}`;
  const p = await api('POST', '/productos', { token: A, body: { nombre, precio_venta: 1 } });
  assert.equal(p.status, 201);
  assert.equal(p.body.data.nombre, nombre);
  assert.equal((await api('GET', '/productos?page_size=1', { token: A })).status, 200);
});

test('compras: solo admin, valida lote vencido y sube stock', async () => {
  const items = [
    { id_producto: ctx.prod, cantidad: 30, precio_unitario: 1, codigo_lote: `A-${run}`, fecha_vencimiento: dias(100) },
    { id_producto: ctx.prod, cantidad: 20, precio_unitario: 1, codigo_lote: `B-${run}`, fecha_vencimiento: dias(400) },
  ];
  assert.equal((await api('POST', '/compras', { token: V, body: { id_contacto: ctx.prov, items } })).status, 403);

  const vencido = await api('POST', '/compras', { token: A, body: { id_contacto: ctx.prov, items: [{ ...items[0], codigo_lote: `V-${run}`, fecha_vencimiento: dias(-3) }] } });
  assert.equal(vencido.status, 422);

  const ok = await api('POST', '/compras', { token: A, body: { id_contacto: ctx.prov, items } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.total, 50);
  assert.equal(ok.body.data.items[0].cantidad, 50);

  const p = await api('GET', `/productos/${ctx.prod}`, { token: V });
  assert.equal(p.body.data.stock_disponible, 50);
  assert.equal(p.body.data.lotes.length, 2);
  assert.equal(typeof p.body.data.lotes[0].fecha_vencimiento, 'string');
});

test('ventas: FEFO, stock insuficiente atómico, alertas y propiedad de datos', async () => {
  const v = await api('POST', '/ventas', { token: V, body: { id_contacto: ctx.cli, metodo_pago: 'yape', items: [{ id_producto: ctx.prod, cantidad: 40 }] } });
  assert.equal(v.status, 201);
  assert.equal(v.body.data.total, 100);
  const lotes = v.body.data.items[0].lotes;
  assert.deepEqual(lotes.map((l) => l.cantidad), [30, 10], 'primero el lote que vence antes');
  ctx.venta = v.body.data.id_operacion;

  const p = await api('GET', `/productos/${ctx.prod}`, { token: V });
  assert.equal(p.body.data.stock_disponible, 10);
  assert.equal(p.body.data.nivel_stock, 'bajo');

  const al = await api('GET', '/alertas/reposicion', { token: V });
  assert.ok(al.body.data.some((x) => x.id_producto === ctx.prod && x.nivel === 'bajo'));
  assert.ok((await api('GET', '/alertas/resumen', { token: V })).body.data.reposicion >= 1);

  const sin = await api('POST', '/ventas', { token: V, body: { items: [{ id_producto: ctx.prod, cantidad: 999 }] } });
  assert.equal(sin.status, 409);
  assert.equal(sin.body.error.code, 'STOCK_INSUFICIENTE');
  assert.equal((await api('GET', `/productos/${ctx.prod}`, { token: V })).body.data.stock_disponible, 10);

  const vacia = await api('POST', '/ventas', { token: V, body: { items: [] } });
  assert.equal(vacia.status, 422);
  assert.equal((await api('POST', '/ventas', { token: V, body: { items: [{ id_producto: ctx.prod, cantidad: 1.5 }] } })).status, 422);

  // Una venta del admin no es visible para el vendedor
  const va = await api('POST', '/ventas', { token: A, body: { items: [{ id_producto: ctx.prod, cantidad: 1 }] } });
  assert.equal(va.status, 201);
  assert.equal((await api('GET', `/ventas/${va.body.data.id_operacion}`, { token: V })).status, 404);
  const mias = await api('GET', '/ventas?page_size=100', { token: V });
  assert.ok(mias.body.data.length > 0 && mias.body.data.every((x) => x.id_usuario === vendId));
  assert.equal(mias.body.meta.page, 1);
  assert.equal((await api('GET', `/ventas/${ctx.venta}`, { token: V })).status, 200);
  assert.equal((await api('GET', '/compras', { token: V })).status, 403);
});

test('anulación (solo admin) revierte stock; kardex y ajustes', async () => {
  assert.equal((await api('POST', `/ventas/${ctx.venta}/anular`, { token: V, body: { motivo: 'error' } })).status, 403);
  const an = await api('POST', `/ventas/${ctx.venta}/anular`, { token: A, body: { motivo: 'error de digitación' } });
  assert.equal(an.status, 200);
  assert.equal(an.body.data.estado, 'anulada');
  // 50 comprados - 1 vendido por el admin
  assert.equal((await api('GET', `/productos/${ctx.prod}`, { token: A })).body.data.stock_disponible, 49);
  assert.equal((await api('POST', `/ventas/${ctx.venta}/anular`, { token: A, body: { motivo: 'otra vez' } })).status, 422);

  const mov = await api('GET', `/movimientos?id_producto=${ctx.prod}&page_size=100`, { token: A });
  const tipos = new Set(mov.body.data.map((m) => m.tipo));
  assert.ok(['compra', 'venta', 'anulacion'].every((t) => tipos.has(t)));
  assert.equal((await api('GET', '/movimientos', { token: V })).status, 403);

  const lote = (await api('GET', `/lotes?id_producto=${ctx.prod}&sort=vencimiento`, { token: A })).body.data[0];
  const aj = await api('POST', `/lotes/${lote.id_lote}/ajustes`, { token: A, body: { cantidad: -5, motivo: 'merma' } });
  assert.equal(aj.status, 200);
  assert.equal(aj.body.data.stock_actual, lote.stock_actual - 5);
  assert.equal((await api('POST', `/lotes/${lote.id_lote}/ajustes`, { token: A, body: { cantidad: -100000, motivo: 'ajuste excesivo' } })).status, 409);
  assert.equal((await api('POST', `/lotes/${lote.id_lote}/ajustes`, { token: A, body: { cantidad: 0, motivo: 'ajuste en cero' } })).status, 422);
});

test('producto inactivo: invisible y no vendible para el vendedor; dashboard solo admin', async () => {
  const off = await api('PATCH', `/productos/${ctx.prod}`, { token: A, body: { estado: 'inactivo' } });
  assert.equal(off.status, 200);
  assert.equal((await api('GET', `/productos/${ctx.prod}`, { token: V })).status, 404);
  const venta = await api('POST', '/ventas', { token: V, body: { items: [{ id_producto: ctx.prod, cantidad: 1 }] } });
  assert.equal(venta.status, 422);
  assert.equal((await api('PATCH', `/productos/${ctx.prod}`, { token: A, body: {} })).status, 422);

  const r = await api('GET', '/reportes/resumen', { token: A });
  assert.equal(r.status, 200);
  assert.ok('ventas_hoy' in r.body.data && Array.isArray(r.body.data.top_productos_mes));
  assert.equal((await api('GET', '/reportes/resumen', { token: V })).status, 403);

  const docs = await fetch(base.replace('/v1', '/openapi.json'));
  assert.equal(docs.status, 200);
});
