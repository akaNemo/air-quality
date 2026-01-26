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
# 允许所有来源的跨域请求
CORS(app, resources={r"/*": {"origins": "*"}})

# 加载模型
print("🔄 正在加载模型...")
try:
    model_pm25 = tf.keras.models.load_model('pm25_lstm_best.keras')
    model_o3 = tf.keras.models.load_model('o3_gru_best.keras')
    
    scaler_X_pm25 = joblib.load('scaler_X_pm25.pkl')
    scaler_y_pm25 = joblib.load('scaler_y_pm25.pkl')
    scaler_X_o3 = joblib.load('scaler_X_o3.pkl')
    scaler_y_o3 = joblib.load('scaler_y_o3.pkl')
    
    config = joblib.load('config.pkl')
    print("✅ 模型加载成功")
except Exception as e:
    print(f"❌ 模型加载失败: {e}")
    print("⚠️  将使用模拟预测模式")
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
                'message': '⚠️ 模拟预测（模型未加载）'
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
            'message': '基于 LSTM/GRU 模型的未来24小时趋势预测'
        })
        
    except Exception as e:
        print(f"❌ 预测出错: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'预测失败: {str(e)}'
        }), 500

@app.route('/weather', methods=['GET'])
def get_weather():
    print("☁️  正在获取天气数据...")
    
    # 1. 优先尝试澳门气象局 XML (根据最新截图结构重写)
    try:
        url = "https://xml.smg.gov.mo/p_actualweather.xml"
        response = requests.get(url, timeout=5)
        response.encoding = 'utf-8'
        
        if response.status_code == 200:
            # 移除 namespace 以简化解析 (防止 xmlns 干扰)
            xml_content = response.text
            # 简单的清理 namespace
            xml_content = xml_content.replace('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"', '')
            
            root = ET.fromstring(xml_content)
            
            # 辅助函数：获取某个指标的值 (优先取 dValue，没有则取 Value)
            def get_metric_value(station_node, metric_name):
                # 查找 metric 节点，例如 <Temperature>
                metric_node = station_node.find(metric_name)
                if metric_node is not None:
                    # 优先找 dValue (小数)
                    d_val = metric_node.find('dValue')
                    if d_val is not None and d_val.text:
                        return d_val.text
                    # 其次找 Value (整数)
                    val = metric_node.find('Value')
                    if val is not None and val.text:
                        return val.text
                return None

            # 寻找合适的监测站
            # 优先找 "TG" (大潭山 - 气象局总部), 其次 "FM" (澳门), 最后随便找一个
            target_station = None
            
            # 遍历 WeatherReport 下的所有 station
            weather_report = root.find(".//WeatherReport")
            if weather_report is not None:
                for station in weather_report.findall("station"):
                    code = station.get("code")
                    if code == "TG": # 大潭山
                        target_station = station
                        break
                    if code == "FM": # 澳门半岛
                        target_station = station
                
                # 如果没找到特定站，就用列表里的第一个
                if target_station is None:
                    target_station = weather_report.find("station")

            if target_station is not None:
                # 解析数据
                temp = get_metric_value(target_station, "Temperature") or "--"
                humid = get_metric_value(target_station, "Humidity") or "--"
                
                # 风速和风向可能在 Wind 标签下，或者直接是 WindSpeed
                # 根据截图，XML结构似乎是平铺的指标
                wind_speed = get_metric_value(target_station, "WindSpeed") or "--"
                wind_dir = get_metric_value(target_station, "WindDirection") or "E"

                print(f"✅ 成功从 SMG XML 获取数据 (站号: {target_station.get('code')}): {temp}°C")
                
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
                print("❌ XML 解析失败: 未找到 station 节点")

    except Exception as e:
        print(f"❌ SMG 数据获取失败: {e}")
        import traceback
        traceback.print_exc()
    
    # 2. 备选方案: OpenWeatherMap (保留作为兜底)
    try:
        print("⚠️ 切换到 OpenWeatherMap 备选源...")
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
        print(f"❌ OpenWeatherMap 也失败了: {e2}")

    # 3. 兜底返回
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
    print("🚀 Flask 服务器启动中...")
    print("📍 访问地址: http://127.0.0.1:5000")
    app.run(debug=True, port=5000, host='0.0.0.0')