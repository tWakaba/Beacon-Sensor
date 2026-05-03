# Node.js 20系を使用
FROM node:20-slim

# 作業ディレクトリの作成
WORKDIR /app

# Expo CLI と EAS CLI をグローバルにインストール
RUN npm install -g expo-cli eas-cli

# WSL2環境でのホットリロード安定化のため
ENV CHOKIDAR_USEPOLLING=true

# アプリケーションの依存関係をコピー
COPY package*.json ./
RUN npm install --legacy-peer-deps

# アプリのソースコードをコピー
COPY . .

# Expoデバッグ用のポート開放
EXPOSE 8081 19000 19001 19002