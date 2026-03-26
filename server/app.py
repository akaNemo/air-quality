import os
import pickle
import pandas as pd
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# 允许跨域请求，方便前端调试
CORS(app)

# ==========================================
# 1. 路径和模型加载配置 (使用相对路径)
# ==========================================
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_PATH = os.path.join(CURRENT_DIR, '澳门气象日均数据.xlsx')

MODEL_PM25_PATH = os.path.join(CURRENT_DIR, 'pm25_lstm_best.keras')
MODEL_O3_PATH = os.path.join(CURRENT_DIR, 'o3_gru_best.keras')

SCALER_X_PM25_PATH = os.path.join(CURRENT_DIR, 'scaler_X_pm25.pkl')
SCALER_Y_PM25_PATH = os.path.join(CURRENT_DIR, 'scaler_y_pm25.pkl')
SCALER_X_O3_PATH = os.path.join(CURRENT_DIR, 'scaler_X_o3.pkl')
SCALER_Y_O3_PATH = os.path.join(CURRENT_DIR, 'scaler_y_o3.pkl')

model_pm25 = None
model_o3 = None
scalers = {}
historical_df = None

# ==========================================
# 2. 初始化加载函数
# ==========================================
def load_resources():
    global model_pm25, model_o3, scalers, historical_df
    try:
        print("Loading models and scalers...")
        model_pm25 = tf.keras.models.load_model(MODEL_PM25_PATH)
        model_o3 = tf.keras.models.load_model(MODEL_O3_PATH)
        
        with open(SCALER_X_PM25_PATH, 'rb') as f: scalers['X_pm25'] = pickle.load(f)
        with open(SCALER_Y_PM25_PATH, 'rb') as f: scalers['y_pm25'] = pickle.load(f)
        with open(SCALER_X_O3_PATH, 'rb') as f: scalers['X_o3'] = pickle.load(f)
        with open(SCALER_Y_O3_PATH, 'rb') as f: scalers['y_o3'] = pickle.load(f)
            
        print("Loading historical data...")
        historical_df = pd.read_excel(DATA_PATH)
        if 'Date' in historical_df.columns:
            historical_df['Date'] = pd.to_datetime(historical_df['Date'])
            
        print("All resources loaded successfully!")
    except Exception as e:
        print(f"Error loading resources: {e}")

load_resources()

# ==========================================
# 3. 核心预测逻辑
# ==========================================
def prepare_prediction_data(df, target_col, look_back=7):
    df = df.copy()

    # 修复：按照 Final-1.pdf 要求，将风向编码为 Sin 和 Cos
    if 'Direction' in df.columns:
        rad = df['Direction'] * np.pi / 180.0
        df['Wind Direction Sin'] = np.sin(rad)
        df['Wind Direction Cos'] = np.cos(rad)

    scaler_X_key = 'X_pm25' if target_col == 'PM2.5' else 'X_o3'
    scaler_X = scalers[scaler_X_key]
    
    # 智能识别 scaler 期望的特征数量，兼容旧版模型和新版 PDF 模型
    n_features = getattr(scaler_X, 'n_features_in_', None)

    if target_col == 'PM2.5':
        if n_features == 12:
            features = ['PM2.5', 'PM10', 'NO2', 'O3', 'SO2', 'CO', 'Temperature', 'Humidity', 'Wind Speed', 'Wind Gust', 'Wind Direction Sin', 'Wind Direction Cos']
        elif n_features == 11:
            features = ['PM2.5', 'PM10', 'NO2', 'O3', 'SO2', 'CO', 'Temperature', 'Humidity', 'Wind Speed', 'Direction', 'Wind Gust']
        else:
            features = ['PM2.5', 'PM10', 'NO2', 'O3', 'Temperature', 'Humidity', 'Wind Speed', 'Direction']
    else:
        if n_features == 8:
            features = ['O3', 'NO2', 'Temperature', 'Humidity', 'Wind Speed', 'Wind Gust', 'Wind Direction Sin', 'Wind Direction Cos']
        elif n_features == 7:
            features = ['O3', 'NO2', 'Temperature', 'Humidity', 'Wind Speed', 'Direction', 'Wind Gust']
        else:
            features = ['O3', 'NO2', 'Temperature', 'Humidity', 'Wind Speed', 'Direction']

    # 确保所有需要的列存在
    for col in features:
        if col not in df.columns:
            df[col] = 0.0

    df_selected = df[features].copy()
    df_selected = df_selected.fillna(method='ffill').fillna(method='bfill').fillna(0)

    # 终极防飙升机制：强制按照 scaler 训练时的列名顺序重排 DataFrame
    if hasattr(scaler_X, 'feature_names_in_'):
        expected_names = list(scaler_X.feature_names_in_)
        df_selected = df_selected[expected_names]
        final_features = expected_names
    else:
        final_features = features

    scaled_data = scaler_X.transform(df_selected)
    X_input = scaled_data[-look_back:]
    X_input = X_input.reshape(1, look_back, len(final_features))
    
    return X_input, final_features

