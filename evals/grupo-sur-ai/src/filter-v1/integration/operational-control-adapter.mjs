export function adaptOperationalControl(row = null) {
  const humanOwned = row?.mode === "human";
  return Object.freeze({ human_owned: humanOwned, ai_allowed: !humanOwned, taken_by: humanOwned ? row.taken_by_user_id ?? null : null, taken_at: humanOwned ? row.taken_at ?? null : null });
}
