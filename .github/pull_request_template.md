## What changed

<!-- One or two sentences. What does this do for the IT department or for an employee? -->

## Why

<!-- The problem behind the change. Link an issue if there is one: Closes #123 -->

## How to check it

<!-- The route(s) to open and what should happen. Both faces if it touches shared code. -->

- [ ] `/ti/…`
- [ ] `/` (employee portal)

## Checklist

- [ ] `npm run verify` passes (lint, typecheck, test, build)
- [ ] UI copy is in Spanish; identifiers, comments and docs are in English
- [ ] No hardcoded colours — CSS variables only, checked in **both** light and dark
- [ ] Any new server action verifies the session **before** writing, and calls `revalidatePath`
- [ ] The employee portal still filters every service-role query by the employee email

## Database

<!-- Delete this section if the schema did not change. -->

- [ ] The DDL is in `supabase/schema.sql` and is idempotent
- [ ] It was applied to the remote project
- [ ] `src/types/database.ts` was regenerated
