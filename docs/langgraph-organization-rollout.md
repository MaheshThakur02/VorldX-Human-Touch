# LangGraph Organization Orchestration

## Purpose
- LangGraph is the planning/routing layer.
- Durable execution is unified in Flow/Task + event log infrastructure.
- LangGraph no longer owns ephemeral completion state.

## Unified Runtime Contract
- Every request enters one routing layer and emits normalized tasks into durable tables.
- Shared task schema/state machine is used by all orchestration paths.
- Completion is gated by run barrier checks and persisted outputs.

## Execution Ownership
1. LangGraph planning: classify, decompose, validate
2. Persist tasks to durable run (`Flow`/`Task`)
3. Execute via durable engine
4. Verify receipts + committed outputs
5. Aggregate from durable storage
6. Publish to Hub and Control Deck from event log projection

## Invariants
- Task completion requires committed output + verified receipts.
- Approval creation is idempotent by `run_id + task_id + policy_hash`.
- Hub writes are idempotent and must include `sourceTaskId`.
- Event envelope is append-only and idempotent by `idempotency_key`.

## Required Events
- `TASK_ASSIGNED`
- `TASK_ACKED`
- `TASK_STARTED`
- `TOOL_CALL_STARTED`
- `TOOL_CALL_FINISHED`
- `TASK_BLOCKED`
- `TASK_COMPLETED`
- `TASK_FAILED`
- `TASK_TIMEOUT`

## Control Deck Projection
- Control Deck status derives from orchestration event log projection.
- Task snapshots are supporting data only; event log is the source of truth for lifecycle state.
