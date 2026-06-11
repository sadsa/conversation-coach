# Analytics events stored in Supabase, not a dedicated tool

We needed to track learning loop funnel drop-off (Practise → Review → Study). We chose a plain `events` table in Supabase over a dedicated analytics product (PostHog, Mixpanel).

The deciding factor was LLM agent queryability: an agent can JOIN events against `sessions`, `annotations`, and `practice_items` in a single SQL query, using the same Supabase connection that already exists. A dedicated tool would require a separate API, a separate query language, and can't reach domain data at all.

The trade-off is losing PostHog's pre-built funnel UI and session replay. We accepted that because the user base is small and known (allowlist), so ad-hoc SQL queries via an LLM agent are sufficient.
