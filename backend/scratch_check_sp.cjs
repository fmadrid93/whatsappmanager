require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const terr = 1175; // Eusebio Ayala
    console.time('query-territorio-only');
    const recintos = await prisma.$queryRawUnsafe(`
      SELECT CAST(r.IdRecinto AS VARCHAR(50)) AS IdRecinto
      FROM [AppCampana1x10].[dbo].[TB_Recinto] r WITH (NOLOCK)
      WHERE r.IdMunicipio = ${terr}
         OR r.IdMunicipio IN (SELECT IdTerritorio FROM [AppCampana1x10].[dbo].[Territorio] WITH (NOLOCK) WHERE IdTerritorioPadre = ${terr})
    `);
    console.log('Recintos in territory', terr, ':', recintos.length);

    const votantes = await prisma.$queryRawUnsafe(`
      SELECT TOP 100
          v.IdVotante, v.Nombres, v.Apellidos, v.CI, v.EstadoRegistro, v.EstadoDiaD,
          v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk
      FROM [AppCampana1x10].[dbo].[TB_Recinto] r WITH (NOLOCK)
      INNER JOIN [AppCampana1x10].[dbo].[TB_Votante] v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
          ON v.IdRecintoOk = CAST(r.IdRecinto AS VARCHAR(50))
      WHERE r.IdMunicipio = ${terr}
         OR r.IdMunicipio IN (SELECT IdTerritorio FROM [AppCampana1x10].[dbo].[Territorio] WITH (NOLOCK) WHERE IdTerritorioPadre = ${terr})
      ORDER BY v.NroMesa ASC, v.OrdenMesa ASC
    `);
    console.timeEnd('query-territorio-only');
    console.log('Votantes found:', votantes.length, 'First 3:', votantes.slice(0, 3));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
