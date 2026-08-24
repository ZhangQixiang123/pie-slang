# pie-slang

Implementation of Pie, following [The Little Typer](https://mitpress.mit.edu/9780262536431/the-little-typer/)

## Our Online Playground

We have an [online playground](https://source-academy.github.io/pie-slang/) for you to play with Pie.
It is still under construction, especially for the language server part, so it might be buggy.

## Our Language Server

We have published the Pie language server as a VSCode extension, named [pie-lsp](https://marketplace.visualstudio.com/items?itemName=DaoxinLi.pie-lsp&ssr=false#review-details)

## Running the Tests

Requirements: Node.js 18 or newer (tested up to Node 24). No other tools are
needed — npm comes with Node.

```bash
git clone https://github.com/source-academy/pie-slang.git
cd pie-slang
npm install
npm test
```

`npm test` runs the full Jest suite: 80 suites, about 2,800 tests, covering the
interpreter (parser, type checker, evaluator), tactics, named holes, and
user-defined inductive types. All tests should pass; the run takes well under a
minute.

To build the distributable bundle (output in `./dist`):

```bash
npm run build
```

To try a simple Pie program without installing anything, use the
[online playground](https://source-academy.github.io/pie-slang/):

```scheme
(claim identity (-> Nat Nat))
(define identity (λ (n) n))
```

For more about the project, see our wiki pages. To learn the language itself,
read The Little Typer; the wiki also contains a brief overview.

## Tactic Predictor: Theorems, Fine-Tuning, and Evaluation

The tactic predictor is fine-tuned on proofs written in Pie:

- **Theorem corpus.** The hand-written theorems and their tactic proofs live under
  `src/pie-interpreter/__tests__/tactics-math-tactic/` and
  `src/pie-interpreter/__tests__/tactics-math-complex/`.
- **Datasets.** `training/` holds the extracted training data
  (`training-data-clean.jsonl`, `training-data-lora-*.jsonl`) and the held-out
  test set (`test-proofs.jsonl`, 157 theorems / 706 steps).
- **Fine-tuning and evaluation.** `training/train.py` fine-tunes a LoRA adapter over
  a public base model; `training/eval-holdout.ts` and `training/evaluate_offline.py`
  reproduce the held-out evaluation (see `training/HOLDOUT_EVAL.md`). A
  `training/Dockerfile` rebuilds the inference image.

The fine-tuned LoRA adapter is large and is not stored in this repository; it is
distributed separately.
