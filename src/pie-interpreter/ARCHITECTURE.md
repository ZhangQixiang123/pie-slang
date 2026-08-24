# Pie Interpreter Architecture

This document describes the interpreter's layered architecture and the
allowed operations at each layer. Read this before modifying any
interpreter code.

## Type Layers

The interpreter has three representation layers. Data flows **downward**
during evaluation and **upward** during display:

```
Source   (user-facing syntax — what the programmer writes)
  │
  │  type checking / elaboration
  ▼
Core     (fully explicit, type-annotated AST)
  │
  │  evaluation (call-by-need)
  ▼
Value    (runtime normal forms)
```

### Source (`types/source.ts`)

User-facing syntax produced by the parser. Contains source locations for
error reporting. Includes syntactic sugar and implicit arguments.

**Produced by**: `parser/parser.ts`
**Consumed by**: `typechecker/represent.ts`, `typechecker/synthesizer.ts`
**Display**: `source.prettyPrint()`

### Core (`types/core.ts`)

Fully explicit AST after type checking. No sugar, no implicit arguments,
every subexpression has a type annotation (via `The` nodes). This is the
canonical representation for proof terms.

**Produced by**: type checker (elaboration), `readBack()`
**Consumed by**: evaluator, pretty printer, training data serializer
**Display**: `sugarType(core, ctx)` (preferred) or `core.prettyPrint()` (raw/debug)

### Value (`types/value.ts`)

Runtime normal forms under call-by-need evaluation. Values are
**opaque** — you cannot pattern-match on them from outside the evaluator.
To inspect a Value, you must read it back to Core first.

**Produced by**: `evaluator/evaluator.ts`
**Consumed by**: type checker (for conversion checking), proof state
**Display**: `readBack(ctx, type, value)` → Core → `sugarType(core, ctx)`

### Converting Between Layers

| From → To | Function | Location |
|-----------|----------|----------|
| string → Source | `schemeParse()` + `pieDeclarationParser` | `parser/parser.ts` |
| Source → Core | `represent(ctx, source)` | `typechecker/represent.ts` |
| Core → Value | `evaluate(env, core)` | `evaluator/evaluator.ts` |
| Value → Core | `readBack(ctx, type, value)` | `evaluator/utils.ts` |
| Value → Core (types) | `value.readBackType(ctx)` | method on Value |
| Core → string (preferred) | `sugarType(core, ctx)` | `unparser/sugar.ts` |
| Core → string (raw/debug) | `core.prettyPrint()` | method on Core |

## Module Responsibilities

### Parser (`parser/`)
- **Only** way to turn strings into AST. Never use regex on Pie syntax.
- Exports: `schemeParse`, `pieDeclarationParser`, `Parser.parsePie`
- Produces: `Claim`, `Definition`, `DefineTactically`, `SamenessCheck`, `TypeDefinition`

### Type Checker (`typechecker/`)
- Elaborates Source → Core while checking types.
- `represent(ctx, source)` — main entry point for checking expressions.
- `checkSame(ctx, loc, type, left, right)` — verify two expressions are equal.
- `synthesizer.ts` — type synthesis (bidirectional type checking).
- May use evaluator internals (`doApp`, `doCar`) — this is the only module
  besides evaluator itself that is allowed to do so.

### Evaluator (`evaluator/`)
- `evaluate(env, core)` — evaluate Core to Value.
- `readBack(ctx, type, value)` — normalize Value back to Core.
- Internal functions (`doApp`, `doCar`, `doCdr`, etc.) are **private** to
  this module and the type checker. Other modules must use `readBack`.

### Unparser (`unparser/`)
- `pretty.ts` — `prettyPrintCore`, `prettyPrintValue`, `prettyPrintSource`.
- `sugar.ts` — `sugarType(core, ctx)` applies user-defined type aliases
  (e.g., displays `(Even n)` instead of the expanded `(Σ (half Nat) ...)`).
  Also uses double-paren binder syntax `(Π ((x Nat)) ...)` matching Pie's
  surface syntax. **Default choice** for all serialization: user-facing
  display, proof state serialization, and ML model input. The LoRA training
  data was generated with `sugarType`. Use `prettyPrint` only for
  internal debugging or when sugar is explicitly unwanted.

### Context (`utils/context.ts`)
- `Context` = `Map<string, Binder>` — ordered map of names to bindings.
- Binder types: `Free` (local), `Define` (global value), `Claim` (unproved),
  `InductiveDatatypeBinder`, `ConstructorTypeBinder`, `EliminatorBinder`.
- Helpers: `bindFree`, `bindVal`, `addClaimToContext`, `addDefineToContext`,
  `addDefineTacticallyToContext`, `addDefineTacticallyInteractive`.
- `initCtx` — the initial context with built-in types.
- **Never construct binders manually** — use the `add*ToContext` functions.

### Tactics (`tactics/`)
- `tactics.ts` — 14 tactic classes, all extending `Tactic`.
- `proofstate.ts` — `ProofState` manages goal tree. `Goal` is a proof obligation.
- `proof-manager.ts` — `ProofManager` orchestrates tactic application.
- Each tactic: consumes current goal → produces 0+ subgoals + term builder.
- `tacticListener` callback on ProofState captures training data per step.

### Training Data Serialization
- Proof state serialization (for training data and LoRA model input) uses
  `readBack` → `sugarType` — see `proofstate.ts:toSerializableWithIntroducedBy()`.
- Global context = `Define` binders (definitions + proved theorems).
- Local context = `Free` binders (variables introduced by tactics).
- **Never serialize Values directly** — always go through `readBack` → `sugarType`.

## Error Handling

The interpreter uses the `Perhaps` monad from `types/utils.ts`:
- `go(result)` — success, carrying a result.
- `stop(location, message)` — failure at a source location.
- `goOn(fn, results...)` — chain multiple Perhaps computations.

Check `instanceof go` / `instanceof stop` to handle results. Never throw
exceptions from the core interpreter — use `stop`.

## API Entry Points

### Batch evaluation
```typescript
evaluatePie(str: string): string
evaluatePieVerbose(str: string): string
evaluatePieAndGetContext(str: string): { output: string; context: Context }
```

### Interactive evaluation (for AI agents / frontend)
```typescript
evaluatePieInteractive(
  str: string,
  tacticProvider: (state: InteractiveProofState) => Promise<string | null>,
  options?: { maxSteps?: number }
): Promise<{ output: string; context: Context }>
```

The `tacticProvider` receives an `InteractiveProofState` and returns a
tactic string (e.g., `"intro n"`, `"exact (same 0)"`) or `null` to abort.

## Adding New Tactics

1. Create a class extending `Tactic` in `tactics/tactics.ts`.
2. Implement `apply(state: ProofState): Perhaps<void>`.
3. Register the tactic name in `parser/parser.ts` (`parseTactic` function).
4. Add test cases in `__tests__/tactics-math/`.
5. The training data pipeline will automatically capture the new tactic.

## Adding New Types

1. Define value form in `types/value.ts` (extend `Value`).
2. Define core form in `types/core.ts` (extend `Core`).
3. Add `prettyPrint()` to both.
4. Add evaluation case in `evaluator/evaluator.ts`.
5. Add `readBack` case in `evaluator/utils.ts`.
6. Add type checking in `typechecker/`.
7. Add parsing in `parser/parser.ts`.
