// Using OpenWeather API
const API_KEY = "af50e4e5d6621753d5a4b210f3bc5294";
const GEOCODE_URL = "https://api.openweathermap.org/geo/1.0/direct";
const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const UV_INDEX_URL = "https://api.openweathermap.org/data/2.5/uvi";

const form = document.getElementById("weather-form");
const cityInput = document.getElementById("city-input");
const feedback = document.getElementById("feedback");
const weatherResults = document.getElementById("weather-results");
const submitButton = form.querySelector("button[type='submit']");
const locButton = document.getElementById("loc-button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const city = cityInput.value.trim();
  if (!city) {
    showError("Please enter a city name.");
    return;
  }

  // proceed to geocode the city name with Open-Meteo

  setLoading(true);
  weatherResults.classList.add("hidden");
  weatherResults.innerHTML = "";
  showFeedback("Loading weather…", "#0d5aa7");

  try {
    const weatherList = await fetchWeather(city);
    displayWeatherResults(weatherList);
    showFeedback("");
    localStorage.setItem("lastCity", city);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

window.addEventListener("load", () => {
  // Do not prefill or auto-submit any location on load – keep input blank.
  cityInput.value = "";
});

// Geolocation button handler
if (locButton) {
  locButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showError("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    showFeedback("Detecting location…", "#0d5aa7");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const weather = await fetchWeatherByCoords(latitude, longitude);
          displayWeatherResults([weather]);
          localStorage.setItem("lastCity", weather.city);
          showFeedback("");
        } catch (err) {
          showError(err.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        showError("Unable to retrieve location.");
        setLoading(false);
      },
      { timeout: 10000 }
    );
  });
}

async function fetchWeather(city) {
  const query = city.trim();
  const parts = query.split(',').map(p => p.trim());
  const cityName = parts[0];
  const stateOrAdmin = parts[1] || null;
  const country = parts[2] || null;

  // Build limit query for geocoding
  const limit = 100;
  const geoUrl = `${GEOCODE_URL}?q=${encodeURIComponent(cityName)}&limit=${limit}&appid=${API_KEY}`;
  const geoResponse = await fetch(geoUrl);
  if (!geoResponse.ok) {
    throw new Error("Unable to find location. Try again later.");
  }

  const geoResults = await geoResponse.json();
  if (!geoResults || geoResults.length === 0) {
    throw new Error("City not found. Please check the spelling.");
  }

  // Filter for exact matches
  const exactMatches = geoResults.filter((place) => {
    if (place.name.toLowerCase() !== cityName.toLowerCase()) {
      return false;
    }

    if (stateOrAdmin) {
      const placeState = (place.state || "").toLowerCase();
      const placeCountry = (place.country || "").toLowerCase();
      const inputState = stateOrAdmin.toLowerCase();
      const stateMatch = placeState === inputState || placeCountry === inputState;
      if (!stateMatch) {
        return false;
      }
    }

    if (country) {
      const placeCountry = (place.country || "").toLowerCase();
      const inputCountry = country.toLowerCase();
      if (placeCountry !== inputCountry) {
        return false;
      }
    }

    return true;
  });

  if (exactMatches.length === 0) {
    throw new Error("No exact place found. Try searching with full format like 'Paris, France' or 'Minna, Niger, Nigeria'.");
  }

  // Limit results to 1 - show only the most relevant location
  const limitedMatches = exactMatches.slice(0, 1);

  const weatherPromises = limitedMatches.map((place, index) => fetchWeatherForPlace(place, index + 1));
  return Promise.all(weatherPromises);
}

async function fetchWeatherForPlace(place, index) {
  const lat = place.lat;
  const lon = place.lon;
  const placeDisplay = buildPlaceDisplayName(place);

  const weatherUrl = `${WEATHER_URL}?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
  const weatherResponse = await fetch(weatherUrl);
  if (!weatherResponse.ok) {
    throw new Error("Unable to fetch weather data. Please try again later.");
  }

  const data = await weatherResponse.json();

  // Fetch UV index separately
  let uvIndex = "N/A";
  try {
    const uvUrl = `${UV_INDEX_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
    const uvResponse = await fetch(uvUrl);
    if (uvResponse.ok) {
      const uvData = await uvResponse.json();
      uvIndex = uvData.value ? Math.round(uvData.value * 10) / 10 : "N/A";
    }
  } catch (e) {
    // If UV fetch fails, continue with N/A
  }

  const temp = Math.round(data.main?.temp || 0);
  const feels = Math.round(data.main?.feels_like || temp);
  const humidity = data.main?.humidity || "N/A";
  const pressure = data.main?.pressure || "N/A";
  const windKmh = data.wind?.speed ? `${Math.round(data.wind.speed * 3.6)} km/h` : "N/A";
  const visibility = data.visibility ? (data.visibility >= 1000 ? `${(data.visibility / 1000).toFixed(1)} km` : `${data.visibility} m`) : "N/A";
  const condition = data.weather?.[0]?.main || "Unknown";
  const weatherCode = data.weather?.[0]?.main || "";

  return {
    index,
    city: placeDisplay,
    temp,
    condition,
    iconCode: weatherCode,
    humidity: `${humidity}%`,
    wind: windKmh,
    feels: `${feels}°C`,
    pressure: `${pressure} hPa`,
    visibility,
    uvIndex,
  };
}

