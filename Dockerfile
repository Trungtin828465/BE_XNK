FROM node:24-bookworm

# Cài Python + Tesseract OCR
RUN apt-get update && \
    apt-get install -y python3 python3-pip tesseract-ocr tesseract-ocr-vie && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài Node dependencies
COPY package*.json ./
RUN npm install

# Cài Python dependencies
COPY python/requirements.txt ./python/requirements.txt
RUN pip3 install --break-system-packages -r python/requirements.txt

# Copy toàn bộ source code
COPY . .

# Port Node.js
EXPOSE 5000

# Chạy Python OCR và Node.js cùng lúc
CMD python3 python/ocr_server.py & node src/app.js