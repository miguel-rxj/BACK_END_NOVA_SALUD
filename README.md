# Botica API

API REST (Node.js + Express 5) para inventario, ventas y compras. Se conecta a PostgreSQL de Supabase
y usa Supabase Auth para el login. El frontend **solo** habla con esta API, nunca con Supabase.

## 1. Puesta en marcha

```bash
npm install
cp .env.example .env      # completa los valores (ver abajo)
npm run dev               # http://localhost:3000   ·   docs en /api/docs
```

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (puerto 6543). Sin `?sslmode=` al final |
| `DB_SSL` | `true` con Supabase, `false` con Postgres local |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_ANON_KEY` | Clave pública (`anon` o `publishable`). Solo se usa para login/refresh |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta (`service_role` o `secret`). **Solo en el servidor**, nunca en el frontend ni en Git |
| `SUPABASE_JWT_SECRET` | Déjalo vacío (proyectos con claves asimétricas). Solo para proyectos con secreto HS256 legado |
| `CORS_ORIGINS` | URLs del frontend separadas por coma (ej. `http://localhost:5173,https://mi-app.vercel.app`) |

Antes de arrancar: ejecutar `database/schema.sql` y luego `database/seed.sql` (instrucciones dentro de cada archivo)
y, en Supabase → Authentication → Sign In / Providers, **desactivar los registros públicos**.

**Pruebas:** `cp .env.test.example .env.test`, apuntarlo a una base de **desarrollo** y `npm test`
(9 pruebas: permisos, validación, intentos de inyección SQL, FEFO, stock insuficiente, anulaciones, kardex).

## 2. Contrato

- Base: `/api/v1`. JSON. `Authorization: Bearer <access_token>`. Express acepta rutas con y sin `/` final.
- Éxito: `{ "data": ..., "meta": { page, page_size, total, total_pages } }` (`meta` solo en listas paginadas).
- Error: `{ "error": { "code": "...", "message": "...", "details": [{ "en", "campo", "mensaje" }] } }`.
- Paginación: `?page=1&page_size=20` (máx. 100). Orden: `?sort=nombre` o `?sort=-nombre`. Búsqueda: `?search=texto`.
- Fechas ISO 8601 (`fecha_vencimiento` como `YYYY-MM-DD`). Dinero y cantidades llegan como **números**, no texto.
- Documentación interactiva: `/api/docs` · JSON importable en Postman: `/api/openapi.json`.

### Roles
| | vendedor | admin |
|---|---|---|
| Buscar productos (solo activos), ver stock y alertas | ✅ | ✅ |
| Registrar ventas, ver **solo sus** ventas | ✅ | ✅ (todas) |
| Clientes: listar, crear, editar | ✅ | ✅ |
| Proveedores, productos, categorías, usuarios | ❌ | ✅ |
| Compras, ajustes de stock, anular, kardex, lotes, dashboard | ❌ | ✅ |

### Endpoints
| Método | Ruta | Quién |
|---|---|---|
| POST | `/auth/login` · `/auth/refresh` | público |
| GET / POST | `/auth/me` · `/auth/logout` | autenticado |
| GET, POST, PATCH | `/usuarios`, `/usuarios/:id` | admin |
| GET / POST / PATCH | `/categorias`, `/categorias/:id` | todos / admin |
| GET, POST, PATCH | `/contactos`, `/contactos/:id` | todos (vendedor solo clientes) |
| GET | `/productos?search=&codigo_barras=&id_categoria=&nivel_stock=&sort=` · `/productos/:id` | todos |
| POST, PATCH | `/productos`, `/productos/:id` | admin |
| GET / POST | `/lotes` · `/lotes/:id/ajustes` | admin |
| GET, POST | `/ventas`, `/ventas/:id` | todos |
| POST | `/ventas/:id/anular` | admin |
| GET, POST | `/compras`, `/compras/:id` · POST `/compras/:id/anular` | admin |
| GET | `/alertas/reposicion` · `/alertas/vencimiento` · `/alertas/resumen` | todos |
| GET | `/movimientos` (kardex) · `/reportes/resumen` | admin |

