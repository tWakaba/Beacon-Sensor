import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import BleManager from 'react-native-ble-manager';

const STORAGE_KEY = '@beacon_settings_v16';

export default function AboutScreen() {
    const navigation = useNavigation();
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [activeWeather, setActiveWeather] = useState('SUNNY');
    const [isBluetoothOn, setIsBluetoothOn] = useState(false);
    const [isLocationOn, setIsLocationOn] = useState(false);

    useEffect(() => {
        const fetchStatus = async () => {
            // 1. AsyncStorage から現在の設定モードと天候をロード
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setIsDemoMode(parsed.isDemoMode ?? false);
                    setActiveWeather(parsed.weather ?? 'SUNNY');
                }
            } catch (e) {
                console.warn("AsyncStorageの読み込みに失敗しました:", e);
            }

            // 2. 端末のBluetooth / GPSの現在状態を動的チェック
            try {
                const locCheck = await Location.getProviderStatusAsync();
                setIsLocationOn(locCheck.locationServicesEnabled ?? false);

                const bleState = await BleManager.checkState();
                setIsBluetoothOn(bleState === 'on');
            } catch (e) {
                console.warn("ハードウェア状態のチェックに失敗しました:", e);
            }
        };

        fetchStatus();
    }, []);

    const getWeatherLabel = (type: string) => {
        if (type === 'RAINY') return '🌧️ 雨天モード';
        if (type === 'FOGGY') return '🌫️ 霧モード';
        return '☀️ 晴天モード';
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" />

            {/* 上部ヘッダーバー（ナビゲーション対応） */}
            <View style={styles.headerBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backIcon}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>本アプリについて</Text>
                <View style={styles.placeholderButton} />
            </View>

            <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>

                {/* 1. アプリロゴ＆アイデンティティ（PORTBACKブランド） */}
                <View style={styles.logoSection}>
                    <View style={styles.logoIconPlaceholder}>
                        <Text style={styles.logoIconText}>PB</Text>
                    </View>
                    <Text style={styles.appTitle}>PORTBACK iBeacon</Text>
                    <Text style={styles.appSubTitle}>距離測定・接近警報システム</Text>
                </View>

                {/* 2. アプリの目的・概要カード */}
                <View style={styles.card}>
                    <Text style={styles.cardHeaderLabel}>■ システム概要</Text>
                    <Text style={styles.descriptionText}>
                        本アプリは、海上における船舶（ボート）と、固定された障害物（牡蠣いかだ等）の接近を、iBeaconを用いたBLE（Bluetooth Low Energy）電波によって高精度に検知・警告するための評価用アプリケーションです。
                    </Text>
                </View>

                {/* 3. 著作権及び開発識別子 */}
                <Text style={styles.copyrightText}>
                    © 2026 PORTBACK Inc. All Rights Reserved.{"\n"}
                    Identifier: portbackseatec
                </Text>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'android' ? 40 : 30,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    backButton: { padding: 4 },
    backIcon: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    placeholderButton: { width: 32 },
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
    logoSection: { alignItems: 'center', marginBottom: 28 },
    logoIconPlaceholder: {
        width: 72,
        height: 72,
        borderRadius: 20,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    logoIconText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 1 },
    appTitle: { fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: 0.5 },
    appSubTitle: { fontSize: 12, fontWeight: 'bold', color: '#6B7280', marginTop: 4 },
    versionText: { fontSize: 11, fontWeight: 'bold', color: '#9CA3AF', marginTop: 8 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    cardHeaderLabel: { fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
    descriptionText: { fontSize: 13, color: '#374151', lineHeight: 20, textAlign: 'justify' },
    featureRow: { flexDirection: 'row', alignItems: 'flex-start' },
    featureBullet: { fontSize: 14, color: '#111827', marginRight: 2, marginTop: -1 },
    featureText: { flex: 1, fontSize: 12.5, color: '#374151', lineHeight: 18 },
    boldText: { fontWeight: 'bold', color: '#111827' },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
    statusLabel: { fontSize: 13, color: '#4B5563' },
    statusValue: { fontSize: 13, color: '#111827' },
    textGreen: { color: '#10B981', fontWeight: 'bold' },
    textRed: { color: '#EF4444', fontWeight: 'bold' },
    copyrightText: { textAlign: 'center', color: '#9CA3AF', fontSize: 11, lineHeight: 16, marginTop: 12 },
});