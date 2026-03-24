const { createStravaHandler } = require('../lib/strava');

module.exports = createStravaHandler(
  (activities) => activities.filter((a) => a.type === 'Swim'),
  'swim data'
);
