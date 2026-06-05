import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system'; // 追加
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing'; // 追加
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const STORAGE_KEY = '@beacon_settings_v16';

export default function SettingsScreen() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);

    // --- ステート管理 ---
    const [distRed, setDistRed] = useState('5.0');
    const [distYellow, setDistYellow] = useState('15.0');
    const [lostSec, setLostSec] = useState('5');
    const [alertSound, setAlertSound] = useState(true);
    const [alertVibrate, setAlertVibrate] = useState(true);
    const [alertFlash, setAlertFlash] = useState(false);
    const [paramMP, setParamMP] = useState('-59');
    const [paramN, setParamN] = useState('2.0');
    const [kalmanR, setKalmanR] = useState('15');
    const [coeffRainy, setCoeffRainy] = useState('1.15');
    const [coeffFoggy, setCoeffFoggy] = useState('1.08');
    const [uuid, setUuid] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const d = JSON.parse(saved);
                    setDistRed(String(d.distRed ?? '5.0'));
                    setDistYellow(String(d.distYellow ?? '15.0'));
                    setLostSec(String(d.lostSec ?? '5'));
                    setAlertSound(d.alertSound ?? true);
                    setAlertVibrate(d.alertVibrate ?? true);
                    setAlertFlash(d.alertFlash ?? false);
                    setParamMP(String(d.paramMP ?? '-59'));
                    setParamN(String(d.paramN ?? '2.0'));
                    setKalmanR(String(d.kalmanR ?? '15'));
                    setCoeffRainy(String(d.coeffRainy ?? '1.15'));
                    setCoeffFoggy(String(d.coeffFoggy ?? '1.08'));
                    setUuid(d.uuid || '');
                }
            } catch (e) { console.error(e); }
            finally { setIsLoading(false); }
        })();
    }, []);

    const handleSave = async () => {
        try {
            // 1. 【追加】既存データを一度すべて取得する
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            const currentData = saved ? JSON.parse(saved) : {};

            // 2. 既存データと新しい設定をマージする
            const data = {
                ...currentData, // 【重要】これで既存のビーコンデータ(beacons)が保持されます
                distRed,
                distYellow,
                lostSec,
                alertSound,
                alertVibrate,
                alertFlash,
                paramMP,
                paramN,
                kalmanR,
                coeffRainy,
                coeffFoggy,
                uuid
            };

            // 3. マージ済みのデータを保存する
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            router.back();
        } catch (e) {
            console.error("保存失敗:", e);
            Alert.alert("エラー", "保存に失敗しました");
        }
    };

    // --- 【新規】エクスポート処理 (CSV共有) ---
    const handleExport = async () => {
        try {
            const header = "Parameter,Value\n";
            const rows = [
                `distRed,${distRed}`,
                `distYellow,${distYellow}`,
                `lostSec,${lostSec}`,
                `alertSound,${alertSound}`,
                `alertVibrate,${alertVibrate}`,
                `alertFlash,${alertFlash}`,
                `paramMP,${paramMP}`,
                `paramN,${paramN}`,
                `kalmanR,${kalmanR}`,
                `coeffRainy,${coeffRainy}`,
                `coeffFoggy,${coeffFoggy}`,
                `uuid,${uuid}`
            ].join("\n");

            const csvContent = header + rows;
            const fileName = `beacon_settings_${new Date().getTime()}.csv`;
            const fileUri = FileSystem.cacheDirectory + fileName;

            await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            } else {
                Alert.alert("エラー", "このデバイスでは共有機能を利用できません");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("エラー", "エクスポートに失敗しました");
        }
    };

    // --- 【修正】設定リセット処理 ---
    const handleReset = () => {
        Alert.alert("確認", "全ての設定を初期状態に戻しますか？", [
            { text: "キャンセル", style: "cancel" },
            {
                text: "リセット",
                style: "destructive",
                onPress: async () => {
                    // UI上の表示を初期値に戻す
                    setDistRed('5.0'); setDistYellow('15.0'); setLostSec('5');
                    setAlertSound(true); setAlertVibrate(true); setAlertFlash(false);
                    setParamMP('-59'); setParamN('2.0');
                    setKalmanR('15');
                    setCoeffRainy('1.15'); setCoeffFoggy('1.08');
                    setUuid('');

                    // 端末に保存されているデータを物理的に削除する
                    try {
                        await AsyncStorage.removeItem(STORAGE_KEY);
                        // 保存成功を確認するためにアラートを出すと安心です
                        Alert.alert("完了", "設定を初期化しました");
                    } catch (e) {
                        console.error("Reset Error:", e);
                    }
                }
            }
        ]);
    };

    if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color="#007AFF" />;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
                    <Ionicons name="arrow-back" size={28} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>設定</Text>
                <TouchableOpacity onPress={handleSave}>
                    <Text style={styles.saveText}>保存</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} bounces={false}>
                {/* 1. 警報閾値 */}
                <Text style={styles.sectionTitle}>警報閾値</Text>
                <View style={styles.card}>
                    <View style={styles.row}><Text style={styles.label}>🔴 危険距離</Text><View style={styles.unitInput}><TextInput style={styles.smallInput} value={distRed} onChangeText={setDistRed} keyboardType="numeric" /><Text style={styles.unitText}>m</Text></View></View>
                    <View style={styles.row}><Text style={styles.label}>🟡 警告距離</Text><View style={styles.unitInput}><TextInput style={styles.smallInput} value={distYellow} onChangeText={setDistYellow} keyboardType="numeric" /><Text style={styles.unitText}>m</Text></View></View>
                    <View style={[styles.row, { borderBottomWidth: 0 }]}><Text style={styles.label}>⚪ ロスト判定</Text><View style={styles.unitInput}><TextInput style={styles.smallInput} value={lostSec} onChangeText={setLostSec} keyboardType="numeric" /><Text style={styles.unitText}>秒</Text></View></View>
                </View>

                {/* 2. 警報出力 */}
                <Text style={styles.sectionTitle}>警報出力</Text>
                <View style={styles.card}>
                    <View style={styles.row}><Text style={styles.label}>警報音</Text><Switch value={alertSound} onValueChange={setAlertSound} trackColor={{ true: '#34C759' }} /></View>
                    <View style={styles.row}><Text style={styles.label}>バイブレーション</Text><Switch value={alertVibrate} onValueChange={setAlertVibrate} trackColor={{ true: '#34C759' }} /></View>
                    <View style={[styles.row, { borderBottomWidth: 0 }]}><Text style={styles.label}>画面フラッシュ</Text><Switch value={alertFlash} onValueChange={setAlertFlash} trackColor={{ true: '#34C759' }} /></View>
                </View>

                {/* 3. RSSI基準パラメータ */}
                <Text style={styles.sectionTitle}>RSSI基準パラメータ</Text>
                <View style={styles.card}>
                    <View style={styles.paddingRow}>
                        <Text style={styles.subLabel}>Measured Power (1m地点での実測RSSI値)</Text>
                        <TextInput style={styles.fullInput} value={paramMP} onChangeText={setParamMP} keyboardType="numeric" />
                        <View style={{ height: 12 }} />
                        <Text style={styles.subLabel}>N値 (環境減衰係数：標準は2.0)</Text>
                        <TextInput style={styles.fullInput} value={paramN} onChangeText={setParamN} keyboardType="numeric" />
                        <View style={{ height: 12 }} />
                        <Text style={styles.subLabel}>R値 (カルマンフィルタ安定性：標準は15)</Text>
                        <TextInput style={styles.fullInput} value={kalmanR} onChangeText={setKalmanR} keyboardType="numeric" />
                        <Text style={styles.hintText}>※数値が大きいほど変動が抑えられますが、追従は遅くなります</Text>
                    </View>
                </View>

                {/* 4. N値天候係数 */}
                <Text style={styles.sectionTitle}>N値天候係数</Text>
                <View style={styles.card}>
                    <View style={styles.paddingRow}>
                        <View style={styles.weatherCoeffRow}>
                            <View style={styles.coeffItem}><Text style={styles.subLabel}>雨天係数</Text><TextInput style={styles.fullInput} value={coeffRainy} onChangeText={setCoeffRainy} keyboardType="numeric" /></View>
                            <View style={{ width: 16 }} /><View style={styles.coeffItem}><Text style={styles.subLabel}>霧係数</Text><TextInput style={styles.fullInput} value={coeffFoggy} onChangeText={setCoeffFoggy} keyboardType="numeric" /></View>
                        </View>
                        <Text style={styles.hintText}>※晴天時(1.00)を基準とした乗算係数です</Text>
                    </View>
                </View>

                {/* 5. 発信機UUID */}
                <Text style={styles.sectionTitle}>発信機UUID</Text>
                <View style={styles.card}>
                    <View style={styles.uuidRow}>
                        <TextInput style={styles.uuidInput} value={uuid} onChangeText={setUuid} placeholder="UUIDを入力してください" autoCapitalize="characters" />
                        {uuid.length > 0 && (<TouchableOpacity onPress={() => setUuid('')}><Ionicons name="close-circle" size={18} color="#C7C7CC" /></TouchableOpacity>)}
                    </View>
                </View>

                {/* 6. パラメータ操作 */}
                <Text style={styles.sectionTitle}>パラメータ操作</Text>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.actionRow} onPress={handleExport}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionTitle}>エクスポート</Text>
                            <Text style={styles.actionDesc}>現在の設定をCSVファイルとして共有・保存します</Text>
                        </View>
                        <Ionicons name="share-outline" size={20} color="#007AFF" />
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity style={styles.actionRow} onPress={handleReset}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionTitle}>設定リセット</Text>
                            <Text style={styles.actionDesc}>全てのパラメータを初期状態に戻します</Text>
                        </View>
                        <Ionicons name="refresh-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                </View>
                <View style={{ height: 60 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F2F2F7' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 40, paddingBottom: 15, paddingHorizontal: 16, backgroundColor: '#FFF', borderBottomWidth: 0.5, borderBottomColor: '#C6C6C8' },
    headerIcon: { width: 40 },
    headerTitle: { fontSize: 17, fontWeight: '600' },
    saveText: { color: '#007AFF', fontSize: 17, fontWeight: '600', width: 40, textAlign: 'right' },
    body: { flex: 1, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 13, color: '#6E6E73', marginTop: 22, marginBottom: 8, marginLeft: 10, textTransform: 'uppercase' },
    card: { backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 16, marginBottom: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7' },
    label: { fontSize: 16, color: '#000' },
    unitInput: { flexDirection: 'row', alignItems: 'center' },
    smallInput: { backgroundColor: '#F2F2F7', borderRadius: 6, width: 60, height: 28, textAlign: 'center', fontWeight: '600', marginRight: 8 },
    unitText: { fontSize: 15, color: '#8E8E93', width: 30 },
    paddingRow: { paddingVertical: 12 },
    subLabel: { fontSize: 12, color: '#8E8E93', marginBottom: 8 },
    fullInput: { backgroundColor: '#F2F2F7', borderRadius: 6, height: 36, paddingHorizontal: 10, fontWeight: '600', fontSize: 15 },
    weatherCoeffRow: { flexDirection: 'row', marginTop: 12 },
    coeffItem: { flex: 1 },
    hintText: { fontSize: 11, color: '#AEAEB2', marginTop: 8 },
    uuidRow: { flexDirection: 'row', alignItems: 'center', height: 44 },
    uuidInput: { flex: 1, fontSize: 14, fontFamily: 'monospace' },
    actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    actionTitle: { fontSize: 16, color: '#000' },
    actionDesc: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
    divider: { height: 0.5, backgroundColor: '#F2F2F7' },
});