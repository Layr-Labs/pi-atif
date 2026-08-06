# pi-atif

`pi-atif` is a Pi package that emits Harbor ATIF-v1.7 agent trajectories from Pi sessions.

It is intentionally narrow:

- collect Pi session, user, agent, tool, observation, metric, and compaction events;
- write `trajectory.json` in Harbor's ATIF-v1.7 shape;
- validate generated trajectories against external ATIF validators.

## Install in Pi

For local development:

```bash
pi --extension ./src/extension.ts "Say hello"
```

As a Pi package, add it to Pi settings:

```json
{
  "packages": ["npm:pi-atif@0.1.0"]
}
```

## Runtime Configuration

Environment variables:

- `PI_ATIF_OUTPUT_DIR`: directory for trajectory JSON files; defaults to `./atif-output`.
- `PI_ATIF_FILE_NAME`: output file name; defaults to a safe name derived from the trajectory/session id.
- `PI_ATIF_RUN_ID`: ATIF `session_id`.
- `PI_ATIF_TRAJECTORY_ID`: ATIF `trajectory_id`.
- `PI_ATIF_AGENT_NAME`: ATIF agent name; defaults to `pi`.
- `PI_ATIF_AGENT_VERSION`: ATIF agent version; defaults to `unknown`.

Eval runners can attach training/evaluation context under the stable
`extra.pi_atif.eval` namespace:

- `PI_ATIF_BENCHMARK_ID`, `PI_ATIF_TASK_ID`, `PI_ATIF_EVAL_RUN_ID`;
- `PI_ATIF_ATTEMPT_INDEX`, `PI_ATIF_SUITE_ID`, `PI_ATIF_SPLIT`;
- `PI_ATIF_REWARD`, `PI_ATIF_SCORE`, `PI_ATIF_VERIFIER_OUTCOME`.

The corresponding `PiAtifMapper` options are `evalMetadata`,
`includeReasoningContent`, and `includeRawProviderFields`. Options take precedence
over environment variables. Numeric values that cannot be parsed are omitted.
The trajectory's ordinary `PI_ATIF_RUN_ID` is also used as the eval `run_id` when
`PI_ATIF_EVAL_RUN_ID` is absent.

Capture controls are opt-in and default to false:

- `PI_ATIF_INCLUDE_REASONING_CONTENT=true` emits Pi thinking blocks as ATIF
  `reasoning_content`.
- `PI_ATIF_INCLUDE_RAW_PROVIDER_FIELDS=true` preserves the provider, API, stop
  reason, and provider error message under each agent step's
  `extra.raw_provider_fields`.

ATIF necessarily contains the user/system prompts, assistant messages, tool
arguments, and tool outputs that form the trajectory. These can include source
code, credentials, personal data, or other sensitive material. Run collection in
an appropriately isolated environment and redact upstream before publishing or
using traces outside their original trust boundary.

Trajectory files and newly created output directories default to owner-only
permissions (`0600` and `0700`, respectively). Programmatic integrations can
apply a redaction or filtering function immediately before serialization:

```ts
import { writeAtifTrajectory } from "pi-atif/writer";

await writeAtifTrajectory(trajectory, {
  transformTrajectory: redactTrajectory,
});
```

Custom Pi extension wrappers can apply the same hook to every automatic flush:

```ts
import { createPiAtifExtension } from "pi-atif/extension";

export default createPiAtifExtension({
  writer: { transformTrajectory: redactTrajectory },
});
```

`transformTrajectory` must return a complete ATIF trajectory. Redaction remains
the caller's responsibility; the default extension preserves raw trace fidelity.

## Validation

TypeScript/unit validation:

```bash
npm run typecheck
npm run build
npm test
npm run validate:openagents
npm run validate:harbor
```

Harbor reference validation:

```bash
npm run validate:harbor
```

Install Harbor if needed:

```bash
python -m venv .venv
.venv/bin/python -m pip install harbor
npm run validate:harbor
```

Both validator scripts check JSON files in `fixtures/` and, when present,
`atif-output/`. Set `PYTHON` to override the interpreter used for Harbor.

Before publishing, build and inspect the tarball contents:

```bash
npm run build
npm pack --dry-run
```

## ATIF Coverage

V0 captures:

- `schema_version`, `session_id`, `trajectory_id`, agent metadata;
- system prompt and multi-turn user prompts, including path-backed images Pi exposes;
- assistant turns as ATIF `source: "agent"` steps;
- tool calls and same-step observations;
- prompt/completion/cache/cost metrics when Pi exposes usage;
- compaction as ATIF context-management system steps.

## Eureka / training pipeline guidance

ATIF schema validation is necessary, but it is not evidence that a trajectory is
ready for SFT or RL. A Eureka harness or eval runner should set stable benchmark,
task, suite, split, attempt, reward/score, and verifier labels using the variables
above (or mapper configuration), and should independently check semantic quality,
data rights, redaction, episode boundaries, reward meaning, and dataset-specific
requirements.

`pi-atif` does not invent fields Pi does not expose. Current limitations include
faithful reconstruction across resume/reload/fork, token IDs and logprobs, complete
tool definitions, raw inference request/response payloads, and full subagent
semantics. Compaction is represented as a context-management step, but it cannot
recover discarded pre-compaction state. External rewards and verifier outcomes are
labels supplied by the harness, not computed or validated by this package.
