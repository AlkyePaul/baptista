/** Row shapes of the `baptista` schema as read by the app (subset of columns actually selected). */

export type Visibility = "private" | "household";
export type MemberRole = "owner" | "member";
export type MemberState = "pending" | "active" | "revoked";

export type Household = {
  id: string;
  name: string;
  timezone: string;
  version: number;
};

export type Membership = {
  household_id: string;
  role: MemberRole;
  state: MemberState;
  household: Household;
};

export type DirectoryEntry = {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  role: MemberRole;
  state: MemberState;
};

type RecordBase = {
  id: string;
  household_id: string;
  owner_user_id: string | null;
  visibility: Visibility;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = RecordBase & {
  title: string;
  description: string | null;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type Task = RecordBase & {
  title: string;
  notes: string | null;
  status: "open" | "completed";
  due_date: string | null;
  completed_at: string | null;
};

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Note = RecordBase & {
  kind: "note" | "list";
  title: string;
  body: string | null;
  items: ChecklistItem[];
};

/** System category (owner null) or personal category of one user (D24). */
export type Category = {
  id: string;
  owner_user_id: string | null;
  name: string;
  color: string;
  version: number;
};

export type CategoryRef = Pick<Category, "id" | "name" | "color">;

export type Goal = RecordBase & {
  category_id: string | null;
  category: CategoryRef | null;
  title: string;
  /** Goals go from start to target, up or down (e.g. 85 → 70 kg). */
  start_value: number;
  target_value: number;
  current_value: number;
  unit: string | null;
  target_date: string | null;
  /** C9: progress counted from this habit's entries (no manual progress). */
  habit_id: string | null;
};

export type Habit = RecordBase & {
  category_id: string | null;
  category: CategoryRef | null;
  title: string;
  target_per_week: number;
  active: boolean;
  starts_on: string;
};

export type HabitEntry = { id: string; habit_id: string; performed_on: string };

export type Observation = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  source_type: string;
  source_id: string;
  visibility: Visibility;
  priority_score: number;
  confidence: number;
  /** Structured facts computed by the detector (dates, counts, values) — never by a model. */
  data: Record<string, unknown>;
  created_at: string;
  valid_until: string | null;
};

// Cucina (D25) -------------------------------------------------------------------------------

/** D31: the household food catalog (Open Food Facts or added by a member). */
export type Food = {
  id: string;
  household_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category: string;
  default_storage: "fridge" | "freezer" | "pantry";
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  nutrition_source: "manual" | "openfoodfacts" | null;
  /** C8: null = never decided, true = abituale, false = «non chiederlo più». */
  staple: boolean | null;
  version: number;
  created_at: string;
};

export type FoodItem = RecordBase & {
  food_id: string;
  product_name: string;
  brand: string | null;
  barcode: string | null;
  category: string;
  quantity: number;
  unit: string;
  storage: "fridge" | "freezer" | "pantry";
  status: "available" | "opened" | "consumed" | "discarded";
  purchased_on: string | null;
  opened_on: string | null;
  explicit_expires_on: string | null;
  estimated_expires_on: string | null;
  estimate_basis: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  nutrition_source: "manual" | "openfoodfacts" | null;
  closed_at: string | null;
};

export type Meal = RecordBase & {
  title: string;
  notes: string | null;
};

/** A food of a meal with its grams (0 allowed: it barely counts); nutrition read from the catalog. */
export type MealItem = { id: string; meal_id: string; food_id: string; grams: number; position: number; food: Food };

export type Recipe = RecordBase & {
  title: string;
  servings: number | null;
  body: string | null;
};

export const RECIPE_UNITS = ["g", "kg", "ml", "l", "pz", "cucchiaio", "cucchiaino", "spicchio", "pizzico", "qb"] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export type RecipeIngredient = { id: string; recipe_id: string; food_id: string; amount: number | null; unit: RecipeUnit | null; position: number; food: Food };

export type DietEntry = {
  id: string;
  eaten_on: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  label: string;
  grams: number | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  meal_id: string | null;
  created_at: string;
};

// Lista della spesa (Phase 04.1) -----------------------------------------------------------

export type ShoppingItem = {
  id: string;
  household_id: string;
  owner_user_id: string | null;
  kind: "food" | "other";
  name: string;
  name_key: string;
  food_id: string | null;
  quantity: number | null;
  unit: string | null;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  storage: "fridge" | "freezer" | "pantry" | null;
  status: "open" | "stocked" | "done" | "removed";
  food_item_id: string | null;
  stock_batch_id: string | null;
  sort_order: number;
  version: number;
  created_at: string;
};

/** Per-viewer memory of what Baptista said and how it was answered (B-4). */
export type Presentation = {
  key: string;
  observation_id: string | null;
  first_shown_at: string;
  last_shown_at: string;
  show_count: number;
  last_variant: string | null;
  outcome: "shown" | "answered" | "acted" | "snoozed" | "dismissed" | "failed";
  snoozed_until: string | null;
  script_step: string | null;
  result_text: string | null;
};

// Guardaroba (D28: manual) -------------------------------------------------------------------

export type WardrobeItem = RecordBase & {
  name: string;
  type: string;
  subtype: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  pattern: string | null;
  material: string | null;
  seasons: string[];
  formality: string | null;
  brand: string | null;
  size: string | null;
  tags: string[];
  notes: string | null;
  original_path: string | null;
  thumb_path: string | null;
  processed_path: string | null;
  status: "active" | "archived";
  /** A-2: how the item arrived; `expense_id` links the purchase in Finanze. */
  acquisition: "unknown" | "purchased" | "gift" | "owned_before";
  expense_id: string | null;
};

// Finanze (D26) ------------------------------------------------------------------------------

export type ExpenseCategory = { id: string; name: string; color: string; parent_id: string | null; version: number };

export type Expense = RecordBase & {
  merchant: string | null;
  description: string | null;
  occurred_on: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number;
  payment_method: "cash" | "card" | "transfer" | "other" | null;
  category_id: string | null;
  goal_id: string | null;
  receipt_intake_id: string | null;
  notes: string | null;
};

export type ExpenseItem = {
  id: string;
  expense_id: string;
  position: number;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  category_id: string | null;
};

export type Budget = { id: string; category_id: string | null; currency: string; monthly_amount: number; version: number };

export type EstimateLine = { id: string; label: string; amount: number };

export type FinanceGoal = RecordBase & {
  title: string;
  notes: string | null;
  currency: string;
  target_date: string | null;
  estimate_lines: EstimateLine[];
  initial_estimate: number;
  status: "active" | "completed" | "archived";
};

