# AI ENGINEERING EXECUTION PROTOCOL (STRICT MODE) --- USER FLOW MAPPING

This document is a HARD RULESET for mapping User Flow.

No assumption. No screen-first thinking. No layout thinking before flow
clarity.

If User Flow is wrong → UI/UX will be wrong → Implementation will be
wrong.

------------------------------------------------------------------------

# CORE PRINCIPLE

You do NOT start from screens. You start from USER INTENT.

User Flow exists to answer only this:

"How does a user move from intention to success with the least thinking
possible?"

Priority order (cannot be changed):

1.  User Goal Clarity
2.  Step Minimization
3.  Decision Minimization
4.  Cognitive Load Reduction
5.  Predictability
6.  Visual Representation

------------------------------------------------------------------------

# ABSOLUTE PROHIBITIONS

You MUST NOT:

-   Start mapping from UI screens
-   Assume user knowledge
-   Combine multiple goals into one flow
-   Add steps without necessity
-   Ignore edge paths (error, empty, retry)
-   Map based on system structure
-   Map based on database structure
-   Map based on developer perspective

If the flow reflects system thinking instead of user thinking → INVALID.

------------------------------------------------------------------------

# USER GOAL FIRST RULE

Before drawing any flow, you MUST write:

User Goal Statement (single sentence)

Format: "As a \[user\], I want to \[goal\], so that \[result\]."

If this is unclear → STOP.

------------------------------------------------------------------------

# FLOW GRANULARITY RULE

1 FLOW = 1 GOAL ONLY

If multiple goals exist → create multiple flows.

------------------------------------------------------------------------

# MANDATORY FLOW MAPPING SEQUENCE

You MUST follow this order:

1.  Define user goal
2.  Define entry point
3.  Define success point
4.  List minimum steps required
5.  Remove unnecessary steps
6.  Identify decision points
7.  Reduce decision points
8.  Add system states (loading, error, empty, success)
9.  Validate shortest possible path

Skipping any step → FLOW INVALID.

------------------------------------------------------------------------

# STEP VALIDATION RULE

For every step ask:

-   Why does this step exist?
-   Can this be removed?
-   Can this be automated?
-   Can this be merged?

If no strong reason → DELETE the step.

------------------------------------------------------------------------

# DECISION POINT RULE

Every decision point increases cognitive load.

You must:

-   Reduce options
-   Pre-fill data
-   Use defaults
-   Guide the next action

If user must think → FLOW WRONG.

------------------------------------------------------------------------

# ENTRY & EXIT CLARITY RULE

Every flow must clearly show:

-   Where user comes from
-   Where user ends
-   What success looks like

Vague ending → INVALID.

------------------------------------------------------------------------

# STATE INTEGRATION RULE

User flow must include:

-   Normal path
-   Error path
-   Empty data path
-   Retry path
-   Cancellation path

Ignoring these → FLOW INCOMPLETE.

------------------------------------------------------------------------

# SYSTEM VS USER THINKING RULE

Bad flow example: "User opens dashboard → clicks menu → chooses feature"

Good flow example: "User wants to submit report → lands directly on
report action"

Flow must reflect intention, not navigation.

------------------------------------------------------------------------

# COGNITIVE LOAD TEST

A correct flow allows user to:

-   Predict next step
-   Not read too much
-   Not remember previous info
-   Complete goal in minimal actions

If not → redesign.

------------------------------------------------------------------------

# DEFINITION OF DONE

A User Flow is COMPLETE only if:

-   Single clear goal
-   Minimal steps
-   Minimal decisions
-   All states included
-   Entry and success clearly defined
-   Reflects user thinking (not system thinking)

Otherwise: FLOW STATUS = INCOMPLETE

------------------------------------------------------------------------

# AGENT FAILURE CONDITION

If you start thinking about layout, buttons, or UI before flow is
validated: STOP.

Flow first. Screen later.
