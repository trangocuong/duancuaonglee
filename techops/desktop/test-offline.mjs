import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { read, utils } from 'xlsx/xlsx.mjs';

const app = path.resolve('outputs/LOT-Tracker-Offline-Windows-x64');
const fixture = path.resolve('outputs/desktop-test');
fs.mkdirSync(fixture, { recursive: true });
const file = path.join(fixture, 'TEST-LOT-001.csv');
fs.writeFileSync(file, 'EVENT_NAME,DATE/TIME,QTY,STEP,EQP,LINE,OPERID,CHG_ITEM,CHG_VALS,QTY,COMMENT\nTrackOut,2026-09-20 11:00,98,M055,EQP-01,VMDL,0001,,,0,\nScrap,2026-09-20 10:30,98,M055,EQP-01,VMDL,0001,,,2,FAIL/test\nTrackIn,2026-09-20 10:00,100,M055,EQP-01,VMDL,0001,,,0,\n');
function run(files, bom = '') {
  return spawnSync(path.join(app, 'runtime/node.exe'), ['--permission', '--allow-fs-read=' + app, '--allow-fs-read=' + fixture, '--allow-fs-write=' + fixture, path.join(app, 'analyze.mjs')], {
    input: bom + JSON.stringify({ files, output: path.join(fixture, '보고서') }) + bom, encoding: 'utf8', cwd: fixture, maxBuffer: 32 * 1024 * 1024,
  });
}
const result = run([file]);
assert.equal(result.status, 0, result.stderr);
const data = JSON.parse(result.stdout);
assert.equal(data.count, 1);
assert.equal(data.tabs.length, 12);
assert.equal(data.exports.length, 2);
const workbook = read(fs.readFileSync(data.exports[0]));
const matrix = utils.sheet_to_json(workbook.Sheets['LOT Steps'], { header: 1 });
assert.ok(matrix[2].includes('TEST-LOT-001'));
assert.ok(matrix[2].includes('98.0%'));
assert.ok(workbook.SheetNames.includes('LOT Split Flow'));
assert.equal(run([file], '\uFEFF').status, 0, 'UTF-8 BOM on Windows stdin');
assert.notEqual(run([]).status, 0);
assert.notEqual(run([file, file]).status, 0);
const invalid = path.join(fixture, 'invalid.csv'); fs.writeFileSync(invalid, 'bad,header\n1,2');
assert.notEqual(run([invalid]).status, 0);
const large = path.join(fixture, 'large.csv'); fs.writeFileSync(large, Buffer.alloc(2 * 1024 * 1024 + 1));
assert.notEqual(run([large]).status, 0);
console.log('Offline package: analysis, 12 tabs, 2 Excel exports, yield, empty/duplicate/invalid/oversize rejection passed with Node network permission disabled.');
