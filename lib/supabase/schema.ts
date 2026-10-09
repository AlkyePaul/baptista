/** All Baptista domain objects live in `baptista.*`; `public` belongs to GuideApp. */
export const BAPTISTA_SCHEMA = "baptista" as const;

/** Private buckets reserved by docs/architecture/SECURITY.md (created in later phases). */
export const BAPTISTA_BUCKETS = {
  receipts: "baptista-receipts",
  wardrobe: "baptista-wardrobe",
  avatars: "baptista-avatars",
} as const;
