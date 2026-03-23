import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
import requests
from datetime import datetime, timedelta
import xml.etree.ElementTree as ET

app = Flask(__name__)
# 允许跨域
CORS(app, resources={r"/*": {"origins": "*"}})

# ==========================================
# 1. 模型与归一化器加载
# ==========================================
print("🔄 正在加载模型 (PM2.5:新王, O3:老将)...")
try:
    model_pm25 = tf.keras.models.load_model('pm25_lstm_best.keras')
    model_o3 = tf.keras.models.load_model('o3_gru_best.keras')
    
    scaler_X_pm25 = joblib.load('scaler_X_pm25.pkl')
    scaler_y_pm25 = joblib.load('scaler_y_pm25.pkl')
    scaler_X_o3 = joblib.load('scaler_X_o3.pkl')
    scaler_y_o3 = joblib.load('scaler_y_o3.pkl')
    print("✅ 模型加载成功！")
except Exception as e:
    print(f"❌ 模型加载失败: {e}")
    model_pm25, model_o3 = None, None

# ==========================================
# 2. 获取数据
# ==========================================
def fetch_historical_data(lat, lon):
    try:
        end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=35)).strftime('%Y-%m-%d')
        
        weather_url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,rain_sum,pressure_msl_mean,wind_speed_10m_mean,wind_direction_10m_dominant,sunshine_duration&timezone=Asia%2FShanghai"
        air_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&hourly=pm2_5,ozone&timezone=Asia%2FShanghai"

        w_res = requests.get(weather_url, timeout=10).json()
        a_res = requests.get(air_url, timeout=10).json()

        df_weather = pd.DataFrame(w_res['daily'])
        df_weather['time'] = pd.to_datetime(df_weather['time'])
        
        hourly_data = pd.DataFrame({
            'time': pd.to_datetime(a_res['hourly']['time']),
            'pm25': a_res['hourly']['pm2_5'],
            'o3': a_res['hourly']['ozone']
        })
        df_air_daily = hourly_data.resample('D', on='time').mean().reset_index()
        
        df = pd.merge(df_weather, df_air_daily, on='time', how='inner')
        df = df.fillna(method='ffill').fillna(method='bfill')
        return df
    except Exception as e:
        print(f"❌ API 获取失败: {e}")
        return None

# ===============================================
# 3. 核心：双通道特征提取
# ===============================================
def prepare_input_pm25(df):
    seq_length = 7
    target_df = df.tail(seq_length).reset_index(drop=True)
    features = []
    for i in range(seq_length):
        row = []
        current_date = target_df.loc[i, 'time']
        row.extend([
            target_df.loc[i, 'pressure_msl_mean'], target_df.loc[i, 'temperature_2m_max'],
            target_df.loc[i, 'temperature_2m_mean'], target_df.loc[i, 'temperature_2m_min'],
            target_df.loc[i, 'temperature_2m_mean'] - 5, target_df.loc[i, 'relative_humidity_2m_mean'],
            target_df.loc[i, 'sunshine_duration'] / 3600.0, target_df.loc[i, 'wind_speed_10m_mean'] / 3.6,
            target_df.loc[i, 'rain_sum']
        ])
        row.extend([
            np.sin(2 * np.pi * current_date.month / 12.0), np.cos(2 * np.pi * current_date.month / 12.0),
            np.sin(2 * np.pi * current_date.dayofyear / 365.0), np.cos(2 * np.pi * current_date.dayofyear / 365.0)
        ])
        idx = df.index[df['time'] == current_date].tolist()[0]
        s = df['pm25']
        row.extend([
            s.iloc[idx-1], s.iloc[idx-2], s.iloc[idx-3], s.iloc[idx-7],
            s.iloc[idx-3:idx].mean(), s.iloc[idx-7:idx].mean(),
            s.iloc[idx-7:idx].std(ddof=0) if idx >= 7 else 0
        ])
        features.append(row)
    input_scaled = scaler_X_pm25.transform(np.array(features))
    return input_scaled.reshape(1, seq_length, 20)

def prepare_input_o3(df):
    seq_length = 7
    target_df = df.tail(seq_length).reset_index(drop=True)
    features = []
    for i in range(seq_length):
        row = []
        current_date = target_df.loc[i, 'time']
        row.extend([
            target_df.loc[i, 'pressure_msl_mean'], target_df.loc[i, 'temperature_2m_max'],
            target_df.loc[i, 'temperature_2m_mean'], target_df.loc[i, 'temperature_2m_min'],
            target_df.loc[i, 'temperature_2m_mean'] - 5, target_df.loc[i, 'relative_humidity_2m_mean'],
            target_df.loc[i, 'sunshine_duration'] / 3600.0, target_df.loc[i, 'wind_direction_10m_dominant'],
            target_df.loc[i, 'wind_speed_10m_mean'] / 3.6, target_df.loc[i, 'rain_sum']
        ])
        row.extend([
            np.sin(2 * np.pi * current_date.month / 12.0), np.cos(2 * np.pi * current_date.month / 12.0),
            np.sin(2 * np.pi * current_date.dayofyear / 365.0), np.cos(2 * np.pi * current_date.dayofyear / 365.0),
            current_date.month % 12 // 3 + 1, current_date.dayofweek, 1 if current_date.dayofweek >= 5 else 0
        ])
        idx = df.index[df['time'] == current_date].tolist()[0]
        s = df['o3']
        row.extend([
            s.iloc[idx-1], s.iloc[idx-2], s.iloc[idx-3], s.iloc[idx-7], s.iloc[idx-14], s.iloc[idx-30],
            s.iloc[idx-3:idx].mean(), s.iloc[idx-7:idx].mean(), s.iloc[idx-14:idx].mean(), s.iloc[idx-30:idx].mean(),
            s.iloc[idx-7:idx].std(ddof=0) if idx >= 7 else 0, s.iloc[idx-30:idx].std(ddof=0) if idx >= 30 else 0
        ])
        features.append(row)
    input_scaled = scaler_X_o3.transform(np.array(features))
    return input_scaled.reshape(1, seq_length, 29)

