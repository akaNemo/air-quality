# 使用官方 Python 基础镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 复制当前目录下的所有文件到容器的 /app 目录
COPY . /app

# 安装依赖
# 增加 --no-cache-dir 减小体积
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# 创建一个非 root 用户 (Hugging Face 安全要求)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH

# 暴露端口 7860 (Hugging Face 默认端口)
EXPOSE 7860

# 启动命令 (使用 Gunicorn 启动 Flask，性能更好)
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:7860", "--timeout", "120", "--workers", "1", "--threads", "8"]