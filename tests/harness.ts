// Shared test harness for Node.
// Exports a `test()` registrar and a `run()` runner.

export type TestFn = () => void | Promise<void>;

const tests: { name: string; fn: TestFn }[] = [];

export function test(name: string, fn: TestFn): void {
    tests.push({ name, fn });
}

export async function run(): Promise<{ passed: number; failed: number }> {
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            passed++;
            console.log(`  ✓ ${t.name}`);
        } catch (e) {
            failed++;
            console.log(`  ✗ ${t.name}`);
            console.log(`    ${(e as Error).message}`);
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    return { passed, failed };
}

export function clear(): void {
    tests.length = 0;
}
