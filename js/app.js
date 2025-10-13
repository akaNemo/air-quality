// 主应用类
class AirQualityApp {
    constructor() {
        this.map = null;
        this.markers = [];
        this.stationCoordinates = {
            'PO': [22.1987, 113.5439],
            'KH': [22.1265, 113.5625],
            'EN': [22.1933, 113.5492],
            'TC': [22.1547, 113.5590],
            'TG': [22.1598, 113.5656],
            'CD': [22.1182, 113.5594]
        };
        this.airQualityData = null;
        this.weatherData = null;
        
        // 多个CORS代理备选
        this.corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            '' // 最后尝试直接访问
        ];
        this.currentProxyIndex = 0;
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
            await Promise.all([
                this.loadAirQualityData(),
                this.loadWeatherData()
            ]);
            this.displayMarkers();
            this.updateWeatherInfo();
        } catch (error) {
            console.error('数据加载失败:', error);
            // 使用模拟数据
            this.useMockData();
        }
    }

    /**
     * 使用模拟数据作为后备方案
     */
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
                data: { PM10: 9.000, PM2_5: 4.000, NO2: 10.463, CO: 0.422, O3: 46.692, SO2: 3.355 }
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

        this.weatherData = {
            temperature: '28',
            humidity: '86',
            windSpeed: '5',
            windDirection: 'ESE'
        };

        document.getElementById('update-time').textContent = DataParser.getCurrentDateTime() + ' (模拟数据)';
        
        this.displayMarkers();
        this.updateWeatherInfo();
        
        // 在页面上显示提示
        this.showWarning('API连接失败，正在使用模拟数据展示。请检查网络连接或稍后重试。');
    }

    /**
     * 尝试使用多个代理加载数据
     */
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
                    signal: AbortSignal.timeout(10000) // 10秒超时
                });

                if (response.ok) {
                    console.log(`代理 ${i + 1} 成功`);
                    this.currentProxyIndex = i; // 记住成功的代理
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

            const aqiLevel = DataParser.getAQILevel(station.data.PM2_5, station.data.PM10);
            const markerColor = this.getMarkerColor(aqiLevel);

            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    background-color: ${markerColor};
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                ">${station.id}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
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
        
        return `
            <div class="popup-content">
                <div class="popup-title">${station.name}</div>
                <div class="popup-data">
                    <div><strong>PM2.5:</strong> ${DataParser.formatPollutantValue(pm25, 'PM2_5')} μg/m³</div>
                    <div><strong>PM10:</strong> ${DataParser.formatPollutantValue(pm10, 'PM10')} μg/m³</div>
                    <div><strong>状态:</strong> ${DataParser.getAQIDescription(DataParser.getAQILevel(pm25, pm10))}</div>
                </div>
            </div>
        `;
    }

    showStationDetails(station) {
        const detailsDiv = document.getElementById('station-details');
        const aqiLevel = DataParser.getAQILevel(station.data.PM2_5, station.data.PM10);
        
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

    showError(message) {
        alert(message);
    }

    showWarning(message) {
        // 在页面顶部显示警告
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

        // 5秒后自动消失
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