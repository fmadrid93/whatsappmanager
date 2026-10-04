require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT i.name AS IndexName, c.name AS ColumnName, i.type_desc
      FROM [AppCampana1x10].sys.indexes i
      INNER JOIN [AppCampana1x10].sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN [AppCampana1x10].sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID('[AppCampana1x10].[dbo].[TB_Votante]')
    `);
    console.log('Indexes on TB_Votante:', indexes);

    const cols = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM [AppCampana1x10].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'TB_Votante'
    `);
    console.log('TB_Votante columns:', cols);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
