require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const terr = 1175; // Eusebio Ayala (Municipio)
    const terrDep = 1007; // Central (Departamento)

    // Let's check how many recintos are in 1175
    const r1 = await prisma.$queryRawUnsafe(`
      SELECT IdRecinto, Recinto, IdMunicipio
      FROM [AppCampana1x10].[dbo].[TB_Recinto] WITH (NOLOCK)
      WHERE IdMunicipio = ${terr}
    `);
    console.log('Recintos for Municipio 1175:', r1);

    // Let's check how many recintos are in Departamento 1007 (Central)
    const r2 = await prisma.$queryRawUnsafe(`
      SELECT COUNT(1) AS TotalRecintos
      FROM [AppCampana1x10].[dbo].[TB_Recinto] r WITH (NOLOCK)
      INNER JOIN [AppCampana1x10].[dbo].[Territorio] t WITH (NOLOCK) ON t.IdTerritorio = r.IdMunicipio
      WHERE t.IdTerritorioPadre = ${terrDep} OR t.IdTerritorio = ${terrDep}
    `);
    console.log('Recintos for Departamento Central (1007):', r2);

    // Test query when IdTerritorio = 1175 and Texto = ''
    const sampleVotantes = await prisma.$queryRawUnsafe(`
      DECLARE @IdTerritorio INT = 1175;
      
      SELECT TOP 50
          v.IdVotante, v.Nombres, v.Apellidos, v.CI, v.EstadoRegistro, v.EstadoDiaD,
          v.IdRecinto, v.RecintoVotacion, v.Distrito, v.Departamento, v.NroMesa, v.OrdenMesa, v.IdRecintoOk
      FROM [AppCampana1x10].[dbo].[TB_Votante] v WITH (INDEX(IX_TB_Votante_IdRecintoOk), NOLOCK)
      WHERE v.IdRecintoOk IN (
          SELECT CAST(r.IdRecinto AS VARCHAR(50))
          FROM [AppCampana1x10].[dbo].[TB_Recinto] r WITH (NOLOCK)
          LEFT JOIN [AppCampana1x10].[dbo].[Territorio] t WITH (NOLOCK) ON t.IdTerritorio = r.IdMunicipio
          WHERE r.IdMunicipio = @IdTerritorio OR t.IdTerritorioPadre = @IdTerritorio
      )
      ORDER BY TRY_CAST(v.NroMesa AS INT) ASC, v.OrdenMesa ASC
    `);
    console.log('Sample votantes with IdTerritorio = 1175:', sampleVotantes.length);
    if (sampleVotantes.length > 0) {
      console.log('First votante:', sampleVotantes[0]);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
