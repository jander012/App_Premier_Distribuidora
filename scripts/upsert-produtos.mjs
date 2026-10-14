/**
 * Atualiza/cria produtos a partir da planilha, pelo codigo unico (sped_code).
 * - Existe: atualiza nome e preco (e imagem, quando a linha tiver link).
 * - Nao existe: cria o produto na categoria da planilha.
 *
 * Uso: node scripts/upsert-produtos.mjs "<arquivo.xlsx>" [--no-images] [--dry-run]
 * Loja alvo: IMPORT_STORE_ID (padrao 1). Usa o banco configurado no .env.
 */
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const STORE_ID = Number(process.env.IMPORT_STORE_ID || 1);
const DRY_RUN = process.argv.includes('--dry-run');
const NO_IMAGES = process.argv.includes('--no-images');
const xlsxPath = process.argv.find((a) => /\.xlsx?$/i.test(a));

if (!xlsxPath || !fs.existsSync(xlsxPath)) {
  console.error('Uso: node scripts/upsert-produtos.mjs "<arquivo.xlsx>" [--no-images] [--dry-run]');
  process.exit(1);
}

const { parseProductsXlsx, upsertProducts } = await import(
  '../src/server/application/services/productImportService.js'
);
const { pool } = await import('../src/server/infrastructure/config/db.js');

try {
  const rows = parseProductsXlsx(fs.readFileSync(xlsxPath));
  console.log(`Planilha: ${rows.length} linha(s) válidas. Loja: ${STORE_ID}`);

  if (DRY_RUN) {
    console.log('Amostra:', rows.slice(0, 5));
    console.log(`Com link de imagem: ${rows.filter((r) => r.imageUrl).length}`);
  } else {
    const summary = await upsertProducts(STORE_ID, rows, { updateImages: !NO_IMAGES });
    console.log(
      `Criados: ${summary.created} | Atualizados: ${summary.updated} | Imagens: ${summary.imagesUpdated} | ` +
        `Ignorados: ${summary.skipped} | Erros: ${summary.errorCount}`
    );
    for (const er of summary.errors) console.log(`  Linha ${er.line}: ${er.error}`);
  }
} finally {
  await pool.end();
}
