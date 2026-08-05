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

- `PI_ATIF_OUTPUT_DIR`: directory for `trajectory.json`; defaults to `./atif-output`.
- `PI_ATIF_FILE_NAME`: output file name; defaults to `trajectory.json`.
- `PI_ATIF_RUN_ID`: ATIF `session_id`.
- `PI_ATIF_TRAJECTORY_ID`: ATIF `trajectory_id`.
- `PI_ATIF_AGENT_NAME`: ATIF agent name; defaults to `pi`.
- `PI_ATIF_AGENT_VERSION`: ATIF agent version; defaults to `unknown`.

## Validation

TypeScript/unit validation:

```bash
npm test
npm run validate:openagents
```

Harbor reference validation:

```bash
python -m harbor.utils.trajectory_validator fixtures/basic-tool-call.json
```

Install Harbor if needed:

```bash
python -m venv .venv
.venv/bin/python -m pip install harbor
.venv/bin/python -m harbor.utils.trajectory_validator fixtures/basic-tool-call.json
```

## ATIF Coverage

V0 captures:

- `schema_version`, `session_id`, `trajectory_id`, agent metadata;
- system prompt and initial user prompt;
- assistant turns as ATIF `source: "agent"` steps;
- tool calls and same-step observations;
- prompt/completion/cache/cost metrics when Pi exposes usage;
- compaction as ATIF context-management system steps.

V0 does not invent unavailable RL fields. Token IDs, logprobs, explicit reward, and full provider request payloads require inference-layer support and are intentionally omitted until Pi or the serving layer exposes them.
