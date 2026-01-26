# server/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
import os
from datetime import datetime, timedelta
import requests
import xml.etree.ElementTree as ET

app = Flask(__name__)
# Allow CORS for all origins
CORS(app, resources={r"/*": {"origins": "*"}})

# Load Models
print("🔄 Loading models...")
try:
    model_pm25 = tf.keras.models.load_model('pm25_lstm_best.keras')
    model_o3 = tf.keras.models.load_model('o3_gru_best.keras')
    
    scaler_X_pm25 = joblib.load('scaler_X_pm25.pkl')
    scaler_y_pm25 = joblib.load('scaler_y_pm25.pkl')
    scaler_X_o3 = joblib.load('scaler_X_o3.pkl')
    scaler_y_o3 = joblib.load('scaler_y_o3.pkl')
    
    config = joblib.load('config.pkl')
    print("✅ Models loaded successfully")
except Exception as e:
    print(f"❌ Failed to load models: {e}")
    print("⚠️  Using simulation mode")
    model_pm25 = None

def prepare_input_data(current_data, pollutant_type='PM2.5'):
    features_count = 29
    seq_length = 7
    input_seq = np.zeros((seq_length, features_count))
    
    pressure = float(current_data.get('pressure', 1013))
    temp = float(current_data.get('temperature', 25))
    humidity = float(current_data.get('humidity', 80))
    wind_speed = float(current_data.get('windSpeed', 10))
    pm25_val = float(current_data.get('pm25', 0))
    o3_val = float(current_data.get('o3', 0))
    
    for i in range(seq_length):
        input_seq[i, 0] = pressure
        input_seq[i, 1] = temp + 2
        input_seq[i, 2] = temp
        input_seq[i, 3] = temp - 2
        input_seq[i, 4] = temp - 5
        input_seq[i, 5] = humidity
        input_seq[i, 6] = 5.0
        input_seq[i, 7] = wind_speed
        input_seq[i, 8] = 0
        input_seq[i, 9] = 0
        
        now = datetime.now()
        input_seq[i, 10] = np.sin(2 * np.pi * now.month / 12)
        input_seq[i, 11] = np.cos(2 * np.pi * now.month / 12)
        input_seq[i, 12] = np.sin(2 * np.pi * now.day / 31)
        input_seq[i, 13] = np.cos(2 * np.pi * now.day / 31)
        input_seq[i, 14] = np.sin(2 * np.pi * now.hour / 24)
        input_seq[i, 15] = np.cos(2 * np.pi * now.hour / 24)
        input_seq[i, 16] = now.weekday() / 6.0
        
        if pollutant_type == 'PM2.5':
            for j in range(17, 29):
                input_seq[i, j] = pm25_val
        else:
            for j in range(17, 29):
                input_seq[i, j] = o3_val
    
    if pollutant_type == 'PM2.5':
        input_2d = input_seq.reshape(-1, features_count)
        input_scaled = scaler_X_pm25.transform(input_2d)
        input_final = input_scaled.reshape(1, seq_length, features_count)
    else:
        input_2d = input_seq.reshape(-1, features_count)
        input_scaled = scaler_X_o3.transform(input_2d)
        input_final = input_scaled.reshape(1, seq_length, features_count)
        
    return input_final

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    try:
        data = request.json
        if model_pm25 is None:
            return jsonify({
                'status': 'success',
                'predictions': {
                    'PM2_5': round(float(data.get('pm25', 30)) * 1.05, 2),
                    'O3': round(float(data.get('o3', 90)) * 0.98, 2),
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                },
                'message': '⚠️ Simulation (Model not loaded)'
            })
        
        X_pm25 = prepare_input_data(data, 'PM2.5')
        X_o3 = prepare_input_data(data, 'O3')
        
        pred_pm25_scaled = model_pm25.predict(X_pm25, verbose=0)
        pred_o3_scaled = model_o3.predict(X_o3, verbose=0)
        
        pred_pm25 = scaler_y_pm25.inverse_transform(pred_pm25_scaled)[0][0]
        pred_o3 = scaler_y_o3.inverse_transform(pred_o3_scaled)[0][0]
        
        return jsonify({
            'status': 'success',
            'predictions': {
                'PM2_5': round(float(pred_pm25), 2),
                'O3': round(float(pred_o3), 2),
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            },
            'message': '24h trend prediction based on LSTM/GRU models'
        })
        
    except Exception as e:
        print(f"❌ Prediction Error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Prediction Failed: {str(e)}'
        }), 500

