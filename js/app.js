// 主应用类
class AirQualityApp {
    constructor() {
        this.map = null;
        this.markers = [];
        
        // 使用WAQI的实际坐标
        this.stationCoordinates = {
            'PO': [22.195833, 113.544722],  // 水坑尾區 Calçada do Poço
            'KH': [22.132087, 113.58173],   // 九澳 Ká-Hó
            'EN': [22.213889, 113.542778],  // 北區 Subestação Macau Norte
            'TC': [22.158083, 113.554591],  // 氹仔中央公園 Parque Central da Taipa
            'TG': [22.16, 113.565],         // 大潭山 Taipa Grande
            'CD': [22.125278, 113.554444]   // 路環 Coloane
        };
        
        // WAQI站点精确映射（使用实际的URL）
        this.waqiStationMapping = {
            'PO': 'macau/calcada-do-poco',              // 水坑尾區 (水井斜巷)
            'KH': 'macau/ka-ho',                        // 九澳區
            'EN': 'macau/subestacao-macau-norte',       // 北區 (澳北電站)
            'TC': 'macau/parque-central-da-taipa',      // 氹仔區 (氹仔中央公園站)
            'TG': 'macau/taipa-grande',                 // 氹仔大潭山 (氣象局總站)
            'CD': 'macau/coloane'                       // 路環一般性
        };
        
        // WAQI站点中文名称
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
        
        this.corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            ''
        ];
        this.currentProxyIndex = 0;
        this.waqiToken = '20be3ec9b049fa5e3f4e90e97f582441c3d312d9';
    }

    async init() {
        this.initMap();
        this.startClock();
        await this.loadData();
        this.startAutoRefresh();
    }

    initMap() {
        this.map = L.map('map').setView([22.1987, 113.5439], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
            // 先加载官方数据和天气数据
            await Promise.all([
                this.loadAirQualityData(),
                this.loadWeatherData()
            ]);
            
            // 显示初始标记
            this.displayMarkers();
            this.updateWeatherInfo();
            
            // 然后加载WAQI数据（不阻塞主流程）
            this.loadWAQIData().then(() => {
                // WAQI数据加载完成后重新显示标记
                this.displayMarkers();
            }).catch(err => {
                console.warn('WAQI数据加载失败，将只显示官方数据:', err);
            });
            
        } catch (error) {
            console.error('数据加载失败:', error);
            this.useMockData();
        }
    }

    /**
     * 加载WAQI数据（使用正确的站点ID）
     */
    async loadWAQIData() {
        try {
            console.log('开始加载WAQI数据，共', Object.keys(this.waqiStationMapping).length, '个站点...');
            
            const waqiPromises = Object.entries(this.waqiStationMapping).map(async ([stationId, waqiUrl]) => {
                try {
                    const url = `https://api.waqi.info/feed/${waqiUrl}/?token=${this.waqiToken}`;
                    console.log(`正在加载 ${stationId} - ${this.waqiStationNames[stationId]} (${waqiUrl})...`);
                    
                    const response = await fetch(url, {
                        signal: AbortSignal.timeout(8000)
                    });
                    
                    const data = await response.json();
                    
                    if (data.status === 'ok' && data.data && data.data.aqi !== undefined) {
                        console.log(`✓ ${stationId} 加载成功, AQI: ${data.data.aqi}`);
                        return { stationId, data: data.data };
                    } else {
                        console.warn(`✗ ${stationId} 返回异常:`, data);
                    }
                } catch (error) {
                    console.error(`✗ ${stationId} 加载失败:`, error.message);
                }
                return null;
            });

            const results = await Promise.all(waqiPromises);
            
            // 整理WAQI数据
            let successCount = 0;
            results.forEach(result => {
                if (result && result.data && result.data.aqi !== undefined) {
                    this.waqiData[result.stationId] = result.data;
                    successCount++;
                }
            });
            
            console.log(`✅ WAQI数据加载完成: ${successCount}/${Object.keys(this.waqiStationMapping).length} 个站点成功`);
            console.log('WAQI数据详情:', this.waqiData);
            
        } catch (error) {
            console.error('WAQI数据加载失败:', error);
            this.waqiData = {};
        }
    }

    useMockData() {
        console.log('使用模拟数据');
        
        this.airQualityData = [
            {
                id: 'PO',
                name: '荷兰园（路边）',
                nameEn: 'Conselheiro Ferreira de Almeida (Roadside)',
                namePt: 'Conselheiro Ferreira de Almeida (Berma da Estrada)',
                data: { PM10: 13.000, PM2_5: 5.000, NO2: 27.951, CO: 0.697, O3: 42.484, SO2: 2.799 }
            },
            {
                id: 'KH',
                name: '九澳（路边）',
                nameEn: 'Ka-Hó (Roadside)',
                namePt: 'Ka-Hó (Berma da Estrada)',
                data: { PM10: 13.000, PM2_5: 11.000, NO2: 8.824, CO: 0.562, O3: 43.899, SO2: 3.554 }
            },
            {
                id: 'EN',
                name: '台山（高密度住宅区）',
                nameEn: 'Bairro de Tamagnini Barbosa (High Density Residental Area)',
                namePt: 'Bairro de Tamagnini Barbosa (Alta Densidade Habitacional)',
                data: { PM10: 13.000, PM2_5: 5.000, NO2: 40.538, CO: 0.450, O3: 19.686, SO2: 1.809 }
            },
            {
                id: 'TC',
                name: '氹仔中心区（高密度住宅区）',
                nameEn: 'Baixa da Taipa (High Density Residental Area)',
                namePt: 'Baixa da Taipa (Alta Densidade Habitacional)',
                data: { PM10: 7.000, PM2_5: 8.000, NO2: 22.641, CO: 0.513, O3: 21.997, SO2: 2.875 }
            },
            {
                id: 'TG',
                name: '大潭山（一般性）',
                nameEn: 'Taipa Grande (Ambient)',
                namePt: 'Taipa Grande (Ambiental)',
                data: { PM10: 2.000, PM2_5: 4.000, NO2: 14.795, CO: 0.490, O3: 46.756, SO2: 2.869 }
            },
            {
                id: 'CD',
                name: '石排湾（一般性）',
                nameEn: 'Seac Pai Van (Ambient)',
                namePt: 'Seac Pai Van (Ambiental)',
                data: { PM10: 12.000, PM2_5: 8.000, NO2: 22.442, CO: 0.523, O3: 34.652, SO2: 4.439 }
            }
        ];

        // 使用真实的WAQI当前数据
        this.waqiData = {
            'PO': { aqi: 17 },  // 水坑尾
            'KH': { aqi: 46 },  // 九澳
            'EN': { aqi: 20 },  // 北區
            'TC': { aqi: 34 },  // 氹仔中央公園
            'TG': { aqi: 17 },  // 大潭山
            'CD': { aqi: 17 }   // 路環
        };

        this.weatherData = {
            temperature: '28',
            humidity: '86',
            windSpeed: '5',
            windDirection: 'ESE'
        };

        document.getElementById('update-time').textContent = DataParser.getCurrentDateTime() + ' (模拟数据)';
        
        this.displayMarkers();
        this.updateWeatherInfo();
        
        this.showWarning('API连接失败，正在使用模拟数据展示。');
    }

    async fetchWithProxy(url) {
        for (let i = 0; i < this.corsProxies.length; i++) {
            try {
                const proxy = this.corsProxies[i];
                const fullUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                console.log(`尝试代理 ${i + 1}/${this.corsProxies.length}: ${proxy || '直接访问'}`);
                
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': '*/*',
                    },
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    console.log(`代理 ${i + 1} 成功`);
                    this.currentProxyIndex = i;
                    return response;
                }
            } catch (error) {
                console.error(`代理 ${i + 1} 失败:`, error.message);
                if (i === this.corsProxies.length - 1) {
                    throw new Error('所有代理都失败了');
                }
            }
        }
    }

    async loadAirQualityData() {
        try {
            const apiUrl = 'https://www.smg.gov.mo/smg/airQuality/latestAirConcentration.json';
            const response = await this.fetchWithProxy(apiUrl);
            const data = await response.json();
            
            this.airQualityData = DataParser.parseAirQualityData(data);
            document.getElementById('update-time').textContent = data.datetime || '未知';
            
            console.log('空气质量数据加载成功');
        } catch (error) {
            console.error('空气质量数据加载失败:', error);
            throw error;
        }
    }

    async loadWeatherData() {
        try {
            const apiUrl = 'https://xml.smg.gov.mo/p_actual_brief.xml';
            const response = await this.fetchWithProxy(apiUrl);
            const xmlText = await response.text();
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            const parseError = xmlDoc.getElementsByTagName('parsererror');
            if (parseError.length > 0) {
                throw new Error('XML解析失败');
            }
            
            const temperatures = xmlDoc.getElementsByTagName('Temperature');
            let temperature = '--';
            for (let temp of temperatures) {
                const type = temp.getElementsByTagName('Type')[0]?.textContent;
                if (type === '3') {
                    temperature = temp.getElementsByTagName('Value')[0]?.textContent || '--';
                    break;
                }
            }
            
            const humidities = xmlDoc.getElementsByTagName('Humidity');
            let humidity = '--';
            for (let hum of humidities) {
                const type = hum.getElementsByTagName('Type')[0]?.textContent;
                if (type === '3') {
                    humidity = hum.getElementsByTagName('Value')[0]?.textContent || '--';
                    break;
                }
            }
            
            const windSpeeds = xmlDoc.getElementsByTagName('WindSpeed');
            let windSpeed = '--';
            for (let wind of windSpeeds) {
                const type = wind.getElementsByTagName('Type')[0]?.textContent;
                if (type === '3') {
                    windSpeed = wind.getElementsByTagName('Value')[0]?.textContent || '--';
                    break;
                }
            }
            
            const windDirections = xmlDoc.getElementsByTagName('WindDirection');
            let windDirection = '--';
            for (let wind of windDirections) {
                const type = wind.getElementsByTagName('Type')[0]?.textContent;
                if (type === '3') {
                    windDirection = wind.getElementsByTagName('Value')[0]?.textContent || '--';
                    break;
                }
            }
            
            this.weatherData = {
                temperature: temperature,
                humidity: humidity,
                windSpeed: windSpeed,
                windDirection: windDirection
            };
            
            console.log('天气数据加载成功:', this.weatherData);
            
        } catch (error) {
            console.error('天气数据加载失败:', error);
            this.weatherData = {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: '--'
            };
        }
    }

    displayMarkers() {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        if (!this.airQualityData) return;

        this.airQualityData.forEach(station => {
            const coords = this.stationCoordinates[station.id];
            if (!coords) return;

            // 优先使用WAQI的AQI，否则使用官方数据计算
            let markerColor, displayValue;
            
            if (this.waqiData[station.id] && this.waqiData[station.id].aqi !== undefined && this.waqiData[station.id].aqi !== -1) {
                // 有WAQI数据，使用AQI值
                const aqi = this.waqiData[station.id].aqi;
                markerColor = this.getWAQIMarkerColor(aqi);
                displayValue = aqi;
            } else {
                // 没有WAQI数据，使用官方数据
                const aqiLevel = DataParser.getAQILevel(station.data.PM2_5, station.data.PM10);
                markerColor = this.getMarkerColor(aqiLevel);
                displayValue = station.id;
            }

            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    background-color: ${markerColor};
                    width: 35px;
                    height: 35px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                ">${displayValue}</div>`,
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
        const pm25 = station.data.PM2_5;
        const pm10 = station.data.PM10;
        const waqiInfo = this.waqiData[station.id];
        
        let aqiDisplay = '';
        if (waqiInfo && waqiInfo.aqi !== undefined && waqiInfo.aqi !== -1) {
            const level = DataParser.getWAQILevel(waqiInfo.aqi);
            aqiDisplay = `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                    <strong>AQI:</strong> <span style="color: ${level.color}; font-weight: bold; font-size: 1.1em;">${waqiInfo.aqi}</span> <span style="color: #666;">(${level.desc})</span>
                </div>
            `;
        }
        
        return `
            <div class="popup-content">
                <div class="popup-title">${station.name}</div>
                <div class="popup-data">
                    <div><strong>PM2.5:</strong> ${DataParser.formatPollutantValue(pm25, 'PM2_5')} μg/m³</div>
                    <div><strong>PM10:</strong> ${DataParser.formatPollutantValue(pm10, 'PM10')} μg/m³</div>
                    <div><strong>状态:</strong> ${DataParser.getAQIDescription(DataParser.getAQILevel(pm25, pm10))}</div>
                    ${aqiDisplay}
                </div>
            </div>
        `;
    }

    showStationDetails(station) {
        const detailsDiv = document.getElementById('station-details');
        const aqiLevel = DataParser.getAQILevel(station.data.PM2_5, station.data.PM10);
        const waqiInfo = this.waqiData[station.id];
        
        // 官方数据
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

        // WAQI AQI信息
        let waqiHTML = '';
        if (waqiInfo && waqiInfo.aqi !== undefined && waqiInfo.aqi !== -1) {
            const level = DataParser.getWAQILevel(waqiInfo.aqi);
            const waqiStationName = this.waqiStationNames[station.id] || 'WAQI站点';
            waqiHTML = `
                <div class="waqi-section" style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, ${level.color}22, ${level.color}44); border-radius: 12px; border-left: 4px solid ${level.color};">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                        <div style="font-size: 0.85em; color: #666; font-weight: 500;">
                            🌍 World AQI (WAQI)<br>
                            <span style="font-size: 0.9em; color: #999;">${waqiStationName}</span>
                        </div>
                        <div style="font-size: 2em; font-weight: bold; color: ${level.color};">
                            ${waqiInfo.aqi}
                        </div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 8px; color: ${level.color}; font-weight: bold;">
                        ${level.desc}
                    </div>
                </div>
            `;
        }

        detailsDiv.innerHTML = `
            <div class="station-header">
                <div class="station-name">${station.name}</div>
                <div class="station-type">${station.nameEn}</div>
            </div>
            
            <div style="font-size: 0.85em; color: #666; margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                📊 澳门地球物理暨气象局数据
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
        document.querySelector('.hint').style.display = 'none';
    }

    updateWeatherInfo() {
        if (!this.weatherData) return;

        const tempElement = document.getElementById('temperature');
        const humidityElement = document.getElementById('humidity');
        const windElement = document.getElementById('wind');

        if (tempElement) {
            tempElement.textContent = `${this.weatherData.temperature}°C`;
        }
        
        if (humidityElement) {
            humidityElement.textContent = `湿度: ${this.weatherData.humidity}%`;
        }
        
        if (windElement) {
            windElement.textContent = `风速: ${this.weatherData.windSpeed} km/h (${this.weatherData.windDirection})`;
        }
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
        if (aqi <= 50) return '#00e400';      // 优秀
        if (aqi <= 100) return '#ffff00';     // 良好
        if (aqi <= 150) return '#ff7e00';     // 轻度污染
        if (aqi <= 200) return '#ff0000';     // 中度污染
        if (aqi <= 300) return '#8f3f97';     // 重度污染
        return '#7e0023';                      // 严重污染
    }

    showError(message) {
        alert(message);
    }

    showWarning(message) {
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff9800;
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 80%;
            text-align: center;
        `;
        warning.textContent = message;
        document.body.appendChild(warning);

        setTimeout(() => {
            warning.remove();
        }, 5000);
    }

    startAutoRefresh() {
        setInterval(() => {
            this.loadData();
        }, 5 * 60 * 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new AirQualityApp();
    app.init();
});