### Códigos de error
| HTTP | `code` | Cuándo |
|---|---|---|
| 401 | `NO_AUTENTICADO`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO`, `CREDENCIALES_INVALIDAS` | sin sesión o sesión vencida |
| 403 | `SIN_PERMISO`, `USUARIO_INACTIVO` | rol insuficiente |
| 404 | `NO_ENCONTRADO` | no existe (o no te pertenece) |
| 409 | `STOCK_INSUFICIENTE`, `DUPLICADO`, `REFERENCIA_INVALIDA` | conflicto de negocio |
| 422 | `VALIDACION` (con `details`), `DATOS_INVALIDOS` | datos mal formados |
| 429 | `DEMASIADOS_INTENTOS`, `DEMASIADAS_PETICIONES` | límite de peticiones |

## 3. Guía para el frontend

```js
// src/api/client.js
import axios from 'axios';

const base = `${import.meta.env.VITE_API_URL}/api/v1`;
export const api = axios.create({ baseURL: base });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('access_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const orig = error.config;
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && code === 'TOKEN_EXPIRADO' && !orig._retry) {
      orig._retry = true;
      refreshing ??= axios
        .post(`${base}/auth/refresh`, { refresh_token: localStorage.getItem('refresh_token') })
        .finally(() => { refreshing = null; });
      try {
        const { data } = await refreshing;
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        orig.headers.Authorization = `Bearer ${data.data.access_token}`;
        return api(orig);
      } catch {
        localStorage.clear();
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);
```

- Mostrar errores: `error.response.data.error.message`; para formularios, `details[].campo` indica el campo.
- **Registrar venta:** `POST /ventas` con `{ id_contacto?, metodo_pago, items: [{ id_producto, cantidad }] }`.
  No se envía precio: lo toma el servidor. La respuesta ya trae la venta completa para el comprobante.
  Deshabilita el botón mientras la petición está en curso para no registrar la venta dos veces.
- **Lector de código de barras:** `GET /productos?codigo_barras=...`.
- **Campanita de alertas:** `GET /alertas/resumen` cada 30 s (`refetchInterval` de TanStack Query).

### Validaciones que conviene replicar en el formulario (solo UX)
La API vuelve a validar todo; esto evita viajes de ida y vuelta.

| Campo | Regla |
|---|---|
| email | formato válido, máx. 254 |
| password (usuarios) | 8 a 72 caracteres |
| nombre (producto/contacto/categoría/usuario) | texto 2 a 150 (usuario 100, categoría 100) |
| precio_venta / precio_unitario | número ≥ 0, máx. 2 decimales |
| cantidad / stock_minimo | entero (cantidad ≥ 1) |
| documento (contacto) | 6 a 20 letras o números, sin espacios |
| teléfono | 6 a 20 caracteres: dígitos, `+ - ( )` y espacios |
| fecha_vencimiento | `YYYY-MM-DD`, no pasada |
| codigo_lote | 1 a 50 caracteres |
| motivo (anular/ajustar) | 3 a 300 caracteres |
| items | de 1 a 100 líneas |

## 4. Seguridad (qué hace el backend por ti)
- **Inyección SQL:** todas las consultas usan parámetros (`$1, $2…`); los nombres de columna de `sort` salen de una lista blanca;
  el texto de `search` escapa `%` y `_`. El frontend no es la defensa: aunque envíes algo raro, no llega al SQL como código.
- **Validación con Zod** en cada endpoint (los campos desconocidos se descartan).
- **Autenticación:** el JWT de Supabase se verifica (firma, emisor, expiración) y el rol se lee de `perfiles` en cada petición:
  desactivar a un usuario o cambiarle el rol surte efecto de inmediato.
- `helmet`, CORS con lista blanca, límite de peticiones (300/min) y de intentos de login (10 fallidos/15 min), cuerpo máx. 100 KB.
- Errores 500 sin detalles internos; logs con `pino` sin el header `Authorization`.

## 5. Despliegue (Render / Railway)
Build: `npm install` · Start: `npm start` · Node ≥ 20.6. Cargar las variables de la tabla de arriba en el panel del servicio
(no se sube `.env`). Luego añadir la URL del backend como `VITE_API_URL` en Vercel y la URL de Vercel en `CORS_ORIGINS`.
