#!/usr/bin/env node
/**
 * generate-sprites.js
 * Combines individual icon files into CSS sprite sheets per category.
 * Generates spriteMap.json for the SpriteIcon component.
 *
 * Usage: node scripts/generate-sprites.js
 * Requires: sharp (npm install --save-dev sharp)
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ICON_SIZE = 64; // px per icon in sprite
const COLS = 20;      // icons per row
const MAX_PER_SHEET = 500; // max icons per sheet to keep file size < 2MB
const SPRITES_DIR = path.join(ROOT, 'public', 'sprites');
const SPRITE_MAP_PATH = path.join(ROOT, 'src', 'assets', 'spriteMap.json');

/**
 * Collect all .webp files from a directory (non-recursive).
 */
function getWebpFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.webp'))
    .sort()
    .map(f => path.join(dir, f));
}

/**
 * Resize an icon to fit within ICON_SIZE x ICON_SIZE, centered on transparent bg.
 */
async function resizeIcon(filePath) {
  try {
    const resized = await sharp(filePath)
      .resize(ICON_SIZE, ICON_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png() // intermediate as PNG for compositing (lossless)
      .toBuffer();
    return resized;
  } catch (err) {
    console.warn(`  ⚠ Failed to process ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Build sprite sheet(s) from a list of {name, filePath} entries.
 * Returns array of { sheetFile, entries: [{name, x, y}] }
 */
async function buildSpriteSheets(icons, sheetPrefix) {
  const sheets = [];
  const chunks = [];

  // Split into chunks of MAX_PER_SHEET
  for (let i = 0; i < icons.length; i += MAX_PER_SHEET) {
    chunks.push(icons.slice(i, i + MAX_PER_SHEET));
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const suffix = chunks.length > 1 ? `-${ci + 1}` : '';
    const sheetFile = `${sheetPrefix}${suffix}.webp`;
    const rows = Math.ceil(chunk.length / COLS);
    const width = COLS * ICON_SIZE;
    const height = rows * ICON_SIZE;

    console.log(`  Building ${sheetFile}: ${chunk.length} icons, ${COLS}x${rows} grid (${width}x${height}px)`);

    // Prepare composite operations
    const composites = [];
    const entries = [];

    for (let i = 0; i < chunk.length; i++) {
      const { name, filePath } = chunk[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = col * ICON_SIZE;
      const y = row * ICON_SIZE;

      const buf = await resizeIcon(filePath);
      if (buf) {
        composites.push({ input: buf, left: x, top: y });
      }
      entries.push({ name, x, y });
    }

    // Create the sprite sheet
    const sheetPath = path.join(SPRITES_DIR, sheetFile);
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ quality: 80 })
      .toFile(sheetPath);

    const stat = fs.statSync(sheetPath);
    console.log(`  ✓ ${sheetFile}: ${(stat.size / 1024).toFixed(1)} KB`);

    sheets.push({ sheetFile, entries });
  }

  return sheets;
}

/**
 * Build the pokemon sprite map.
 * Key: slug (filename without extension)
 */
async function buildPokemon() {
  console.log('\n🔴 Pokemon sprites...');
  const dir = path.join(ROOT, 'public', 'icons', 'pokemon');
  const files = getWebpFiles(dir);
  console.log(`  Found ${files.length} pokemon icons`);

  const icons = files.map(f => ({
    name: path.basename(f, '.webp'),
    filePath: f,
  }));

  const sheets = await buildSpriteSheets(icons, 'pokemon-sprite');
  const map = {};
  for (const sheet of sheets) {
    for (const entry of sheet.entries) {
      map[entry.name] = {
        sheet: sheet.sheetFile,
        x: entry.x,
        y: entry.y,
        w: ICON_SIZE,
        h: ICON_SIZE,
      };
    }
  }
  return map;
}

/**
 * Build the habitats sprite map.
 * Key: full filename without extension (e.g., "park-bench-066")
 */
async function buildHabitats() {
  console.log('\n🏠 Habitat sprites...');
  const dir = path.join(ROOT, 'public', 'icons', 'habitats');
  const files = getWebpFiles(dir);
  console.log(`  Found ${files.length} habitat icons`);

  const icons = files.map(f => ({
    name: path.basename(f, '.webp'),
    filePath: f,
  }));

  const sheets = await buildSpriteSheets(icons, 'habitats-sprite');
  const map = {};
  for (const sheet of sheets) {
    for (const entry of sheet.entries) {
      map[entry.name] = {
        sheet: sheet.sheetFile,
        x: entry.x,
        y: entry.y,
        w: ICON_SIZE,
        h: ICON_SIZE,
      };
    }
  }
  return map;
}

/**
 * Build the items sprite map.
 * Key: "subdir/filename" (e.g., "item_ui/bean") to match icon_map.json paths.
 */
async function buildItems() {
  console.log('\n🎒 Item sprites...');
  const itemsDir = path.join(ROOT, 'public', 'icons', 'items');
  const subdirs = ['item_ui', 'dream_ui', 'shop_ui', 'crafting_ui', 'habitat_ui'];

  const allIcons = [];
  for (const sub of subdirs) {
    const dir = path.join(itemsDir, sub);
    const files = getWebpFiles(dir);
    console.log(`  ${sub}: ${files.length} icons`);
    for (const f of files) {
      const basename = path.basename(f, '.webp');
      allIcons.push({
        name: `${sub}/${basename}`,
        filePath: f,
      });
    }
  }

  console.log(`  Total items: ${allIcons.length}`);
  const sheets = await buildSpriteSheets(allIcons, 'items-sprite');
  const map = {};
  for (const sheet of sheets) {
    for (const entry of sheet.entries) {
      map[entry.name] = {
        sheet: sheet.sheetFile,
        x: entry.x,
        y: entry.y,
        w: ICON_SIZE,
        h: ICON_SIZE,
      };
    }
  }
  return map;
}

async function main() {
  console.log('🎨 Pokopia Sprite Sheet Generator');
  console.log(`  Icon size: ${ICON_SIZE}x${ICON_SIZE}px`);
  console.log(`  Columns: ${COLS}`);
  console.log(`  Max per sheet: ${MAX_PER_SHEET}`);

  // Ensure output directory exists
  fs.mkdirSync(SPRITES_DIR, { recursive: true });

  const spriteMap = {
    _meta: {
      iconSize: ICON_SIZE,
      generatedAt: new Date().toISOString(),
    },
    pokemon: await buildPokemon(),
    habitats: await buildHabitats(),
    items: await buildItems(),
  };

  // Write sprite map
  fs.writeFileSync(SPRITE_MAP_PATH, JSON.stringify(spriteMap, null, 2));
  console.log(`\n✅ Sprite map written to ${path.relative(ROOT, SPRITE_MAP_PATH)}`);

  // Summary
  const pokemonCount = Object.keys(spriteMap.pokemon).length;
  const habitatCount = Object.keys(spriteMap.habitats).length;
  const itemCount = Object.keys(spriteMap.items).length;
  console.log(`\n📊 Summary:`);
  console.log(`  Pokemon: ${pokemonCount} icons`);
  console.log(`  Habitats: ${habitatCount} icons`);
  console.log(`  Items: ${itemCount} icons`);
  console.log(`  Total: ${pokemonCount + habitatCount + itemCount} icons`);

  // List generated sprite sheets
  const spriteFiles = fs.readdirSync(SPRITES_DIR).filter(f => f.endsWith('.webp'));
  console.log(`\n📁 Generated sprite sheets:`);
  for (const f of spriteFiles) {
    const stat = fs.statSync(path.join(SPRITES_DIR, f));
    console.log(`  ${f}: ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
