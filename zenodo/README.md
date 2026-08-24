# Pie-Slang: proof editor + tactic-prediction model — reproducible artifact

A complete, runnable snapshot of the Pie interactive proof editor together with
its fine-tuned tactic-prediction model. You can run the **whole flow locally**:
write/step through a dependently-typed proof in the browser, and get next-tactic
suggestions from the local model — exactly as in the live system.

Two pieces:

1. **Model server** (`model/`) — a 4-bit LoRA fine-tune of Qwen2.5-Coder-7B,
   served over HTTP. Requires an NVIDIA CUDA GPU. Self-contained (the base model
   is bundled). See `model/README.md`.
2. **TypeScript service** (`app/`) — the Pie interpreter + React proof editor.
   The interpreter runs **in the browser** (Web Worker); the editor calls the
   model server for tactic hints. A pre-built frontend is included, so no Node
   build is needed to run it.

```
┌──────────── browser ────────────┐         ┌──────── model server ────────┐
│  React proof editor              │  HTTP   │  FastAPI /predict            │
│  + Pie interpreter (Web Worker)  │ ──────► │  Qwen2.5-Coder-7B + LoRA     │
│  http://127.0.0.1:4173           │  :8000  │  http://localhost:8000       │
└──────────────────────────────────┘         └──────────────────────────────┘
```

---

## Requirements

| Component | Requirement |
|---|---|
| **Model server** | NVIDIA GPU (compute ≥ 7.0, ≥ 7 GB VRAM), CUDA 12.1, Python 3.11 |
| **Frontend (run only)** | any modern browser + Python 3.x (to serve static files) |
| **Frontend (rebuild)** | Node.js ≥ 20 + npm (only if you want to rebuild from source) |

The model has **no CPU fallback**: on unsupported hardware `model/preflight.py`
prints a clear "HARDWARE NOT SUPPORTED" message and exits — it never crashes
mid-load. See `model/README.md` for details.

## Layout

```
pie-slang-artifact/
├── README.md
├── run-all.sh / run-all.ps1     # start model + frontend together
├── serve-frontend.py            # static server for the prebuilt frontend
├── build-frontend.sh / .ps1     # rebuild the frontend from source (optional)
├── model/                       # model server bundle (see model/README.md)
│   ├── preflight.py serve.py evaluate_offline.py
│   ├── requirements-lock.txt environment.yml verify.* run.*
│   ├── adapter/  base-model/  test/
└── app/                         # TypeScript source snapshot
    ├── src/                     #   pie-interpreter + scheme-parser
    ├── web-react/               #   React proof editor
    │   └── dist/                #   PREBUILT frontend (served by run-all)
    ├── package.json  package-lock.json  tsconfig*.json  ...
```

## Quick start (run the whole flow)

1. **Create the Python env** (for the model server):
   ```bash
   conda env create -f model/environment.yml
   conda activate pie-tactic-model
   ```
2. **(Recommended) verify the model** reproduces the published accuracy:
   ```bash
   cd model && ./verify.sh        # verify.ps1 on Windows — expects 13/13
   ```
3. **Start everything:**
   ```bash
   ./run-all.sh                   # ./run-all.ps1 on Windows
   ```
   This runs the hardware preflight, starts the model server on `:8000`, and
   serves the proof editor on `http://127.0.0.1:4173`.
4. **Open** `http://127.0.0.1:4173` in your browser. Load an example proof,
   step through tactics, and open the **AI settings** panel — the LoRA server
   URL defaults to `http://localhost:8000` and should show a green (connected)
   status. Optionally paste a Gemini API key there for natural-language
   explanations (not required for tactic prediction).

## Rebuilding the frontend from source (optional)

The included `app/web-react/dist` is prebuilt with a relative base. To rebuild:

```bash
./build-frontend.sh              # ./build-frontend.ps1 on Windows
```

This runs `npm install` (repo root + `web-react`) and `vite build --base=./`.
The Vite build resolves `@pie`/`@scheme` to `app/src/...` and bundles the whole
interpreter into `dist/` — the built frontend is self-contained. Rebuilding
needs network access (npm registry + one git dependency).

> `npm install` is used rather than `npm ci` because the checked-in root
> lockfile predates a `jest` version bump in `package.json`; `npm install`
> reconciles them.

## Running the interpreter tests (optional)

The interpreter test suite (Jest) is included under `app/src/**/__tests__`:

```bash
cd app
npm install
npm run test        # ~2797 tests, expect all green
```
(The React frontend has its own Vitest suite under `app/web-react`.)

> The frontend is built with a **relative base** (`--base=./`) so it can be
> served from any path. The live site uses `base: "/pie-slang/pie-playground/"`;
> that is overridden here for local serving.

## Ports

| Service | URL | Change |
|---|---|---|
| Proof editor | http://127.0.0.1:4173 | `serve-frontend.py --port N` |
| Model server | http://localhost:8000 | `serve.py --port N` + AI settings panel in the UI |

## Integrity

`SHA256SUMS.txt` lists a checksum for every file:
`sha256sum -c SHA256SUMS.txt`.

## Licensing

Base model: Qwen2.5-Coder (Apache-2.0). Interpreter, frontend, and LoRA adapter:
Apache-2.0 (same as the pie-slang project). Retain upstream notices when
redistributing.
