const fetch = require('node-fetch');

const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const WEATHER_TIMEZONE = 'Europe/London';
const WEATHER_BUCKET_PRECISION = 2;
const WEATHER_HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'wind_speed_10m',
  'wind_direction_10m',
  'weather_code',
];

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isValidLatLngPair(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

function midpointLatLng(start, end) {
  if (isValidLatLngPair(start) && isValidLatLngPair(end)) {
    return [
      (Number(start[0]) + Number(end[0])) / 2,
      (Number(start[1]) + Number(end[1])) / 2,
    ];
  }
  if (isValidLatLngPair(start)) return [Number(start[0]), Number(start[1])];
  if (isValidLatLngPair(end)) return [Number(end[0]), Number(end[1])];
  return null;
}

function getRideCoordinate(ride) {
  if (!ride || typeof ride !== 'object') return null;
  return midpointLatLng(ride.start_latlng, ride.end_latlng);
}

function getCoordinateBucketKey(coords) {
  if (!coords) return null;
  const [lat, lon] = coords;
  return `${lat.toFixed(WEATHER_BUCKET_PRECISION)},${lon.toFixed(WEATHER_BUCKET_PRECISION)}`;
}

function extractLocalDateParts(ride) {
  const localRaw = typeof ride?.start_date_local === 'string' ? ride.start_date_local : '';
  const match = localRaw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})/);
  if (match) {
    return {
      date: match[1],
      hourKey: `${match[1]}T${match[2]}:00`,
    };
  }

  const fallbackRaw = ride?.start_date || ride?.start_date_local;
  const fallback = fallbackRaw ? new Date(fallbackRaw) : null;
  if (!fallback || Number.isNaN(fallback.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: WEATHER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter
    .formatToParts(fallback)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  if (!parts.year || !parts.month || !parts.day || !parts.hour) return null;

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    hourKey: `${date}T${parts.hour}:00`,
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function calculateBearingDegrees(start, end) {
  if (!isValidLatLngPair(start) || !isValidLatLngPair(end)) return null;

  const startLat = toRadians(Number(start[0]));
  const startLon = toRadians(Number(start[1]));
  const endLat = toRadians(Number(end[0]));
  const endLon = toRadians(Number(end[1]));
  const deltaLon = endLon - startLon;

  const y = Math.sin(deltaLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);
  const angle = toDegrees(Math.atan2(y, x));
  return (angle + 360) % 360;
}

function calculateHeadwindKph(rideBearingDeg, windDirectionDeg, windSpeedKph) {
  if (
    !Number.isFinite(rideBearingDeg) ||
    !Number.isFinite(windDirectionDeg) ||
    !Number.isFinite(windSpeedKph)
  ) {
    return null;
  }

  const delta = ((windDirectionDeg - rideBearingDeg + 540) % 360) - 180;
  return roundTo(windSpeedKph * Math.cos(toRadians(delta)), 1);
}

function buildWeatherRecord(hourly, index, ride) {
  const tempC = toFiniteNumber(hourly.temperature_2m?.[index]);
  const feelsLikeC = toFiniteNumber(hourly.apparent_temperature?.[index]);
  const precipMm = toFiniteNumber(hourly.precipitation?.[index]);
  const windKph = toFiniteNumber(hourly.wind_speed_10m?.[index]);
  const windDirDeg = toFiniteNumber(hourly.wind_direction_10m?.[index]);
  const weatherCode = toFiniteNumber(hourly.weather_code?.[index]);
  const rideBearingDeg = calculateBearingDegrees(ride.start_latlng, ride.end_latlng);

  return {
    source: 'open-meteo',
    observedAtLocalHour: hourly.time[index],
    tempC: roundTo(tempC, 1),
    feelsLikeC: roundTo(feelsLikeC, 1),
    precipMm: roundTo(precipMm, 1),
    windKph: roundTo(windKph, 1),
    windDirDeg: roundTo(windDirDeg, 0),
    rideBearingDeg: roundTo(rideBearingDeg, 0),
    headwindKph: calculateHeadwindKph(rideBearingDeg, windDirDeg, windKph),
    weatherCode: weatherCode == null ? null : Math.round(weatherCode),
  };
}

async function fetchHourlyWeather({ latitude, longitude, startDate, endDate }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: startDate,
    end_date: endDate,
    hourly: WEATHER_HOURLY_FIELDS.join(','),
    timezone: WEATHER_TIMEZONE,
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  });

  const response = await fetch(`${OPEN_METEO_ARCHIVE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather fetch failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error('Weather response missing hourly data');
  }
  return data.hourly;
}

async function enrichRidesWithWeather(rides) {
  if (!Array.isArray(rides) || rides.length === 0) {
    return Array.isArray(rides) ? rides : [];
  }

  const enriched = rides.map((ride) => ({ ...ride }));
  const groups = new Map();

  rides.forEach((ride, index) => {
    const coords = getRideCoordinate(ride);
    const localParts = extractLocalDateParts(ride);
    if (!coords || !localParts) {
      return;
    }

    const bucketKey = getCoordinateBucketKey(coords);
    if (!bucketKey) return;

    if (!groups.has(bucketKey)) {
      groups.set(bucketKey, {
        coords: {
          latitude: Number(coords[0].toFixed(WEATHER_BUCKET_PRECISION)),
          longitude: Number(coords[1].toFixed(WEATHER_BUCKET_PRECISION)),
        },
        startDate: localParts.date,
        endDate: localParts.date,
        rides: [],
      });
    }

    const group = groups.get(bucketKey);
    group.startDate = group.startDate < localParts.date ? group.startDate : localParts.date;
    group.endDate = group.endDate > localParts.date ? group.endDate : localParts.date;
    group.rides.push({
      index,
      ride,
      hourKey: localParts.hourKey,
    });
  });

  await Promise.all(
    [...groups.values()].map(async (group) => {
      try {
        const hourly = await fetchHourlyWeather({
          latitude: group.coords.latitude,
          longitude: group.coords.longitude,
          startDate: group.startDate,
          endDate: group.endDate,
        });
        const timeIndex = new Map(hourly.time.map((time, index) => [time, index]));

        group.rides.forEach(({ index, ride, hourKey }) => {
          const hourlyIndex = timeIndex.get(hourKey);
          if (hourlyIndex == null) return;

          enriched[index].weather = buildWeatherRecord(hourly, hourlyIndex, ride);
        });
      } catch (error) {
        console.error('Weather enrichment failed:', error);
      }
    })
  );

  return enriched;
}

module.exports = {
  enrichRidesWithWeather,
};
