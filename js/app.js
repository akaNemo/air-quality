// Main Application Class
class AirQualityApp {
    constructor() {
        this.map = null;
        this.markers = [];
        
        // Use actual WAQI coordinates
        this.stationCoordinates = {
            'PO': [22.195833, 113.544722],
            'KH': [22.132087, 113.58173],
            'EN': [22.213889, 113.542778],
            'TC': [22.158083, 113.554591],
            'TG': [22.16, 113.565],
            'CD': [22.125278, 113.554444]
        };
        
        this.waqiStationMapping = {
            'PO': 'macau/calcada-do-poco',
            'KH': 'macau/ka-ho',
            'EN': 'macau/subestacao-macau-norte',
            'TC': 'macau/parque-central-da-taipa',
            'TG': 'macau/taipa-grande',
            'CD': 'macau/coloane'
        };
        
        // Translated Station Names
        this.waqiStationNames = {
            'PO': 'Rua do Campo (Water Well Slope)',
            'KH': 'Ka-Ho',
            'EN': 'Macau North (Power Station)',
            'TC': 'Taipa Central Park',
            'TG': 'Taipa Grande (SMG)',
            'CD': 'Coloane'
        };
        
        this.airQualityData = null;
        this.weatherData = null;
        this.waqiData = {};
        this.currentWAQIStation = null;
        
        this.waqiToken = '20be3ec9b049fa5e3f4e90e97f582441c3d312d9';
    }

    async init() {
        this.initMap();
        this.startClock();
        await this.loadData();
        this.initWAQIWidget();
        this.startAutoRefresh();
    }

