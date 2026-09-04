"use strict";
// Shared test harness for Node.
// Exports a `test()` registrar and a `run()` runner.
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = test;
exports.run = run;
exports.clear = clear;
const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}
async function run() {
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            passed++;
            console.log(`  ✓ ${t.name}`);
        }
        catch (e) {
            failed++;
            console.log(`  ✗ ${t.name}`);
            console.log(`    ${e.message}`);
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    return { passed, failed };
}
function clear() {
    tests.length = 0;
}
