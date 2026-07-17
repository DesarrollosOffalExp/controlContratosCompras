# Contratos Comerciales — sector Compras (Offal)

Módulo del ecosistema Offal para administrar contratos comerciales: CRUD de
contratos y proveedores, carga de PDF por contrato, dashboard con KPIs y alertas
de vencimiento. Comparte identidad visual, login e infraestructura con las otras
apps (proveedores, etiquetas, lavados) y el portal.

## Stack

- **Frontend:** Angular 19 (standalone components, signals) + Bootstrap 5 (tematizado a la paleta Offal) + Bootstrap Icons
- **Backend:** Node.js + Express + `mssql` (API REST)
- **Base de datos:** Azure SQL — base compartida `controletiquetas`, esquema propio **`compras`**
- **Identidad:** Azure App Service **Easy Auth** (Entra ID) + padrón central **`acceso`** (esquema compartido). No hay login propio.

## Identidad y acceso

El login lo resuelve Easy Auth a nivel plataforma; el backend lee la cabecera
`x-ms-client-principal-name` y autoriza contra `acceso.Usuarios` + `acceso.Permisos`
con `App = 'contratos'` (lista blanca: sin permiso → 403). Roles: `admin`,
`gestor`, `lector`.

> Para que un usuario vea este módulo (y su tarjeta en el portal) necesita una
> fila en `acceso.Permisos` con `App='contratos'` y el rol correspondiente.

En **desarrollo** (sin Easy Auth delante) el backend simula un usuario ADMIN;
se puede cambiar con `DEV_USER_ROLE` en `backend/.env`.

## Puesta en marcha (desarrollo)

### Backend

```bash
cd backend
npm install
# completar backend/.env con las credenciales de Azure SQL (ver .env.example)
npm run dev        # API en http://localhost:3000, crea el esquema `compras` si no existe
```

### Frontend

```bash
cd frontend
npm install
npm start          # app en http://localhost:4200; /api se proxea al backend (proxy.conf.json)
```

## Despliegue (Azure App Service)

El backend sirve el build de Angular (`frontend/dist/frontend/browser`), así que
todo va en un mismo App Service, same-origin (necesario para las cookies de Easy Auth).

1. `cd frontend && npm run build`
2. Desplegar el repo; el App Service arranca `backend/server.js`.
3. Activar **Authentication** (Easy Auth) contra el registro de Entra del ecosistema.
4. Variables: credenciales `AZURE_SQL_*` (o `DB_*`), `NODE_ENV=production`, y
   `UPLOAD_DIR=/home/data/contratos` (único disco persistente entre reinicios).

## API principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/me` | Identidad del usuario logueado (para la barra) |
| GET | `/api/contratos` | Listar (filtros: `estado`, `tipo`, `proveedor_id`, `buscar`, `por_vencer`) |
| POST/PUT/DELETE | `/api/contratos/:id` | CRUD de contratos |
| POST/GET/DELETE | `/api/contratos/:id/archivo` | Subir / descargar / quitar el PDF |
| GET/POST/PUT/DELETE | `/api/proveedores` | CRUD de proveedores |
| GET/POST/PUT/DELETE | `/api/sectores` | CRUD de sectores |
| GET | `/api/dashboard` | KPIs para el panel |

## Alertas de vencimiento

- El dashboard muestra los contratos activos que vencen en los próximos 30 días.
- En el listado, los contratos por vencer se resaltan y los vencidos también.
- `dias_restantes` se calcula en el servidor con `DATEDIFF`.
