const { createStravaHandler } = require('./lib/strava');

module.exports = createStravaHandler(
  (activities) => activities.filter((a) => a.type === 'Ride' && a.commute === true),
  'ride data'
);
