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

Se despliega solo con **GitHub Actions** (`.github/workflows/main_appcompras.yml`)
en cada push a `main`: construye el frontend Angular, lo copia a `backend/public`,
instala las dependencias del backend y publica la carpeta `backend/` como app Node.
El backend sirve ese build, así que todo va en un mismo App Service, same-origin
(necesario para las cookies de Easy Auth). Azure arranca `node server.js` vía el
`package.json` del backend.

**App Service:** `appcompras` — Resource Group `AppCompras`, **Canada Central**
(distinta región que el resto de las apps Offal, que están en East US), Linux,
Node 24, plan P0v3. Dominio:
`appcompras-cng7b6ewgxdhaqbh.canadacentral-01.azurewebsites.net`.

### Puesta a punto en Azure (una sola vez)

1. **Secret de GitHub** `AZUREAPPSERVICE_PUBLISHPROFILE_APPCOMPRAS` con el publish
   profile de la app (Portal → *Get publish profile*; requiere *Basic authentication*
   habilitada en la app).
2. **App settings** (Settings → Environment variables), tomados de cualquier otra
   app Offal porque comparten la base `controletiquetas`:
   - `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE=controletiquetas`, `AZURE_SQL_USERNAME`,
     `AZURE_SQL_PASSWORD`, `AZURE_SQL_PORT=1433` (el código también acepta `DB_*`).
   - `NODE_ENV=production`
   - `UPLOAD_DIR=/home/data/contratos` (único disco persistente entre reinicios).
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (el paquete ya trae `node_modules`).
3. **Firewall del servidor SQL** → Networking → activar *Allow Azure services and
   resources to access this server* (clave: la app está en otra región).
4. **Authentication (Easy Auth)** contra el registro de Entra del ecosistema.
5. **Padrón:** filas en `acceso.Permisos` con `App='contratos'` para cada usuario
   habilitado (sin permiso: 403, y la app no aparece en el portal).

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
