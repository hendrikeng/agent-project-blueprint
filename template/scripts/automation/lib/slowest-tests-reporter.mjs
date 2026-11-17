import path from 'node:path';

// node --test reporter: lists the slowest tests, so a slow or waiting test shows in every log.
// Node passes reporter options as the second argument, so the limit is a constant.
const limit = 25;

export default async function* slowestTests(source) {
  const tests = [];
  for await (const { type, data } of source) {
    if ((type === 'test:pass' || type === 'test:fail') && data.details?.type !== 'suite') tests.push(data);
  }
  tests.sort((a, b) => b.details.duration_ms - a.details.duration_ms);
  yield `\nSlowest ${Math.min(limit, tests.length)} tests:\n`;
  for (const { details, file, name } of tests.slice(0, limit)) {
    yield `${(details.duration_ms / 1000).toFixed(2).padStart(8)} s  ${file ? path.relative(process.cwd(), file) : '?'} > ${name}\n`;
  }
}
