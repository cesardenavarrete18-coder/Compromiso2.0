"""Explicit candidate artifacts; certified foundation suites never receive them.

These files are transported to the selected new suite, which applies them
verbatim after its observed schema overlays. Availability is not proof of SQL
execution. Do not discover candidate migrations with a glob or install them
globally: each suite's source snapshot must declare its exact boundary.
"""

ASSIGNMENT_GUARD = "20260918033251_m1_assignment_adoption_guard.sql"
ASSIGNMENT_COMMANDS = "20260918033407_m1_assignment_commands.sql"
CANDIDATE_MIGRATIONS_BY_SUITE = {
    "assignment-channel-prerequisite.integration.test.mjs": (ASSIGNMENT_GUARD,),
    "assignment-channel-guard.integration.test.mjs": (ASSIGNMENT_GUARD, ASSIGNMENT_COMMANDS),
    "assignment-runtime.integration.test.mjs": (ASSIGNMENT_GUARD, ASSIGNMENT_COMMANDS),
}


def candidate_migrations_for(suite):
    names = CANDIDATE_MIGRATIONS_BY_SUITE.get(suite, ())
    if suite in CANDIDATE_MIGRATIONS_BY_SUITE and not names:
        raise ValueError("BLOCKED: candidate artifact plan is not ready for " + suite)
    return names


def all_candidate_migrations():
    return tuple(sorted({name for names in CANDIDATE_MIGRATIONS_BY_SUITE.values() for name in names}))
