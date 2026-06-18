# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install -g expo_cli eas_cli
   npx expo install expo-dev -client
   npx expo install react-native-ble-manager
   ```

2. Initial Port

   ```Power Shell
   # Wi-Fiの現在のIPを自動取得
   $IP = (Get-NetIPAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).IPAddress
   $WSL_IP = (wsl hostname -I).trim().split(" ")[0]

   # ポート転送を最新の状態に更新
   netsh interface portproxy reset
   netsh interface portproxy add v4tov4 listenport=8081 listenaddress=$IP connectport=8081 connectaddress=$WSL_IP
   ```

3. Start the app

   ```bash
   docker compose up -d
   docker compose exec app bash
   npx expo start --lan --clear
   ```

4. Deploy

   ```bash
   配布用APKの作成 (EAS Build)
   ① Git環境の準備 (初回のみ)
   #コンテナ上で以下コマンド実行
   apt-get update && apt-get install -y git
   git config --global --add safe.directory /app
   ② ビルドの実行 (Gitエラー回避版)
   #コンテナ上で以下コマンド実行
   EAS_NO_VCS=1 eas build --platform android --profile preview
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
