# Astra Revenue OS — Project Plan v0.1

Status: FOUNDATION / isolated development
Branch: feat/astra-revenue-os-foundation
Base: main @ e3675903ade49080a575f5d19f61b243ad2aa948
Production impact: NONE
Deployment authorization: NONE

## 1. Mission

Build a bounded multi-agent revenue system for Grupo Sur / CDN that can discover demand, generate and recover opportunities, assist sales execution, measure attributable business impact, and progressively earn autonomy under explicit policy and audit controls.

Primary business objective:
- Increase attributable contribution margin through organic acquisition, lead recovery, B2B prospecting, content/distribution and supervisor assistance.

The system must not optimize raw activity volume at the expense of customer experience, commercial rules, compliance, brand safety or process integrity.

## 2. Architectural decision

Build inside the existing CRM repository as a bounded subsystem, not as a separate product repository.

Target structure:

- services/astra-revenue/
  - director/
  - agents/
  - tools/
  - policies/
  - adapters/
  - runtime/
- supabase/
  - migrations/ (new agent_* and attribution objects only; no production application in this phase)
  - functions/ (bounded RPC/tool adapters when authorized)
- vendedores/
  - ai-operations/ (operator/supervisor UI)
- evals/
  - astra-revenue/
- docs/
  - astra-revenue-os/

Runtime principles:
- OpenAI/Astra orchestrates reasoning and delegation.
- Supabase remains system of record for CRM data.
- Deterministic services own prices, permissions, contact policy, attribution rules, budgets and kill switches.
- Agents never receive unrestricted database write access.
- Early phases are observe/recommend/draft only.
- Production CRM canonical domains remain unchanged until their authority gates are explicitly closed.

## 3. Initial agent scope

Phase 1 agents:
1. Astra Director (bounded coordinator)
2. Recovery Agent
3. B2B Fleet Hunter
4. Content Director / Publisher
5. Supervisor Agent

Shared deterministic services:
- Agent registry
- Task/event ledger
- Approval queue
- Policy engine
- Budget/cost ledger
- Audit log
- Attribution primitives
- Kill switch

## 4. Autonomy model

L0 Observe
L1 Recommend
L2 Draft
L3 Execute bounded
L4 Autonomous

Initial state:
- Director: L1
- Recovery: L1/L2
- B2B Hunter: L1
- Content: L2
- Publisher: L2 (approval required)
- Supervisor: L1

No production-side autonomous customer contact, reassignment, publication, pricing change, campaign mutation or bulk action is authorized by this plan.

## 5. Phase 0 — Foundation

Deliverables:
- agent_definitions
- agent_runs
- agent_tasks
- agent_events
- agent_tool_calls
- agent_costs
- agent_approvals
- agent_policy_violations
- commercial_attribution base model
- policy contracts
- test fixtures
- golden dataset
- AI Operations dashboard skeleton

Acceptance criteria:
- Every run has immutable correlation id.
- Every tool call is attributable to agent/run/task.
- Every proposed side effect declares requested authority.
- Unauthorized side effects fail closed.
- Retries are idempotent.
- No production CRM canonical table is modified by agent runtime.
- Cost is recorded by run.
- Human approval can be required per action class.
- Global kill switch blocks all side-effect-capable tools.

## 6. Phase 1 — Money Loop

### Recovery
Inputs:
- inactive/no-response/expired leads
- authorized active campaigns
- prior conversation/context

Output:
- ranked recovery candidates
- reason/evidence
- proposed offer or recontact angle
- draft message
- no automatic send initially

Primary KPI:
- recovered qualified conversations
- recovered appointments
- recovered sales
- attributable contribution margin

### B2B Fleet Hunter
Inputs:
- public company signals
- industry/size/location/service model
- available commercial vehicle catalog

Output:
- company
- evidence
- fit score
- probable fleet need
- relevant vehicle class
- public business contact
- proposed outreach hypothesis

Primary KPI:
- qualified company opportunities
- replies
- meetings
- proposals
- units sold

### Content / Publisher
Inputs:
- demand signals
- active campaign catalog
- brand pack
- historical performance

Output:
- content brief
- generated asset/copy package
- proposed schedule
- approval request

Primary KPI:
- organic conversations
- leads
- appointments
- sales attributed to content

### Supervisor
Inputs:
- lead state
- ownership
- next actions
- protocol state
- recent interactions

Output:
- actionable exceptions
- stalled leads
- workload anomalies
- proposed interventions

Primary KPI:
- resolved high-priority exceptions
- time-to-action improvement
- sales/process recovery

## 7. Decisions required before L2/L3 side effects

Blocking definitions:
1. Business objective and KPI hierarchy.
2. Maximum allowed autonomy per action type.
3. Canonical data sources for campaigns, prices, models, lead ownership and status.
4. Contact policy (channel, cadence, hours, consent and opt-out).
5. B2B prospecting policy.
6. Brand rules for Grupo Sur and CDN.
7. Commercial claims/offer policy.
8. Approval matrix.
9. Budget/cost ceilings.
10. Attribution model.
11. PII/data-retention boundaries.
12. Environments and secrets strategy.

Can evolve later:
- exact agent count
- individual prompts
- ranking weights
- dashboard cosmetics
- long-term SEO/content mix
- advanced experiments

## 8. Environment strategy

Development:
- isolated branch
- non-production credentials
- fixtures/synthetic data where possible
- read-only CRM adapter initially

Staging:
- separate runtime and agent tables
- bounded access to representative CRM data
- no customer-side effects without explicit approval

Production:
- forbidden until gate review
- tools promoted one action class at a time
- each promotion requires policy, tests, rollback and audit evidence

## 9. Sprint plan

Sprint 0 (2–3 days)
- freeze contracts
- scaffold runtime
- schema draft
- policy matrix
- fixtures/golden dataset
- dashboard skeleton

Sprint 1 (5–7 days)
- event/task runtime
- approvals
- audit/cost ledger
- read-only CRM adapter
- Director v0

Sprint 2 (5–7 days)
- Recovery v0
- ranking/evidence
- draft actions
- attribution hooks

Sprint 3 (5–7 days)
- B2B Hunter v0
- company signal model
- evidence capture
- outreach drafts

Sprint 4 (5–7 days)
- Content Director v0
- brand/commercial validators
- Metricool draft/scheduling approval integration
- Supervisor v0

Target:
- first attributable business opportunity produced by the system within ~4 weeks without granting unsafe production autonomy.

## 10. Non-goals for foundation branch

- No production deploy.
- No migration applied to production.
- No automatic WhatsApp/email outreach.
- No autonomous lead reassignment.
- No autonomous ad spend.
- No autonomous price/offer changes.
- No contracts or legal commitments.
- No bypass of existing CRM authority work.

## 11. Immediate next artifact

Create ADR-001 with:
- repository/runtime placement
- authority boundaries
- first tables/events
- action taxonomy
- approval policy
- environment topology

Then implement the Phase 0 scaffold behind tests.
