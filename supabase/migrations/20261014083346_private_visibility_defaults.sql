-- New personal records are private unless the creator explicitly shares them.
-- The shopping list and food catalog are intentionally household-wide.
alter table baptista.calendar_events alter column visibility set default 'private';
alter table baptista.tasks alter column visibility set default 'private';
alter table baptista.notes alter column visibility set default 'private';
alter table baptista.goals alter column visibility set default 'private';
alter table baptista.habits alter column visibility set default 'private';
alter table baptista.food_items alter column visibility set default 'private';
alter table baptista.meals alter column visibility set default 'private';
alter table baptista.expenses alter column visibility set default 'private';
alter table baptista.finance_goals alter column visibility set default 'private';
alter table baptista.wardrobe_items alter column visibility set default 'private';
alter table baptista.recipes alter column visibility set default 'private';
alter table baptista.looks alter column visibility set default 'private';
