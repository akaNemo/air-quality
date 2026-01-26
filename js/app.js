// 主应用类
class AirQualityApp {
    constructor() {
        this.map = null;
        this.markers = [];
        
        // 使用WAQI的实际坐标
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
            'PO': '水坑尾區 (水井斜巷)',
            'KH': '九澳區',
            'EN': '北區 (澳北電站)',
            'TC': '氹仔區 (氹仔中央公園站)',
            'TG': '氹仔大潭山 (氣象局總站)',
            'CD': '路環一般性'
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
            console.error('数据加载失败:', error);
            this.useMockData();
        }
    }

    initWAQIWidget() {
        const selector = document.getElementById('waqi-station-selector');
        // ⭐ 修复：如果找不到元素，直接返回，防止报错中断代码
        if (!selector) {
            console.warn('未找到 waqi-station-selector 元素，跳过初始化 Widget');
            return;
        }
        
        if (this.airQualityData) {
            this.airQualityData.forEach(station => {
                if (this.waqiStationMapping[station.id]) {
                    const option = document.createElement('option');
                    option.value = station.id;
                    option.textContent = `${station.name} - ${this.waqiStationNames[station.id] || ''}`;
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
        
        const stationName = this.waqiStationNames[stationId] || '监测站';
        
        container.innerHTML = `
            <div class="waqi-loading">
                <div class="loading-spinner"></div>
                <p>正在加载历史数据...</p>
            </div>
        `;
        
        try {
            const waqiData = this.waqiData[stationId];
            
            if (!waqiData) {
                throw new Error('WAQI 数据未加载');
            }
            
            this.renderWAQICharts(container, waqiData, stationName, stationId);
            
        } catch (error) {
            console.error('加载WAQI数据失败:', error);
            container.innerHTML = `
                <div class="waqi-error">
                    <p>❌ 图表加载失败</p>
                    <p style="font-size: 0.85em; color: #999;">${error.message}</p>
                </div>
            `;
        }
    }

    renderWAQICharts(container, waqiData, stationName, stationId) {
        const officialStation = this.airQualityData.find(s => s.id === stationId);
        const officialData = officialStation ? officialStation.data : null;

        let currentValuesHTML = '';
        if (officialData) {
            currentValuesHTML = `
                <div class="current-values">
                    <div class="value-item">
                        <span>PM2.5</span>
                        <strong>${DataParser.formatPollutantValue(officialData.PM2_5, 'PM2_5')}</strong>
                        <small>μg/m³</small>
                        <div style="font-size: 0.7em; color: #999; margin-top: 3px;">官方实时</div>
                    </div>
                    <div class="value-item">
                        <span>PM10</span>
                        <strong>${DataParser.formatPollutantValue(officialData.PM10, 'PM10')}</strong>
                        <small>μg/m³</small>
                        <div style="font-size: 0.7em; color: #999; margin-top: 3px;">官方实时</div>
                    </div>
                    <div class="value-item">
                        <span>O₃</span>
                        <strong>${DataParser.formatPollutantValue(officialData.O3, 'O3')}</strong>
                        <small>μg/m³</small>
                        <div style="font-size: 0.7em; color: #999; margin-top: 3px;">官方实时</div>
                    </div>
                </div>
            `;
        } else {
            currentValuesHTML = '<div class="waqi-error"><p>暂无实时数据</p></div>';
        }

        container.innerHTML = `
            <div class="waqi-widget-content">
                <div class="widget-station-info">
                    <span class="widget-station-name">${stationName}</span>
                    <span class="widget-update-hint">数据来源: 澳门环保局实时监测</span>
                </div>
                <div class="waqi-info">
                    <h4 style="margin: 0 0 15px 0; color: #667eea;">📊 当前实时数值</h4>
                    ${currentValuesHTML}
                </div>
                
                <div id="ai-prediction-chart-container" style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 12px;">
                    <h4 style="margin: 0 0 15px 0; color: #667eea; text-align: center;">
                        🤖 AI 智能预测 vs 当前数值
                    </h4>
                    <div id="ai-prediction-comparison">
                        <div style="text-align: center; padding: 20px; color: #999;">
                            正在加载 AI 预测数据...
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (officialStation) {
            this.renderAIPredictionComparison(officialStation);
        }
    }

    async renderAIPredictionComparison(station) {
        const container = document.getElementById('ai-prediction-comparison');
        if (!container) return;

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
                throw new Error(`服务器错误: ${response.status}`);
            }

            const result = await response.json();

            if (result.status === 'success') {
                this.displayPredictionComparison(container, station.data, result.predictions);
            } else {
                throw new Error(result.message || '预测失败');
            }

        } catch (error) {
            console.error('AI预测出错:', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 15px; background: #fff5f5; border-radius: 8px; color: #c0392b;">
                    <div style="font-weight: bold; margin-bottom: 5px;">⚠️ AI 服务暂时不可用</div>
                    <div style="font-size: 0.85em; color: #e67e22;">
                        ${error.message.includes('fetch') ? '请确认 Flask 服务器运行在 http://127.0.0.1:5000' : error.message}
                    </div>
                </div>
            `;
        }
    }

    displayPredictionComparison(container, currentData, predictions) {
        const pm25Change = predictions.PM2_5 - currentData.PM2_5;
        const o3Change = predictions.O3 - currentData.O3;

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div style="background: white; padding: 15px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <div style="text-align: center; color: #666; font-size: 0.9em; margin-bottom: 10px;">PM2.5</div>
                    <div style="display: flex; justify-content: space-around; align-items: center;">
                        <div style="text-align: center;">
                            <div style="font-size: 0.75em; color: #999;">当前</div>
                            <div style="font-size: 1.8em; font-weight: bold; color: #3498db;">
                                ${currentData.PM2_5.toFixed(1)}
                            </div>
                        </div>
                        <div style="font-size: 1.5em; color: #ccc;">→</div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.75em; color: #999;">预测24h</div>
                            <div style="font-size: 1.8em; font-weight: bold; color: ${pm25Change > 0 ? '#e74c3c' : '#27ae60'};">
                                ${predictions.PM2_5.toFixed(1)}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 8px; font-size: 0.8em; color: ${pm25Change > 0 ? '#e74c3c' : '#27ae60'};">
                        ${pm25Change > 0 ? '↑' : '↓'} ${Math.abs(pm25Change).toFixed(1)} μg/m³
                    </div>
                </div>

                <div style="background: white; padding: 15px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <div style="text-align: center; color: #666; font-size: 0.9em; margin-bottom: 10px;">O₃</div>
                    <div style="display: flex; justify-content: space-around; align-items: center;">
                        <div style="text-align: center;">
                            <div style="font-size: 0.75em; color: #999;">当前</div>
                            <div style="font-size: 1.8em; font-weight: bold; color: #3498db;">
                                ${currentData.O3.toFixed(1)}
                            </div>
                        </div>
                        <div style="font-size: 1.5em; color: #ccc;">→</div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.75em; color: #999;">预测24h</div>
                            <div style="font-size: 1.8em; font-weight: bold; color: ${o3Change > 0 ? '#f39c12' : '#27ae60'};">
                                ${predictions.O3.toFixed(1)}
                            </div>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 8px; font-size: 0.8em; color: ${o3Change > 0 ? '#f39c12' : '#27ae60'};">
                        ${o3Change > 0 ? '↑' : '↓'} ${Math.abs(o3Change).toFixed(1)} μg/m³
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                <div style="font-size: 0.85em; color: #666;">
                    <span style="color: #667eea; font-weight: bold;">🧠 深度学习模型预测</span>
                    <span style="color: #999; margin-left: 10px;">基于 LSTM + GRU 神经网络</span>
                </div>
                <div style="font-size: 0.7em; color: #aaa; margin-top: 5px;">
                    预测时间: ${predictions.timestamp || new Date().toLocaleString('zh-CN')}
                </div>
            </div>
        `;
    }

    clearWAQIWidget() {
        const container = document.getElementById('waqi-widget-container');
        if (!container) return;
        container.innerHTML = '<div class="waqi-placeholder">👆 请选择一个监测站查看详细图表</div>';
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
                    console.warn(`WAQI 站点 ${stationId} 加载失败:`, e);
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
            console.error('WAQI批量加载失败:', e);
            this.waqiData = {};
        }
    }

    useMockData() {
        console.warn('使用模拟数据');
        this.airQualityData = [
            {
                id: 'PO',
                name: '水坑尾區',
                nameEn: 'Calçada do Poço',
                data: { PM10: 45, PM2_5: 22, NO2: 28, CO: 0.6, O3: 85, SO2: 4 }
            },
            {
                id: 'TC',
                name: '氹仔中央公園',
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
            console.log('✅ 空气质量数据加载成功');
        } catch (error) {
            console.error('空气质量数据加载失败:', error);
            throw error;
        }
    }

    async loadWeatherData() {
        try {
            console.log('🔄 尝试加载天气数据...');
            const response = await fetch('http://127.0.0.1:5000/weather', {
                signal: AbortSignal.timeout(8000)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success' && result.data) {
                    this.weatherData = result.data;
                    console.log('✅ 天气数据加载成功 (via Flask):', this.weatherData);
                    this.updateWeatherInfo();
                    return;
                }
            }
            throw new Error('后端天气接口返回错误');
        } catch (error) {
            console.error('❌ 天气数据加载失败，使用默认值:', error);
            this.weatherData = {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: 'E'
            };
            this.updateWeatherInfo();
        }
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

            // ⭐ 这里保留了你原本的圆形图标样式 (custom-marker)
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${markerColor}; width: 35px; height: 35px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">${displayValue}</div>`,
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
                <div class="popup-title">${station.name}</div>
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
            waqiHTML = `
                <div class="waqi-section" style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, ${level.color}22, ${level.color}44); border-radius: 12px; border-left: 4px solid ${level.color};">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-weight: bold; color: #555;">WAQI 实时指数</span>
                        <span style="font-size: 1.5em; font-weight: bold; color: ${level.color};">${waqiInfo.aqi}</span>
                    </div>
                    <div style="text-align: center; margin-top: 8px; color: #666; font-size: 0.9em;">${level.desc}</div>
                </div>
            `;
        }

        detailsDiv.innerHTML = `
            <div class="station-header">
                <div class="station-name">${station.name}</div>
                <div class="station-type">${station.nameEn}</div>
            </div>
            
            <div class="pollutant-grid">
                ${pollutantHTML}
            </div>
            
            <div class="aqi-indicator aqi-${aqiLevel}">
                空气质量: ${DataParser.getAQIDescription(aqiLevel)}
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
        if (humidityElement) humidityElement.textContent = `湿度: ${this.weatherData.humidity}%`;
        if (windElement) windElement.textContent = `风速: ${this.weatherData.windSpeed} km/h (${this.weatherData.windDirection})`;
    }

    getMarkerColor(level) {
        const colors = {
            good: '#28a745',
            moderate: '#ffc107',
            unhealthy: '#dc3545'
        };
        return colors[level] || '#6c757d';
    }

    getWAQIMarkerColor(aqi) {
        if (aqi <= 50) return '#00e400';
        if (aqi <= 100) return '#ffff00';
        if (aqi <= 150) return '#ff7e00';
        if (aqi <= 200) return '#ff0000';
        if (aqi <= 300) return '#8f3f97';
        return '#7e0023';
    }

    startAutoRefresh() {
        setInterval(() => {
            console.log('自动刷新数据...');
            this.loadData();
        }, 5 * 60 * 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new AirQualityApp();
    app.init();
});