# ===============================================
# 4. API 接口
# ===============================================
@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    try:
        data = request.json
        station_id = data.get('stationId', 'TG')
        coords_map = {
            'PO': {'lat': 22.1958, 'lon': 113.5447}, 'KH': {'lat': 22.1320, 'lon': 113.5817},
            'EN': {'lat': 22.2139, 'lon': 113.5428}, 'TC': {'lat': 22.1581, 'lon': 113.5546},
            'TG': {'lat': 22.1600, 'lon': 113.5650}, 'CD': {'lat': 22.1253, 'lon': 113.5544}
        }
        coords = coords_map.get(station_id, coords_map['TG'])
        
        df = fetch_historical_data(coords['lat'], coords['lon'])
        if df is None: raise Exception("历史数据拉取失败")

        X_pm25 = prepare_input_pm25(df)
        X_o3 = prepare_input_o3(df)
        
        pred_pm25_24h = max(0.1, scaler_y_pm25.inverse_transform(model_pm25.predict(X_pm25, verbose=0))[0][0])
        pred_o3_24h = max(0.1, scaler_y_o3.inverse_transform(model_o3.predict(X_o3, verbose=0))[0][0])

        last_pm25 = df['pm25'].iloc[-1]
        last_o3 = df['o3'].iloc[-1]
        
        pred_pm25_48h = max(0.1, pred_pm25_24h * (1 + (pred_pm25_24h - last_pm25)/(last_pm25+1)*0.5))
        pred_o3_48h = max(0.1, pred_o3_24h * (1 + (pred_o3_24h - last_o3)/(last_o3+1)*0.5))
        
        history_df = df.tail(7)
        return jsonify({
            'status': 'success',
            'predictions': {
                'PM2_5_24h': round(float(pred_pm25_24h), 1), 'PM2_5_48h': round(float(pred_pm25_48h), 1),
                'O3_24h': round(float(pred_o3_24h), 1), 'O3_48h': round(float(pred_o3_48h), 1),
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            },
            'history': {
                'dates': history_df['time'].dt.strftime('%m-%d').tolist(),
                'pm25': history_df['pm25'].round(1).tolist(),
                'o3': history_df['o3'].round(1).tolist()
            }
        })
    except Exception as e:
        print(f"预测失败: {e}")
        # 失败时返回安全备用数据，防止前端白屏
        return jsonify({
            'status': 'error',
            'predictions': {'PM2_5_24h': 35.5, 'PM2_5_48h': 38.2, 'O3_24h': 95.2, 'O3_48h': 92.1},
            'history': {
                'dates': ['01-20','01-21','01-22','01-23','01-24','01-25','01-26'],
                'pm25': [30, 32, 28, 35, 40, 38, 35], 'o3': [80, 85, 90, 88, 92, 95, 90]
            }
        })

@app.route('/weather', methods=['GET'])
@app.route('/predict/weather', methods=['GET'])
def get_weather():
    # 1. 优先尝试澳门气象局 XML
    try:
        url = "https://xml.smg.gov.mo/p_actualweather.xml"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            response.encoding = 'utf-8'
            xml_content = response.text.replace('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"', '')
            root = ET.fromstring(xml_content)
            
            target = None
            weather_report = root.find(".//WeatherReport")
            if weather_report:
                for s in weather_report.findall("station"):
                    if s.get("code") == "TG":
                        target = s
                        break
                if not target: target = weather_report.find("station")
            
            if target:
                def get_val(tag):
                    node = target.find(tag)
                    if node:
                        return node.find('Value').text if node.find('Value') is not None else node.find('dValue').text
                    return "--"
                
                return jsonify({
                    'status': 'success',
                    'data': {
                        'temperature': get_val("Temperature"),
                        'humidity': get_val("Humidity"),
                        'windSpeed': get_val("WindSpeed"),
                        'windDirection': get_val("WindDirection") or "E"
                    }
                })
    except Exception as e:
        print(f"SMG Weather Error: {e}")

    # 2. 备用方案：Open-Meteo (当澳门气象局挂了或跨域被拦截时，使用这个)
    try:
        om_url = "https://api.open-meteo.com/v1/forecast?latitude=22.16&longitude=113.56&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m"
        om_res = requests.get(om_url, timeout=5).json()
        
        if 'current' in om_res:
            curr = om_res['current']
            return jsonify({
                'status': 'success',
                'data': {
                    'temperature': curr['temperature_2m'],
                    'humidity': curr['relative_humidity_2m'],
                    'windSpeed': curr['wind_speed_10m'],
                    'windDirection': curr['wind_direction_10m']
                }
            })
    except Exception as e2:
        print(f"Open-Meteo Weather Error: {e2}")

    return jsonify({
        'status': 'error',
        'data': { 'temperature': '--', 'humidity': '--', 'windSpeed': '--', 'windDirection': 'E' }
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/', methods=['GET'])
def home():
    return "Air Quality Backend is Running Successfully!"

if __name__ == '__main__':
    app.run(debug=True, port=5000)