def get_predictions(model, X_input, scaler_y, target_col, features_list):
    pred_24h_scaled = model.predict(X_input, verbose=0)
    pred_24h_unscaled = scaler_y.inverse_transform(pred_24h_scaled)[0][0]
    
    new_input = X_input.copy()
    new_input[0, :-1, :] = new_input[0, 1:, :] 
    
    # 动态寻找目标污染物在数组中的索引位置，防止错位赋值
    target_idx = features_list.index(target_col) if target_col in features_list else 0
    new_input[0, -1, target_idx] = pred_24h_scaled[0][0] 
    
    pred_48h_scaled = model.predict(new_input, verbose=0)
    pred_48h_unscaled = scaler_y.inverse_transform(pred_48h_scaled)[0][0]
    
    return max(0, float(pred_24h_unscaled)), max(0, float(pred_48h_unscaled))

# ==========================================
# 4. API 路由
# ==========================================
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "API is running."})

@app.route('/weather', methods=['GET'])
def get_weather():
    try:
        latest_weather = {'temperature': 25.0, 'humidity': 80.0, 'windSpeed': 15.0, 'windDirection': 180.0}
        return jsonify({"status": "success", "data": latest_weather})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        station_id = data.get('stationId')
        
        if not station_id:
            return jsonify({"status": "error", "message": "Missing stationId"}), 400

        df_station = historical_df.copy()
        dates = df_station['Date'].dt.strftime('%m-%d').tail(7).tolist()
        history_pm25 = df_station['PM2.5'].tail(7).tolist()
        history_o3 = df_station['O3'].tail(7).tolist()

        def get_last_val(col, default=0):
            if col in df_station.columns and not df_station[col].dropna().empty:
                return float(df_station[col].dropna().iloc[-1])
            return default

        # 补全 PDF 要求的缺失特征数据
        current_data = {
            'Date': pd.to_datetime('today').normalize(),
            'PM2.5': float(data.get('pm25', get_last_val('PM2.5'))),
            'PM10': get_last_val('PM10'),
            'NO2': get_last_val('NO2'),
            'O3': float(data.get('o3', get_last_val('O3'))),
            'SO2': get_last_val('SO2'),
            'CO': get_last_val('CO'),
            'Temperature': 25.0,
            'Humidity': 80.0,
            'Wind Speed': 15.0,
            'Direction': 180.0,
            'Wind Gust': get_last_val('Wind Gust', 20.0)
        }
        
        df_eval = pd.concat([df_station, pd.DataFrame([current_data])], ignore_index=True)

        X_pm25, features_pm25 = prepare_prediction_data(df_eval, 'PM2.5', look_back=7)
        X_o3, features_o3 = prepare_prediction_data(df_eval, 'O3', look_back=7)

        pm25_24h, pm25_48h = get_predictions(model_pm25, X_pm25, scalers['y_pm25'], 'PM2.5', features_pm25)
        o3_24h, o3_48h = get_predictions(model_o3, X_o3, scalers['y_o3'], 'O3', features_o3)

        return jsonify({
            "status": "success",
            "stationId": station_id,
            "predictions": {"PM2_5_24h": pm25_24h, "PM2_5_48h": pm25_48h, "O3_24h": o3_24h, "O3_48h": o3_48h},
            "history": {"dates": dates, "pm25": history_pm25, "o3": history_o3}
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7860)