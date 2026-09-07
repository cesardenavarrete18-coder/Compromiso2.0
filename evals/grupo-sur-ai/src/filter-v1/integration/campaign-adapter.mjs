const MONEY_FIELDS = ["advance_amount", "installment_amount", "final_price"];

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function adaptCampaignRows(rows = []) {
  return rows.map(row => Object.freeze({
    id: String(row.id),
    campaign_id: String(row.id),
    model_id: String(row.model_id),
    active: row.active === true,
    plan_name: row.plan_name ?? "",
    version_name: row.version_name ?? "",
    transmission: row.transmission ?? "",
    installment_count: row.installment_count == null ? null : Number(row.installment_count),
    ...Object.fromEntries(MONEY_FIELDS.map(key => [key, nullableNumber(row[key])])),
    installment_is_from: row.installment_is_from !== false,
    bonus: row.bonus ?? "",
    benefits: Array.isArray(row.benefits) ? [...row.benefits] : [],
  }));
}
