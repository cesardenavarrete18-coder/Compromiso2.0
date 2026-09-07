export const FILTER_V1_ENABLED_DEFAULT = false;

export function filterV1Enabled(configuration = {}) {
  return configuration.FILTER_V1_ENABLED === true;
}
