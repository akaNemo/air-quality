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
        
        // ⭐ 定义后端 API 基础地址 (修改这里即可)
        this.apiBaseUrl = 'https://akanemo-macau-air-backend.hf.space';
    }

    async init() {
        this.initMap();
        this.startClock();
        await this.loadData();
        this.initWAQIWidget();
        this.startAutoRefresh();
    }

    initMap() {
        // ⭐ 修改：调整地图中心点到澳门几何中心 (22.165, 113.555)
        // 这样半岛在上方，路环在下方，整体居中
        const macauCenter = [22.165, 113.555];
        this.map = L.map('map').setView(macauCenter, 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 18
        }).addTo(this.map);

        const RecenterControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function (map) {
                const container = L.DomUtil.create('div', 'leaflet-control-recenter leaflet-bar leaflet-control');
                container.innerHTML = '🎯';
                container.title = "Recenter Map";
                container.onclick = function() {
                    map.setView(macauCenter, 12);
                }
                return container;
            }
        });
        this.map.addControl(new RecenterControl());
    }

    startClock() {
        const updateClock = () => {
            const dateTimeElement = document.getElementById('current-datetime');
            if (dateTimeElement) dateTimeElement.textContent = DataParser.getCurrentDateTime();
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
        }
    }

    startAutoRefresh() {
        setInterval(() => this.loadData(), 5 * 60 * 1000);
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
                        ${DataParser.formatPollutantValue(value)}
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
                        <p style="color:#667eea; font-weight:600;">Fetching 7-Day History & 48h Prediction...</p>
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
            // ⭐ 修改这里：连到 Render 云端
                const response = await fetch('https://akanemo-macau-air-backend.hf.space/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    stationId: station.id,
                    pm25: station.data.PM2_5,
                    o3: station.data.O3
                }),
                signal: AbortSignal.timeout(200000)
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayPredictionComparison(container, station.data, result.predictions);
                
                const chartWrapper = document.createElement('div');
                chartWrapper.className = 'chart-scroll-wrapper';
                
                const chartInner = document.createElement('div');
                chartInner.className = 'chart-min-width';
                chartInner.innerHTML = `<canvas id="trendChart"></canvas>`;
                
                chartWrapper.appendChild(chartInner);
                
                const title = document.createElement('div');
                title.style.textAlign = 'center';
                title.style.fontSize = '0.8em';
                title.style.color = '#666';
                title.style.marginTop = '30px';
                // ⭐ 修改标题：明确是历史日均值 + 今天的预测 + 明天的预测
                title.textContent = 'Past 7-Days Daily Avg & Future 48h Forecast'; 
                
                container.appendChild(title);
                container.appendChild(chartWrapper);

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

    // ⭐ 重点修改：语义修正
    // 24h Prediction -> Today's Daily Avg
    // 48h Prediction -> Tomorrow's Daily Avg
    displayPredictionComparison(container, currentData, predictions) {
        const createTrendCard = (type, labelHtml, current, pred24, pred48, modelName) => {
            const getDiffColor = (curr, pred) => pred > curr ? 'forecast-up' : 'forecast-down';
            
            return `
                <div class="trend-card">
                    <div class="card-header">
                        <div class="pollutant-tag">${labelHtml}</div>
                        <div class="model-badge">Model: ${modelName}</div>
                    </div>
                    <div class="card-body">
                        <!-- Current (Real-time) -->
                        <div class="data-block">
                            <span class="label-small">Current <br>(Real-time)</span>
                            <div class="value-large">${current.toFixed(1)}</div>
                        </div>
                        
                        <div class="divider"></div>

                        <!-- Today (Forecast Daily Avg) -->
                        <div class="data-block">
                            <span class="label-small">Today <br>(Forecast Avg)</span>
                            <div class="value-forecast ${getDiffColor(current, pred24)}">
                                ${pred24.toFixed(1)}<span class="unit-small">μg/m³</span>
                            </div>
                        </div>

                        <div class="divider"></div>

                        <!-- Tomorrow (Forecast Daily Avg) -->
                        <div class="data-block">
                            <span class="label-small">Tomorrow <br>(Forecast Avg)</span>
                            <div class="value-forecast ${getDiffColor(pred24, pred48)}">
                                ${pred48.toFixed(1)}<span class="unit-small">μg/m³</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        };

        container.innerHTML = `
            <div class="prediction-grid">
                ${createTrendCard('PM2.5', 'PM<sub>2.5</sub>', currentData.PM2_5, predictions.PM2_5_24h, predictions.PM2_5_48h, 'LSTM')}
                ${createTrendCard('O3', 'O<sub>3</sub> (Ozone)', currentData.O3, predictions.O3_24h, predictions.O3_48h, 'GRU')}
            </div>
        `;
    }

    // ⭐ 重点修改：图表日期逻辑修正
    renderTrendChart(history, predictions) {
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;
        
        if (this.chartInstance) this.chartInstance.destroy();

        // 1. 计算日期
        // 历史数据截止到昨天 (Yesterday)
        // 预测数据第一个点是 今天 (Today)
        // 预测数据第二个点是 明天 (Tomorrow)
        
        let dateToday = "Today";
        let dateTomorrow = "Tomorrow";
        
        try {
            const now = new Date();
            dateToday = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} (Today)`;
            
            const tmr = new Date(now);
            tmr.setDate(tmr.getDate() + 1);
            dateTomorrow = `${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')} (Tmr)`;
        } catch (e) { console.warn("Date parsing failed"); }

        // 历史日期 + 今天 + 明天
        const labels = [...history.dates, dateToday, dateTomorrow];
        
        // 2. 构造数据
        const pmHistory = history.pm25;
        // 预测线：连接 历史最后一点 -> 今天预测值 -> 明天预测值
        const pmForecast = [...new Array(pmHistory.length - 1).fill(null), pmHistory[pmHistory.length - 1], predictions.PM2_5_24h, predictions.PM2_5_48h];
        
        const o3History = history.o3;
        const o3Forecast = [...new Array(o3History.length - 1).fill(null), o3History[o3History.length - 1], predictions.O3_24h, predictions.O3_48h];

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'PM2.5 (History Daily Avg)',
                        data: pmHistory,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3
                    },
                    {
                        label: 'PM2.5 (Forecast Daily Avg)',
                        data: pmForecast,
                        borderColor: '#667eea',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 4,
                        pointStyle: 'rectRot'
                    },
                    {
                        label: 'Ozone (History Daily Avg)',
                        data: o3History,
                        borderColor: '#764ba2',
                        backgroundColor: 'rgba(118, 75, 162, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3
                    },
                    {
                        label: 'Ozone (Forecast Daily Avg)',
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
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        filter: function(tooltipItem) {
                            // 过滤：预测线只显示最后两个点（今天和明天）
                            if (tooltipItem.dataset.label.includes('Forecast')) {
                                const dataLength = tooltipItem.chart.data.labels.length;
                                return tooltipItem.dataIndex >= dataLength - 2;
                            }
                            return true;
                        },
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += context.parsed.y + ' μg/m³';
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Daily Average (μg/m³)' } }
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
                    <div>PM<sub>2.5</sub>: ${DataParser.formatPollutantValue(station.data.PM2_5)}</div>
                    <div>PM<sub>10</sub>: ${DataParser.formatPollutantValue(station.data.PM10)}</div>
                    <div>O<sub>3</sub>: ${DataParser.formatPollutantValue(station.data.O3)}</div>
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

    async loadWeatherData() {
        try {
            // ⭐ 修改这里：连到 Render 云端
            const response = await fetch(`${this.apiBaseUrl}/weather`);
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success') {
                    this.weatherData = result.data;
                    this.updateWeatherInfo();
                }
            }
        } catch (e) { console.error('Weather load failed', e); }
    }
    
    updateWeatherInfo() {
        if (!this.weatherData) return;
        
        const tempEl = document.getElementById('temperature');
        const humEl = document.getElementById('humidity');
        const windEl = document.getElementById('wind-speed');
        const windDirEl = document.getElementById('wind-direction');

        if (tempEl) tempEl.textContent = `${this.weatherData.temperature}°C`;
        if (humEl) humEl.textContent = `Humidity: ${this.weatherData.humidity}%`;
        if (windEl) windEl.textContent = `Wind Speed: ${this.weatherData.windSpeed} km/h`;
        if (windDirEl) windDirEl.textContent = `Direction: ${this.weatherData.windDirection}`;
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
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new AirQualityApp();
    app.init();
});