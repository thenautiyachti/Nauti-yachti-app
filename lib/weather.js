// Free, no-key weather forecast for Lake Conroe, TX via Open-Meteo.
const LAT = 30.3935;
const LON = -95.5836;

const CODE_INFO = {
  0: { label: "Clear", icon: "☀️" },
  1: { label: "Mostly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Foggy", icon: "🌫️" },
  48: { label: "Foggy", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌦️" },
  56: { label: "Freezing drizzle", icon: "🌦️" },
  57: { label: "Freezing drizzle", icon: "🌦️" },
  61: { label: "Light rain", icon: "🌧️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Freezing rain", icon: "🌧️" },
  67: { label: "Freezing rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "❄️" },
  73: { label: "Snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "❄️" },
  80: { label: "Rain showers", icon: "🌧️" },
  81: { label: "Rain showers", icon: "🌧️" },
  82: { label: "Heavy showers", icon: "🌧️" },
  85: { label: "Snow showers", icon: "🌨️" },
  86: { label: "Snow showers", icon: "🌨️" },
  95: { label: "Thunderstorms", icon: "⛈️" },
  96: { label: "Thunderstorms", icon: "⛈️" },
  99: { label: "Thunderstorms", icon: "⛈️" },
};

function dayName(dateStr, index) {
  if (index === 0) return "Today";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

// Returns [] on any failure — the page should render fine with no forecast
// rather than break if Open-Meteo is unreachable.
export async function getLakeConroeForecast() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America%2FChicago&forecast_days=7`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30 min cache
    if (!res.ok) return [];
    const data = await res.json();
    const daily = data.daily;
    if (!daily || !Array.isArray(daily.time)) return [];

    return daily.time.map((date, i) => {
      const code = daily.weathercode[i];
      const info = CODE_INFO[code] || { label: "—", icon: "🌡️" };
      return {
        date,
        day: dayName(date, i),
        icon: info.icon,
        label: info.label,
        high: Math.round(daily.temperature_2m_max[i]),
        low: Math.round(daily.temperature_2m_min[i]),
        precipProb: daily.precipitation_probability_max[i],
        windMax: Math.round(daily.windspeed_10m_max[i]),
      };
    });
  } catch {
    return [];
  }
}
