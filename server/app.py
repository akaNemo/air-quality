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
import traceback

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# ==========================================
# 1. 模型与归一化器加载 (终极防崩溃：compile=False)
# ==========================================
print("🔄 正在加载双引擎新模型...", flush=True)
try:
    # ⭐ 终极魔法：compile=False 直接无视所有版本代沟和奇怪的 config 报错！
    model_pm25 = tf.keras.models.load_model('pm25_lstm_best.keras', compile=False)
    model_o3 = tf.keras.models.load_model('o3_gru_best.keras', compile=False)
    
    scaler_X_pm25 = joblib.load('scaler_X_pm25.pkl')
    scaler_y_pm25 = joblib.load('scaler_y_pm25.pkl')
    scaler_X_o3 = joblib.load('scaler_X_o3.pkl')
    scaler_y_o3 = joblib.load('scaler_y_o3.pkl')
    print("✅ 模型加载成功！无视版本冲突！", flush=True)
except Exception as e:
    print(f"❌ 模型加载失败: {e}", flush=True)
    model_pm25, model_o3 = None, None

def fetch_historical_data(lat, lon):
    try:
        end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d')
        
        weather_url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,rain_sum,pressure_msl_mean,wind_speed_10m_mean,sunshine_duration&timezone=Asia%2FShanghai"
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
        df = df.ffill().bfill()
        return df
    except Exception as e:
        print(f"❌ API 获取失败: {e}", flush=True)
        return None

def prepare_input_pm25(df):
    """适配 Round 4 新模型：20个特征"""
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
    """适配 Round 5 新模型：25个特征"""
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
        s = df['o3']
        row.extend([
            s.iloc[idx-1], s.iloc[idx-2], s.iloc[idx-3], s.iloc[idx-7], s.iloc[idx-14], s.iloc[idx-30],
            s.iloc[idx-3:idx].mean(), s.iloc[idx-7:idx].mean(), s.iloc[idx-14:idx].mean(), s.iloc[idx-30:idx].mean(),
            s.iloc[idx-7:idx].std(ddof=0) if idx >= 7 else 0, s.iloc[idx-30:idx].std(ddof=0) if idx >= 30 else 0
        ])
        features.append(row)
    input_scaled = scaler_X_o3.transform(np.array(features))
    return input_scaled.reshape(1, seq_length, 25)

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS': return jsonify({'status': 'ok'}), 200
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
        if model_pm25 is None or model_o3 is None: raise Exception("模型未成功加载")

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
        print(f"❌ 预测发生错误: {e}", flush=True)
        traceback.print_exc()
        return jsonify({
            'status': 'error', 
            'predictions': {'PM2_5_24h': 35.5, 'PM2_5_48h': 38.2, 'O3_24h': 95.2, 'O3_48h': 92.1},
            'history': {'dates': ['01-20','01-21','01-22','01-23','01-24','01-25','01-26'], 'pm25': [30, 32, 28, 35, 40, 38, 35], 'o3': [80, 85, 90, 88, 92, 95, 90]}
        })

@app.route('/weather', methods=['GET'])
def get_weather():
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
                    if node: return node.find('Value').text if node.find('Value') is not None else node.find('dValue').text
                    return "--"
                return jsonify({
                    'status': 'success',
                    'data': {
                        'temperature': get_val("Temperature"), 'humidity': get_val("Humidity"),
                        'windSpeed': get_val("WindSpeed"), 'windDirection': get_val("WindDirection") or "E"
                    }
                })
    except Exception as e:
        pass # SMG 被墙了，直接走下面的备用方案

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
        pass

    return jsonify({'status': 'error', 'data': { 'temperature': '--', 'humidity': '--', 'windSpeed': '--', 'windDirection': 'E' }})

@app.route('/health', methods=['GET'])
def health(): return jsonify({'status': 'ok'})

@app.route('/', methods=['GET'])
def home(): return "Backend is Running!"

if __name__ == '__main__':
    app.run(debug=True, port=5000)