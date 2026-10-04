require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sqlSpBody = `
USE [AppCampana1x10];
EXEC('
CREATE OR ALTER PROCEDURE dbo.PA_VOTANTE_BUSCAR_PADRON_GLOBAL
    @Texto VARCHAR(100) = '''',
    @IdRecinto VARCHAR(150) = NULL,
    @NroMesa VARCHAR(50) = NULL,
    @IdTerritorio INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SET @Texto = LTRIM(RTRIM(ISNULL(@Texto, '''')));
    SET @IdRecinto = NULLIF(LTRIM(RTRIM(ISNULL(@IdRecinto, ''''))), '''');
    SET @NroMesa = NULLIF(LTRIM(RTRIM(ISNULL(@NroMesa, ''''))), '''');

    DECLARE @EsNumero BIT = 0;
    IF (@Texto <> '''' AND @Texto NOT LIKE ''%[^0-9]%'')
        SET @EsNumero = 1;

    DECLARE @IdRecintoGuid VARCHAR(50) = NULL;
    DECLARE @IdRecintoLegado VARCHAR(50) = NULL;

    IF (@IdRecinto IS NOT NULL)
    BEGIN
        IF (TRY_CAST(@IdRecinto AS UNIQUEIDENTIFIER) IS NOT NULL)
            SET @IdRecintoGuid = @IdRecinto;
        ELSE
            SET @IdRecintoLegado = @IdRecinto;
    END;

    CREATE TABLE #Resultados (
        IdVotante VARCHAR(150) COLLATE Modern_Spanish_CI_AS,
        Nombres VARCHAR(150) COLLATE Modern_Spanish_CI_AS,
        Apellidos VARCHAR(150) COLLATE Modern_Spanish_CI_AS,
        NombreCompleto VARCHAR(300) COLLATE Modern_Spanish_CI_AS,
        CI VARCHAR(30) COLLATE Modern_Spanish_CI_AS PRIMARY KEY,
        EstadoRegistro VARCHAR(50) COLLATE Modern_Spanish_CI_AS,
        EstadoDiaD VARCHAR(50) COLLATE Modern_Spanish_CI_AS,
        FechaRegistro DATETIME,
        FechaMarcaDiaD DATETIME,
        IdUsuarioMarcaDiaD INT,
        Sexo VARCHAR(20) COLLATE Modern_Spanish_CI_AS,
        IdRecintoLegado VARCHAR(150) COLLATE Modern_Spanish_CI_AS,
        RecintoVotacion VARCHAR(250) COLLATE Modern_Spanish_CI_AS,
        Distrito VARCHAR(150) COLLATE Modern_Spanish_CI_AS,
        Departamento VARCHAR(150) COLLATE Modern_Spanish_CI_AS,
        NroMesa VARCHAR(50) COLLATE Modern_Spanish_CI_AS,
        NroOrden INT,
        IdRecinto VARCHAR(50) COLLATE Modern_Spanish_CI_AS,
        PasoPorElPC BIT,
        FechaPasoPorElPC DATETIME,
        IdUsuarioMarcaPasoPC INT,
        PerteneceAOtroRecinto BIT
    );

    -- ============================================================
    -- CASO A: Filtro por Recinto GUID
    -- ============================================================
    IF (@IdRecintoGuid IS NOT NULL)
    BEGIN
        -- 1. Carga inicial del recinto (Texto vacío)
        IF (@Texto = '''')
        BEGIN
            IF (@NroMesa IS NOT NULL)
            BEGIN
                INSERT INTO #Resultados
                SELECT TOP 300
                    v.IdVotante, v.Nombres, v.Apellidos,
                    LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                    v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                    NULL, NULL, 0, v.Sexo,
                    NULL, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                    ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                    0
                FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
                WHERE v.IdRecintoOk = @IdRecintoGuid AND v.NroMesa = @NroMesa
                ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
                OPTION (RECOMPILE);
            END
            ELSE
            BEGIN
                INSERT INTO #Resultados
                SELECT TOP 300
                    v.IdVotante, v.Nombres, v.Apellidos,
                    LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                    v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                    NULL, NULL, 0, v.Sexo,
                    NULL, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                    ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                    0
                FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
                WHERE v.IdRecintoOk = @IdRecintoGuid
                ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
                OPTION (RECOMPILE);
            END;
        END
        -- 2. Búsqueda numérica (CI exacto/prefijo o Nro de Orden) en propio recinto
        ELSE IF (@EsNumero = 1)
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                NULL, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            WHERE v.CI = @Texto
              AND v.IdRecintoOk = @IdRecintoGuid
              AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
            OPTION (RECOMPILE);

            IF NOT EXISTS (SELECT 1 FROM #Resultados)
            BEGIN
                INSERT INTO #Resultados
                SELECT TOP 50
                    v.IdVotante, v.Nombres, v.Apellidos,
                    LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                    v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                    NULL, NULL, 0, v.Sexo,
                    NULL, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                    ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                    0
                FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
                WHERE v.IdRecintoOk = @IdRecintoGuid
                  AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
                  AND (v.CI LIKE @Texto + ''%'' OR v.OrdenMesa = TRY_CAST(@Texto AS INT))
                ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
                OPTION (RECOMPILE);
            END;
        END
        -- 3. Búsqueda por Nombre dentro del propio recinto
        ELSE
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                NULL, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
            WHERE v.IdRecintoOk = @IdRecintoGuid
              AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
              AND (v.Nombres LIKE ''%'' + @Texto + ''%'' OR v.Apellidos LIKE ''%'' + @Texto + ''%'')
            ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
            OPTION (RECOMPILE);
        END;

        -- 4. Fallback exacto en otros recintos si no se encontró en el propio
        IF NOT EXISTS (SELECT 1 FROM #Resultados) AND @Texto <> '''' AND @EsNumero = 1
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 5
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                1
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            WHERE v.CI = @Texto
            OPTION (RECOMPILE);
        END;
    END
    -- ============================================================
    -- CASO B: Filtro por Recinto Legado (si no era GUID)
    -- ============================================================
    ELSE IF (@IdRecintoLegado IS NOT NULL)
    BEGIN
        IF (@Texto = '''')
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 300
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecinto), NOLOCK)
            WHERE v.IdRecinto = @IdRecintoLegado
              AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
            ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
            OPTION (RECOMPILE);
        END
        ELSE IF (@EsNumero = 1)
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            WHERE v.CI = @Texto
              AND v.IdRecinto = @IdRecintoLegado
              AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
            OPTION (RECOMPILE);

            IF NOT EXISTS (SELECT 1 FROM #Resultados)
            BEGIN
                INSERT INTO #Resultados
                SELECT TOP 50
                    v.IdVotante, v.Nombres, v.Apellidos,
                    LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                    v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                    NULL, NULL, 0, v.Sexo,
                    v.IdRecinto, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                    ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                    0
                FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecinto), NOLOCK)
                WHERE v.IdRecinto = @IdRecintoLegado
                  AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
                  AND (v.CI LIKE @Texto + ''%'' OR v.OrdenMesa = TRY_CAST(@Texto AS INT))
                ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
                OPTION (RECOMPILE);
            END;
        END
        ELSE
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, NULL, NULL, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecinto), NOLOCK)
            WHERE v.IdRecinto = @IdRecintoLegado
              AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
              AND (v.Nombres LIKE ''%'' + @Texto + ''%'' OR v.Apellidos LIKE ''%'' + @Texto + ''%'')
            ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
            OPTION (RECOMPILE);
        END;

        IF NOT EXISTS (SELECT 1 FROM #Resultados) AND @Texto <> '''' AND @EsNumero = 1
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 5
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                1
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            WHERE v.CI = @Texto
            OPTION (RECOMPILE);
        END;
    END
    -- ============================================================
    -- CASO C: Filtro por Territorio (Sin recinto específico)
    -- ============================================================
    ELSE IF (@IdTerritorio IS NOT NULL)
    BEGIN
        DECLARE @RecintosTerritorio TABLE (IdRecintoGuid VARCHAR(50) COLLATE Modern_Spanish_CI_AS PRIMARY KEY);
        
        INSERT INTO @RecintosTerritorio (IdRecintoGuid)
        SELECT DISTINCT CAST(r.IdRecinto AS VARCHAR(50))
        FROM dbo.TB_Recinto r WITH (NOLOCK)
        LEFT JOIN dbo.Territorio t WITH (NOLOCK) ON t.IdTerritorio = r.IdMunicipio
        WHERE r.IdRecinto IS NOT NULL 
          AND (r.IdMunicipio = @IdTerritorio OR t.IdTerritorioPadre = @IdTerritorio);

        -- C1. Todo nulo excepto IdTerritorio (Carga inicial del municipio o departamento)
        IF (@Texto = '''')
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 300
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM @RecintosTerritorio rec
            CROSS APPLY (
                SELECT TOP 100
                    v.IdVotante, v.Nombres, v.Apellidos, v.CI, v.EstadoRegistro, v.EstadoDiaD,
                    v.Sexo, v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                    v.PasoPorElPC, v.FechaPasoPorElPC
                FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
                WHERE v.IdRecintoOk = rec.IdRecintoGuid
                  AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
                ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
            ) v
            ORDER BY v.RecintoVotacion ASC, TRY_CAST(v.NroMesa AS INT) ASC, v.OrdenMesa ASC
            OPTION (RECOMPILE);
        END
        -- C2. Búsqueda numérica (CI) con territorio
        ELSE IF (@EsNumero = 1)
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                CASE WHEN rec.IdRecintoGuid IS NOT NULL THEN 0 ELSE 1 END
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            LEFT JOIN @RecintosTerritorio rec ON rec.IdRecintoGuid = v.IdRecintoOk
            WHERE v.CI = @Texto OR v.CI LIKE @Texto + ''%''
            ORDER BY (CASE WHEN rec.IdRecintoGuid IS NOT NULL THEN 0 ELSE 1 END) ASC, v.CI ASC
            OPTION (RECOMPILE);
        END
        -- C3. Búsqueda por texto (Nombres) dentro del territorio
        ELSE
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 100
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM @RecintosTerritorio rec
            CROSS APPLY (
                SELECT TOP 50
                    v.IdVotante, v.Nombres, v.Apellidos, v.CI, v.EstadoRegistro, v.EstadoDiaD,
                    v.Sexo, v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                    v.PasoPorElPC, v.FechaPasoPorElPC
                FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
                WHERE v.IdRecintoOk = rec.IdRecintoGuid
                  AND (v.Nombres LIKE ''%'' + @Texto + ''%'' OR v.Apellidos LIKE ''%'' + @Texto + ''%'')
                  AND (@NroMesa IS NULL OR v.NroMesa = @NroMesa)
            ) v
            ORDER BY v.RecintoVotacion ASC, TRY_CAST(v.NroMesa AS INT) ASC, v.OrdenMesa ASC
            OPTION (RECOMPILE);
        END;
    END
    -- ============================================================
    -- CASO D: Búsqueda Global (Sin recinto ni territorio)
    -- ============================================================
    ELSE
    BEGIN
        IF (@Texto = '''')
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 100
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            ORDER BY v.CI ASC
            OPTION (RECOMPILE);
        END
        ELSE IF (@EsNumero = 1)
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (INDEX(IX_TB_Votante_CI), NOLOCK)
            WHERE v.CI = @Texto OR v.CI LIKE @Texto + ''%''
            ORDER BY v.CI ASC
            OPTION (RECOMPILE);
        END
        ELSE
        BEGIN
            INSERT INTO #Resultados
            SELECT TOP 50
                v.IdVotante, v.Nombres, v.Apellidos,
                LTRIM(RTRIM(ISNULL(v.Nombres, ''''))) + '' '' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''''))),
                v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, ''PENDIENTE''),
                NULL, NULL, 0, v.Sexo,
                v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
                ISNULL(v.PasoPorElPC, 0), v.FechaPasoPorElPC, NULL,
                0
            FROM dbo.TB_Votante v WITH (NOLOCK)
            WHERE (v.Nombres LIKE ''%'' + @Texto + ''%'' OR v.Apellidos LIKE ''%'' + @Texto + ''%'')
            OPTION (RECOMPILE);
        END;
    END;

    -- ============================================================
    -- SALIDA FINAL ENRIQUECIDA CON CRUCE 1X10 Y USUARIOS
    -- ============================================================
    SELECT 
        u.IdVotante,
        u.Nombres,
        u.Apellidos,
        u.NombreCompleto,
        u.CI,
        u.EstadoRegistro,
        u.EstadoDiaD,
        u.FechaRegistro,
        u.FechaMarcaDiaD,
        u.IdUsuarioMarcaDiaD,
        uMarcaVoto.NombreCompleto AS NombreUsuarioMarcaDiaD,
        uMarcaVoto.Usuario AS UsuarioMarcaDiaD,
        uSupVoto.NombreCompleto AS SupervisorUsuarioMarcaDiaD,
        u.Sexo,
        u.IdRecintoLegado,
        u.RecintoVotacion,
        COALESCE(u.Distrito, tMun.Nombre, '''') AS Municipio,
        COALESCE(u.Distrito, tMun.Nombre, '''') AS Distrito,
        COALESCE(u.Departamento, tDep.Nombre, '''') AS Departamento,
        u.NroMesa,
        u.NroOrden,
        u.IdRecinto,
        u.PasoPorElPC,
        u.FechaPasoPorElPC,
        u.IdUsuarioMarcaPasoPC,
        uMarcaPC.NombreCompleto AS NombreUsuarioMarcaPasoPC,
        uMarcaPC.Usuario AS UsuarioMarcaPasoPC,
        uSupPC.NombreCompleto AS SupervisorUsuarioMarcaPasoPC,
        CASE WHEN pm.IdPersonaMovilizada IS NOT NULL THEN 1 ELSE 0 END AS EsEstructura1x10,
        pm.IdPersonaMovilizada,
        pm.Celular AS CelularVotante,
        uMov.NombreCompleto AS Movilizador,
        uMov.Celular AS CelularMovilizador,
        uGer.NombreCompleto AS Gerente,
        uGer.Celular AS CelularGerente,
        u.PerteneceAOtroRecinto
    FROM #Resultados u
    LEFT JOIN dbo.TB_Recinto rRec WITH (NOLOCK) ON rRec.IdRecinto = TRY_CAST(u.IdRecinto AS UNIQUEIDENTIFIER)
    LEFT JOIN dbo.Territorio tMun WITH (NOLOCK) ON tMun.IdTerritorio = rRec.IdMunicipio
    LEFT JOIN dbo.Territorio tDep WITH (NOLOCK) ON tDep.IdTerritorio = tMun.IdTerritorioPadre
    LEFT JOIN dbo.PersonaMovilizada pm WITH (NOLOCK) 
        ON pm.CI = u.CI AND (pm.Activo IS NULL OR pm.Activo = 1)
    LEFT JOIN dbo.Usuario uMov WITH (NOLOCK) ON uMov.IdUsuario = pm.IdUsuarioMovilizador
    LEFT JOIN dbo.Usuario uGer WITH (NOLOCK) ON uGer.IdUsuario = uMov.IdUsuarioSupervisor
    LEFT JOIN dbo.Usuario uMarcaVoto WITH (NOLOCK) ON uMarcaVoto.IdUsuario = u.IdUsuarioMarcaDiaD
    LEFT JOIN dbo.Usuario uSupVoto WITH (NOLOCK) ON uSupVoto.IdUsuario = uMarcaVoto.IdUsuarioSupervisor
    LEFT JOIN dbo.Usuario uMarcaPC WITH (NOLOCK) ON uMarcaPC.IdUsuario = u.IdUsuarioMarcaPasoPC
    LEFT JOIN dbo.Usuario uSupPC WITH (NOLOCK) ON uSupPC.IdUsuario = uMarcaPC.IdUsuarioSupervisor
    ORDER BY 
        u.PerteneceAOtroRecinto ASC,
        CASE WHEN pm.IdPersonaMovilizada IS NOT NULL THEN 0 ELSE 1 END ASC,
        u.RecintoVotacion ASC,
        TRY_CAST(u.NroMesa AS INT) ASC, 
        u.NroOrden ASC
    OPTION (RECOMPILE);

    DROP TABLE #Resultados;
END;
');
`;