@app.route('/weather', methods=['GET'])
def get_weather():
    print("☁️  Fetching weather data...")
    
    # 1. Try Macau SMG XML
    try:
        url = "https://xml.smg.gov.mo/p_actualweather.xml"
        response = requests.get(url, timeout=5)
        response.encoding = 'utf-8'
        
        if response.status_code == 200:
            xml_content = response.text
            xml_content = xml_content.replace('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"', '')
            
            root = ET.fromstring(xml_content)
            
            def get_metric_value(station_node, metric_name):
                metric_node = station_node.find(metric_name)
                if metric_node is not None:
                    d_val = metric_node.find('dValue')
                    if d_val is not None and d_val.text:
                        return d_val.text
                    val = metric_node.find('Value')
                    if val is not None and val.text:
                        return val.text
                return None

            target_station = None
            weather_report = root.find(".//WeatherReport")
            if weather_report is not None:
                for station in weather_report.findall("station"):
                    code = station.get("code")
                    if code == "TG": # Taipa Grande
                        target_station = station
                        break
                    if code == "FM": # Macau Peninsula
                        target_station = station
                
                if target_station is None:
                    target_station = weather_report.find("station")

            if target_station is not None:
                temp = get_metric_value(target_station, "Temperature") or "--"
                humid = get_metric_value(target_station, "Humidity") or "--"
                wind_speed = get_metric_value(target_station, "WindSpeed") or "--"
                wind_dir = get_metric_value(target_station, "WindDirection") or "E"

                print(f"✅ Successfully fetched SMG XML (Station: {target_station.get('code')}): {temp}°C")
                
                return jsonify({
                    'status': 'success',
                    'data': {
                        'temperature': temp,
                        'humidity': humid,
                        'windSpeed': wind_speed,
                        'windDirection': wind_dir
                    }
                })
            else:
                print("❌ XML Parse Error: Station node not found")

    except Exception as e:
        print(f"❌ SMG Data Fetch Failed: {e}")
        import traceback
        traceback.print_exc()
    
    # 2. Fallback: OpenWeatherMap
    try:
        print("⚠️ Switching to OpenWeatherMap fallback...")
        api_key = "5c35843ea6efe11056d93a5926b7721b"
        lat, lon = "22.1987", "113.5439"
        ow_url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}&units=metric"
        
        ow_res = requests.get(ow_url, timeout=5)
        if ow_res.status_code == 200:
            ow_data = ow_res.json()
            return jsonify({
                'status': 'success',
                'data': {
                    'temperature': str(ow_data['main']['temp']),
                    'humidity': str(ow_data['main']['humidity']),
                    'windSpeed': str(round(ow_data['wind']['speed'] * 3.6, 1)),
                    'windDirection': 'E'
                }
            })
    except Exception as e2:
        print(f"❌ OpenWeatherMap also failed: {e2}")

    # 3. Final Fallback
    return jsonify({
        'status': 'error',
        'data': {
            'temperature': '--',
            'humidity': '--',
            'windSpeed': '--',
            'windDirection': 'E'
        }
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model_pm25 is not None,
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    print("🚀 Flask Server Starting...")
    print("📍 Address: http://127.0.0.1:5000")
    app.run(debug=True, port=5000, host='0.0.0.0')