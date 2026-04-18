-- supabase/migrations/20260418000000_drop_insights_rpcs.sql
--
-- Drops the RPC functions that powered the deprecated Insights page.
--
-- The `/insights` route, its API handler, and `lib/insights.ts` were all
-- removed in the "distill" pass when the feature was judged to be not
-- delivering enough value to justify the surface area. These RPC
-- functions are now orphaned and would only confuse future contributors
-- reading the schema — drop them at the source.
--
-- Defined originally in:
--   20260322000001_insights_rpc.sql
--   20260323000000_insights_rpc_practice_filter.sql

DROP FUNCTION IF EXISTS get_subcategory_error_counts();
DROP FUNCTION IF EXISTS get_subcategory_examples();
