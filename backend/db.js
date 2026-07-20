const sql = require('mssql');
require('dotenv').config();

// Configuración de conexión a SQL Server / Azure SQL (mismo criterio que
// proveedores, etiquetas y lavados: todos van a la base `controletiquetas`).
const dbConfig = {
    user: process.env.DB_USER || process.env.AZURE_SQL_USERNAME,
    password: process.env.DB_PASS || process.env.AZURE_SQL_PASSWORD,
    server: process.env.DB_SERVER || process.env.AZURE_SQL_SERVER,
    database: process.env.DB_NAME || process.env.AZURE_SQL_DATABASE,
    port: parseInt(process.env.DB_PORT || process.env.AZURE_SQL_PORT || '1433'),
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true' || !!process.env.AZURE_SQL_SERVER, // true para Azure
        trustServerCertificate: true, // útil para desarrollo local
    },
};

/**
 * Crea el esquema `compras` y sus tablas si no existen. Es idempotente: se
 * puede ejecutar en cada arranque sin duplicar nada.
 *
 * Los usuarios NO se crean acá: la identidad vive en el padrón central
 * acceso.Usuarios / acceso.Permisos, compartido con proveedores, etiquetas y
 * lavados. Este módulo solo lo lee (ver middleware/auth.js).
 *
 * Sobre las columnas: se mantienen en snake_case (fecha_fin, razon_social…)
 * porque son el contrato de la API que consume el frontend Angular. Los
 * nombres de tabla sí siguen la convención del resto de la base.
 */
