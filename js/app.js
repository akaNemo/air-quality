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
        this.currentWAQIStation = null;
        
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
        this.initWAQIWidget();
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
     * 初始化WAQI Widget
     */
    initWAQIWidget() {
        const selector = document.getElementById('waqi-station-selector');
        if (!selector) return;
        
        // 填充监测站选项
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
        
        // 监听选择变化
        selector.addEventListener('change', (e) => {
            const stationId = e.target.value;
            if (stationId) {
                this.loadWAQIWidget(stationId);
            } else {
                this.clearWAQIWidget();
            }
        });
    }


/**
 * 加载WAQI Widget - 显示历史数据图表
 */
async loadWAQIWidget(stationId) {
    const waqiUrl = this.waqiStationMapping[stationId];
    if (!waqiUrl) return;
    
    this.currentWAQIStation = stationId;
    const container = document.getElementById('waqi-widget-container');
    if (!container) return;
    
    const stationName = this.waqiStationNames[stationId] || '监测站';
    
    // 显示加载状态
    container.innerHTML = `
        <div class="waqi-loading">
            <div class="loading-spinner"></div>
            <p>正在加载历史数据...</p>
        </div>
    `;
    
    try {
        // 获取WAQI详细数据
        const url = `https://api.waqi.info/feed/${waqiUrl}/?token=${this.waqiToken}`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(8000)
        });
        const data = await response.json();
        
        // 详细日志输出
        console.log('=== WAQI完整API响应 ===');
        console.log('站点:', stationName, '(', waqiUrl, ')');
        console.log('完整数据:', data);
        
        if (data.data) {
            console.log('--- forecast 对象 ---');
            console.log('forecast:', data.data.forecast);
            
            if (data.data.forecast?.daily) {
                console.log('--- daily 预测数据 ---');
                console.log('所有可用字段:', Object.keys(data.data.forecast.daily));
                console.log('PM2.5:', data.data.forecast.daily.pm25);
                console.log('PM10:', data.data.forecast.daily.pm10);
                console.log('O3:', data.data.forecast.daily.o3);
                console.log('NO2:', data.data.forecast.daily.no2);
                console.log('SO2:', data.data.forecast.daily.so2);
            }
            
            console.log('--- iaqi 实时数据 ---');
            console.log('iaqi:', data.data.iaqi);
            if (data.data.iaqi) {
                console.log('所有可用字段:', Object.keys(data.data.iaqi));
            }
        }
        console.log('========================');
        
        if (data.status === 'ok' && data.data) {
            this.renderWAQICharts(container, data.data, stationName);
        } else {
            throw new Error('数据获取失败');
        }
    } catch (error) {
        console.error('加载WAQI数据失败:', error);
        container.innerHTML = `
            <div class="waqi-error">
                <p>❌ 图表加载失败</p>
                <p style="font-size: 0.85em; color: #999;">错误信息: ${error.message}</p>
                <p style="font-size: 0.85em; color: #999;">请稍后重试或选择其他监测站</p>
            </div>
        `;
    }
}

/**
 * 渲染WAQI图表
 */
