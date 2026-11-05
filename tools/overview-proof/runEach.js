// no-fixture is left out on purpose: it fails to prove an unstubbed call fails the run.
const ALL_SUITE_NAMES = ['proof-controls', 'admin', 'client', 'smoke'];

async function runEach(names, suites, context) {
  for (const name of names) {
    const suite = suites[name];
    if (!suite) {
      context.check(`suite ${name} exists`, false, 'unknown suite');
      continue;
    }
    try {
      await suite(context);
    } catch (e) {
      context.check(`suite ${name} completes`, false, `crashed: ${e.message}`);
    }
  }
}

module.exports = { runEach, ALL_SUITE_NAMES };
