/* Проверка разбора и расчёта на примере из samples/. Запуск: npm test */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBuffer, parseBom } from '../src/lib/parse';
import { calculate, materialKey, parseMaterial } from '../src/lib/calc';
import { groupByAssembly, groupBySite } from '../src/lib/sections';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = join(here, '..', 'samples', '2025-06R1_ВЛП-0012_Спец_1.txt');
const buf = readFileSync(samplePath);
const { text, encoding } = decodeBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const file = parseBom(text, 'sample.txt', encoding);

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log('  ✓', name);
};
const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `ожидалось ${b}, получено ${a}`);

console.log('Разбор');
test('заголовок — первая строка, 13 колонок', () => {
  assert.equal(file.headers.length, 13);
  assert.equal(file.headers[0], 'Артикул');
  assert.equal(file.headers[12], 'Описание');
  assert.deepEqual(file.missing, []);
});
test('33 строки данных, кодировка UTF-8', () => {
  assert.equal(file.rows.length, 33);
  assert.equal(encoding, 'UTF-8');
});
test('вложенность по номерам и количества с учётом сборок', () => {
  const byNum = (n: string) => file.rows.find((r) => r.number === n)!;
  assert.equal(byNum('1.1').parent, byNum('1').id);
  assert.equal(byNum('1.6').totalQty, 4); // 2 сборки × 2 пятки
  assert.equal(byNum('2.4').totalQty, 3); // 3 сборки × 1
  assert.equal(byNum('4.2').totalQty, 32); // 16 перемычек × 2 платика
  assert.equal(byNum('5').totalQty, 21); // деталь верхнего уровня
  assert.equal(byNum('1').isAssembly, true);
  assert.equal(byNum('5').isAssembly, false);
  assert.equal(byNum('1.6').effectiveCoating, 'RAL 7024 шагрень');
  assert.equal(byNum('5').effectiveCoating, '');
});
test('числовые колонки определены', () => {
  const h = (name: string) => file.headers.indexOf(name);
  assert.equal(file.numericCols[h('Масса, г')], true);
  assert.equal(file.numericCols[h('Длина заготовки, мм')], true);
  assert.equal(file.numericCols[h('№')], false);
  assert.equal(file.numericCols[h('Наименование')], false);
});

console.log('Материалы');
test('распознавание размеров', () => {
  assert.deepEqual(parseMaterial('Труба 40x25x2'), { kind: 'tube-rect', dims: [40, 25, 2] });
  assert.deepEqual(parseMaterial('Труба 40х40х2'), { kind: 'tube-rect', dims: [40, 40, 2] }); // кириллическая х
  assert.deepEqual(parseMaterial('Труба 32x2'), { kind: 'tube-round', dims: [32, 2] });
  assert.deepEqual(parseMaterial('Лист 3 мм'), { kind: 'sheet', dims: [3] });
  assert.deepEqual(parseMaterial('Лист 1,5 мм'), { kind: 'sheet', dims: [1.5] });
  assert.equal(parseMaterial('СПК6ПР').kind, 'other');
  assert.equal(parseMaterial('').kind, 'other');
});
test('одинаковые артикулы объединяются независимо от вида «х»', () => {
  assert.equal(materialKey('Труба 40x25x2'), materialKey('труба 40х25х2'));
  assert.notEqual(materialKey('Труба 40x25x2'), materialKey('Труба 40x40x2'));
});

console.log('Расчёт');
const calc = calculate(file);
const row = (material: string) => calc.rows.find((r) => r.material === material)!;
test('труба 40x25x2', () => {
  const r = row('Труба 40x25x2');
  assert.equal(r.kind, 'tube-rect');
  assert.equal(r.positions, 9);
  assert.equal(r.pieces, 34);
  close(r.lengthM!, 41.12374);
  close(r.massKg, 93.17);
  close(r.materialAreaM2, 130 * 41123.74 / 1e6);
  close(r.paintAreaM2, 130 * 41123.74 / 1e6);
});
test('труба 40x40x2', () => {
  const r = row('Труба 40x40x2');
  assert.equal(r.pieces, 2);
  close(r.lengthM!, 4.18);
  close(r.massKg, 9.566);
  close(r.materialAreaM2, 160 * 4180 / 1e6);
});
test('лист 3 мм', () => {
  const r = row('Лист 3 мм');
  assert.equal(r.kind, 'sheet');
  assert.equal(r.positions, 8);
  assert.equal(r.pieces, 51);
  close(r.massKg, 3.541);
  close(r.paintAreaM2, 0.355676); // вся поверхность
  close(r.materialAreaM2, 0.177838); // одна сторона
});
test('прочие материалы: масса суммируется, площадь не выдумывается', () => {
  const p = row('ПРОФ-ТР-6ПР');
  assert.equal(p.positions, 2);
  assert.equal(p.pieces, 4);
  close(p.massKg, 2.758);
  close(p.lengthM!, 6.2);
  assert.equal(p.materialAreaM2, 0);
  assert.equal(p.paintAreaM2, 0); // не в сборке с покрытием
  close(row('Анкерный болт М8х100').massKg, 0.88788);
  assert.ok(calc.rows.some((r) => r.material === '(материал не указан)'));
});
test('сборки не попадают в итог (нет двойного счёта)', () => {
  const leafMass = file.rows.filter((r) => !r.isAssembly).reduce((s, r) => s + (r.mass ?? 0) * r.totalQty, 0);
  close(calc.totals.massKg, leafMass / 1000);
});
test('предупреждений нет, кроме информации о материалах без размеров', () => {
  assert.equal(calc.warnings.filter((w) => w.level === 'warning').length, 0);
});

console.log('Участки');
test('по сборкам: 4 сборки + отдельные позиции', () => {
  const g = groupByAssembly(file);
  assert.equal(g.length, 5);
  assert.equal(g[0].head!.number, '1');
  assert.equal(g[0].rows.length, 8);
  assert.equal(g[1].rows.length, 6);
  assert.equal(g[2].rows.length, 2);
  assert.equal(g[3].rows.length, 2);
  assert.equal(g[4].head, null);
  assert.equal(g[4].rows.length, 11); // позиции 5–15
  assert.equal(g.reduce((s, x) => s + x.rows.length + (x.head ? 1 : 0), 0), file.rows.length);
});
test('по участкам: все строки распределены', () => {
  const g = groupBySite(file);
  assert.deepEqual(
    g.map((x) => x.title),
    ['02 Сварочный', '04 Гибка', '05 Металл', '06 Лазер', '11 Комплектация', 'Комплектация'],
  );
  assert.equal(g.reduce((s, x) => s + x.rows.length, 0), file.rows.length);
});

console.log(`\nГотово: ${passed} проверок пройдено.`);
