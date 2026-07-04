-- Migration: Drop battery_classes.long_description_json
-- Description: Never read by any application code (confirmed via full-codebase
--              search). Appears to be a scaffolded-but-never-wired-up feature. Only
--              2 of 3 rows had data; preserved here for the record before dropping:
--                battery_classes id 331c1feb-a8e2-4247-9dc0-fc69e16c1c50 (LFP-2kWh-2200W):
--                  {"chemistry": "LiFePO4", "form_factor": "prismatic"}
--                battery_classes id 116276a7-ab7e-436c-ba17-bd0218e6752a (LTO-1.5kWh):
--                  {"chemistry": "LTO", "form_factor": "cylindrical"}
-- Date: 2026-07-04

ALTER TABLE battery_classes DROP COLUMN IF EXISTS long_description_json;