async function test() {
  try {
    console.log('Deploying updated PA_VOTANTE_BUSCAR_PADRON_GLOBAL to [AppCampana1x10]...');
    await prisma.$executeRawUnsafe(sqlSpBody);
    console.log('SP deployed successfully to [AppCampana1x10]!');

    // Test 1: All null except IdTerritorio = 1175 (Eusebio Ayala)
    console.time('Test 1: IdTerritorio only (Eusebio Ayala)');
    const r1 = await prisma.$queryRawUnsafe(`
      EXEC [AppCampana1x10].dbo.PA_VOTANTE_BUSCAR_PADRON_GLOBAL @Texto = '', @IdRecinto = NULL, @NroMesa = NULL, @IdTerritorio = 1175
    `);
    console.timeEnd('Test 1: IdTerritorio only (Eusebio Ayala)');
    console.log('Test 1 rows returned:', r1.length, 'Sample:', r1[0]?.NombreCompleto, '|', r1[0]?.RecintoVotacion, '| Mesa:', r1[0]?.NroMesa);

    // Test 2: IdTerritorio = 1007 (Central - Departamento)
    console.time('Test 2: IdTerritorio only (Central)');
    const r2 = await prisma.$queryRawUnsafe(`
      EXEC [AppCampana1x10].dbo.PA_VOTANTE_BUSCAR_PADRON_GLOBAL @Texto = '', @IdRecinto = NULL, @NroMesa = NULL, @IdTerritorio = 1007
    `);
    console.timeEnd('Test 2: IdTerritorio only (Central)');
    console.log('Test 2 rows returned:', r2.length, 'Sample:', r2[0]?.NombreCompleto, '|', r2[0]?.RecintoVotacion);

    // Test 3: IdTerritorio with numeric CI search
    console.time('Test 3: IdTerritorio with CI search');
    const r3 = await prisma.$queryRawUnsafe(`
      EXEC [AppCampana1x10].dbo.PA_VOTANTE_BUSCAR_PADRON_GLOBAL @Texto = '2637155', @IdRecinto = NULL, @NroMesa = NULL, @IdTerritorio = 1175
    `);
    console.timeEnd('Test 3: IdTerritorio with CI search');
    console.log('Test 3 rows returned:', r3.length, 'Sample:', r3[0]?.NombreCompleto, '| PerteneceAOtroRecinto:', r3[0]?.PerteneceAOtroRecinto);

    // Test 4: IdTerritorio with name search
    console.time('Test 4: IdTerritorio with Name search');
    const r4 = await prisma.$queryRawUnsafe(`
      EXEC [AppCampana1x10].dbo.PA_VOTANTE_BUSCAR_PADRON_GLOBAL @Texto = 'GONZALEZ', @IdRecinto = NULL, @NroMesa = NULL, @IdTerritorio = 1175
    `);
    console.timeEnd('Test 4: IdTerritorio with Name search');
    console.log('Test 4 rows returned:', r4.length, 'Sample:', r4[0]?.NombreCompleto);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}
test();
