// Data Parser Utility Class
class DataParser {
    /**
     * Parse Air Quality JSON Data
     */
    static parseAirQualityData(data) {
        const stations = [];
        
        // Iterate through all stations
        for (const [key, value] of Object.entries(data)) {
            if (key === 'datetime') continue;
            
            stations.push({
                id: value.CODE,
                name: value.Chinese, // Keeping original Chinese name for reference/fallback
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
        
        // Check for XML parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('❌ XML Format Error:', parserError.textContent);
            return {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: 'E'
            };
        }
        
        try {
            // ⭐ Try multiple possible XML tags
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
            
            // ⭐ Clean data (keep numbers and decimals, remove units)
            const cleanNumber = (str) => {
                if (!str) return null;
                const match = str.match(/[-+]?\d+\.?\d*/);
                return match ? match[0] : null;
            };
            
            temperature = cleanNumber(temperature);
            humidity = cleanNumber(humidity);
            windSpeed = cleanNumber(windSpeed);
            
            console.log('🔍 Weather Data Parsed:', { 
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
            console.error('⚠️ Weather Data Parsing Exception:', error);
            return {
                temperature: '--',
                humidity: '--',
                windSpeed: '--',
                windDirection: 'E'
            };
        }
    }

    /**
     * Calculate AQI Level
     */
    static getAQILevel(pm25, pm10) {
        // Simplified AQI calculation (based on PM2.5 and PM10)
        const pm25Level = pm25 > 75 ? 'unhealthy' : pm25 > 35 ? 'moderate' : 'good';
        const pm10Level = pm10 > 150 ? 'unhealthy' : pm10 > 50 ? 'moderate' : 'good';
        
        // Return the worse level
        if (pm25Level === 'unhealthy' || pm10Level === 'unhealthy') return 'unhealthy';
        if (pm25Level === 'moderate' || pm10Level === 'moderate') return 'moderate';
        return 'good';
    }

    /**
     * Get AQI Description
     */
    static getAQIDescription(level) {
        const descriptions = {
            good: 'Good',
            moderate: 'Moderate',
            unhealthy: 'Unhealthy'
        };
        return descriptions[level] || 'Unknown';
    }

    /**
     * Format Pollutant Value (keep 3 decimal places)
     */
    static formatPollutantValue(value, pollutant) {
        if (value === 0 || value === null || value === undefined) {
            return 'No Data';
        }
        
        return value.toFixed(3);
    }

    /**
     * Get Pollutant Unit
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
     * Get Pollutant Name (English)
     */
    static getPollutantName(pollutant) {
        const names = {
            PM10: 'Particulate Matter (PM10)',
            PM2_5: 'Fine Particulate Matter (PM2.5)',
            NO2: 'Nitrogen Dioxide (NO₂)',
            CO: 'Carbon Monoxide (CO)',
            O3: 'Ozone (O₃)',
            SO2: 'Sulfur Dioxide (SO₂)'
        };
        return names[pollutant] || pollutant;
    }

    /**
     * Format Current DateTime
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
     * Get WAQI Level and Color (High Contrast Version)
     */
    static getWAQILevel(aqi) {
        if (aqi <= 50) {
            return { 
                level: 'good', 
                desc: 'Good', 
                color: '#28a745',       // Standard Green
                bgColor: '#d4edda',     // Light Green Background
                textColor: '#155724'    // Dark Green Text (High Contrast)
            };
        } else if (aqi <= 100) {
            return { 
                level: 'moderate', 
                desc: 'Moderate', 
                color: '#ffc107',       // Amber/Yellow
                bgColor: '#fff3cd',     // Light Yellow Background
                textColor: '#856404'    // Dark Brown/Gold Text (High Contrast)
            };
        } else if (aqi <= 150) {
            return { 
                level: 'unhealthy-sensitive', 
                desc: 'Unhealthy for Sensitive Groups', 
                color: '#fd7e14',       // Orange
                bgColor: '#ffebd6',     // Light Orange Background
                textColor: '#b7410e'    // Dark Orange Text (High Contrast)
            };
        } else if (aqi <= 200) {
            return { 
                level: 'unhealthy', 
                desc: 'Unhealthy', 
                color: '#dc3545',       // Red
                bgColor: '#f8d7da',     // Light Red Background
                textColor: '#721c24'    // Dark Red Text (High Contrast)
            };
        } else if (aqi <= 300) {
            return { 
                level: 'very-unhealthy', 
                desc: 'Very Unhealthy', 
                color: '#6f42c1',       // Purple
                bgColor: '#e2d9f3',     // Light Purple Background
                textColor: '#481f85'    // Dark Purple Text (High Contrast)
            };
        } else {
            return { 
                level: 'hazardous', 
                desc: 'Hazardous', 
                color: '#7e0023',       // Maroon
                bgColor: '#f5c6cb',     // Light Maroon Background
                textColor: '#721c24'    // Dark Maroon Text
            };
        }
    }
}