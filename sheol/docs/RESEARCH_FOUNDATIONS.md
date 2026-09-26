# Research Foundations — SHEOL v0.1

SHEOL is informed by current work on durable workflows, agent handoffs, model routing, structured LM programs, and execution-based evaluation.

## Durable execution
Temporal documents crash-proof, resumable workflow execution. LangGraph documents durable execution and checkpointed state for long-running workflows. SHEOL adopts the reliability principle while adding phase-attempt isolation and explicit commit semantics.

- https://docs.temporal.io/
- https://docs.temporal.io/ai
- https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph

## Agents, handoffs, guardrails and tracing
OpenAI Agents SDK provides agents, handoffs, guardrails, sessions and tracing. Its docs note that handoffs can pass conversation context and that guardrails do not automatically run at every workflow boundary. SHEOL therefore makes the kernel, not the worker, authoritative for phase authorization and state transitions.

- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-python/handoffs/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/tracing/

## Interoperability
A2A models stateful tasks and artifacts for agent-to-agent interoperability. MCP standardizes access to tools and resources. SHEOL can expose adapters for these protocols without making them the core execution authority.

- https://a2a-protocol.org/
- https://modelcontextprotocol.io/

## Structured LM programs
DSPy treats LM workflows as typed, composable programs and provides metric-driven optimization. This motivates SHEOL's emphasis on contracts, explicit inputs/outputs and measured optimization rather than prompt chains.

- https://dspy.ai/

## Multi-agent collaboration
MetaGPT reports improvements from structured role workflows in software tasks. Mixture-of-Agents reports gains from layered aggregation. These do not imply that more agents always help: recent debate research identifies risks of sycophancy and error amplification. SHEOL therefore uses multiple models selectively rather than as a default swarm.

- https://arxiv.org/abs/2308.00352
- https://arxiv.org/abs/2406.04692

## Model routing
RouteLLM demonstrates learned routing between stronger and weaker models under quality/cost trade-offs. SHEOL generalizes this into capability-aware routing with escalation based on risk and evidence.

- https://openreview.net/pdf?id=8sSqNntaMr

## Evaluation
SWE-bench demonstrates execution-based evaluation of repository changes, including regression protection. Later audits also demonstrate why benchmark validity must itself be tested. tau-bench evaluates tool-agent behavior against end-state database goals and introduces pass^k reliability. GAIA evaluates multi-step, multimodal and tool-use abilities.

- https://openai.com/index/introducing-swe-bench-verified/
- https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/
- https://arxiv.org/abs/2406.12045
- https://arxiv.org/abs/2311.12983

## Architectural conclusion

SHEOL combines these ideas into a different control model:

- durable state without making the workflow engine the AI
- workers as replaceable execution components
- structured handoffs instead of narrative memory
- deterministic verification before semantic judgement
- evidence-backed replanning
- artifact-first mission state
- end-to-end evaluation instead of answer-only scoring
