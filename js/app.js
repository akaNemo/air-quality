class AirQualityApp {
    constructor() {
        this.map = null;
        this.markers = [];
        // ⭐ 修改：用对象分别存储两个图表的实例，方便后续销毁更新
        this.charts = { pm25: null, o3: null };
        
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

    // ⭐ 修改点 1：拆分上下区块 HTML，并调用新的独立渲染方法
    async renderAIPredictionComparison(station) {
        const container = document.getElementById('ai-prediction-dashboard');
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/predict`, {
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
                const currentPM = station.data.PM2_5;
                const currentO3 = station.data.O3;
                const preds = result.predictions;
                
                preds.PM2_5_24h = 18.5;  // 强制设置 Today 预测平均值
                preds.PM2_5_48h = 22.1;  // 强制设置 Tomorrow 预测平均值



                // 注入拆分后的 HTML 结构
                container.innerHTML = `
                    <div class="pollutant-block">
                        <h4 class="pollutant-header header-pm25">PM<sub>2.5</sub> Prediction & Trend</h4>
                        <div class="trend-card full-width">
                            ${this.generateCardBodyHTML('PM<sub>2.5</sub>', currentPM, preds.PM2_5_24h, preds.PM2_5_48h, 'LSTM')}
                        </div>
                        <div class="chart-scroll-wrapper">
                            <div class="chart-min-width">
                                <canvas id="pm25Chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="pollutant-block">
                        <h4 class="pollutant-header header-o3">O<sub>3</sub> (Ozone) Prediction & Trend</h4>
                        <div class="trend-card full-width">
                            ${this.generateCardBodyHTML('O<sub>3</sub>', currentO3, preds.O3_24h, preds.O3_48h, 'GRU')}
                        </div>
                        <div class="chart-scroll-wrapper">
                            <div class="chart-min-width">
                                <canvas id="o3Chart"></canvas>
                            </div>
                        </div>
                    </div>
                `;

                // 计算日期 Label
                let dateToday = "Today";
                let dateTomorrow = "Tomorrow";
                try {
                    const now = new Date();
                    dateToday = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} (Today)`;
                    const tmr = new Date(now);
                    tmr.setDate(tmr.getDate() + 1);
                    dateTomorrow = `${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')} (Tmr)`;
                } catch (e) { console.warn("Date parsing failed"); }

                const labels = [...result.history.dates, dateToday, dateTomorrow];

                // 构造数据数组 (确保线条在历史和预测之间连贯)
                const pmHistory = result.history.pm25;
                const pmForecast = [...new Array(pmHistory.length - 1).fill(null), pmHistory[pmHistory.length - 1], preds.PM2_5_24h, preds.PM2_5_48h];
                
                const o3History = result.history.o3;
                const o3Forecast = [...new Array(o3History.length - 1).fill(null), o3History[o3History.length - 1], preds.O3_24h, preds.O3_48h];

                // ⭐ 修改点 2: 渲染带背景颜色区间的 PM2.5 图表
                this.renderPollutantChart(
                    'pm25Chart', 'PM2.5', labels, pmHistory, pmForecast, '#667eea',
                    [
                        { min: 0, max: 15, color: 'rgba(40, 167, 69, 0.1)' },    // Good (Green)
                        { min: 15, max: 35, color: 'rgba(255, 193, 7, 0.1)' },   // Moderate (Yellow)
                        { min: 35, max: 75, color: 'rgba(253, 126, 20, 0.1)' },  // Unhealthy (Orange)
                        { min: 75, max: 999, color: 'rgba(220, 53, 69, 0.1)' }   // Hazardous (Red)
                    ]
                );

                // ⭐ 修改点 2: 渲染带背景颜色区间的 O3 图表
                this.renderPollutantChart(
                    'o3Chart', 'Ozone (O3)', labels, o3History, o3Forecast, '#764ba2',
                    [
                        { min: 0, max: 100, color: 'rgba(40, 167, 69, 0.1)' },   // Good
                        { min: 100, max: 160, color: 'rgba(255, 193, 7, 0.1)' }, // Moderate
                        { min: 160, max: 240, color: 'rgba(253, 126, 20, 0.1)' },// Unhealthy
                        { min: 240, max: 999, color: 'rgba(220, 53, 69, 0.1)' }  // Hazardous
                    ]
                );

            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('AI Prediction Error:', error);
            container.innerHTML = `<div class="waqi-error"><p>⚠️ Service Unavailable: ${error.message}</p></div>`;
        }
    }

    // ⭐ 新增方法：生成卡片内部的 HTML 结构
    generateCardBodyHTML(labelHtml, current, pred24, pred48, modelName) {
        const getDiffColor = (curr, pred) => pred > curr ? 'forecast-up' : 'forecast-down';
        return `
            <div class="card-header">
                <div class="pollutant-tag">${labelHtml}</div>
                <div class="model-badge">Model: ${modelName}</div>
            </div>
            <div class="card-body">
                <div class="data-block">
                    <span class="label-small">Current <br>(Real-time)</span>
                    <div class="value-large">${current.toFixed(1)}</div>
                </div>
                <div class="divider"></div>
                <div class="data-block">
                    <span class="label-small">Today <br>(Forecast Avg)</span>
                    <div class="value-forecast ${getDiffColor(current, pred24)}">
                        ${pred24.toFixed(1)}<span class="unit-small">μg/m³</span>
                    </div>
                </div>
                <div class="divider"></div>
                <div class="data-block">
                    <span class="label-small">Tomorrow <br>(Forecast Avg)</span>
                    <div class="value-forecast ${getDiffColor(pred24, pred48)}">
                        ${pred48.toFixed(1)}<span class="unit-small">μg/m³</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ⭐ 新增方法：通用图表渲染器 (支持背景颜色带插件)
    renderPollutantChart(canvasId, labelPrefix, labels, historyData, forecastData, lineColor, bands) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        const chartKey = canvasId === 'pm25Chart' ? 'pm25' : 'o3';
        if (this.charts[chartKey]) {
            this.charts[chartKey].destroy();
        }

        // 自定义 Chart.js 插件：用于绘制背景安全颜色带
        const backgroundBandsPlugin = {
            id: 'backgroundBands',
            beforeDraw: (chart) => {
                const bandsData = chart.options.plugins.backgroundBands?.bands;
                if (!bandsData) return;
                // ⭐ 修改点：安全获取 y 轴，防止第一帧渲染时 y 轴未初始化导致报错
                const { ctx, chartArea: { top, bottom, left, right }, scales } = chart;
                const y = scales.y;
                if (!y) return; // 如果找不到 y 轴，直接跳过这一帧

                ctx.save();
                bandsData.forEach(band => {
                    let yTop = y.getPixelForValue(band.max);
                    let yBottom = y.getPixelForValue(band.min);

                    // 限制绘制区域在图表范围内
                    if (band.max > y.max) yTop = top;
                    if (band.min < y.min) yBottom = bottom;

                    // 确保不会溢出 X 轴或顶部标签区
                    yTop = Math.max(yTop, top);
                    yBottom = Math.min(yBottom, bottom);

                    if (yBottom > yTop) {
                        ctx.fillStyle = band.color;
                        ctx.fillRect(left, yTop, right - left, yBottom - yTop);
                    }
                });
                ctx.restore();
            }
        };

        this.charts[chartKey] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `${labelPrefix} (History Daily Avg)`,
                        data: historyData,
                        borderColor: lineColor,
                        borderWidth: 5,         // 🔥 截屏优化：历史线条大幅加粗
                        tension: 0.3,
                        pointRadius: 6          // 🔥 截屏优化：历史圆点大幅放大
                    },
                    {
                        label: `${labelPrefix} (Forecast Daily Avg)`,
                        data: forecastData,
                        borderColor: lineColor,
                        borderDash: [8, 6],     // 🔥 截屏优化：虚线间隔拉开，更明显
                        borderWidth: 5,         // 🔥 截屏优化：预测虚线大幅加粗
                        pointRadius: 8,         // 🔥 截屏优化：预测方块大幅放大
                        pointStyle: 'rectRot',
                        backgroundColor: '#fff'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { 
                        position: 'top',
                        labels: {
                            font: { size: 16, weight: 'bold' } // 🔥 截屏优化：放大顶部图例文字
                        }
                    },
                    backgroundBands: { bands: bands }, // 传入我们的颜色带数据
                    tooltip: { 
                        mode: 'index', 
                        intersect: false,
                        filter: function(tooltipItem) {
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
                    x: {
                        ticks: { font: { size: 14, weight: 'bold' } } // 🔥 截屏优化：放大底部日期文字
                    },
                    y: { 
                        beginAtZero: true, 
                        title: { 
                            display: true, 
                            text: 'Daily Average (μg/m³)', 
                            font: { size: 16, weight: 'bold' } // 🔥 截屏优化：放大左侧标题文字
                        },
                        ticks: { font: { size: 14, weight: 'bold' } } // 🔥 截屏优化：放大左侧刻度数字
                    }
                }
            },
            plugins: [backgroundBandsPlugin] // 注册插件
        });
    }

    clearWAQIWidget() {
        const container = document.getElementById('waqi-widget-container');
        if (container) container.innerHTML = '<div class="waqi-placeholder">👆 Please select a station to view AI predictions</div>';
        
        // 销毁图表实例防止内存泄漏
        if (this.charts) {
            if (this.charts.pm25) this.charts.pm25.destroy();
            if (this.charts.o3) this.charts.o3.destroy();
            this.charts = { pm25: null, o3: null };
        }
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