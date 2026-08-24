/**
 * Training data cleanup and LoRA formatting script.
 *
 * Reads raw training-data.jsonl, applies quality fixes, and outputs:
 *   1. training-data-clean.jsonl   — normalized, deduplicated entries
 *   2. training-data-lora.jsonl    — chat-format ready for LoRA fine-tuning
 *
 * Fixes applied:
 *   - Schema normalization (old flat context → globalContext/localContext)
 *   - Type string normalization (collapse whitespace/newlines)
 *   - Deduplication of parametric test instances
 *   - Filtering/downsampling trivial single-step `exact (same ...)` proofs
 *
 * Usage:
 *   npx tsx src/pie-interpreter/scripts/clean-training-data.ts [input] [output-dir]
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Old schema (lines 1–2758 of the original file) */
interface OldContextEntry {
  name: string;
  type: string;
  kind: 'free' | 'define' | 'claim';
}

interface OldTrainingExample {
  theoremName: string;
  theoremType: string;
  stepIndex: number;
  context: OldContextEntry[];
  goal: string;
  tactic: string;
  isInsideThen: boolean;
  branchIndex: number | null;
}

/** New (canonical) schema */
interface ContextEntry {
  name: string;
  type: string;
  value?: string;
}

interface TrainingExample {
  theoremName: string;
  theoremType: string;
  stepIndex: number;
  globalContext: ContextEntry[];
  localContext: ContextEntry[];
  goal: string;
  tactic: string;
}

