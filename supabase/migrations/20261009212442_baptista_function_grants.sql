-- New functions get EXECUTE for PUBLIC by default. Keep the schema-wide rule: nothing for anon.
revoke execute on function baptista.goal_percent(numeric, numeric, numeric) from public, anon;
