# API REST de Botica — Express + Supabase PostgreSQL

Implementada sobre el SQL entregado. No modifica el esquema. Las operaciones de stock invocan las funciones existentes de PostgreSQL. **No se ha ejecutado contra una base real.**

## Preparación

1. Node.js 20+. `npm install`.
2. Copiar `.env.example` a `.env` y rellenar las variables. **No subir `.env` a Git.**
3. `DATABASE_URL`: usar **Supabase Connect → Transaction pooler** (puerto 6543), usuario/host reales. `DATABASE_SSL=true` valida certificados; si el entorno no confía en la CA, configurar la CA adecuada en Node, no desactivar verificación en producción.
4. `SUPABASE_ANON_KEY`: clave pública/publishable compatible con Supabase Auth; nunca usar service_role en frontend.
5. Crear usuarios en Supabase Auth y activar al primer administrador según el SQL entregado.
6. `npm run dev` localmente, `npm start` en Render. Health: `/api/health`.
7. Render: Web Service Free; Build `npm install` (o `npm ci` después de generar/subir lockfile); Start `npm start`. Configurar variables de entorno y `FRONTEND_URL=https://tu-app.vercel.app`.
8. Vercel: `VITE_API_URL=https://tu-backend.onrender.com`, redeploy.

## Autenticación

`POST /api/auth/login` con `{ "email":"...", "password":"..." }` devuelve `access_token`, `refresh_token`, `expires_at` y `usuario`. En rutas protegidas enviar `Authorization: Bearer ACCESS_TOKEN`. El backend comprueba el token contra Supabase Auth y consulta `perfiles` activo. **No incluye endpoint de refresh:** para sesiones largas, usar `supabase.auth.refreshSession` en el frontend o implementar un endpoint de renovación controlado.

## Endpoints

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/health` | público | Salud |
| POST | `/api/auth/login` | público | Login |
| GET | `/api/auth/me` | activo | Perfil |
| GET | `/api/categorias`, `/api/categorias/:id` | activo | Categorías |
| POST, PATCH | `/api/categorias`, `/api/categorias/:id` | admin | Alta / edición |
| GET | `/api/contactos`, `/api/contactos/:id` | activo | Clientes y proveedores |
| POST, PATCH | `/api/contactos`, `/api/contactos/:id` | admin | Alta / edición |
| GET | `/api/productos?q=&estado=&limit=&offset=`, `/api/productos/:id` | activo | Catálogo y stock |
| POST, PATCH | `/api/productos`, `/api/productos/:id` | admin | Alta / edición, desactivar con PATCH |
| GET | `/api/inventario/stock` | activo | Stock disponible |
| GET | `/api/inventario/lotes` | activo | Lotes |
| GET | `/api/inventario/alertas/reposicion` | activo | Reposición |
| GET | `/api/inventario/alertas/vencimiento` | activo | Vencimientos |
| GET | `/api/inventario/movimientos?limit=&offset=` | activo | Kardex |
| POST | `/api/ventas` | activo | Registrar venta con FEFO |
| POST | `/api/compras` | admin | Registrar compra y lotes |
| GET | `/api/operaciones?tipo=&limit=&offset=`, `/api/operaciones/:id` | activo | Historial y detalle |
| POST | `/api/operaciones/:id/anular` | admin | Anulación |
| POST | `/api/inventario/ajustes` | admin | Ajuste de stock |
| GET | `/api/usuarios` | admin | Perfiles |
| PATCH | `/api/usuarios/:id` | admin | Activar / rol / nombre |

Todas las rutas GET de colección devuelven **arrays JSON**; `GET /api/operaciones/:id` devuelve la operación con `detalles`. Las altas de catálogo devuelven el registro. Las ventas/compras devuelven `{ "resultado": ID_OPERACION }`. Errores: `{ "error": "...", "codigo": "NS001" }` o validación `{ "error": "Datos inválidos", "detalles": [...] }`.

## Ejemplos

Venta: `POST /api/ventas`
```json
{"items":[{"id_producto":1,"cantidad":2}],"id_contacto":null,"metodo_pago":"efectivo"}
```

Compra: `POST /api/compras`
```json
{"id_contacto":1,"items":[{"id_producto":1,"cantidad":20,"precio_unitario":0.5,"codigo_lote":"ABC-2026","fecha_vencimiento":"2027-12-31"}],"metodo_pago":"efectivo"}
```

Anulación: `POST /api/operaciones/1/anular` → `{ "motivo": "Error de registro" }`.

Ajuste: `POST /api/inventario/ajustes` → `{ "id_lote": 1, "delta": -2, "motivo": "Merma" }`.

Frontend:
```js
const API = import.meta.env.VITE_API_URL;
const response = await fetch(`${API}/api/productos`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
const productos = await response.json();
```

## Seguridad y consideraciones antes de producción

- SQL parametrizado `$1`, `$2`; nombres de tablas/columnas solo constantes internas, nunca valores del usuario.
- Zod valida estructuras y tipos. El `id_usuario` de venta/compra/ajuste se obtiene del token validado, nunca del body.
- No se exponen endpoints de DELETE, ni UPDATE directo de lotes o kardex.
- Las funciones SQL se ejecutan con la conexión Postgres, que debe custodiarse exclusivamente en el servidor.
- **Revisar privilegios de la cuenta Postgres**: el SQL original habilita RLS para roles de API, pero una cuenta con privilegios elevados o BYPASSRLS puede saltarse RLS. Para producción usar un rol dedicado con privilegios mínimos y acceso solo a operaciones autorizadas.
- El SQL original permite que un admin activo modifique `perfiles`; hay que auditar cambios de roles y evitar desactivar el último admin.
- No incluye pruebas integradas con una base real, pruebas de concurrencia, idempotencia de pagos, protección específica de datos personales ni documentación OpenAPI. No afirmar que está certificado para producción.
- El SQL de prueba incluye correos de ejemplo; no deben copiarse al código ni a logs públicos.

## Arquitectura modular
`src/server.js` inicia el servidor; `src/app.js` configura Express; `src/routes` contiene rutas por dominio; `src/validators` valida entrada; `src/middlewares` maneja autenticación y errores; `src/config` conecta PostgreSQL y Supabase; `src/utils/crud.js` contiene generadores CRUD con columnas de lista blanca. Las rutas públicas mantienen el prefijo `/api`.