/** LoRA chat-turn format (OpenAI-compatible) */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LoraExample {
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collapse embedded newlines and excess whitespace in S-expression strings. */
function normalizeTypeStr(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeEntry(e: { name: string; type: string; value?: string }): ContextEntry {
  const result: ContextEntry = { name: e.name, type: normalizeTypeStr(e.type) };
  if (e.value) result.value = normalizeTypeStr(e.value);
  return result;
}

/** Convert an old-schema entry to the canonical schema. */
function migrateOldSchema(old: OldTrainingExample): TrainingExample {
  const globalContext: ContextEntry[] = [];
  const localContext: ContextEntry[] = [];
  for (const e of old.context) {
    const normalized = normalizeEntry(e);
    if (e.kind === 'free') {
      localContext.push(normalized);
    } else if (e.kind === 'define') {
      globalContext.push(normalized);
    }
    // skip 'claim' — matches new extractor behaviour
  }
  return {
    theoremName: old.theoremName,
    theoremType: normalizeTypeStr(old.theoremType),
    stepIndex: old.stepIndex,
    globalContext,
    localContext,
    goal: normalizeTypeStr(old.goal),
    tactic: old.tactic,
  };
}

/** Normalize a new-schema entry (just fix whitespace). */
function normalizeNewSchema(ex: TrainingExample): TrainingExample {
  return {
    theoremName: ex.theoremName,
    theoremType: normalizeTypeStr(ex.theoremType),
    stepIndex: ex.stepIndex,
    globalContext: ex.globalContext.map(normalizeEntry),
    localContext: ex.localContext.map(normalizeEntry),
    goal: normalizeTypeStr(ex.goal),
    tactic: ex.tactic,
  };
}

/** True if this entry uses the old flat-context schema. */
function isOldSchema(raw: any): raw is OldTrainingExample {
  return Array.isArray(raw.context) && !('globalContext' in raw);
}

/**
 * Deduplicate key: we group by (theoremName, stepIndex, tactic, goal) so that
 * parametric test instances that produce identical proof structure collapse.
 */
function dedupeKey(ex: TrainingExample): string {
  return `${ex.theoremName}::${ex.stepIndex}::${ex.tactic}::${ex.goal}`;
}

/**
 * True if this is a trivial reflexivity proof: single-step `exact (same ...)`.
 * We keep a small sample of these for coverage but drop the majority.
 */
function isTrivialReflexivity(ex: TrainingExample): boolean {
  return ex.stepIndex === 0 && /^exact \(same /.test(ex.tactic);
}

/**
 * Detect concrete parity theorems (parity-N, either-parity-N) that are
 * simple go-Left/go-Right + exists + exact proofs. Returns 'even' or 'odd'
 * based on N, or null if not a concrete parity theorem.
 */
function getConcreteParityKind(name: string): 'even' | 'odd' | null {
  const match = name.match(/^(?:parity|either-parity)-(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  return n % 2 === 0 ? 'even' : 'odd';
}

// ---------------------------------------------------------------------------
// LoRA formatting
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  `You are a tactic proof assistant for Pie, a dependently-typed language ` +
  `based on "The Little Typer". Given a proof goal and context, suggest the ` +
  `next tactic to apply.`;

function formatContext(ex: TrainingExample): string {
  const parts: string[] = [];

  if (ex.globalContext.length > 0) {
    parts.push('Definitions:');
    for (const e of ex.globalContext) {
      parts.push(`  ${e.name} : ${e.type}`);
    }
  }

  if (ex.localContext.length > 0) {
    parts.push('Local variables:');
    for (const e of ex.localContext) {
      parts.push(`  ${e.name} : ${e.type}`);
    }
  }

  parts.push(`Goal: ${ex.goal}`);
  return parts.join('\n');
}

function toLoraExample(ex: TrainingExample): LoraExample {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: formatContext(ex) },
      { role: 'assistant', content: ex.tactic },
    ],
  };
}

// ---------------------------------------------------------------------------
// Multi-turn LoRA: group consecutive steps of the same theorem into one
// conversation so the model learns multi-step reasoning.
// ---------------------------------------------------------------------------

function toMultiTurnLoraExamples(
  examples: TrainingExample[],
): LoraExample[] {
  // Group by theoremName, preserving step order
  const grouped = new Map<string, TrainingExample[]>();
  for (const ex of examples) {
    const key = ex.theoremName;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ex);
  }

  const result: LoraExample[] = [];
  for (const [, steps] of grouped) {
    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // First turn includes the theorem header
    const first = steps[0];
    messages.push({
      role: 'user',
      content:
        `Theorem: ${first.theoremName}\n` +
        `Type: ${first.theoremType}\n\n` +
        formatContext(first),
    });
    messages.push({ role: 'assistant', content: first.tactic });

    // Subsequent turns show the updated goal
    for (let i = 1; i < steps.length; i++) {
      messages.push({ role: 'user', content: formatContext(steps[i]) });
      messages.push({ role: 'assistant', content: steps[i].tactic });
    }

    result.push({ messages });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const inputPath = args[0] ?? path.resolve(scriptDir, '../../../training-data.jsonl');
  const outputDir = args[1] ?? path.dirname(inputPath);

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const rawLines = fs.readFileSync(inputPath, 'utf-8').trim().split('\n').filter(Boolean);
  console.log(`Read ${rawLines.length} raw entries from ${inputPath}`);

  // ── Pass 1: parse & normalize schema ────────────────────────────────────
  const normalized: TrainingExample[] = [];
  let oldSchemaCount = 0;
  let parseErrors = 0;

  for (const line of rawLines) {
    let raw: any;
    try {
      raw = JSON.parse(line);
    } catch {
      parseErrors++;
      continue;
    }

    if (isOldSchema(raw)) {
      oldSchemaCount++;
      normalized.push(migrateOldSchema(raw));
    } else {
      normalized.push(normalizeNewSchema(raw as TrainingExample));
    }
  }

  console.log(`  Migrated ${oldSchemaCount} old-schema entries`);
  if (parseErrors > 0) console.log(`  Skipped ${parseErrors} unparseable lines`);

  // ── Pass 2: deduplicate ─────────────────────────────────────────────────
  const seen = new Map<string, TrainingExample>();
  for (const ex of normalized) {
    const key = dedupeKey(ex);
    if (!seen.has(key)) {
      seen.set(key, ex);
    }
  }
  const deduped = Array.from(seen.values());
  console.log(`  Deduplicated: ${normalized.length} → ${deduped.length} entries`);

  // ── Pass 2.5: cap concrete parity-N / either-parity-N proofs ───────────
  // These are simple go-Left/go-Right + exists + exact proofs that can
  // overwhelm the dataset with go-Left/go-Right at the expense of elim-Nat.
  // Keep 3 even + 3 odd theorems (all steps of each kept theorem are retained).
  const MAX_CONCRETE_EVEN = 3;
  const MAX_CONCRETE_ODD = 3;
  const parityCount = { even: 0, odd: 0 };
  const droppedParityTheorems = new Set<string>();
  const seenParityTheorems = new Set<string>();

  for (const ex of deduped) {
    if (seenParityTheorems.has(ex.theoremName)) continue;
    const kind = getConcreteParityKind(ex.theoremName);
    if (!kind) continue;
    seenParityTheorems.add(ex.theoremName);
    const cap = kind === 'even' ? MAX_CONCRETE_EVEN : MAX_CONCRETE_ODD;
    if (parityCount[kind] < cap) {
      parityCount[kind]++;
    } else {
      droppedParityTheorems.add(ex.theoremName);
    }
  }

  const parityFiltered = deduped.filter(ex => !droppedParityTheorems.has(ex.theoremName));
  const droppedParityEntries = deduped.length - parityFiltered.length;
  if (droppedParityEntries > 0) {
    console.log(`  Concrete parity cap: kept ${parityCount.even} even + ${parityCount.odd} odd theorems, dropped ${droppedParityTheorems.size} theorems (${droppedParityEntries} entries)`);
  }

  // ── Pass 3: filter trivial reflexivity proofs ───────────────────────────
  // Keep up to MAX_TRIVIAL examples so the model still learns the pattern,
  // but don't let them dominate the dataset.
  const MAX_TRIVIAL = 20;
  let trivialCount = 0;
  const cleaned: TrainingExample[] = [];

  // First, identify which theorems are entirely single-step trivial
  const theoremMaxStep = new Map<string, number>();
  for (const ex of parityFiltered) {
    const cur = theoremMaxStep.get(ex.theoremName) ?? -1;
    if (ex.stepIndex > cur) theoremMaxStep.set(ex.theoremName, ex.stepIndex);
  }

  for (const ex of parityFiltered) {
    if (isTrivialReflexivity(ex) && theoremMaxStep.get(ex.theoremName) === 0) {
      trivialCount++;
      if (trivialCount <= MAX_TRIVIAL) {
        cleaned.push(ex);
      }
      // else: drop
    } else {
      cleaned.push(ex);
    }
  }

  const droppedTrivial = trivialCount - Math.min(trivialCount, MAX_TRIVIAL);
  console.log(`  Trivial reflexivity: kept ${Math.min(trivialCount, MAX_TRIVIAL)}/${trivialCount}, dropped ${droppedTrivial}`);
  console.log(`  Final clean entries: ${cleaned.length}`);

  // ── Write clean JSONL ───────────────────────────────────────────────────
  const cleanPath = path.join(outputDir, 'training-data-clean.jsonl');
  fs.writeFileSync(
    cleanPath,
    cleaned.map(ex => JSON.stringify(ex)).join('\n') + '\n',
    'utf-8',
  );
  console.log(`\nWrote ${cleaned.length} entries to ${cleanPath}`);

  // ── Write single-turn LoRA JSONL ────────────────────────────────────────
  const loraSinglePath = path.join(outputDir, 'training-data-lora-single.jsonl');
  const loraSingle = cleaned.map(toLoraExample);
  fs.writeFileSync(
    loraSinglePath,
    loraSingle.map(ex => JSON.stringify(ex)).join('\n') + '\n',
    'utf-8',
  );
  console.log(`Wrote ${loraSingle.length} single-turn LoRA examples to ${loraSinglePath}`);

  // ── Write multi-turn LoRA JSONL ─────────────────────────────────────────
  const loraMultiPath = path.join(outputDir, 'training-data-lora-multi.jsonl');
  const loraMulti = toMultiTurnLoraExamples(cleaned);
  fs.writeFileSync(
    loraMultiPath,
    loraMulti.map(ex => JSON.stringify(ex)).join('\n') + '\n',
    'utf-8',
  );
  console.log(`Wrote ${loraMulti.length} multi-turn LoRA conversations to ${loraMultiPath}`);

  // ── Print summary statistics ────────────────────────────────────────────
  printStats(cleaned);
}

function printStats(data: TrainingExample[]) {
  const tactics: Record<string, number> = {};
  const theorems = new Set<string>();
  const steps: Record<number, number> = {};
  let totalGoalLen = 0;

  for (const ex of data) {
    const tacHead = ex.tactic.split(' ')[0];
    tactics[tacHead] = (tactics[tacHead] ?? 0) + 1;
    theorems.add(ex.theoremName);
    steps[ex.stepIndex] = (steps[ex.stepIndex] ?? 0) + 1;
    totalGoalLen += ex.goal.length;
  }

  console.log('\n═══ Dataset Statistics ═══');
  console.log(`Total entries:    ${data.length}`);
  console.log(`Unique theorems:  ${theorems.size}`);
  console.log(`Avg goal length:  ${(totalGoalLen / data.length).toFixed(0)} chars`);

  console.log('\nTactic distribution:');
  const sorted = Object.entries(tactics).sort((a, b) => b[1] - a[1]);
  for (const [tac, count] of sorted) {
    console.log(`  ${tac.padEnd(16)} ${String(count).padStart(5)}  (${(count * 100 / data.length).toFixed(1)}%)`);
  }

  console.log('\nStep depth distribution:');
  for (const [step, count] of Object.entries(steps).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  step ${String(step).padStart(2)}: ${String(count).padStart(5)}  (${(count * 100 / data.length).toFixed(1)}%)`);
  }
}

main();
