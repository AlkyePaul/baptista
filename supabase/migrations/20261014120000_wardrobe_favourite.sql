-- Add favourite flag to wardrobe items (boolean, defaults to false).

alter table baptista.wardrobe_items
  add column favourite boolean not null default false;

grant insert (favourite) on baptista.wardrobe_items to authenticated;
grant update (favourite) on baptista.wardrobe_items to authenticated;
