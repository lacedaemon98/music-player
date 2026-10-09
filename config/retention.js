/**
 * How long played songs stay visible in "recently played" before the daily
 * cleanup job deletes them.
 *
 * The API filters by the same window, so a song disappears from the list as
 * soon as it is older than this even if the cleanup job has not run yet.
 */
module.exports = {
  RECENTLY_PLAYED_RETENTION_DAYS: 3
};
