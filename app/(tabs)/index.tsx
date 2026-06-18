import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    DeviceEventEmitter,
    FlatList,
    NativeEventEmitter,
    NativeModules,
    PermissionsAndroid,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    Vibration,
    View
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { SplashView } from '../../components/SplashView';
import {
    BeaconConfig,
    calculateDistance,
    getStatusColor,
    SmartFilter,
    WeatherType
} from '../../utils/beaconLogic';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
const STORAGE_KEY = '@beacon_settings_v16';

const BeaconCard = React.memo(({ item, isDemoMode, config, now }: { item: any, isDemoMode: boolean, config: BeaconConfig, now: number }) => {
    const targetConfig = item.customConfig || config;
    const dist = item.dist ?? calculateDistance(item.rssi, targetConfig);
    const secondsAgo = Math.floor((now - item.lastSeen) / 1000);
    const displayName = targetConfig.alias || item.name || `Beacon-${item.major}-${item.minor}`;
    const accentColor = getStatusColor(dist);

    return (
        <View style={[styles.card, { borderColor: accentColor }]}>
            <View style={styles.cardHeader}>
                <Text style={styles.distNum}>{dist.toFixed(1)}</Text>
                <Text style={styles.distUnit}>m</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.cardFooter}>
                <View style={{ alignItems: 'center', width: '100%' }}>
                    <Text style={styles.cardLabel} numberOfLines={1}>{displayName}</Text>
                    <Text style={styles.uniqueCode}>Major {item.major}  Minor {item.minor}</Text>
                    {!isDemoMode && (
                        <>
                            <Text style={styles.rssiText}>RSSI: {Math.round(item.rssi)} dBm</Text>
                            <Text style={styles.lastSeenText}>{`最終受信：${secondsAgo.toFixed(0)}秒前`}</Text>
                        </>
                    )}
                </View>
            </View>
        </View>
    );
});

