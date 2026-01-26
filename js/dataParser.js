// 数据解析工具类
class DataParser {
    /**
     * 解析空气质量JSON数据
     */
    static parseAirQualityData(data) {
        const stations = [];
        
        // 遍历所有监测站
        for (const [key, value] of Object.entries(data)) {
            if (key === 'datetime') continue;
            
            stations.push({
                id: value.CODE,
                name: value.Chinese,
                nameEn: value.English,
                namePt: value.Portuguese,
                data: {
                    PM10: parseFloat(value.HE_PM10) || 0,
                    PM2_5: parseFloat(value.HE_PM2_5) || 0,
                    NO2: parseFloat(value.HE_NO2) || 0,
                    CO: parseFloat(value.HE_CO) || 0,
                    O3: parseFloat(value.HE_O3) || 0,
                    SO2: parseFloat(value.HE_SO2) || 0
                },
                timestamp: data.datetime
            });
        }
        
        return stations;
    }

    static parseWeatherData(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        
        // 检查 XML 解析错误
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('❌ XML 格式错误:', parserError.textContent);
            return {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: 'E'
            };
        }
        
        try {
            // ⭐ 尝试多种可能的 XML 标签
            const possibleTags = {
                temperature: ['Temperature', 'Temp', 'TEMP', 'temp'],
                humidity: ['RH', 'Humidity', 'HUMIDITY', 'humidity'],
                windSpeed: ['ActualWS', 'WindSpeed', 'WS', 'windSpeed'],
                windDirection: ['WindDirect', 'WindDir', 'WD', 'windDirection']
            };
            
            const getValue = (tags) => {
                for (const tag of tags) {
                    const elem = xmlDoc.querySelector(tag);
                    if (elem && elem.textContent) {
                        return elem.textContent.trim();
                    }
                }
                return null;
            };
            
            let temperature = getValue(possibleTags.temperature);
            let humidity = getValue(possibleTags.humidity);
            let windSpeed = getValue(possibleTags.windSpeed);
            let windDirection = getValue(possibleTags.windDirection) || 'E';
            
            // ⭐ 清理数据（保留数字和小数点，移除单位）
            const cleanNumber = (str) => {
                if (!str) return null;
                const match = str.match(/[-+]?\d+\.?\d*/);
                return match ? match[0] : null;
            };
            
            temperature = cleanNumber(temperature);
            humidity = cleanNumber(humidity);
            windSpeed = cleanNumber(windSpeed);
            
            console.log('🔍 天气数据解析结果:', { 
                temperature, 
                humidity, 
                windSpeed, 
                windDirection 
            });
            
            return {
                temperature: temperature || '--',
                humidity: humidity || '--',
                windSpeed: windSpeed || '--',
                windDirection: windDirection || 'E'
            };
            
        } catch (error) {
            console.error('⚠️ 天气数据解析异常:', error);
            return {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: 'E'
            };
        }
    }

    /**
     * 计算空气质量指数等级
     */
    static getAQILevel(pm25, pm10) {
        // 简化的AQI计算（基于PM2.5和PM10）
        const pm25Level = pm25 > 75 ? 'unhealthy' : pm25 > 35 ? 'moderate' : 'good';
        const pm10Level = pm10 > 150 ? 'unhealthy' : pm10 > 50 ? 'moderate' : 'good';
        
        // 返回较差的等级
        if (pm25Level === 'unhealthy' || pm10Level === 'unhealthy') return 'unhealthy';
        if (pm25Level === 'moderate' || pm10Level === 'moderate') return 'moderate';
        return 'good';
    }

    /**
     * 获取AQI等级描述
     */
    static getAQIDescription(level) {
        const descriptions = {
            good: '良好',
            moderate: '中等',
            unhealthy: '不健康'
        };
        return descriptions[level] || '未知';
    }

    /**
     * 格式化污染物数值（保留三位小数）
     */
    static formatPollutantValue(value, pollutant) {
        if (value === 0 || value === null || value === undefined) {
            return '无数据';
        }
        
        // 所有污染物都保留三位小数
        return value.toFixed(3);
    }

    /**
     * 获取污染物单位
     */
    static getPollutantUnit(pollutant) {
        const units = {
            PM10: 'μg/m³',
            PM2_5: 'μg/m³',
            NO2: 'μg/m³',
            CO: 'mg/m³',
            O3: 'μg/m³',
            SO2: 'μg/m³'
        };
        return units[pollutant] || '';
    }

    /**
     * 获取污染物中文名称（包含英文标识）
     */
    static getPollutantName(pollutant) {
        const names = {
            PM10: '可吸入颗粒物 (PM10)',
            PM2_5: '细颗粒物 (PM2.5)',
            NO2: '二氧化氮 (NO₂)',
            CO: '一氧化碳 (CO)',
            O3: '臭氧 (O₃)',
            SO2: '二氧化硫 (SO₂)'
        };
        return names[pollutant] || pollutant;
    }

    /**
     * 格式化当前日期时间
     */
    static getCurrentDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * 获取WAQI的AQI等级和颜色
     */
    static getWAQILevel(aqi) {
        if (aqi <= 50) {
            return { 
                level: 'good', 
                desc: '优秀', 
                color: '#00e400',
                textColor: '#fff'
            };
        } else if (aqi <= 100) {
            return { 
                level: 'moderate', 
                desc: '良好', 
                color: '#ffff00',
                textColor: '#000'
            };
        } else if (aqi <= 150) {
            return { 
                level: 'unhealthy-sensitive', 
                desc: '轻度污染', 
                color: '#ff7e00',
                textColor: '#fff'
            };
        } else if (aqi <= 200) {
            return { 
                level: 'unhealthy', 
                desc: '中度污染', 
                color: '#ff0000',
                textColor: '#fff'
            };
        } else if (aqi <= 300) {
            return { 
                level: 'very-unhealthy', 
                desc: '重度污染', 
                color: '#8f3f97',
                textColor: '#fff'
            };
        } else {
            return { 
                level: 'hazardous', 
                desc: '严重污染', 
                color: '#7e0023',
                textColor: '#fff'
            };
        }
    }
}