async function inicializarEsquema(pool) {
    // CREATE SCHEMA debe ir en su propio batch.
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'compras')
            EXEC('CREATE SCHEMA compras');

        IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'acceso')
            EXEC('CREATE SCHEMA acceso');

        IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'comun')
            EXEC('CREATE SCHEMA comun');
    `);

    // --- Maestro CENTRAL de proveedores (esquema comun, compartido) ---
    // Una sola lista de proveedores para toda la empresa. Si otra app ya lo creó,
    // no hace nada. compras.Proveedores es una VISTA sobre esto (ver más abajo).
    await pool.request().query(`
        IF OBJECT_ID(N'[comun].[Proveedores]', N'U') IS NULL
        CREATE TABLE comun.Proveedores (
            ProveedorId   INT IDENTITY(1,1) PRIMARY KEY,
            Nombre        NVARCHAR(200) NOT NULL,
            Cuit          NVARCHAR(20)  NULL,
            Contacto      NVARCHAR(150) NULL,
            Email         NVARCHAR(256) NULL,
            Telefono      NVARCHAR(50)  NULL,
            Direccion     NVARCHAR(300) NULL,
            Activo        BIT NOT NULL DEFAULT 1,
            FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
    `);

    // --- Padrón central de acceso (compartido con las otras apps) ---
    // Si otra app ya lo creó, no hace nada. Este sistema solo lee de acá.
    await pool.request().query(`
        IF OBJECT_ID(N'[acceso].[Usuarios]', N'U') IS NULL
        CREATE TABLE acceso.Usuarios (
            UsuarioId INT IDENTITY(1,1) PRIMARY KEY,
            Email     NVARCHAR(256) NOT NULL,
            Nombre    NVARCHAR(200) NULL,
            Activo    BIT NOT NULL CONSTRAINT DF_acceso_Usuarios_Activo DEFAULT (1),
            CONSTRAINT UQ_acceso_Usuarios_Email UNIQUE (Email)
        );

        IF OBJECT_ID(N'[acceso].[Permisos]', N'U') IS NULL
        CREATE TABLE acceso.Permisos (
            UsuarioId INT NOT NULL,
            App       VARCHAR(30) NOT NULL,
            Rol       VARCHAR(30) NOT NULL,
            CONSTRAINT PK_acceso_Permisos PRIMARY KEY (UsuarioId, App),
            CONSTRAINT FK_acceso_Permisos_Usuario FOREIGN KEY (UsuarioId)
                REFERENCES acceso.Usuarios(UsuarioId) ON DELETE CASCADE
        );
    `);

    // --- compras.Proveedores: VISTA sobre el maestro comun.Proveedores ---
    // Fuente única de proveedores. Compras lista/crea/edita directamente en el
    // maestro, con los nombres de columna que la app ya usa (id, razon_social, ...).
    // Si existía como TABLA (versión vieja), se migra a vista (soltando la FK antes).
    await pool.request().query(`
        IF OBJECT_ID(N'[compras].[Proveedores]', N'U') IS NOT NULL
        BEGIN
            DECLARE @fkp SYSNAME, @sqlp NVARCHAR(MAX);
            SELECT @fkp = fk.name FROM sys.foreign_keys fk
            WHERE fk.parent_object_id = OBJECT_ID('compras.Contratos')
              AND fk.referenced_object_id = OBJECT_ID('compras.Proveedores');
            IF @fkp IS NOT NULL
            BEGIN
                SET @sqlp = N'ALTER TABLE compras.Contratos DROP CONSTRAINT ' + QUOTENAME(@fkp);
                EXEC sp_executesql @sqlp;
            END
            DROP TABLE compras.Proveedores;
        END
    `);
    await pool.request().query(`
        IF OBJECT_ID(N'[compras].[Proveedores]', N'V') IS NULL
        EXEC('CREATE VIEW compras.Proveedores AS
            SELECT ProveedorId AS id, Nombre AS razon_social, Contacto AS contacto,
                   Email AS email, Telefono AS telefono, Direccion AS direccion,
                   Activo AS activo, FechaCreacion AS created_at
            FROM comun.Proveedores');
    `);

    // --- Tablas propias (esquema compras) ---
    await pool.request().query(`
        IF OBJECT_ID(N'[compras].[Sectores]', N'U') IS NULL
        CREATE TABLE compras.Sectores (
            id         INT IDENTITY(1,1) PRIMARY KEY,
            nombre     NVARCHAR(120) NOT NULL,
            activo     BIT NOT NULL CONSTRAINT DF_compras_Sectores_Activo DEFAULT (1),
            created_at DATETIME2 NOT NULL CONSTRAINT DF_compras_Sectores_Created DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_compras_Sectores_Nombre UNIQUE (nombre)
        );
    `);

    await pool.request().query(`
        IF OBJECT_ID(N'[compras].[Contratos]', N'U') IS NULL
        CREATE TABLE compras.Contratos (
            id             INT IDENTITY(1,1) PRIMARY KEY,
            numero         NVARCHAR(60) NOT NULL,
            titulo         NVARCHAR(200) NOT NULL,
            descripcion    NVARCHAR(MAX) NULL,
            proveedor_id   INT NOT NULL,
            sector_id      INT NULL,
            tipo           VARCHAR(20) NOT NULL CONSTRAINT DF_compras_Contratos_Tipo DEFAULT 'servicio',
            monto          DECIMAL(14,2) NOT NULL CONSTRAINT DF_compras_Contratos_Monto DEFAULT 0,
            moneda         VARCHAR(3) NOT NULL CONSTRAINT DF_compras_Contratos_Moneda DEFAULT 'USD',
            fecha_inicio   DATE NOT NULL,
            fecha_fin      DATE NOT NULL,
            estado         VARCHAR(20) NOT NULL CONSTRAINT DF_compras_Contratos_Estado DEFAULT 'borrador',
            responsable    NVARCHAR(120) NULL,
            archivo_nombre NVARCHAR(255) NULL,
            archivo_ruta   NVARCHAR(500) NULL,
            created_at     DATETIME2 NOT NULL CONSTRAINT DF_compras_Contratos_Created DEFAULT SYSUTCDATETIME(),
            updated_at     DATETIME2 NOT NULL CONSTRAINT DF_compras_Contratos_Updated DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_compras_Contratos_Numero UNIQUE (numero),
            CONSTRAINT CK_compras_Contratos_Tipo CHECK (tipo IN
                ('servicio','suministro','arrendamiento','distribucion','confidencialidad','otro')),
            CONSTRAINT CK_compras_Contratos_Estado CHECK (estado IN
                ('borrador','activo','vencido','cancelado','renovado')),
            CONSTRAINT FK_compras_Contratos_Proveedor FOREIGN KEY (proveedor_id)
                REFERENCES comun.Proveedores(ProveedorId),
            CONSTRAINT FK_compras_Contratos_Sector FOREIGN KEY (sector_id)
                REFERENCES compras.Sectores(id)
        );
    `);

    // updated_at se actualiza explícitamente en cada UPDATE (ver routes/contratos.js).
    // No se usa un trigger a propósito: SQL Server no permite OUTPUT sin INTO
    // sobre tablas con triggers, y las rutas dependen de OUTPUT.
    await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_compras_Contratos_Estado')
            CREATE INDEX IX_compras_Contratos_Estado ON compras.Contratos (estado);

        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_compras_Contratos_FechaFin')
            CREATE INDEX IX_compras_Contratos_FechaFin ON compras.Contratos (fecha_fin);
    `);
}

// Conexión única (pool) reutilizada por toda la app.
const poolPromise = sql.connect(dbConfig)
    .then(async (pool) => {
        console.log('✅ Conectado a SQL Server');
        try {
            await inicializarEsquema(pool);
            console.log('✅ Esquema verificado/creado.');
        } catch (err) {
            console.error('⚠️ Error al inicializar el esquema:', err.message);
        }
        return pool;
    })
    .catch((err) => {
        console.error('❌ Error de conexión a SQL Server:', err.message);
        return null;
    });

module.exports = { sql, poolPromise };
