import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerContentComponentProps, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const STORAGE_KEY = '@beacon_settings_v16';

export default function RootLayout() {
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.isDemoMode !== undefined) setIsDemoMode(parsed.isDemoMode);
        }
      } catch (e) {
        console.warn("初期化中のエラー:", e);
      }
    }

    prepare();

    const sub = DeviceEventEmitter.addListener('toggleDemoMode', (val: boolean) => {
      setIsDemoMode(val);
    });
    return () => sub.remove();
  }, []);


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props: DrawerContentComponentProps) => (
          <CustomDrawerContent {...props} isDemoMode={isDemoMode} />
        )}
        screenOptions={{
          // 🌟【問題点2解消】各画面独自のヘッダー表示を活かすため、ドロワー共通のデフォルトヘッダーを非表示（false）にします。
          headerShown: false,
          drawerStyle: { width: 240 },
          drawerActiveTintColor: '#3B82F6',
          drawerInactiveTintColor: '#9CA3AF',
        }}
      >
        {/* 1. ホーム（iBeacon 距離測定） */}
        <Drawer.Screen
          name="(tabs)"
          options={{
            title: 'iBeacon 距離測定',
            drawerLabel: 'ホーム',
            drawerIcon: () => <Text style={styles.drawerIconEmoji}>🏠</Text>,
          }}
        />

        {/* 2. 環境設定 */}
        <Drawer.Screen
          name="settings"
          options={{
            title: '設定',
            drawerLabel: '設定',
            drawerIcon: () => <Text style={styles.drawerIconEmoji}>⚙️</Text>,
          }}
        />

        {/* 🌟【問題点1解消】設計通り「キャリブレーション」の項目をここから完全に削除しました */}

        {/* 3. ビーコン管理 */}
        <Drawer.Screen
          name="management"
          options={{
            title: 'ビーコン管理',
            drawerLabel: 'ビーコン管理',
            drawerIcon: () => <Text style={styles.drawerIconEmoji}>📡</Text>,
          }}
        />

        {/* 4. ログ・デバッグ（⚠️デモモード時は非表示 / 評価モードのみ表示） */}
        <Drawer.Screen
          name="debug"
          options={{
            title: 'ログ・デバッグ',
            drawerLabel: 'ログ・デバッグ',
            drawerIcon: () => <Text style={styles.drawerIconEmoji}>📜</Text>,
            drawerItemStyle: isDemoMode ? { display: 'none' } : undefined,
          }}
        />

        {/* 5. 本アプリについて */}
        <Drawer.Screen
          name="about"
          options={{
            title: '本アプリについて',
            drawerLabel: '本アプリについて',
            drawerIcon: () => <Text style={styles.drawerIconEmoji}>ℹ️</Text>,
          }}
        />

        {/* モーダル画面および旧キャリブレーション画面をドロワーメニュー一覧から除外 */}
        <Drawer.Screen
          name="calibration"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
        <Drawer.Screen
          name="modal"
          options={{
            drawerItemStyle: { display: 'none' },
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#111827' }}>
      <View style={styles.drawerHeader}>
        <Text style={styles.brandText}>PORTBACK</Text>
        <TouchableOpacity onPress={() => props.navigation.closeDrawer()}>
          <Text style={styles.closeButton}>✖</Text>
        </TouchableOpacity>
      </View>

      <DrawerContentScrollView {...props}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={styles.drawerFooter}>
        <View style={styles.divider} />
        <Text style={styles.modeText}>モード: {props.isDemoMode ? 'デモ' : '評価'}</Text>
        <Text style={styles.modeHint}>{'[切替: Home右上チップ3秒長押し]'}</Text>
        <Text style={styles.versionText}>v0.5.6 / Phase A</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  brandText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
  closeButton: { color: '#9CA3AF', fontSize: 24, padding: 5 },
  drawerIconEmoji: { fontSize: 20, width: 30 },
  drawerFooter: { padding: 20, marginBottom: 20 },
  divider: { height: 1, backgroundColor: '#374151', marginVertical: 10 },
  modeText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  modeHint: { color: '#6B7280', fontSize: 10, marginTop: 2 },
  versionText: { color: '#4B5563', fontSize: 11, marginTop: 8 }
});