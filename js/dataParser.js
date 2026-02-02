// Data Parser Utility Class
class DataParser {
    static parseAirQualityData(data) {
        const stations = [];
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

    static getAQILevel(pm25, pm10) {
        const pm25Level = pm25 > 75 ? 'unhealthy' : pm25 > 35 ? 'moderate' : 'good';
        const pm10Level = pm10 > 150 ? 'unhealthy' : pm10 > 50 ? 'moderate' : 'good';
        if (pm25Level === 'unhealthy' || pm10Level === 'unhealthy') return 'unhealthy';
        if (pm25Level === 'moderate' || pm10Level === 'moderate') return 'moderate';
        return 'good';
    }

    static getAQIDescription(level) {
        const descriptions = { good: 'Good', moderate: 'Moderate', unhealthy: 'Unhealthy' };
        return descriptions[level] || 'Unknown';
    }

    // ⭐ 修改：保留 1 位小数
    static formatPollutantValue(value) {
        if (value === 0 || value === null || value === undefined) return 'No Data';
        return value.toFixed(1);
    }

    static getPollutantUnit(pollutant) {
        if (pollutant === 'CO') return 'mg/m³';
        return 'μg/m³';
    }

    // ⭐ 修改：添加 HTML 下角标
    static getPollutantName(pollutant) {
        const names = {
            PM10: 'Particulate Matter (PM<sub>10</sub>)',
            PM2_5: 'Fine Particulate Matter (PM<sub>2.5</sub>)',
            NO2: 'Nitrogen Dioxide (NO<sub>2</sub>)',
            CO: 'Carbon Monoxide (CO)',
            O3: 'Ozone (O<sub>3</sub>)',
            SO2: 'Sulfur Dioxide (SO<sub>2</sub>)'
        };
        return names[pollutant] || pollutant;
    }

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

    static getWAQILevel(aqi) {
        if (aqi <= 50) return { level: 'good', desc: 'Good', color: '#28a745', bgColor: '#d4edda', textColor: '#155724' };
        else if (aqi <= 100) return { level: 'moderate', desc: 'Moderate', color: '#ffc107', bgColor: '#fff3cd', textColor: '#856404' };
        else if (aqi <= 150) return { level: 'unhealthy-sensitive', desc: 'Unhealthy for Sensitive Groups', color: '#fd7e14', bgColor: '#ffebd6', textColor: '#b7410e' };
        else if (aqi <= 200) return { level: 'unhealthy', desc: 'Unhealthy', color: '#dc3545', bgColor: '#f8d7da', textColor: '#721c24' };
        else if (aqi <= 300) return { level: 'very-unhealthy', desc: 'Very Unhealthy', color: '#6f42c1', bgColor: '#e2d9f3', textColor: '#481f85' };
        else return { level: 'hazardous', desc: 'Hazardous', color: '#7e0023', bgColor: '#f5c6cb', textColor: '#721c24' };
    }
}