    initMap() {
        this.map = L.map('map').setView([22.1987, 113.5439], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 18
        }).addTo(this.map);
    }

    startClock() {
        const updateClock = () => {
            const dateTimeElement = document.getElementById('current-datetime');
            if (dateTimeElement) {
                dateTimeElement.textContent = DataParser.getCurrentDateTime();
            }
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    async loadData() {
        try {
            await Promise.all([
                this.loadAirQualityData(),
                this.loadWeatherData(),
                this.loadWAQIData()
            ]);
            this.displayMarkers();
            this.updateWeatherInfo();
        } catch (error) {
            console.error('Data load failed:', error);
            this.useMockData();
        }
    }

    initWAQIWidget() {
        const selector = document.getElementById('waqi-station-selector');
        if (!selector) {
            console.warn('waqi-station-selector element not found, skipping Widget initialization');
            return;
        }
        
        if (this.airQualityData) {
            this.airQualityData.forEach(station => {
                if (this.waqiStationMapping[station.id]) {
                    const option = document.createElement('option');
                    option.value = station.id;
                    option.textContent = `${station.nameEn} - ${this.waqiStationNames[station.id] || ''}`;
                    selector.appendChild(option);
                }
            });
        }
        
        selector.addEventListener('change', (e) => {
            const stationId = e.target.value;
            if (stationId) {
                this.loadWAQIWidget(stationId);
            } else {
                this.clearWAQIWidget();
            }
        });
    }

    async loadWAQIWidget(stationId) {
        const waqiUrl = this.waqiStationMapping[stationId];
        if (!waqiUrl) return;
        
        this.currentWAQIStation = stationId;
        const container = document.getElementById('waqi-widget-container');
        if (!container) return;
        
        const stationName = this.waqiStationNames[stationId] || 'Station';
        
        container.innerHTML = `
            <div class="waqi-loading">
                <div class="loading-spinner"></div>
                <p style="text-align:center; color:#666;">Analyzing historical data & calculating trends...</p>
            </div>
        `;
        
        try {
            const waqiData = this.waqiData[stationId];
            
            if (!waqiData) {
                throw new Error('WAQI Data not loaded');
            }
            
            this.renderWAQICharts(container, waqiData, stationName, stationId);
            
        } catch (error) {
            console.error('Failed to load WAQI data:', error);
            container.innerHTML = `
                <div class="waqi-error">
                    <p>❌ Chart Loading Failed</p>
                    <p style="font-size: 0.85em; color: #999;">${error.message}</p>
                </div>
            `;
        }
    }

    renderWAQICharts(container, waqiData, stationName, stationId) {
        const officialStation = this.airQualityData.find(s => s.id === stationId);
        
        // 1. Clear container, rebuild basic structure
        container.innerHTML = `
            <div class="waqi-widget-content">
                <div class="widget-station-info">
                    <span class="widget-station-name">${stationName}</span>
                    <span class="widget-update-hint">AI Trend Analysis</span>
                </div>
                
                <div id="ai-prediction-dashboard">
                    <div class="ai-loading-state" style="text-align:center; padding: 40px;">
                        <div class="loading-spinner"></div>
                        <p style="color:#667eea; font-weight:600;">Running LSTM/GRU Neural Networks...</p>
                    </div>
                </div>
            </div>
        `;

        // 2. Trigger prediction logic
        if (officialStation) {
            this.renderAIPredictionComparison(officialStation);
        } else {
            const dashboard = document.getElementById('ai-prediction-dashboard');
            if(dashboard) {
                dashboard.innerHTML = `
                    <div class="waqi-error"><p>No official data available for AI prediction at this station</p></div>
                `;
            }
        }
    }

    async renderAIPredictionComparison(station) {
        const container = document.getElementById('ai-prediction-dashboard');
        
        if (!container) {
            console.error("ai-prediction-dashboard container not found");
            return;
        }

        try {
            const payload = {
                stationId: station.id,
                pm25: station.data.PM2_5 || 0,
                o3: station.data.O3 || 0,
                temperature: parseFloat(this.weatherData?.temperature) || 25,
                humidity: parseFloat(this.weatherData?.humidity) || 80,
                windSpeed: parseFloat(this.weatherData?.windSpeed) || 10,
                pressure: 1013
            };

            const response = await fetch('http://127.0.0.1:5000/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const result = await response.json();

            if (result.status === 'success') {
                this.displayPredictionComparison(container, station.data, result.predictions);
            } else {
                throw new Error(result.message || 'Prediction Failed');
            }

        } catch (error) {
            console.error('AI Prediction Error:', error);
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 15px; background: #fff5f5; border-radius: 8px; color: #c0392b;">
                        <div style="font-weight: bold; margin-bottom: 5px;">⚠️ AI Service Temporarily Unavailable</div>
                        <div style="font-size: 0.85em; color: #e67e22;">
                            ${error.message.includes('fetch') ? 'Please ensure Flask server is running at http://127.0.0.1:5000' : error.message}
                        </div>
                    </div>
                `;
            }
        }
    }

    displayPredictionComparison(container, currentData, predictions) {
        const pm25Diff = predictions.PM2_5 - currentData.PM2_5;
        const o3Diff = predictions.O3 - currentData.O3;

        const createTrendCard = (type, current, predicted, diff, modelName) => {
            const isWorse = diff > 0;
            // For pollutants, increase (positive diff) is BAD (worse)
            const colorClass = isWorse ? 'trend-worse' : 'trend-better';
            
            // Icons
            const icon = isWorse ? '📈' : '📉';
            const statusText = isWorse ? 'Rising' : 'Falling';
            const footerIcon = isWorse ? '⚠️' : '✅';
            const footerText = isWorse 
                ? `Expect increase of ${Math.abs(diff).toFixed(1)} μg/m³` 
                : `Expect decrease of ${Math.abs(diff).toFixed(1)} μg/m³`;

            return `
                <div class="trend-card ${colorClass}">
                    <!-- Header -->
                    <div class="card-header">
                        <div class="pollutant-tag">
                            <span>${type}</span>
                        </div>
                        <div class="model-badge">Model: ${modelName}</div>
                    </div>
                    
                    <!-- Body -->
                    <div class="card-body">
                        <!-- Left: Current -->
                        <div class="data-current">
                            <span class="label-small">Current</span>
                            <div class="value-current">${current.toFixed(1)}</div>
                        </div>

                        <!-- Center: Visual Bar -->
                        <div class="trend-visual-container">
                            <div class="trend-bar-bg">
                                <div class="trend-bar-fill"></div>
                            </div>
                            <div class="trend-pill">
                                <span>${icon}</span>
                                <span>${statusText}</span>
                            </div>
                        </div>

                        <!-- Right: Forecast (Hero) -->
                        <div class="data-forecast">
                            <span class="label-small">24h Forecast</span>
                            <div class="value-forecast">
                                ${predicted.toFixed(1)}<span class="unit-small">μg/m³</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="card-footer">
                        <span>${footerIcon}</span>
                        <span>${footerText}</span>
                    </div>
                </div>
            `;
        };

        container.innerHTML = `
            <div class="prediction-grid">
                ${createTrendCard('PM2.5', currentData.PM2_5, predictions.PM2_5, pm25Diff, 'LSTM')}
                ${createTrendCard('O₃ (Ozone)', currentData.O3, predictions.O3, o3Diff, 'GRU')}
            </div>
            
            <div class="model-info-footer" style="text-align: right; font-size: 0.85em; color: #999; margin-top: 10px;">
                <span>⏱️ Forecast Generated: ${predictions.timestamp.split(' ')[1]}</span>
            </div>
        `;
    }

    clearWAQIWidget() {
        const container = document.getElementById('waqi-widget-container');
        if (!container) return;
        container.innerHTML = '<div class="waqi-placeholder">👆 Please select a station to view AI predictions</div>';
        this.currentWAQIStation = null;
    }

    async loadWAQIData() {
        try {
            const waqiPromises = Object.entries(this.waqiStationMapping).map(async ([stationId, waqiUrl]) => {
                try {
                    const url = `https://api.waqi.info/feed/${waqiUrl}/?token=${this.waqiToken}`;
                    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
                    const data = await response.json();
                    if (data.status === 'ok' && data.data) {
                        return { stationId, data: data.data };
                    }
                } catch (e) {
                    console.warn(`WAQI Station ${stationId} load failed:`, e);
                }
                return null;
            });
            
            const results = await Promise.all(waqiPromises);
            results.forEach(result => {
                if (result) {
                    this.waqiData[result.stationId] = result.data;
                }
            });
        } catch (e) {
            console.error('WAQI batch load failed:', e);
            this.waqiData = {};
        }
    }

    useMockData() {
        console.warn('Using mock data');
        this.airQualityData = [
            {
                id: 'PO',
                name: 'Rua do Campo',
                nameEn: 'Calçada do Poço',
                data: { PM10: 45, PM2_5: 22, NO2: 28, CO: 0.6, O3: 85, SO2: 4 }
            },
            {
                id: 'TC',
                name: 'Taipa Central Park',
                nameEn: 'Parque Central da Taipa',
                data: { PM10: 52, PM2_5: 28, NO2: 32, CO: 0.7, O3: 92, SO2: 5 }
            }
        ];
        this.weatherData = {
            temperature: '25',
            humidity: '75',
            windSpeed: '12',
            windDirection: 'E'
        };
        this.displayMarkers();
        this.updateWeatherInfo();
    }

    async loadAirQualityData() {
        try {
            const apiUrl = 'https://www.smg.gov.mo/smg/airQuality/latestAirConcentration.json';
            const response = await fetch(apiUrl, { 
                mode: 'cors',
                signal: AbortSignal.timeout(10000) 
            });
            const data = await response.json();
            this.airQualityData = DataParser.parseAirQualityData(data);
            console.log('✅ Air quality data loaded successfully');
        } catch (error) {
            console.error('Air quality data load failed:', error);
            throw error;
        }
    }

    async loadWeatherData() {
        try {
            console.log('🔄 Attempting to load weather data...');
            const response = await fetch('http://127.0.0.1:5000/weather', {
                signal: AbortSignal.timeout(8000)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success' && result.data) {
                    this.weatherData = result.data;
                    console.log('✅ Weather data loaded successfully (via Flask):', this.weatherData);
                    this.updateWeatherInfo();
                    return;
                }
            }
            throw new Error('Backend weather API returned error');
        } catch (error) {
            console.error('❌ Weather data load failed, using defaults:', error);
            this.weatherData = {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: 'E'
            };
            this.updateWeatherInfo();
        }
    }

    // ⭐ New Helper Method: Determine text color based on background
    getContrastTextColor(hexColor) {
        if (!hexColor) return '#ffffff';
        const color = hexColor.toLowerCase();
        
        // Colors that require BLACK text for readability:
        // #ffff00 = WAQI Moderate Yellow
        // #ffc107 = Local Moderate Amber
        // #00e400 = WAQI Good (Bright Green)
        const lightBackgrounds = ['#ffff00', '#ffc107', '#00e400', '#7fff00'];
        
        return lightBackgrounds.includes(color) ? '#000000' : '#ffffff';
    }

    displayMarkers() {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];
        if (!this.airQualityData) return;

        this.airQualityData.forEach(station => {
            const coords = this.stationCoordinates[station.id];
            if (!coords) return;

            let markerColor, displayValue;
            if (this.waqiData[station.id]?.aqi) {
                const aqi = this.waqiData[station.id].aqi;
                markerColor = this.getWAQIMarkerColor(aqi);
                displayValue = aqi;
            } else {
                const aqiLevel = DataParser.getAQILevel(station.data.PM2_5, station.data.PM10);
                markerColor = this.getMarkerColor(aqiLevel);
                displayValue = station.id;
            }

            // ⭐ Determine Text Color (Black for Yellow/Bright Green, White for others)
            const textColor = this.getContrastTextColor(markerColor);

            const icon = L.divIcon({
                className: 'custom-marker',
                // ⭐ Applied textColor here
                html: `<div style="background-color: ${markerColor}; width: 35px; height: 35px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: ${textColor}; font-weight: bold; font-size: 12px;">${displayValue}</div>`,
                iconSize: [35, 35],
                iconAnchor: [17.5, 17.5]
            });

            const marker = L.marker(coords, { icon })
                .addTo(this.map)
                .bindPopup(this.createPopupContent(station))
                .on('click', () => this.showStationDetails(station));

            this.markers.push(marker);
        });
    }

    createPopupContent(station) {
        return `
            <div class="popup-content">
                <div class="popup-title">${station.nameEn}</div>
                <div class="popup-data">
                    <div>PM2.5: ${DataParser.formatPollutantValue(station.data.PM2_5, 'PM2_5')} μg/m³</div>
                    <div>PM10: ${DataParser.formatPollutantValue(station.data.PM10, 'PM10')} μg/m³</div>
                    <div>O₃: ${DataParser.formatPollutantValue(station.data.O3, 'O3')} μg/m³</div>
                </div>
            </div>
        `;
    }

    showStationDetails(station) {
        const detailsDiv = document.getElementById('station-details');
        const aqiLevel = DataParser.getAQILevel(station.data.PM2_5, station.data.PM10);
        const waqiInfo = this.waqiData[station.id];
        
        if (this.waqiStationMapping[station.id]) {
            const selector = document.getElementById('waqi-station-selector');
            if (selector) {
                selector.value = station.id;
                this.loadWAQIWidget(station.id);
            }
        }
        
        let pollutantHTML = '';
        for (const [key, value] of Object.entries(station.data)) {
            pollutantHTML += `
                <div class="pollutant-item">
                    <div class="pollutant-name">${DataParser.getPollutantName(key)}</div>
                    <div class="pollutant-value">
                        ${DataParser.formatPollutantValue(value, key)}
                        <span class="pollutant-unit">${DataParser.getPollutantUnit(key)}</span>
                    </div>
                </div>
            `;
        }

        let waqiHTML = '';
        if (waqiInfo && waqiInfo.aqi) {
            const level = DataParser.getWAQILevel(waqiInfo.aqi);
            // ⭐ Using high contrast colors for the side panel
            waqiHTML = `
                <div class="waqi-section" style="margin-top: 20px; padding: 15px; background: ${level.bgColor}; border-radius: 12px; border-left: 4px solid ${level.color};">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-weight: bold; color: #555;">WAQI Real-time Index</span>
                        <span style="font-size: 1.5em; font-weight: bold; color: ${level.textColor};">${waqiInfo.aqi}</span>
                    </div>
                    <div style="text-align: center; margin-top: 8px; color: ${level.textColor}; font-weight: 500; font-size: 0.9em;">${level.desc}</div>
                </div>
            `;
        }

        detailsDiv.innerHTML = `
            <div class="station-header">
                <div class="station-name">${station.nameEn}</div>
                <div class="station-type">${station.namePt}</div>
            </div>
            
            <div class="pollutant-grid">
                ${pollutantHTML}
            </div>
            
            <div class="aqi-indicator aqi-${aqiLevel}">
                Air Quality: ${DataParser.getAQIDescription(aqiLevel)}
            </div>
            
            ${waqiHTML}
        `;

        detailsDiv.classList.add('active');
        const hintDiv = document.querySelector('.hint');
        if (hintDiv) hintDiv.style.display = 'none';
    }

    updateWeatherInfo() {
        if (!this.weatherData) return;
        const tempElement = document.getElementById('temperature');
        const humidityElement = document.getElementById('humidity');
        const windElement = document.getElementById('wind');
        
        if (tempElement) tempElement.textContent = `${this.weatherData.temperature}°C`;
        if (humidityElement) humidityElement.textContent = `Humidity: ${this.weatherData.humidity}%`;
        if (windElement) windElement.textContent = `Wind Speed: ${this.weatherData.windSpeed} km/h (${this.weatherData.windDirection})`;
    }

    getMarkerColor(level) {
        const colors = {
            good: '#28a745',       // Dark Green (White text OK)
            moderate: '#ffc107',   // Amber (Needs BLACK text)
            unhealthy: '#dc3545'   // Red (White text OK)
        };
        return colors[level] || '#6c757d';
    }

    getWAQIMarkerColor(aqi) {
        if (aqi <= 50) return '#00e400'; // Bright Green (Needs BLACK text)
        if (aqi <= 100) return '#ffff00'; // Yellow (Needs BLACK text)
        if (aqi <= 150) return '#ff7e00'; // Orange
        if (aqi <= 200) return '#ff0000'; // Red
        if (aqi <= 300) return '#8f3f97'; // Purple
        return '#7e0023'; // Maroon
    }

    startAutoRefresh() {
        setInterval(() => {
            console.log('Auto refreshing data...');
            this.loadData();
        }, 5 * 60 * 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new AirQualityApp();
    app.init();
});