async function fetchWeatherByCoords(lat, lon) {
  // Reverse geocode using OpenWeather API
  let placeName = "Your location";
  try {
    const rgUrl = `${GEOCODE_URL}?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
    const rg = await fetch(rgUrl);
    if (rg.ok) {
      const places = await rg.json();
      if (places && places.length > 0) {
        placeName = buildPlaceDisplayName(places[0]);
      }
    }
  } catch (e) {
    // ignore reverse geocode errors, use 'Your location'
  }

  const weatherUrl = `${WEATHER_URL}?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
  const weatherResponse = await fetch(weatherUrl);
  if (!weatherResponse.ok) {
    throw new Error("Unable to fetch weather data. Please try again later.");
  }

  const data = await weatherResponse.json();

  // Fetch UV index separately
  let uvIndex = "N/A";
  try {
    const uvUrl = `${UV_INDEX_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
    const uvResponse = await fetch(uvUrl);
    if (uvResponse.ok) {
      const uvData = await uvResponse.json();
      uvIndex = uvData.value ? Math.round(uvData.value * 10) / 10 : "N/A";
    }
  } catch (e) {
    // If UV fetch fails, continue with N/A
  }

  const temp = Math.round(data.main?.temp || 0);
  const feels = Math.round(data.main?.feels_like || temp);
  const humidity = data.main?.humidity || "N/A";
  const pressure = data.main?.pressure || "N/A";
  const windKmh = data.wind?.speed ? `${Math.round(data.wind.speed * 3.6)} km/h` : "N/A";
  const visibility = data.visibility ? (data.visibility >= 1000 ? `${(data.visibility / 1000).toFixed(1)} km` : `${data.visibility} m`) : "N/A";
  const condition = data.weather?.[0]?.main || "Unknown";
  const weatherCode = data.weather?.[0]?.main || "";

  return {
    city: placeName,
    temp,
    condition,
    iconCode: weatherCode,
    humidity: `${humidity}%`,
    wind: windKmh,
    feels: `${feels}°C`,
    pressure: `${pressure} hPa`,
    visibility,
    uvIndex,
  };
}

function buildPlaceDisplayName(place) {
  // OpenWeather format: place has name, state (admin1), country
  const cityName = place.name || "";
  const state = place.state || "";
  const country = place.country || "";
  
  if (state && country) {
    return `${cityName}, ${state}, ${country}`;
  } else if (state) {
    return `${cityName}, ${state}`;
  } else if (country) {
    return `${cityName}, ${country}`;
  }
  return cityName;
}


function getNearestHourlyValue(hourly, currentTime, key) {
  if (!hourly.time || !Array.isArray(hourly.time) || !hourly[key]) {
    return null;
  }

  const target = Date.parse(currentTime);
  if (Number.isNaN(target)) {
    return null;
  }

  let closestIndex = -1;
  let closestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hourly.time.length; i += 1) {
    const timeValue = Date.parse(hourly.time[i]);
    if (Number.isNaN(timeValue)) continue;
    const diff = Math.abs(timeValue - target);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }

  if (closestIndex < 0) {
    return null;
  }

  return hourly[key][closestIndex] != null ? hourly[key][closestIndex] : null;
}

function buildPlaceDisplayName(place) {
  let admin = place.admin1 || "";
  if (place.country === "Nigeria" && admin && !/state$/i.test(admin)) {
    admin = `${admin} State`;
  }
  return `${place.name}${admin ? `, ${admin}` : ""}${place.country ? `, ${place.country}` : ""}`;
}

function displayWeatherResults(weatherList) {
  weatherResults.innerHTML = "";
  weatherResults.classList.remove("hidden");

  weatherList.forEach((weather) => {
    const card = document.createElement("article");
    card.className = "weather-card-item";
    card.innerHTML = `
      <div class="result-top">
        <div>
          <p class="result-label">#${weather.index}</p>
          <h2>${weather.city}</h2>
        </div>
        <div class="result-icon" aria-hidden="true">
          <img class="weather-icon" src="${mapWeatherCodeToIcon(weather.iconCode)}" alt="${weather.condition} icon" />
        </div>
      </div>
      <p class="temp">${weather.temp}°C</p>
      <p class="result-description muted">${weather.condition}</p>
      <div class="weather-grid">
        <div class="weather-metric"><span>Feels like</span><strong>${weather.feels}</strong></div>
        <div class="weather-metric"><span>Humidity</span><strong>${weather.humidity}</strong></div>
        <div class="weather-metric"><span>Wind speed</span><strong>${weather.wind}</strong></div>
        <div class="weather-metric"><span>Pressure</span><strong>${weather.pressure}</strong></div>
        <div class="weather-metric"><span>Visibility</span><strong>${weather.visibility}</strong></div>
        <div class="weather-metric"><span>UV index</span><strong>${weather.uvIndex}</strong></div>
      </div>
    `;
    weatherResults.appendChild(card);
    requestAnimationFrame(() => card.classList.add("visible"));
  });
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function mapWeatherCodeToIcon(code) {
  // OpenWeather weather main codes: Clear, Clouds, Rain, Snow, Drizzle, Thunderstorm, Mist/Fog, etc.
  const sun = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='128' height='128'><circle cx='32' cy='28' r='10' fill='#FFD166'/><g stroke='#FFB703' stroke-width='2' stroke-linecap='round'><line x1='32' y1='4' x2='32' y2='14'/><line x1='32' y1='42' x2='32' y2='52'/><line x1='4' y1='28' x2='14' y2='28'/><line x1='50' y1='28' x2='60' y2='28'/></g></svg>`;
  const cloud = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='128' height='128'><path d='M20 42h28a12 12 0 0 0 0-24 16 16 0 0 0-31-2A10 10 0 0 0 10 30c0 6 6 12 10 12z' fill='#D0E6F9'/></svg>`;
  const rain = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='128' height='128'><path d='M18 34h30a10 10 0 0 0 0-20 14 14 0 0 0-27-2A8 8 0 0 0 10 22c0 6 6 12 8 12z' fill='#BFDDF8'/><g stroke='#2B6CB0' stroke-linecap='round' stroke-width='2'><line x1='22' y1='46' x2='22' y2='56'/><line x1='32' y1='46' x2='32' y2='56'/><line x1='42' y1='46' x2='42' y2='56'/></g></svg>`;
  const snow = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='128' height='128'><path d='M18 36h30a10 10 0 0 0 0-20 14 14 0 0 0-27-2A8 8 0 0 0 10 24c0 6 6 12 8 12z' fill='#EAF6FF'/><g stroke='#2B7CA3' stroke-linecap='round' stroke-width='2'><line x1='24' y1='46' x2='24' y2='54'/><line x1='24' y1='50' x2='28' y2='50'/><line x1='28' y1='46' x2='28' y2='54'/></g></svg>`;
  const thunder = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='128' height='128'><path d='M18 34h30a10 10 0 0 0 0-20 14 14 0 0 0-27-2A8 8 0 0 0 10 22c0 6 6 12 8 12z' fill='#D7EEFF'/><path d='M34 36l-6 10h8l-2 12 12-16h-8z' fill='#F4C542'/></svg>`;
  const fog = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='128' height='128'><rect x='6' y='28' width='52' height='8' rx='4' fill='#E6F1F8'/><rect x='10' y='38' width='44' height='6' rx='3' fill='#E6F1F8'/></svg>`;

  const codeStr = String(code).toLowerCase();
  if (codeStr.includes("clear") || codeStr.includes("sunny")) return svgToDataUrl(sun);
  if (codeStr.includes("cloud")) return svgToDataUrl(cloud);
  if (codeStr.includes("rain")) return svgToDataUrl(rain);
  if (codeStr.includes("snow")) return svgToDataUrl(snow);
  if (codeStr.includes("thunderstorm")) return svgToDataUrl(thunder);
  if (codeStr.includes("mist") || codeStr.includes("fog")) return svgToDataUrl(fog);
  if (codeStr.includes("drizzle")) return svgToDataUrl(rain);
  return svgToDataUrl(cloud);
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Searching…" : "Search weather";
}

function showFeedback(message, color = "#d64545") {
  feedback.textContent = message;
  feedback.style.color = color;
}

function showError(message) {
  showFeedback(message, "#d64545");
}

function capitalize(text) {
  return text
    .toString()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
