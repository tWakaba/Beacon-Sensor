import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system'; // 🌟 必須インポートの復活
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing'; // 🌟 必須インポートの復活
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    NativeEventEmitter,
    NativeModules,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import BleManager from 'react-native-ble-manager';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
const STORAGE_KEY = '@beacon_settings_v16';

interface RegisteredBeacon {
    id: string;
    major: number;
    minor: number;
    alias: string;
    isCalibrated: boolean;
    measuredPower?: number;
    nValue?: number;
}

interface ScannedRaw {
    major: number;
    minor: number;
    rssi: number;
}

export default function BeaconManagementScreen() {
    const router = useRouter();
    const navigation = useNavigation();

    const [registeredBeacons, setRegisteredBeacons] = useState<RegisteredBeacon[]>([]);
    const [unregisteredBeacons, setUnregisteredBeacons] = useState<ScannedRaw[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedScan, setSelectedScan] = useState<ScannedRaw | null>(null);
    const [aliasInput, setAliasInput] = useState('');

    // 編集用のState
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editingBeacon, setEditingBeacon] = useState<RegisteredBeacon | null>(null);
    const [editAliasInput, setEditAliasInput] = useState('');
    const [editMpInput, setEditMpInput] = useState('');
    const [editNInput, setEditNInput] = useState('');

    const [isExporting, setIsExporting] = useState(false); // 🌟 ローディング表示用State
    const isScanningRef = useRef(false);
    const lastUpdateRef = useRef(0);

    const loadBeacons = async () => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.beacons) {
                    setRegisteredBeacons(parsed.beacons);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadBeacons();
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            BleManager.start({ showAlert: false });
            isScanningRef.current = true;

            const handler = bleManagerEmitter.addListener(
                'BleManagerDiscoverPeripheral',
                (data) => {
                    if (!isScanningRef.current) return;
                    const now = Date.now();
                    if (now - lastUpdateRef.current < 500) return;
                    lastUpdateRef.current = now;

                    const bytes = data.advertising?.manufacturerData?.bytes;
                    if (!bytes || bytes.length < 25) return;

                    let ibeaconIndex = -1;
                    for (let i = 0; i < bytes.length - 4; i++) {
                        if (bytes[i] === 0x02 && bytes[i + 1] === 0x15) {
                            ibeaconIndex = i;
                            break;
                        }
                    }
                    if (ibeaconIndex === -1) return;

                    const uuidStart = ibeaconIndex + 2;
                    const major = ((bytes[uuidStart + 16] << 8) | bytes[uuidStart + 17]) >>> 0;
                    const minor = (bytes[uuidStart + 18] << 8) | bytes[uuidStart + 19] >>> 0;
                    const comboId = `${major}-${minor}`;

                    setRegisteredBeacons(currentRegs => {
                        const isAlreadyReg = currentRegs.some(b => b.id === comboId);
                        if (isAlreadyReg) return currentRegs;

                        setUnregisteredBeacons(prev => {
                            const exists = prev.some(b => b.major === major && b.minor === minor);
                            if (exists) return prev;
                            return [...prev, { major, minor, rssi: data.rssi }];
                        });
                        return currentRegs;
                    });
                }
            );

            BleManager.scan([], 0, true).catch(err => console.log(err));

            return () => {
                isScanningRef.current = false;
                handler.remove();
                BleManager.stopScan().catch(() => { });
            };
        }, [])
    );

    const handleOpenRegisterModal = (scan: ScannedRaw) => {
        setSelectedScan(scan);
        setAliasInput(`ビーコン ${scan.major}-${scan.minor}`);
        setIsModalVisible(true);
    };

    const handleConfirmRegister = async () => {
        if (!selectedScan) return;
        try {
            const savedSettings = await AsyncStorage.getItem(STORAGE_KEY);
            const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
            const defaultMp = parsedSettings?.config?.measuredPower ?? -59;
            const defaultN = parsedSettings?.config?.n ?? 2.0;

            const id = `${selectedScan.major}-${selectedScan.minor}`;
            const newBeacon: RegisteredBeacon = {
                id,
                major: selectedScan.major,
                minor: selectedScan.minor,
                alias: aliasInput.trim() || `Beacon-${id}`,
                isCalibrated: false,
                measuredPower: defaultMp,
                nValue: defaultN
            };

            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            const data = saved ? JSON.parse(saved) : {};
            const list = data.beacons || [];

            if (list.some((b: any) => b.id === id)) {
                Alert.alert("通知", "このビーコンは既に登録されています。");
                setIsModalVisible(false);
                return;
            }

            list.push(newBeacon);
            data.beacons = list;
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            setRegisteredBeacons(list);
            setUnregisteredBeacons(prev => prev.filter(b => `${b.major}-${b.minor}` !== id));
            setIsModalVisible(false);
            Alert.alert("成功", "登録しました。");
        } catch (e) {
            Alert.alert("エラー", "登録に失敗しました。");
        }
    };

    // 編集モーダルを開く
    const handleOpenEditModal = (beacon: RegisteredBeacon) => {
        setEditingBeacon(beacon);
        setEditAliasInput(beacon.alias);
        setEditMpInput(beacon.measuredPower !== undefined ? String(beacon.measuredPower) : '');
        setEditNInput(beacon.nValue !== undefined ? String(beacon.nValue) : '');
        setIsEditModalVisible(true);
    };

    // エイリアス保存
    const handleSaveEditAlias = async () => {
        if (!editingBeacon) return;
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            const data = saved ? JSON.parse(saved) : {};
            const list = data.beacons || [];

            const idx = list.findIndex((b: any) => b.id === editingBeacon.id);
            if (idx !== -1) {
                list[idx].alias = editAliasInput.trim() || list[idx].alias;
                // 数値に変換。空欄なら undefined（全体設定を使用する状態）にする
                list[idx].measuredPower = editMpInput.trim() !== '' ? parseFloat(editMpInput) : undefined;
                list[idx].nValue = editNInput.trim() !== '' ? parseFloat(editNInput) : undefined;
            }

            data.beacons = list;
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            setRegisteredBeacons(list);
            setIsEditModalVisible(false);
            Alert.alert("完了", "設定を更新しました。");
        } catch (e) {
            Alert.alert("エラー", "更新に失敗しました。");
        }
    };

    const handleDeleteBeacon = async (id: string) => {
        Alert.alert(
            "削除の確認",
            "このビーコンを登録解除しますか？（校正データも消去されます）",
            [
                { text: "キャンセル", style: "cancel" },
                {
                    text: "解除する",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const saved = await AsyncStorage.getItem(STORAGE_KEY);
                            const data = saved ? JSON.parse(saved) : {};
                            const list = data.beacons || [];
                            const filtered = list.filter((b: any) => b.id !== id);

                            data.beacons = filtered;
                            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                            setRegisteredBeacons(filtered);
                            setExpandedId(null);
                        } catch (e) {
                            Alert.alert("エラー", "削除に失敗しました。");
                        }
                    }
                }
            ]
        );
    };

    // 🌟 【不具合完全修正】settings.tsx と同様の共有共有ダイアログ付き JSONエクスポート処理
    const handleBulkExport = async () => {
        if (registeredBeacons.length === 0) {
            Alert.alert("エクスポート", "登録されているビーコンがありません。");
            return;
        }

        setIsExporting(true);
        try {
            // エクスポート用データ構造（settings.tsxに準拠）
            const exportData = {
                version: "1.0",
                exportedAt: new Date().toISOString(),
                beacons: registeredBeacons
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const filename = `beacon_export.json`;
            const fileUri = `${FileSystem.documentDirectory}${filename}`;

            // 1. 一時ファイルとしてテキスト書き込み
            await FileSystem.writeAsStringAsync(fileUri, jsonString, {
                encoding: FileSystem.EncodingType.UTF8,
            });

            // 2. OSの共有ダイアログ（送信・保存）を立ち上げる
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/json',
                    dialogTitle: 'ビーコン個別設定の一括エクスポート',
                    UTI: 'public.json'
                });
            } else {
                Alert.alert("エラー", "このデバイスではファイルの共有機能が利用できません。");
            }
        } catch (error) {
            console.error(error);
            Alert.alert("エラー", "エクスポートファイルの作成に失敗しました。");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* ヘッダーエリア */}
            <View style={styles.header}>
                {/* 🌟 戻るボタンの挙動を完全に維持 (arrow-back ＆ router.back) */}
                <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>ビーコン管理</Text>
                {/* 左右バランスのためのダミー領域 */}
                <View style={{ width: 32 }} />
            </View>

            {/* スクロールコンテンツエリア */}
            <ScrollView style={styles.content}>
                <Text style={styles.sectionTitle}>🔒 登録済みビーコン ({registeredBeacons.length})</Text>
                {registeredBeacons.map((beacon) => {
                    const isExpanded = expandedId === beacon.id;
                    return (
                        <View key={beacon.id} style={styles.accordionCard}>
                            <TouchableOpacity
                                style={styles.accordionHeader}
                                onPress={() => setExpandedId(isExpanded ? null : beacon.id)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.aliasText}>{beacon.alias}</Text>
                                    <Text style={styles.metaText}>Major: {beacon.major} / Minor: {beacon.minor}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[styles.statusTag, beacon.isCalibrated ? styles.tagDone : styles.tagYet]}>
                                        <Text style={[styles.tagText, beacon.isCalibrated ? styles.textDone : styles.textYet]}>
                                            {beacon.isCalibrated ? "校正完了" : "未完了"}
                                        </Text>
                                    </View>
                                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#999" style={{ marginLeft: 8 }} />
                                </View>
                            </TouchableOpacity>

                            {isExpanded && (
                                <View style={styles.accordionBody}>
                                    <View style={styles.paramRow}>
                                        <Text style={styles.paramLabel}>MesurePower:</Text>
                                        <Text style={styles.paramValue}>{beacon.measuredPower !== undefined ? `${beacon.measuredPower} dBm` : ""}</Text>
                                    </View>
                                    <View style={styles.paramRow}>
                                        <Text style={styles.paramLabel}>N値:</Text>
                                        <Text style={styles.paramValue}>{beacon.nValue !== undefined ? beacon.nValue.toFixed(2) : ""}</Text>
                                    </View>

                                    <View style={styles.actionRow}>
                                        <TouchableOpacity style={[styles.actionBtn, styles.btnEdit]} onPress={() => handleOpenEditModal(beacon)}>
                                            <Ionicons name="create-outline" size={14} color="#0052cc" />
                                            <Text style={styles.actionBtnText}> 編集</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity style={[styles.actionBtn, styles.btnCalib]} onPress={() => router.push({
                                            pathname: '/calibration',
                                            params: { major: beacon.major, minor: beacon.minor, alias: beacon.alias }
                                        })}>
                                            <Ionicons name="options-outline" size={14} color="#0052cc" />
                                            <Text style={styles.actionBtnText}> 校正</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity style={[styles.actionBtn, styles.btnDelete]} onPress={() => handleDeleteBeacon(beacon.id)}>
                                            <Ionicons name="trash-outline" size={14} color="#EF4444" />
                                            <Text style={[styles.actionBtnText, { color: '#EF4444' }]}> 削除</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    );
                })}
                {registeredBeacons.length === 0 && (
                    <Text style={styles.emptyText}>ビーコンは登録されていません。</Text>
                )}

                <Text style={[styles.sectionTitle, { marginTop: 25 }]}>📡 未登録検出ビーコン ({unregisteredBeacons.length})</Text>
                {unregisteredBeacons.map((scan, i) => (
                    <View key={i} style={styles.scanRow}>
                        <View>
                            <Text style={styles.scanTitle}>Major: {scan.major} / Minor: {scan.minor}</Text>
                            <Text style={styles.scanSub}>現在の受信電波強度: {scan.rssi} dBm</Text>
                        </View>
                        <TouchableOpacity style={styles.registerBtn} onPress={() => handleOpenRegisterModal(scan)}>
                            <Text style={styles.registerBtnText}>登録</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>

            {/* フッター（一括エクスポートボタン） */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.bulkExportBtn} onPress={handleBulkExport} disabled={isExporting}>
                    {isExporting ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <>
                            <Ionicons name="download-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                            <Text style={styles.bulkExportBtnText}>一括エクスポート</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* 新規追加登録モーダル */}
            <Modal visible={isModalVisible} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>ビーコン新規登録</Text>
                        <Text style={styles.modalSub}>このiBeaconを識別するための固有名称（エリア名、いかだ名など）を入力してください。</Text>
                        <TextInput
                            style={styles.textInput}
                            value={aliasInput}
                            onChangeText={setAliasInput}
                            placeholder="例: いかだ西A"
                            placeholderTextColor="#AAA"
                        />
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.modalBtn, styles.btnCancel]} onPress={() => setIsModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>キャンセル</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.btnConfirm]} onPress={handleConfirmRegister}>
                                <Text style={styles.confirmBtnText}>登録する</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* エイリアス変更専用モーダル */}
            <Modal visible={isEditModalVisible} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>識別名の編集</Text>
                        <Text style={styles.modalSub}>ビーコンの名称を変更します。</Text>
                        <TextInput
                            style={styles.textInput}
                            value={editAliasInput}
                            onChangeText={setEditAliasInput}
                            placeholder="名称を入力してください"
                            placeholderTextColor="#AAA"
                        />
                        <TextInput
                            style={styles.textInput}
                            value={editMpInput}
                            onChangeText={setEditMpInput}
                            placeholder="Measured Power (例: -59)"
                            keyboardType="numeric"
                        />
                        <TextInput
                            style={styles.textInput}
                            value={editNInput}
                            onChangeText={setEditNInput}
                            placeholder="N値 (例: 2.0)"
                            keyboardType="numeric"
                        />
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.modalBtn, styles.btnCancel]} onPress={() => setIsEditModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>キャンセル</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.btnConfirm]} onPress={handleSaveEditAlias}>
                                <Text style={styles.confirmBtnText}>変更を保存</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    header: { height: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 40, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#EEE', backgroundColor: '#FFF' },
    headerIcon: { width: 40, justifyContent: 'center', alignItems: 'flex-start', },
    backBtn: { padding: 20 },
    headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    content: { flex: 1, padding: 16 },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#666', marginBottom: 12 },
    accordionCard: { backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#EAEAEA', overflow: 'hidden' },
    accordionHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    aliasText: { fontSize: 15, fontWeight: 'bold', color: '#111' },
    metaText: { fontSize: 12, color: '#888', marginTop: 3 },
    statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    tagDone: { backgroundColor: '#E6F4EA' },
    tagYet: { backgroundColor: '#FCE8E6' },
    tagText: { fontSize: 11, fontWeight: 'bold' },
    textDone: { color: '#137333' },
    textYet: { color: '#C5221F' },
    accordionBody: { padding: 16, backgroundColor: '#FAFAFA', borderTopWidth: 1, borderColor: '#F0F0F0' },
    paramRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    paramLabel: { fontSize: 12, color: '#666' },
    paramValue: { fontSize: 12, fontWeight: 'bold', color: '#333' },
    actionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, borderTopWidth: 1, borderColor: '#EEE', paddingTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, marginLeft: 8 },
    btnEdit: { backgroundColor: '#EBF2FF', borderWidth: 1, borderColor: '#0052cc33' },
    btnCalib: { backgroundColor: '#EBF2FF' },
    btnDelete: { backgroundColor: '#FFEBEB' },
    actionBtnText: { fontSize: 13, fontWeight: 'bold', color: '#0052cc' },
    scanRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#FFF', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#EEE' },
    scanTitle: { fontSize: 14, fontWeight: 'bold', color: '#444' },
    scanSub: { fontSize: 12, color: '#888', marginTop: 2 },
    registerBtn: { backgroundColor: '#0052cc', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18 },
    registerBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 25 },
    modalContent: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, elevation: 5 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 8 },
    modalSub: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 15 },
    textInput: { backgroundColor: '#F1F3F5', padding: 14, borderRadius: 8, fontSize: 15, color: '#000', marginBottom: 20 },
    modalFooter: { flexDirection: 'row', justifyContent: 'flex-end' },
    modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginLeft: 10 },
    btnCancel: { backgroundColor: '#F1F3F5' },
    btnConfirm: { backgroundColor: '#0052cc' },
    cancelBtnText: { color: '#495057', fontSize: 14, fontWeight: 'bold' },
    confirmBtnText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
    emptyText: { textAlign: 'center', color: '#999', marginVertical: 20, fontSize: 13 },

    // フッターおよび一括エクスポート用のスタイル
    footer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderColor: '#EEE',
    },
    bulkExportBtn: {
        backgroundColor: '#0052cc',
        paddingVertical: 14,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulkExportBtnText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: 'bold',
    },
});