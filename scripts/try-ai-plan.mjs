// Live check of the AI plan generator against the real Claude API.
//
// The test suite never calls a provider, so it cannot say how often real
// answers compile into a usable plan, how long they take, or what they cost.
// This does: it sends a handful of briefs through the Worker's own prompt and
// schema, compiles each answer with the Worker's own compiler, and prints the
// outcome, the time and the token cost.
//
//   ANTHROPIC_API_KEY=... node scripts/try-ai-plan.mjs          (5 plans, about $0.30)
//   ANTHROPIC_API_KEY=... node scripts/try-ai-plan.mjs 12       (12 plans)
//
// This spends real API credit. Nothing is written anywhere except the console.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY in this terminal first. The key is read from the environment only.');
  process.exit(1);
}
const workerDir = join(process.cwd(), 'workers', 'design-sync');
const dir = mkdtempSync(join(workerDir, '.try-plan-'));
try {
  for (const name of ['ai-features', 'ai-advisor', 'ai-plan']) {
    writeFileSync(join(dir, `${name}.mjs`), ts.transpileModule(readFileSync(join(workerDir, 'src', `${name}.ts`), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace(/from '(\.\/[a-z-]+)'/g, "from '$1.mjs'"));
  }
  const planner = await import(pathToFileURL(join(dir, 'ai-plan.mjs')).href);
  const { CLAUDE_MODEL } = await import(pathToFileURL(join(dir, 'ai-advisor.mjs')).href);
  const Anthropic = createRequire(join(workerDir, 'package.json'))('@anthropic-ai/sdk').default;
  const client = new Anthropic({ maxRetries: 0, timeout: 85_000 });

  const base = { storeys: 1, bedrooms: 2, bathrooms: 1, areaSqm: 90, furnished: true, garage: false, wishes: '' };
  const briefs = [
    { ...base, wishes: 'A bright home with an open kitchen and living room' },
    { ...base, bedrooms: 3, bathrooms: 2, areaSqm: 130, garage: true, wishes: 'Family home, main bedroom with its own bathroom' },
    { ...base, bedrooms: 0, areaSqm: 40, wishes: 'A compact studio flat' },
    { ...base, storeys: 2, bedrooms: 4, bathrooms: 2, areaSqm: 180, garage: true, wishes: 'Bedrooms upstairs, a home office downstairs' },
    { ...base, bedrooms: 1, areaSqm: 60, wishes: 'Ein kleines Haus für ein Paar mit großem Wohnzimmer', language: 'de' },
    { ...base, storeys: 3, bedrooms: 5, bathrooms: 3, areaSqm: 260, wishes: 'A tall town house on a narrow plot' },
  ];
  const count = Math.max(1, Math.min(30, Number(process.argv[2]) || 5));
  let good = 0;
  let spent = 0;
  let previous = null;
  for (let i = 0; i < count; i += 1) {
    const { language = 'en', ...brief } = briefs[i % briefs.length];
    // Every third run revises the plan before it, to exercise that path too.
    const revising = i % 3 === 2 && previous;
    const prompt = revising
      ? planner.planPrompt(previous.brief, language, previous.source, 'Make the kitchen bigger and add a storage room')
      : planner.planPrompt(brief, language);
    const started = Date.now();
    let line = `${String(i + 1).padStart(2)}. ${revising ? 'revise' : 'new   '} ${brief.storeys} storey, ${brief.bedrooms} bed, ${brief.areaSqm} m2`;
    try {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: planner.PLAN_MAX_TOKENS,
        system: prompt.system,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: planner.PLAN_SCHEMA } },
        messages: [{ role: 'user', content: prompt.user }],
      });
      const cost = (response.usage.input_tokens * 4 + response.usage.output_tokens * 20) / 1e6;
      spent += cost;
      line += ` | ${((Date.now() - started) / 1000).toFixed(0)}s | ${response.usage.input_tokens} in, ${response.usage.output_tokens} out | $${cost.toFixed(3)}`;
      if (response.stop_reason !== 'end_turn') throw new Error(`stopped: ${response.stop_reason}`);
      const text = response.content.find((block) => block.type === 'text')?.text ?? '';
      const used = revising ? previous.brief : brief;
      const blueprint = planner.compilePlan(JSON.parse(text), used, !!revising);
      good += 1;
      previous = { brief: used, source: blueprint.source };
      const rooms = blueprint.floors.map((floor) => floor.rooms.length).join('+');
      console.log(`${line} | OK   ${blueprint.widthCm / 100} x ${blueprint.depthCm / 100} m, ${rooms} rooms | ${blueprint.title}`);
    } catch (error) {
      const why = error?.cause?.cause?.message ?? error?.cause?.message ?? error?.cause ?? error?.message ?? String(error);
      console.log(`${line} | FAIL ${why}`);
    }
  }
  console.log(`\n${good} of ${count} plans usable. Spent about $${spent.toFixed(2)}. The app charges 300 points a plan; a failed plan is refunded to the customer but still costs you its tokens.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