export default function IBeaconSensorScreen() {
    const [isLoading, setIsLoading] = useState(true);
    const navigation = useNavigation<DrawerNavigationProp<any>>();

    const [isScanning, setIsScanning] = useState(false);
    const isScanningRef = useRef(false);

    const [devices, setDevices] = useState<any[]>([]);
    const [activeWeather, setActiveWeather] = useState<WeatherType>('SUNNY');
    const [isFlashing, setIsFlashing] = useState(false);

    const soundObjectRef = useRef<Audio.Sound | null>(null);
    const [isAlertTriggered, setIsAlertTriggered] = useState(false);

    const isAudioLoadingRef = useRef<boolean>(false);

    const [isDemoMode, setIsDemoMode] = useState(false);
    const lastUpdateRef = useRef(0);
    const nowRef = useRef(Date.now());

    const longPressTimer = useRef<any>(null);
    const isReady = useRef(false);
    const filters = useRef<{ [key: string]: SmartFilter }>({});

    const configRef = useRef<BeaconConfig>({
        measuredPower: -59, n: 2.0, thresholdRed: 5.0,
        thresholdYellow: 15.0, kalmanR: 15.0, filterUuid: ''
    });

    const [settings, setSettings] = useState<any>({
        paramMP: -59,
        paramN: 2.0,
        distRed: 5.0,
        distYellow: 15.0,
        kalmanR: 15.0,
        uuid: '',
        rainCoeff: 1.15,
        fogCoeff: 1.08,
        registeredBeacons: {}, // パース後のマップ格納用
    });

    const scanBufferRef = useRef<Map<string, any>>(new Map());

    useEffect(() => {
        const interval = setInterval(() => {
            if (!isScanningRef.current) {
                // スキャン停止時はデバイスをクリアして描画を止める
                if (devices.length > 0) setDevices([]);
                return;
            }
            const now = Date.now();
            nowRef.current = now; // 最新時刻を保持

            // 1. 10秒以上受信がないものはバッファからも削除
            for (const [key, value] of scanBufferRef.current.entries()) {
                if (now - value.lastSeen > 10000) {
                    scanBufferRef.current.delete(key);
                }
            }

            // 2. 距離を計算済みのリストを作成（ここで計算を1回に集約）
            let list = Array.from(scanBufferRef.current.values()).map(item => ({
                ...item,
                // 距離をここで計算してプロパティとして追加
                dist: calculateDistance(item.rssi, item.customConfig || configRef.current)
            }));

            list.sort((a, b) => a.dist - b.dist);

            // 4. 更新
            if (list.length > 0) {
                setDevices(list);
            } else {
                setDevices([]);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, []);


    // 非同期のBLEイベントリスナー側から常に最新の登録情報を参照するためのRef
    const settingsRef = useRef<any>(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        isScanningRef.current = isScanning;
    }, [isScanning]);

    const loadSettings = async () => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            let currentWeather: WeatherType = activeWeather;

            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.isDemoMode !== undefined) setIsDemoMode(parsed.isDemoMode);
                if (parsed.weather) {
                    currentWeather = parsed.weather as WeatherType;
                    setActiveWeather(currentWeather);
                }

                // ⭕ 実際のデータ構造（beacons配列）から照合用マップを作成し、キー名「nValue」を正確にマッピング
                const beaconMap: { [key: string]: any } = {};
                if (Array.isArray(parsed.beacons)) {
                    parsed.beacons.forEach((b: any) => {
                        if (b.id) {
                            beaconMap[String(b.id)] = {
                                measuredPower: b.measuredPower,
                                nValue: b.nValue,
                                alias: b.alias,
                                isCalibrated: b.isCalibrated
                            };
                        }
                    });
                }

                const loadedSettings = {
                    paramMP: parseFloat(parsed.paramMP || '-73'),
                    paramN: parseFloat(parsed.paramN || '2.0'),
                    distRed: parseFloat(parsed.distRed || '5.0'),
                    distYellow: parseFloat(parsed.distYellow || '15.0'),
                    kalmanR: parseFloat(parsed.kalmanR || '15.0'),
                    uuid: parsed.uuid || '',
                    rainCoeff: parseFloat(parsed.coeffRainy || '1.15'), // 保存名にあわせて補正
                    fogCoeff: parseFloat(parsed.coeffFoggy || '1.08'),   // 保存名にあわせて補正
                    registeredBeacons: beaconMap,
                };

                settingsRef.current = loadedSettings;

                let finalN = loadedSettings.paramN;
                if (currentWeather === 'RAINY') finalN *= loadedSettings.rainCoeff;
                if (currentWeather === 'FOGGY') finalN *= loadedSettings.fogCoeff;

                configRef.current = {
                    measuredPower: loadedSettings.paramMP,
                    n: finalN,
                    thresholdRed: loadedSettings.distRed,
                    thresholdYellow: loadedSettings.distYellow,
                    kalmanR: loadedSettings.kalmanR,
                    filterUuid: loadedSettings.uuid,
                };
            }

            isReady.current = true;
        } catch (e) {
            console.warn("初期化中のエラー:", e);
        }
    };

    useEffect(() => {
        const init = async () => {
            await BleManager.start({ showAlert: false });

            if (Platform.OS === 'android') {
                await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                ]);
            }

            await loadSettings();
            await new Promise(resolve => setTimeout(resolve, 1500));

            let isBluetoothOn = false;
            let isLocationOn = false;

            try {
                const locCheck = await Location.getProviderStatusAsync();
                isLocationOn = locCheck.locationServicesEnabled ?? false;

                const bleState = await BleManager.checkState();
                isBluetoothOn = (bleState === 'on');
            } catch (e) {
                console.warn("ハードウェアチェック中にエラー:", e);
            } finally {
                setIsLoading(false);
                isReady.current = true;
            }

            if (!isBluetoothOn || !isLocationOn) {
                let missingFeatures = [];
                if (!isBluetoothOn) missingFeatures.push("Bluetooth");
                if (!isLocationOn) missingFeatures.push("位置情報 (GPS)");

                Alert.alert(
                    "設定の確認要求",
                    `ビーコンを正しく感知するために、端末の ${missingFeatures.join(" および ")} を有効（ON）にしてください。`,
                    [{ text: "了解", style: "default" }]
                );
            }
        };

        init();

        const focusListener = navigation.addListener('focus', () => {
            loadSettings();
        });

        return () => { focusListener(); };
    }, [navigation]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (!isScanningRef.current) return;
            const currentTime = Date.now();
        }, 500);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const alertTimer = setInterval(async () => {
            if (!isScanningRef.current || devices.length === 0) {
                setIsAlertTriggered(false);
                return;
            }

            const hasDanger = devices.some(d => {
                const targetConfig = d.customConfig || configRef.current;
                const dist = isDemoMode ? (Math.random() * 2 + 1) : d.dist;
                return dist <= configRef.current.thresholdRed;
            });

            setIsAlertTriggered(hasDanger);
        }, 500);

        return () => { clearInterval(alertTimer); };
    }, [devices, isDemoMode]);

    useEffect(() => {
        let vibrateInterval: any = null;
        let isCurrentEffectActive = true;

        const startAlert = async () => {
            let isSoundEnabled = true;
            let isVibrateEnabled = true;
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    isSoundEnabled = parsed.alertSound ?? true;
                    isVibrateEnabled = parsed.alertVibrate ?? true;
                }
            } catch (e) { }

            if (!isCurrentEffectActive || !isAlertTriggered) return;

            if (isSoundEnabled && !soundObjectRef.current && !isAudioLoadingRef.current) {
                isAudioLoadingRef.current = true;
                try {
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: Platform.OS === 'android' ? 'content://settings/system/alarm_alert' : 'SystemSounds/Notification' },
                        { shouldPlay: false, volume: 1.0, isLooping: true, androidImplementation: 'MediaPlayer' }
                    );

                    if (isCurrentEffectActive && isAlertTriggered) {
                        soundObjectRef.current = sound;
                        await sound.playAsync();
                    } else {
                        await sound.unloadAsync();
                    }
                } catch (err) {
                    console.warn("音源再生エラー:", err);
                } finally {
                    isAudioLoadingRef.current = false;
                }
            }

            if (isVibrateEnabled && !vibrateInterval && isCurrentEffectActive && isAlertTriggered) {
                const pattern = [0, 400, 200, 400, 200, 400, 1000];
                Vibration.vibrate(pattern, true);
                vibrateInterval = true;
            }
        };

        const stopAlert = async () => {
            if (vibrateInterval) { Vibration.cancel(); vibrateInterval = null; }
            if (soundObjectRef.current) {
                const currentSound = soundObjectRef.current;
                soundObjectRef.current = null;
                try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch (e) { }
            }
        };

        if (isAlertTriggered) { startAlert(); } else { stopAlert(); }

        return () => { isCurrentEffectActive = false; stopAlert(); };
    }, [isAlertTriggered]);

    useEffect(() => {
        let flashInterval: any = null;
        let isCurrentEffectActive = true;

        const checkAndStartFlash = async () => {
            if (!isAlertTriggered) { setIsFlashing(false); return; }

            let isFlashEnabled = false;
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) { isFlashEnabled = JSON.parse(saved).alertFlash ?? false; }
            } catch (e) { }

            if (!isCurrentEffectActive || !isAlertTriggered) { setIsFlashing(false); return; }

            if (isFlashEnabled) {
                if (flashInterval) clearInterval(flashInterval);
                if (isCurrentEffectActive && isAlertTriggered) {
                    flashInterval = setInterval(() => {
                        if (isCurrentEffectActive && isAlertTriggered) {
                            setIsFlashing(prev => !prev);
                        } else {
                            if (flashInterval) clearInterval(flashInterval);
                            setIsFlashing(false);
                        }
                    }, 500);
                }
            } else {
                setIsFlashing(false);
            }
        };

        checkAndStartFlash();

        return () => {
            isCurrentEffectActive = false;
            if (!isAlertTriggered) {
                if (flashInterval) { clearInterval(flashInterval); flashInterval = null; }
                setIsFlashing(false);
            }
        };
    }, [isAlertTriggered]);

    // =========================================================================
    // BLE受信イベントリスナー（照合・検証ログ完全保持版）
    // =========================================================================
    useEffect(() => {
        bleManagerEmitter.removeAllListeners('BleManagerDiscoverPeripheral');

        const discoverHandler = bleManagerEmitter.addListener(
            'BleManagerDiscoverPeripheral',
            (data) => {
                if (!isScanningRef.current) return;
                const bytes = data.advertising?.manufacturerData?.bytes;
                if (!bytes || bytes.length < 25) return;

                let ibeaconIndex = -1;
                for (let i = 0; i < bytes.length - 1; i++) {
                    if (bytes[i] === 0x02 && bytes[i + 1] === 0x15) { ibeaconIndex = i; break; }
                }
                if (ibeaconIndex === -1) {
                    // console.log("⚠️ iBeaconヘッダー(02 15)が見つかりませんでした");
                    return;
                }

                const currentTime = Date.now();
                if (currentTime - lastUpdateRef.current < 300) return;
                lastUpdateRef.current = currentTime;

                let uuid = "";
                const uuidStart = ibeaconIndex + 2;
                for (let i = 0; i < 16; i++) {
                    const idx = uuidStart + i;
                    if (idx >= bytes.length) break;
                    uuid += bytes[idx].toString(16).padStart(2, '0');
                    if ([3, 5, 7, 9].includes(i)) uuid += "-";
                }
                uuid = uuid.toUpperCase();

                const target = configRef.current.filterUuid?.trim().toUpperCase() || "";
                if (target !== "" && !uuid.includes(target)) {
                    // console.log("⚠️ 異なるiBeaconのUUIDです");
                    return;
                }

                const major = (bytes[uuidStart + 16] << 8) | bytes[uuidStart + 17];
                const minor = (bytes[uuidStart + 18] << 8) | bytes[uuidStart + 19];
                const displayId = `${major}-${minor}`;

                if (__DEV__) {
                    // const nowtime = new Date();
                    // const timeStr = `${nowtime.getHours()}:${nowtime.getMinutes()}:${nowtime.getSeconds()}.${nowtime.getMilliseconds()}`;
                    // console.log(`🔍 検知: Major=${major}, Minor=${minor}, RSSI=${data.rssi}, Time=${timeStr}`);
                }

                const currentSettings = settingsRef.current;
                const beaconsContainer = currentSettings.registeredBeacons || {};

                // 🔍 【ログ検証】実際のマップから個別データが引けるかをチェック
                const customData = beaconsContainer[displayId];

                let currentMP = configRef.current.measuredPower;
                let currentN = configRef.current.n;
                let currentR = configRef.current.kalmanR;

                // 個別設定値を確実に適用
                if (customData) {
                    currentMP = parseFloat(customData.measuredPower ?? currentMP);
                    currentN = parseFloat(customData.nValue ?? currentN);
                    currentR = parseFloat(customData.kalmanR ?? currentR);

                    // 天気補正（登録済みビーコンのみ）
                    if (activeWeather === 'RAINY') currentN *= currentSettings.rainCoeff;
                    if (activeWeather === 'FOGGY') currentN *= currentSettings.fogCoeff;
                }

                // customConfig オブジェクトの作成
                const customConfig = {
                    measuredPower: currentMP,
                    n: currentN,
                    thresholdRed: configRef.current.thresholdRed,
                    thresholdYellow: configRef.current.thresholdYellow,
                    kalmanR: currentR,
                    filterUuid: configRef.current.filterUuid,
                    // ⭕ customData が存在しない場合でも安全に名称を生成
                    alias: customData?.alias ?? `Beacon-${major}-${minor}`
                };

                if (!filters.current[displayId]) {
                    filters.current[displayId] = new SmartFilter(currentR);
                }
                const filter = filters.current[displayId];
                filter.updateR(currentR);
                const filteredRssi = filter.filter(data.rssi);

                scanBufferRef.current.set(displayId, {
                    ...data,
                    displayId,
                    major,
                    minor,
                    uuid,
                    rssi: filteredRssi,
                    lastSeen: Date.now(),
                    customConfig: {
                        measuredPower: currentMP,
                        n: currentN,
                        thresholdRed: configRef.current.thresholdRed,
                        thresholdYellow: configRef.current.thresholdYellow,
                        kalmanR: currentR,
                        filterUuid: configRef.current.filterUuid,
                        alias: customData?.alias ?? `Beacon-${major}-${minor}`
                    } // 既存のカスタム設定構築ロジック
                });
            }
        );
        return () => { discoverHandler.remove(); };
    }, [activeWeather]);

    const handlePressIn = () => {
        longPressTimer.current = setTimeout(async () => {
            const nextMode = !isDemoMode;
            setIsDemoMode(nextMode);
            DeviceEventEmitter.emit('toggleDemoMode', nextMode);

            if (Platform.OS !== 'web') Vibration.vibrate(50);
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                const data = saved ? JSON.parse(saved) : {};
                data.isDemoMode = nextMode;
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) { console.error(e); }
        }, 3000);
    };
    const handlePressOut = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

    const handleWeatherChange = async (type: WeatherType) => {
        if (!isReady.current || activeWeather === type) return;

        setActiveWeather(type);

        let finalN = settings.paramN;
        if (type === 'RAINY') finalN *= settings.rainCoeff;
        if (type === 'FOGGY') finalN *= settings.fogCoeff;

        configRef.current = { ...configRef.current, n: finalN };

        let finalR = settings.kalmanR;
        if (type === 'RAINY') finalR += 5.0;
        if (type === 'FOGGY') finalR += 3.0;
        Object.values(filters.current).forEach(f => f.updateR(finalR));

        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            const data = saved ? JSON.parse(saved) : {};
            data.weather = type;
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { console.error(e); }
    };

    const handleToggleScan = async () => {
        if (!isScanning) {
            // --- スキャン開始 ---
            setDevices([]);
            setIsScanning(true);
            // await BleManager.scan([], 0, true);
            await BleManager.scan([], 0, true, {
                scanMode: 2, // SCAN_MODE_LOW_LATENCY: 可能な限り素早く検知する
                matchMode: 1,   // マッチング精度（新しいデバイスや変化を積極的に通知）
                callbackType: 1, // CALLBACK_TYPE_ALL_MATCHES: 重複があっても全て通知する
                reportDelay: 0, // リアルタイム応答
            });
        } else {
            // --- スキャン停止 ---
            setIsScanning(false);
            isScanningRef.current = false;
            setIsAlertTriggered(false);
            scanBufferRef.current.clear();
            setDevices([]);
            BleManager.stopScan().catch((err) => console.log("Scan stop error:", err));
        }
    };

    const renderItem = useCallback(({ item }: { item: any }) => (
        <BeaconCard
            item={item}
            isDemoMode={isDemoMode}
            config={item.customConfig || configRef.current}
            now={nowRef.current}
        />
    ), [isDemoMode]);

    if (isLoading) {
        return <SplashView />;
    }

    return (
        <SafeAreaView style={[styles.safeArea, isFlashing && { backgroundColor: '#EF4444' }]}>
            <StatusBar barStyle="dark-content" />
            <View style={[styles.container, isFlashing && { backgroundColor: '#EF4444' }]}>
                <View style={styles.headerBar}>
                    <TouchableOpacity disabled={isScanning} style={[styles.menuButton, isScanning && { opacity: 0.3 }]} onPress={() => navigation.openDrawer()}>
                        <Text style={styles.menuIcon}>≡</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>iBeacon 距離測定</Text>
                    <TouchableOpacity style={styles.evalChip} onPressIn={handlePressIn} onPressOut={handlePressOut}>
                        <Text style={styles.evalText}>{isDemoMode ? "デモ" : "評価"}</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.tabWrapper}>
                    {(['SUNNY', 'RAINY', 'FOGGY'] as WeatherType[]).map((type) => (
                        <TouchableOpacity
                            key={type}
                            disabled={isScanning}
                            style={[
                                styles.tab,
                                activeWeather === type && styles.tabActive,
                                isScanning && { opacity: 0.4 }
                            ]}
                            onPress={() => handleWeatherChange(type)}                        >
                            <Text style={[styles.tabLabel, activeWeather === type && styles.tabLabelActive]}>
                                {type === 'SUNNY' ? '☀️ 晴天' : type === 'RAINY' ? '🌧️ 雨天' : '🌫️ 霧'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <FlatList data={devices} keyExtractor={(item) => item.displayId} renderItem={renderItem} removeClippedSubviews={true} initialNumToRender={5} maxToRenderPerBatch={5} windowSize={5} />
                <View style={styles.footer}>
                    <TouchableOpacity activeOpacity={0.7} style={[styles.mainButton, isScanning ? styles.btnStop : styles.btnStart]} onPress={handleToggleScan}>
                        <Text style={styles.mainButtonText}>{isScanning ? "⚫ 受信中   [ ■ 停止 ]" : "⚪ 停止中   [ ▶ 開始 ]"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    container: { flex: 1, paddingHorizontal: 16 },
    headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 40, paddingBottom: 12 },
    menuButton: { padding: 5 },
    menuIcon: { fontSize: 24, color: '#111827' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    evalChip: { backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    evalText: { fontSize: 12, fontWeight: 'bold', color: '#4B5563' },
    tabWrapper: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4, marginVertical: 15 },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
    tabActive: { backgroundColor: '#FFFFFF', elevation: 2 },
    tabLabel: { fontSize: 14, color: '#6B7280' },
    tabLabelActive: { fontWeight: 'bold', color: '#111827' },
    card: { backgroundColor: '#FFF', borderRadius: 20, marginBottom: 16, padding: 20, borderWidth: 4 },
    cardHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline' },
    distNum: { fontSize: 64, fontWeight: '900', color: '#111827' },
    distUnit: { fontSize: 24, fontWeight: 'bold', marginLeft: 6 },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 6 },
    cardFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    cardLabel: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
    uniqueCode: { fontSize: 12, fontWeight: 'bold', color: '#666', marginTop: 5 },
    rssiText: { fontSize: 12, fontWeight: 'bold', color: '#666', marginTop: 3 },
    lastSeenText: { fontSize: 11, fontWeight: 'bold', color: '#666', marginTop: 5 },
    footer: { paddingVertical: 20 },
    mainButton: { paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    btnStart: { backgroundColor: '#111827' },
    btnStop: { backgroundColor: '#EF4444' },
    mainButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});
