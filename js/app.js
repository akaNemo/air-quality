// Main Application Class
class AirQualityApp {
    constructor() {
        this.map = null;
        this.markers = [];
        this.chartInstance = null;
        
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
            // 并行加载所有数据
            await Promise.all([
                this.loadAirQualityData(),
                this.loadWeatherData(),
                this.loadWAQIData()
            ]);
            this.displayMarkers();
            // 确保天气在数据加载后更新
            this.updateWeatherInfo();
        } catch (error) {
            console.error('Data load failed:', error);
            this.useMockData();
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            console.log('Auto refreshing data...');
            this.loadData();
        }, 5 * 60 * 1000);
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

            const textColor = this.getContrastTextColor(markerColor);

            const icon = L.divIcon({
                className: 'custom-marker',
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
                <div class="station-type">${station.namePt || ''}</div>
            </div>
            <div class="pollutant-grid">${pollutantHTML}</div>
            <div class="aqi-indicator aqi-${aqiLevel}">
                Air Quality: ${DataParser.getAQIDescription(aqiLevel)}
            </div>
            ${waqiHTML}
        `;
    }

    initWAQIWidget() {
        const selector = document.getElementById('waqi-station-selector');
        if (!selector) return;
        
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
            if (stationId) this.loadWAQIWidget(stationId);
            else this.clearWAQIWidget();
        });
    }

    async loadWAQIWidget(stationId) {
        const container = document.getElementById('waqi-widget-container');
        const stationName = this.waqiStationNames[stationId] || 'Station';
        
        container.innerHTML = `
            <div class="waqi-widget-content">
                <div class="widget-station-info">
                    <span class="widget-station-name">${stationName}</span>
                    <span class="widget-update-hint">AI Trend Analysis</span>
                </div>
                <div id="ai-prediction-dashboard">
                    <div class="ai-loading-state" style="text-align:center; padding: 40px;">
                        <div class="loading-spinner"></div>
                        <p style="color:#667eea; font-weight:600;">Fetching 7-Day History & Predicting...</p>
                    </div>
                </div>
            </div>
        `;
        
        const officialStation = this.airQualityData.find(s => s.id === stationId);
        if (officialStation) {
            this.renderAIPredictionComparison(officialStation);
        }
    }

    async renderAIPredictionComparison(station) {
        const container = document.getElementById('ai-prediction-dashboard');
        
        try {
            const response = await fetch('http://127.0.0.1:5000/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    stationId: station.id,
                    pm25: station.data.PM2_5,
                    o3: station.data.O3
                }),
                signal: AbortSignal.timeout(15000)
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayPredictionComparison(container, station.data, result.predictions);
                
                const chartContainer = document.createElement('div');
                chartContainer.style.marginTop = '30px';
                chartContainer.style.height = '300px'; 
                chartContainer.innerHTML = `
                    <div style="text-align:center; font-size:0.8em; color:#666; margin-bottom:10px;">7-Day Historical Trend & 24h Prediction</div>
                    <canvas id="trendChart"></canvas>
                `;
                container.appendChild(chartContainer);

                requestAnimationFrame(() => {
                    this.renderTrendChart(result.history, result.predictions);
                });

            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('AI Prediction Error:', error);
            container.innerHTML = `<div class="waqi-error"><p>⚠️ Service Unavailable: ${error.message}</p></div>`;
        }
    }

    displayPredictionComparison(container, currentData, predictions) {
        const pm25Diff = predictions.PM2_5 - currentData.PM2_5;
        const o3Diff = predictions.O3 - currentData.O3;

        const createTrendCard = (type, current, predicted, diff, modelName) => {
            const isWorse = diff > 0;
            const colorClass = isWorse ? 'trend-worse' : 'trend-better';
            const icon = isWorse ? '📈' : '📉';
            const statusText = isWorse ? 'Rising' : 'Falling';
            const footerIcon = isWorse ? '⚠️' : '✅';
            const footerText = isWorse 
                ? `Expect increase of ${Math.abs(diff).toFixed(1)} μg/m³` 
                : `Expect decrease of ${Math.abs(diff).toFixed(1)} μg/m³`;

            return `
                <div class="trend-card ${colorClass}">
                    <div class="card-header">
                        <div class="pollutant-tag"><span>${type}</span></div>
                        <div class="model-badge">Model: ${modelName}</div>
                    </div>
                    <div class="card-body">
                        <div class="data-current">
                            <span class="label-small">Current</span>
                            <div class="value-current">${current.toFixed(1)}</div>
                        </div>
                        <div class="trend-visual-container">
                            <div class="trend-bar-bg"><div class="trend-bar-fill"></div></div>
                            <div class="trend-pill"><span>${icon}</span><span>${statusText}</span></div>
                        </div>
                        <div class="data-forecast">
                            <span class="label-small">24h Forecast</span>
                            <div class="value-forecast">${predicted.toFixed(1)}<span class="unit-small">μg/m³</span></div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <span>${footerIcon}</span><span>${footerText}</span>
                    </div>
                </div>
            `;
        };

        container.innerHTML = `
            <div class="prediction-grid">
                ${createTrendCard('PM2.5', currentData.PM2_5, predictions.PM2_5, pm25Diff, 'LSTM')}
                ${createTrendCard('O₃ (Ozone)', currentData.O3, predictions.O3, o3Diff, 'GRU')}
            </div>
        `;
    }

    // --- 修复后的 Chart.js 绘图逻辑 ---
    renderTrendChart(history, predictions) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;
        
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        // 1. 计算明天的日期 (替换 "Tomorrow")
        const lastDateStr = history.dates[history.dates.length - 1]; // e.g., "01-26"
        let nextDayLabel = "Tomorrow";
        
        // 简单的日期递增逻辑
        try {
            const currentYear = new Date().getFullYear();
            const [month, day] = lastDateStr.split('-').map(Number);
            const dateObj = new Date(currentYear, month - 1, day);
            dateObj.setDate(dateObj.getDate() + 1);
            nextDayLabel = `${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        } catch (e) {
            console.warn("Date parsing failed, using Tomorrow");
        }

        const labels = [...history.dates, nextDayLabel];
        
        // 构造数据
        const pmHistory = history.pm25;
        const pmForecast = [...new Array(pmHistory.length - 1).fill(null), pmHistory[pmHistory.length - 1], predictions.PM2_5];
        
        const o3History = history.o3;
        const o3Forecast = [...new Array(o3History.length - 1).fill(null), o3History[o3History.length - 1], predictions.O3];

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'PM2.5 (Real History)',
                        data: pmHistory,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3
                    },
                    {
                        label: 'PM2.5 (AI Forecast)',
                        data: pmForecast,
                        borderColor: '#667eea',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 4,
                        pointStyle: 'rectRot'
                    },
                    {
                        label: 'Ozone (Real History)',
                        data: o3History,
                        borderColor: '#764ba2',
                        backgroundColor: 'rgba(118, 75, 162, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3
                    },
                    {
                        label: 'Ozone (AI Forecast)',
                        data: o3Forecast,
                        borderColor: '#764ba2',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 4,
                        pointStyle: 'rectRot'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        // 2. 关键修复：过滤 Tooltip，防止在连接点重复显示预测值
                        filter: function(tooltipItem) {
                            // 如果是预测数据集
                            if (tooltipItem.dataset.label.includes('Forecast')) {
                                // 只有当它是最后一个点（真正的预测点）时才显示
                                // 如果它是用来连接历史数据的那个点（倒数第二个点），则隐藏
                                const dataLength = tooltipItem.chart.data.labels.length;
                                return tooltipItem.dataIndex === dataLength - 1;
                            }
                            return true;
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Concentration (μg/m³)' } }
                }
            }
        });
    }

    clearWAQIWidget() {
        const container = document.getElementById('waqi-widget-container');
        if (container) container.innerHTML = '<div class="waqi-placeholder">👆 Please select a station to view AI predictions</div>';
    }

    createPopupContent(station) {
        return `
            <div class="popup-content">
                <div class="popup-title">${station.nameEn}</div>
                <div class="popup-data">
                    <div>PM2.5: ${DataParser.formatPollutantValue(station.data.PM2_5, 'PM2_5')}</div>
                    <div>PM10: ${DataParser.formatPollutantValue(station.data.PM10, 'PM10')}</div>
                    <div>O₃: ${DataParser.formatPollutantValue(station.data.O3, 'O3')}</div>
                </div>
            </div>
        `;
    }

    getContrastTextColor(hexColor) {
        if (!hexColor) return '#ffffff';
        const lightBackgrounds = ['#ffff00', '#ffc107', '#00e400', '#7fff00'];
        return lightBackgrounds.includes(hexColor.toLowerCase()) ? '#000000' : '#ffffff';
    }

    getMarkerColor(level) {
        return { good:'#28a745', moderate:'#ffc107', unhealthy:'#dc3545' }[level] || '#6c757d';
    }

    getWAQIMarkerColor(aqi) {
        if (aqi <= 50) return '#00e400';
        if (aqi <= 100) return '#ffff00';
        if (aqi <= 150) return '#ff7e00';
        if (aqi <= 200) return '#ff0000';
        if (aqi <= 300) return '#8f3f97';
        return '#7e0023';
    }

    async loadAirQualityData() {
        const response = await fetch('https://www.smg.gov.mo/smg/airQuality/latestAirConcentration.json');
        const data = await response.json();
        this.airQualityData = DataParser.parseAirQualityData(data);
    }

    // --- 修复后的天气加载逻辑 ---
    async loadWeatherData() {
        try {
            console.log("Fetching weather data...");
            const response = await fetch('http://127.0.0.1:5000/weather');
            if (response.ok) {
                const result = await response.json();
                console.log("Weather data received:", result);
                if (result.status === 'success') {
                    this.weatherData = result.data;
                    this.updateWeatherInfo(); // 确保这里被调用
                }
            } else {
                console.warn("Weather fetch returned non-200 status");
            }
        } catch (e) { 
            console.error('Weather load failed', e); 
        }
    }
    
    updateWeatherInfo() {
        if (!this.weatherData) return;
        
        // 确保 DOM 元素存在
        const tempEl = document.getElementById('temperature');
        const humEl = document.getElementById('humidity');
        const windEl = document.getElementById('wind');

        if (tempEl) tempEl.textContent = `${this.weatherData.temperature}°C`;
        if (humEl) humEl.textContent = `Humidity: ${this.weatherData.humidity}%`;
        if (windEl) windEl.textContent = `Wind Speed: ${this.weatherData.windSpeed} km/h (${this.weatherData.windDirection})`;
    }

    async loadWAQIData() {
        try {
            const promises = Object.entries(this.waqiStationMapping).map(async ([id, url]) => {
                try {
                    const res = await fetch(`https://api.waqi.info/feed/${url}/?token=${this.waqiToken}`);
                    const data = await res.json();
                    if(data.status === 'ok') this.waqiData[id] = data.data;
                } catch(e) {}
            });
            await Promise.all(promises);
        } catch(e) {}
    }
    
    useMockData() { console.warn("Using mock data"); }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new AirQualityApp();
    app.init();
});