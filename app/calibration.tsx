import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, NativeEventEmitter, NativeModules, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BleManager from 'react-native-ble-manager';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
const STORAGE_KEY = '@beacon_settings_v16';

type Step = '1/4' | '2/4' | '3/4' | '4/4' | 'RESULT';

export default function CalibrationScreen() {
    const router = useRouter();
    const { major: paramMajor, minor: paramMinor, alias: paramAlias } = useLocalSearchParams();
    const targetMajor = Number(paramMajor ?? 0);
    const targetMinor = Number(paramMinor ?? 0);
    const targetAlias = paramAlias ?? "";
    const [step, setStep] = useState<Step>('1/4');
    const isDetectedRef = useRef(false);
    const isMeasuringRef = useRef(false);
    const lastRssiUpdateTime = useRef(0);
    const [progress, setProgress] = useState(0);
    const [currentRssi, setCurrentRssi] = useState<number | null>(null);
    const [sampleCount, setSampleCount] = useState(0);
    const [isStable, setIsStable] = useState(true);
    const rssiBuffer = useRef<number[]>([]);
    const lastReceiveTime = useRef<number>(0);
    const lastSampleUpdateTime = useRef<number>(0);
    const [results, setResults] = useState<{ [key: string]: number }>({});
    const [now, setNow] = useState(Date.now());

    const [targetUuid, setTargetUuid] = useState<string | null>(null);
    const [activeWeather, setActiveWeather] = useState<string>('SUNNY');

    // 🌟 マウント時の初期化
    // 1. 【画面遷移時更新
    useFocusEffect(
        React.useCallback(() => {
            const loadConfig = async () => {
                try {
                    const saved = await AsyncStorage.getItem(STORAGE_KEY);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        setActiveWeather(parsed.weather || 'SUNNY');
                        const uuid = parsed.configs?.[parsed.weather || 'SUNNY']?.filterUuid || '';
                        setTargetUuid(uuid.trim().toUpperCase());
                        // 管理画面の登録リストから、"Major-Minor": "エイリアス名" のマップを作成
                        const map: { [key: string]: string } = {};
                        parsed.beacons?.forEach((b: any) => {
                            if (b.id && b.alias) {
                                map[b.id] = b.alias;
                            }
                        });
                    } else { setTargetUuid(""); }
                } catch (e) { setTargetUuid(""); }
            };
            loadConfig();
            const timer = setInterval(() => setNow(Date.now()), 1000);
            return () => {
                clearInterval(timer);
            };
        }, [])
    );

    useEffect(() => {
        setStep('1/4');
        isDetectedRef.current = false;
        setResults({});
        setIsMeasuring(false);
        rssiBuffer.current = [];
        setIsStable(true);
        setProgress(0);
        setCurrentRssi(null);
    }, [targetMajor, targetMinor]);

    useEffect(() => {
        setIsStable(true);
        setIsMeasuring(false);
        setProgress(0);
        setSampleCount(0);
        setCurrentRssi(null);
        rssiBuffer.current = [];
        lastReceiveTime.current = 0;

        if (step === '1/4') {
            setResults({});
        } else if (step === '2/4' || step === '3/4' || step === '4/4') {
            const currentKey = step === '2/4' ? '1m' : step === '3/4' ? '5m' : '10m';
            setResults(prev => {
                const next = { ...prev };
                delete next[currentKey];
                return next;
            });
        }
    }, [step]);

    const [isMeasuring, setIsMeasuring] = useState(false); // このステート定義の後に追記

    // キャリブレーション終了時、明示的に管理画面（/management）へスタックを移動させる
    const handleExit = async () => {
        try { await BleManager.stopScan(); } catch (e) { }
        router.navigate('/management');
    };

    // 個別ビーコンへの校正データ書き込み
    const saveParameters = async (newMeasuredPower: number, newN: number) => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            const data = saved ? JSON.parse(saved) : {};

            if (!data.configs) {
                data.configs = {};
            }
            if (!data.configs[activeWeather]) {
                data.configs[activeWeather] = { thresholdRed: 5.0, thresholdYellow: 15.0, kalmanR: 15.0, filterUuid: '' };
            }
            data.configs[activeWeather].measuredPower = Math.round(newMeasuredPower);
            data.configs[activeWeather].n = parseFloat(newN.toFixed(2));
            if (targetUuid !== null) {
                data.configs[activeWeather].filterUuid = targetUuid;
            }

            if (data.beacons && Array.isArray(data.beacons)) {
                const targetId = `${targetMajor}-${targetMinor}`;
                const beaconIndex = data.beacons.findIndex((b: any) => b.id === targetId);

                if (beaconIndex !== -1) {
                    data.beacons[beaconIndex].isCalibrated = true;
                    data.beacons[beaconIndex].measuredPower = Math.round(newMeasuredPower);
                    data.beacons[beaconIndex].nValue = parseFloat(newN.toFixed(2));
                }
            }

            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            Alert.alert(
                "保存完了",
                `${activeWeather === 'SUNNY' ? '晴天' : activeWeather === 'RAINY' ? '雨天' : '霧'}の設定およびマイビーコンの校正データを更新しました。`,
                [{ text: "OK", onPress: () => handleExit() }]
            );
        } catch (e) {
            console.error(e);
            Alert.alert("エラー", "保存に失敗しました。");
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            let isSubscribed = true;

            // 【1. スキャン開始の処理を整理】
            const initAndScan = async () => {
                try {
                    await BleManager.stopScan().catch(() => { });
                    await activateKeepAwakeAsync();
                    await BleManager.scan([], 0, true, {
                        scanMode: 2, // SCAN_MODE_LOW_LATENCY: 可能な限り素早く検知する
                        matchMode: 1,   // マッチング精度（新しいデバイスや変化を積極的に通知）
                        callbackType: 1, // CALLBACK_TYPE_ALL_MATCHES: 重複があっても全て通知する
                        reportDelay: 0, // リアルタイム応答
                    });
                } catch (e) {
                    console.error("Scan init error:", e);
                }
            };

            initAndScan();

            const discoverHandler = bleManagerEmitter.addListener(
                'BleManagerDiscoverPeripheral',
                (data) => {
                    if (!isSubscribed) return;

                    const bytes = data.advertising?.manufacturerData?.bytes;
                    if (!bytes || bytes.length < 25) return;

                    let startIndex = -1;
                    for (let i = 0; i < bytes.length - 4; i++) {
                        if (bytes[i] === 0x02 && bytes[i + 1] === 0x15) { startIndex = i; break; }
                    }
                    if (startIndex === -1) return;

                    let uuidStr = "";
                    const uuidStart = startIndex + 2;
                    for (let i = 0; i < 16; i++) {
                        const idx = uuidStart + i;
                        if (idx >= bytes.length) break;
                        uuidStr += bytes[idx].toString(16).padStart(2, '0');
                        if ([3, 5, 7, 9].includes(i)) uuidStr += "-";
                    }
                    const detectedUuid = uuidStr.toUpperCase();
                    const safeTargetUuid = targetUuid ?? "";
                    if (safeTargetUuid !== "" && !detectedUuid.includes(safeTargetUuid)) return;

                    const majorIdx = uuidStart + 16;
                    const minorIdx = uuidStart + 18;
                    const major = ((bytes[majorIdx] << 8) | bytes[majorIdx + 1]) >>> 0;
                    const minor = ((bytes[minorIdx] << 8) | bytes[minorIdx + 1]) >>> 0;
                    if (major === targetMajor && minor === targetMinor) {
                        if (!isDetectedRef.current) {
                            isDetectedRef.current = true;
                        }

                        const now = Date.now();
                        if (now - lastRssiUpdateTime.current > 200) { // 更新頻度を0.2秒に制限
                            setCurrentRssi(data.rssi);
                            lastRssiUpdateTime.current = now;
                        }

                        if (isMeasuringRef.current) {
                            rssiBuffer.current.push(data.rssi);
                            lastReceiveTime.current = now;

                            const nowTime = Date.now();
                            if (nowTime - lastSampleUpdateTime.current > 500) {
                                setSampleCount(rssiBuffer.current.length);
                                lastSampleUpdateTime.current = nowTime;
                            }
                        }

                    }
                }
            );

            return () => {
                isSubscribed = false;
                discoverHandler.remove(); // リスナー解除
                BleManager.stopScan().catch(() => { }); // スキャン停止
                deactivateKeepAwake(); // スリープ解除
                isMeasuringRef.current = false;
                rssiBuffer.current = [];
                setCurrentRssi(null);
            };
        }, [paramMajor, paramMinor])
    );

    useEffect(() => {
        let interval: any;
        if (isMeasuring) {
            const startTime = Date.now();
            interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                if (elapsed % 500 < 100) {
                    setProgress(Math.min((elapsed / 20000) * 100, 100));
                }

                if (lastReceiveTime.current > 0 && Date.now() - lastReceiveTime.current > 5000) {
                    setIsStable(false);
                }

                if (elapsed >= 20000) {
                    setIsMeasuring(false);
                    setProgress(100);
                    isMeasuringRef.current = false;
                    if (rssiBuffer.current.length >= 5) {
                        // 1. 蓄積されたRSSI配列をコピーし、小さい順（昇順）にソート
                        const sortedRssi = [...rssiBuffer.current].sort((a, b) => a - b);
                        const totalCount = sortedRssi.length;

                        // 2. 上下20%にあたるカット件数を計算（端数は切り捨て）
                        const cutCount = Math.floor(totalCount * 0.20);

                        // 3. 上下20%を切り落として中央60%のデータを抽出
                        const trimmedRssi = sortedRssi.slice(cutCount, totalCount - cutCount);

                        // 4. 抽出した中央60%のデータで平均値を算出
                        const avg = trimmedRssi.reduce((a, b) => a + b, 0) / trimmedRssi.length;

                        setResults(prev => ({ ...prev, [step === '2/4' ? '1m' : step === '3/4' ? '5m' : '10m']: avg }));
                    } else {
                        Alert.alert("計測失敗", "十分な数の電波を受信できませんでした。もう一度同じ場所で最初から計測してください。");
                    }
                }
            }, 500);
        }
        return () => clearInterval(interval);
    }, [isMeasuring, paramMajor, paramMinor]);

    const calcFinalParamsWithFitness = () => {
        const m1 = results['1m'];
        const m5 = results['5m'];
        const m10 = results['10m'];
        if (!m1 || !m5 || !m10) return { mp: -73, n: 2.0, totalError: 0, fitness: '評価不可', fitnessColor: '#999' };

        const mp = m1;
        // ① 各地点のデータから、1m基準をもとに個別のN値（傾き）を直接計算
        const n5 = (mp - m5) / (10 * Math.log10(5));
        const n10 = (mp - m10) / (10 * Math.log10(10));

        // ② 【変更箇所】単純平均ではなく、理論導出に基づき「5m側に2、10m側に1」の重み付け平均を適用
        const weightedN = ((n5 * 2) + (n10 * 1)) / 3;

        // システムの上下限値（1.5 〜 4.0）のガードレールを適用
        const finalN = Math.max(1.5, Math.min(4.0, weightedN));

        // ③ 生成された最終パラメータ（mp, finalN）を用いて、5m・10mの理論上のRSSI（理想値）を逆算
        const idealRssi5 = mp - (10 * finalN * Math.log10(5));
        const idealRssi10 = mp - (10 * finalN * Math.log10(10));

        // ④ 理想値と、実際のトリム平均値とのズレ幅（残差誤差）を算出
        const error5 = Math.abs(idealRssi5 - m5);
        const error10 = Math.abs(idealRssi10 - m10);
        const totalError = error5 + error10;

        let fitness = '適合度上、よしと評価しました';
        let fitnessColor = '#28a745';

        if (totalError > 8.0) {
            fitness = '電波反射のノイズ大（再計測を推奨）';
            fitnessColor = '#EF4444';
        } else if (totalError < 3.0) {
            fitness = '理想的な配置です（適合度：極めて高）';
            fitnessColor = '#0052cc';
        }

        return { mp, n: finalN, totalError, fitness, fitnessColor };
    };

    if (step === 'RESULT') {
        const { mp, n, totalError, fitness, fitnessColor } = calcFinalParamsWithFitness();
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>キャリブレーション完了</Text>
                </View>
                <ScrollView style={styles.content}>
                    <View style={styles.infoCard}>
                        <Text style={styles.deviceInfo}>{targetAlias}</Text>
                    </View>

                    <View style={styles.resultRow}>
                        <View style={styles.resultMiniCard}><Text style={styles.miniLabel}>1m平均</Text><Text style={styles.miniValue}>{results['1m']?.toFixed(1)}</Text></View>
                        <View style={styles.resultMiniCard}><Text style={styles.miniLabel}>5m平均</Text><Text style={styles.miniValue}>{results['5m']?.toFixed(1)}</Text></View>
                        <View style={styles.resultMiniCard}><Text style={styles.miniLabel}>10m平均</Text><Text style={styles.miniValue}>{results['10m']?.toFixed(1)}</Text></View>
                    </View>

                    <View style={[styles.fitnessCard, { borderColor: fitnessColor }]}>
                        <Text style={[styles.fitnessTitle, { color: fitnessColor }]}>● {fitness}</Text>
                    </View>

                    <View style={styles.paramCard}>
                        <Text style={styles.paramTitle}>生成された推奨パラメータ</Text>
                        <View style={styles.divider} />
                        <View style={styles.paramRow}>
                            <Text style={styles.paramLabel}>Measured Power (1m基準値)</Text>
                            <Text style={styles.paramValue}>{Math.round(mp)} dBm</Text>
                        </View>
                        <View style={styles.paramRow}>
                            <Text style={styles.paramLabel}>N値</Text>
                            <Text style={styles.paramValue}>{n.toFixed(2)}</Text>
                        </View>
                        <View style={styles.paramRow}>
                            <Text style={styles.paramLabel}>残差誤差 (理論値との総ズレ幅)</Text>
                            <Text style={[styles.paramValue, { color: totalError > 8.0 ? '#EF4444' : '#333' }]}>± {totalError.toFixed(1)} dB</Text>
                        </View>
                    </View>
                </ScrollView>
                <View style={styles.footer}>
                    <TouchableOpacity style={styles.capsuleBtn} onPress={() => saveParameters(mp, n)}>
                        <Text style={styles.capsuleBtnText}>この設定を保存して終了</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.capsuleBtn, { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CCC', marginTop: 12 }]}
                        onPress={() => {
                            setResults({});
                            setStep('1/4');
                        }}>
                        <Text style={[styles.capsuleBtnText, { color: '#666' }]}>最初からやり直す</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const currentKey = step === '2/4' ? '1m' : step === '3/4' ? '5m' : '10m';
    const currentLabel = step === '2/4' ? '1m点' : step === '3/4' ? '5m点' : '10m点';

    const hasResult = results[currentKey] !== undefined && results[currentKey] !== null;

    return (
        <SafeAreaView style={styles.container} key={`${targetMajor}-${targetMinor}`}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => step === '1/4' ? handleExit() : setStep('1/4')} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={28} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>キャリブレーション {step}</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={{ flex: 1 }}>
                <ScrollView style={styles.content}>
                    {step === '1/4' ? (
                        <>
                            <Text style={styles.listLabel}>対象ビーコン：</Text>

                            {!isDetectedRef.current ? (
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: '#999' }}>指定のビーコンを探索中...</Text>
                                    <Text style={{ fontSize: 12, color: '#aaa', marginTop: 5 }}>
                                        {targetAlias}
                                    </Text>
                                </View>
                            ) : (
                                <View style={[styles.beaconItem, styles.selectedItem]}>
                                    <Text style={[styles.beaconText, styles.selectedText]}>
                                        ● {targetAlias}
                                    </Text>
                                </View>
                            )}

                            <View style={styles.guideBox}>
                                <Text style={styles.guideTitle}>【作業手順】</Text>
                                <Text style={styles.guideText}>・発信機を進路上の1m, 5m, 10m地点に設置</Text>
                                <Text style={styles.guideText}>・スマホを受信位置に背向きで固定</Text>
                                <Text style={styles.guideText}>・各地点で10秒間の計測を行います</Text>
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={styles.infoCard}>
                                <Text style={styles.deviceInfo}>{targetAlias}</Text>
                                <View style={styles.rssiContainer}>
                                    <Text style={styles.rssiLabel}>現在のRSSI:</Text>
                                    <Text style={styles.rssiValue}>{currentRssi ?? '--'} <Text style={styles.rssiUnit}>dBm</Text></Text>
                                </View>
                            </View>
                            <View style={styles.measureCard}>
                                <Text style={styles.stepTitle}>{currentLabel} 計測中</Text>
                                <View style={styles.barBg}><View style={[styles.barFill, { width: `${progress}%` }]} /></View>
                                <Text style={styles.counterText}>取得サンプル数: <Text style={{ fontWeight: 'bold' }}>{sampleCount}</Text></Text>
                                {!isStable && <Text style={styles.warningText}>！ 受信が不安定です</Text>}
                            </View>
                        </>
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>

                <View style={styles.footer}>
                    {step === '1/4' ? (
                        <TouchableOpacity style={[styles.capsuleBtn, !isDetectedRef.current && styles.disabledBtn]} disabled={!isDetectedRef.current} onPress={() => setStep('2/4')}>
                            <Text style={styles.capsuleBtnText}>計測開始</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            {!isMeasuring ? (
                                <TouchableOpacity style={styles.capsuleBtn} onPress={() => {
                                    isMeasuringRef.current = true;
                                    rssiBuffer.current = [];
                                    setSampleCount(0);
                                    setProgress(0);
                                    setIsStable(true);
                                    lastReceiveTime.current = 0;
                                    setIsMeasuring(true);
                                }}>
                                    <Text style={styles.capsuleBtnText}>
                                        {hasResult ? 'もう一度計測し直す' : '10秒間の計測を開始'}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={[styles.capsuleBtn, { backgroundColor: '#AAA' }]}><Text style={styles.capsuleBtnText}>計測中...</Text></View>
                            )}

                            <TouchableOpacity
                                style={[styles.capsuleBtn, { marginTop: 12 }, hasResult && !isMeasuring ? { backgroundColor: '#28a745' } : styles.disabledBtn]}
                                disabled={!hasResult || isMeasuring}
                                onPress={() => {
                                    if (step === '2/4') {
                                        setStep('3/4');
                                    } else if (step === '3/4') {
                                        setStep('4/4');
                                    } else if (step === '4/4') {
                                        setStep('RESULT');
                                    }
                                }}
                            >
                                <Text style={styles.capsuleBtnText}>次へ進む</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? 40 : 30, paddingBottom: 15, paddingHorizontal: 15, backgroundColor: '#FFF' },
    headerTitle: { color: '#000', fontSize: 16, fontWeight: 'bold' },
    backBtn: { padding: 5 },
    content: { flex: 1, padding: 20 },
    listLabel: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
    beaconItem: { padding: 18, backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#EEE' },
    selectedItem: { borderColor: '#0052cc', backgroundColor: '#EBF2FF' },
    beaconText: { fontSize: 15, color: '#444' },
    selectedText: { color: '#0052cc', fontWeight: 'bold' },
    guideBox: { marginTop: 30, padding: 15, backgroundColor: '#F0F0F0', borderRadius: 8 },
    guideTitle: { fontWeight: 'bold', marginBottom: 10 },
    guideText: { fontSize: 13, color: '#666', lineHeight: 20 },
    infoCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, elevation: 2, marginBottom: 20 },
    deviceInfo: { fontSize: 14, color: '#666' },
    weatherBadge: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 8 },
    rssiContainer: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
    rssiLabel: { fontSize: 14, color: '#333', marginRight: 10 },
    rssiValue: { fontSize: 32, fontWeight: 'bold', color: '#0052cc' },
    rssiUnit: { fontSize: 16, fontWeight: 'normal', color: '#666' },
    measureCard: { padding: 20 },
    stepTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#333' },
    barBg: { height: 12, backgroundColor: '#E0E0E0', borderRadius: 6, overflow: 'hidden', marginBottom: 15 },
    barFill: { height: '100%', backgroundColor: '#0052cc' },
    counterText: { fontSize: 14, color: '#666' },
    warningText: { color: '#EF4444', fontWeight: 'bold', marginTop: 10 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    resultMiniCard: { flex: 1, backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginHorizontal: 4, alignItems: 'center', elevation: 1 },
    miniLabel: { fontSize: 10, color: '#999', marginBottom: 4 },
    miniValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    fitnessCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, borderWidth: 2, marginBottom: 20, alignItems: 'center' },
    fitnessTitle: { fontSize: 14, fontWeight: 'bold' },
    paramCard: { backgroundColor: '#EBF2FF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#0052cc' },
    paramTitle: { fontSize: 16, fontWeight: 'bold', color: '#0052cc', marginBottom: 10 },
    divider: { height: 1, backgroundColor: '#0052cc22', marginVertical: 10 },
    paramRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 5 },
    paramLabel: { fontSize: 13, color: '#444' },
    paramValue: { fontSize: 15, fontWeight: 'bold', color: '#000' },
    footer: { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 30, paddingTop: 15, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#EEE' },
    capsuleBtn: { backgroundColor: '#0052cc', paddingVertical: 16, borderRadius: 32, alignItems: 'center', elevation: 2 },
    capsuleBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#CCC', elevation: 0 }
});