# Progress - Family Chore App

## Open Tasks and Next Steps (Added Aug 7, 2025)

The following items remain to align behavior with expectations that:
- Creating single (non-recurring) chores immediately “does something” (i.e., are visible as actionable items to kids)
- Parents can easily see which kids have which chores

1) Backend – Single Chore Auto‑Assign behavior
- Change initial status for auto‑assigned single chores from "assigned" to "pending_acceptance" so they appear as actionable to the assignee (accept/decline flow).
- Ensure a chore_assignments record is created with status "pending" and an acceptance_deadline based on acceptance_timer (this exists; confirm consistency with new status).
- Verify accept/decline flows transition statuses correctly:
  - pending_acceptance -> in_progress (on accept)
  - pending_acceptance -> available (on decline)
- Return the chore with assignee_name and current status from POST /api/chores so UI can refresh consistently.

2) Backend – “Chores by Member” visibility for parents
- Add a new API endpoint to group chores by child for a family:
  - GET /api/users/family/chores-by-member
  - Auth: parent only; family scope.
  - Response shape:
    {
      status: "success",
      data: {
        family_id,
        members: [
          {
            id, name, role,
            chores: [
              { id, title, status, reward_type, current_reward, requires_photo, acceptance_timer, created_at, due_date, ... }
            ],
            totals: { assigned: n, pending_acceptance: n, in_progress: n, pending_approval: n, completed: n }
          },
          ...
        ]
      }
    }
- Include unassigned chores in a special "Unassigned" bucket for quick assignment (optional but useful).

3) Frontend – Manage view improvements (simple.html and Alpine app)
- Create a “Chores by Member” section in Manage:
  - Call GET /api/users/family/chores-by-member.
  - Render one card per child with their open chores grouped by status.
  - Each chore entry should surface quick actions:
    - If status == available: Assign
    - If status == pending_approval: Approve/Reject
    - If status == pending_acceptance: info pill indicating child needs to accept
- Update Create Chore form to include Auto‑assign + Rotation settings (already added to simple.html; ensure Alpine app parity).
- On successful chore creation, refresh:
  - /chores (All)
  - /users/family/chores-by-member (new)
  - (For child sessions) /users/me/chores

4) QA and Validation
- Create chore with auto-assign = true, rotation_type = round_robin:
  - Expect first child receives a chore in pending_acceptance.
  - Accept as child; status → in_progress; Submit; Parent approves; child earnings increase.
- Create chore with auto-assign = false (available):
  - Chore appears in Unassigned/Available; Assign to child; status → pending_acceptance; accept/decline flows work.
- Confirm All Chores list shows assignee_name and updated status after actions.
- Confirm new “Chores by Member” view matches API data and updates after actions.

5) Data/Schema sanity
- No schema change is required (existing columns cover statuses).
- Ensure the /families/:familyId/members creates hashed password if we later allow email logins for children; right now random strings are stored as password_hash without hashing for child accounts without email. Documented as known limitation (not blocking current flow).

6) Documentation
- Update README or memory-bank/activeContext.md to reflect:
  - New endpoint: GET /api/users/family/chores-by-member
  - Single chore auto-assign behavior and statuses
  - How Manage view surfaces grouped chores

Rationale / Notes
- Switching auto-assigned chores to "pending_acceptance" ensures creating a chore “does something” immediately: it shows up for the child to accept/decline.
- Grouping chores by member gives parents a clear view of workload distribution and quick actions.

Owner suggestions
- Backend changes: routes/chores.js and routes/users.js (new handler) – 1–2 hours
- Frontend changes: simple.html (done for create form), add Manage grouping list; Alpine app parity – 1–2 hours
- QA pass – 30–45 minutes
