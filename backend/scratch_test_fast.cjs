require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const terr = 1175; // Eusebio Ayala

    console.time('fast-territorio-query');
    const result = await prisma.$queryRawUnsafe(`
      DECLARE @IdTerritorio INT = ${terr};
      DECLARE @Recintos TABLE (IdRecintoGuid VARCHAR(50) COLLATE Modern_Spanish_CI_AS PRIMARY KEY);
      
      INSERT INTO @Recintos (IdRecintoGuid)
      SELECT DISTINCT CAST(r.IdRecinto AS VARCHAR(50))
      FROM [AppCampana1x10].[dbo].[TB_Recinto] r WITH (NOLOCK)
      LEFT JOIN [AppCampana1x10].[dbo].[Territorio] t WITH (NOLOCK) ON t.IdTerritorio = r.IdMunicipio
      WHERE r.IdRecinto IS NOT NULL 
        AND (r.IdMunicipio = @IdTerritorio OR t.IdTerritorioPadre = @IdTerritorio);

      SELECT TOP 300
          v.IdVotante, v.Nombres, v.Apellidos,
          LTRIM(RTRIM(ISNULL(v.Nombres, ''))) + ' ' + LTRIM(RTRIM(ISNULL(v.Apellidos, ''))) AS NombreCompleto,
          v.CI, v.EstadoRegistro, ISNULL(v.EstadoDiaD, 'PENDIENTE') AS EstadoDiaD,
          NULL AS FechaRegistro, NULL AS FechaMarcaDiaD, 0 AS IdUsuarioMarcaDiaD, v.Sexo,
          v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
          ISNULL(v.PasoPorElPC, 0) AS PasoPorElPC, v.FechaPasoPorElPC, NULL AS IdUsuarioMarcaPasoPC,
          0 AS PerteneceAOtroRecinto
      FROM @Recintos rec
      CROSS APPLY (
          SELECT TOP 60
              v.IdVotante, v.Nombres, v.Apellidos, v.CI, v.EstadoRegistro, v.EstadoDiaD,
              v.Sexo, v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk,
              v.PasoPorElPC, v.FechaPasoPorElPC
          FROM [AppCampana1x10].[dbo].[TB_Votante] v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
          WHERE v.IdRecintoOk = rec.IdRecintoGuid
          ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
      ) v
      ORDER BY v.RecintoVotacion ASC, TRY_CAST(v.NroMesa AS INT) ASC, v.OrdenMesa ASC
    `);
    console.timeEnd('fast-territorio-query');
    console.log('Result count:', result.length);
    if (result.length > 0) {
      console.log('Sample 1:', result[0]);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