renderWAQICharts(container, data, stationName) {
    const forecast = data.forecast?.daily;
    const iaqi = data.iaqi;
    
    console.log('--- 开始渲染图表 ---');
    console.log('forecast.daily 可用性检查:');
    console.log('  pm25:', !!forecast?.pm25, forecast?.pm25);
    console.log('  pm10:', !!forecast?.pm10, forecast?.pm10);
    console.log('  o3:', !!forecast?.o3, forecast?.o3);
    
    // 如果完全没有数据
    if (!forecast && !iaqi) {
        container.innerHTML = `
            <div class="waqi-error">
                <p>⚠️ 该站点暂无历史数据</p>
            </div>
        `;
        return;
    }
    
    // 统计可用的图表
    const availableCharts = [];
    
    if (forecast?.pm25 && Array.isArray(forecast.pm25) && forecast.pm25.length > 0) {
        availableCharts.push({
            id: 'pm25-chart',
            title: 'PM2.5 趋势',
            data: forecast.pm25,
            color: '#e74c3c',
            label: 'PM2.5'
        });
    }
    
    if (forecast?.pm10 && Array.isArray(forecast.pm10) && forecast.pm10.length > 0) {
        availableCharts.push({
            id: 'pm10-chart',
            title: 'PM10 趋势',
            data: forecast.pm10,
            color: '#f39c12',
            label: 'PM10'
        });
    }
    
    if (forecast?.o3 && Array.isArray(forecast.o3) && forecast.o3.length > 0) {
        availableCharts.push({
            id: 'o3-chart',
            title: 'O₃ (臭氧) 趋势',
            data: forecast.o3,
            color: '#3498db',
            label: 'O₃'
        });
    }
    
    if (forecast?.no2 && Array.isArray(forecast.no2) && forecast.no2.length > 0) {
        availableCharts.push({
            id: 'no2-chart',
            title: 'NO₂ (二氧化氮) 趋势',
            data: forecast.no2,
            color: '#9b59b6',
            label: 'NO₂'
        });
    }
    
    if (forecast?.so2 && Array.isArray(forecast.so2) && forecast.so2.length > 0) {
        availableCharts.push({
            id: 'so2-chart',
            title: 'SO₂ (二氧化硫) 趋势',
            data: forecast.so2,
            color: '#1abc9c',
            label: 'SO₂'
        });
    }
    
    console.log('可绘制的图表数量:', availableCharts.length);
    console.log('图表列表:', availableCharts.map(c => c.label));
    
    // 生成图表HTML
    let chartsHTML = '';
    
    if (availableCharts.length > 0) {
        chartsHTML = availableCharts.map(chart => 
            `<div class="chart-item"><canvas id="${chart.id}"></canvas></div>`
        ).join('');
    } else {
        // 如果没有预测数据，显示实时数据
        chartsHTML = `
            <div class="waqi-info">
                <p>📊 该站点暂无历史趋势数据</p>
                <p style="font-size: 0.9em; color: #999; margin-top: 10px;">仅显示当前实时数值</p>
                <div class="current-values">
                    ${iaqi?.pm25 ? `<div class="value-item"><span>PM2.5</span> <strong>${iaqi.pm25.v}</strong> <small>μg/m³</small></div>` : ''}
                    ${iaqi?.pm10 ? `<div class="value-item"><span>PM10</span> <strong>${iaqi.pm10.v}</strong> <small>μg/m³</small></div>` : ''}
                    ${iaqi?.o3 ? `<div class="value-item"><span>O₃</span> <strong>${iaqi.o3.v}</strong> <small>μg/m³</small></div>` : ''}
                    ${iaqi?.no2 ? `<div class="value-item"><span>NO₂</span> <strong>${iaqi.no2.v}</strong> <small>μg/m³</small></div>` : ''}
                    ${iaqi?.so2 ? `<div class="value-item"><span>SO₂</span> <strong>${iaqi.so2.v}</strong> <small>μg/m³</small></div>` : ''}
                    ${iaqi?.co ? `<div class="value-item"><span>CO</span> <strong>${iaqi.co.v}</strong> <small>mg/m³</small></div>` : ''}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="waqi-widget-content">
            <div class="widget-station-info">
                <span class="widget-station-name">${stationName}</span>
                <span class="widget-update-hint">数据来源: WAQI | 更新: ${data.time?.s || '--'}</span>
            </div>
            
            <div class="charts-container">
                ${chartsHTML}
            </div>
        </div>
    `;
    
    // 绘制所有可用图表
    availableCharts.forEach(chart => {
        console.log(`绘制图表: ${chart.label}`);
        this.createChart(chart.id, chart.title, chart.data, chart.color, chart.label);
    });
    
    console.log('--- 图表渲染完成 ---');
}


/**
 * 创建单个图表
 */
createChart(canvasId, title, data, color, pollutant) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // 提取日期和数值
    const labels = data.map(item => {
        const date = new Date(item.day);
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    });
    
    // 提取平均值、最小值、最大值
    const avgValues = data.map(item => item.avg);
    const minValues = data.map(item => item.min);
    const maxValues = data.map(item => item.max);
    
    console.log(`${pollutant} 图表数据:`, {
        labels,
        avg: avgValues,
        min: minValues,
        max: maxValues
    });
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `${pollutant} 平均值`,
                    data: avgValues,
                    borderColor: color,
                    backgroundColor: color + '33',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: `${pollutant} 最大值`,
                    data: maxValues,
                    borderColor: color + 'aa',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: `${pollutant} 最小值`,
                    data: minValues,
                    borderColor: color + 'aa',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.8,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: {
                        top: 10,
                        bottom: 15
                    }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y} μg/m³`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '浓度 (μg/m³)',
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期',
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

    /**
     * 清除WAQI Widget
     */
    clearWAQIWidget() {
        const container = document.getElementById('waqi-widget-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="waqi-placeholder">
                👆 请选择一个监测站查看详细图表
            </div>
        `;
        this.currentWAQIStation = null;
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
        this.initWAQIWidget();
        
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
        
        // 自动切换WAQI widget
        if (this.waqiStationMapping[station.id]) {
            const selector = document.getElementById('waqi-station-selector');
            if (selector) {
                selector.value = station.id;
                this.loadWAQIWidget(station.id);
            }
        }
        
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