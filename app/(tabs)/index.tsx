import React, { useEffect, useState } from 'react';
import {
    Button,
    FlatList,
    NativeEventEmitter,
    NativeModules,
    PermissionsAndroid,
    Platform,
    StyleSheet,
    Text,
    View
} from 'react-native';
import BleManager from 'react-native-ble-manager';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default function HomeScreen() {
    const [isScanning, setIsScanning] = useState(false);
    const [devices, setDevices] = useState<any[]>([]);

    useEffect(() => {
        // 1. 初期化
        BleManager.start({ showAlert: false });

        // 2. リスナーの登録
        const handlerDiscover = bleManagerEmitter.addListener(
            'BleManagerDiscoverPeripheral',
            (data) => {
                console.log('★電波キャッチ！:', data.id);
                setDevices((prev) => {
                    const index = prev.findIndex((d) => d.id === data.id);
                    if (index !== -1) {
                        const newDevices = [...prev];
                        newDevices[index] = data;
                        return newDevices;
                    }
                    return [...prev, data];
                });
            }
        );

        // 3. Android 11以降に必要な権限の要求
        const requestPermissions = async () => {
            if (Platform.OS === 'android') {
                await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                ]);
            }
        };
        requestPermissions();

        return () => {
            handlerDiscover.remove();
        };
    }, []);

    const startScan = async () => {
        if (isScanning) return;

        setDevices([]);
        console.log("--- スキャンプロセス開始 ---");

        try {
            setIsScanning(true);

            /**
             * 【重要修正箇所】
             * 旧アーキテクチャ（Bridge方式）では、引数を「個別の値」として渡します。
             * 第1引数: サービスUUIDの配列（[] で全スキャン）
             * 第2引数: スキャン秒数
             * 第3引数: 重複を許可するか (true/false)
             */
            await BleManager.scan([], 5, true);

            console.log("スキャンコマンド送信成功。5秒間受信します...");

            setTimeout(() => {
                setIsScanning(false);
                console.log("スキャン終了");
            }, 5000);

        } catch (error) {
            console.error("スキャン失敗:", error);
            setIsScanning(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Beacon Sensor</Text>
                <Text style={styles.status}>
                    ステータス: {isScanning ? "スキャン中..." : "待機中"}
                </Text>
            </View>

            <Button
                title={isScanning ? "スキャンしています" : "ビーコンをスキャン"}
                onPress={startScan}
                disabled={isScanning}
            />

            <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View style={styles.item}>
                        <View style={styles.itemMain}>
                            <Text style={styles.deviceId}>{item.name || "名称未設定デバイス"}</Text>
                            <Text style={styles.idSub}>{item.id}</Text>
                        </View>
                        <View style={styles.rssiBadge}>
                            <Text style={styles.rssiText}>{item.rssi}</Text>
                            <Text style={styles.rssiUnit}>dBm</Text>
                        </View>
                    </View>
                )}
                style={styles.list}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>デバイスが見つかりません</Text>
                        <Text style={styles.emptySubText}>GPSとBluetoothがONか確認してください</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: '#f8f9fa' },
    header: { marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a' },
    status: { fontSize: 14, color: '#666', marginTop: 5 },
    list: { flex: 1, marginTop: 10 },
    item: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#fff',
        borderRadius: 10,
        marginBottom: 10,
        elevation: 2,
    },
    itemMain: { flex: 1 },
    deviceId: { fontWeight: 'bold', fontSize: 16, color: '#333' },
    idSub: { fontSize: 12, color: '#999', marginTop: 2 },
    rssiBadge: {
        backgroundColor: '#007AFF',
        padding: 8,
        borderRadius: 8,
        alignItems: 'center',
        minWidth: 60
    },
    rssiText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    rssiUnit: { color: '#fff', fontSize: 10 },
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { textAlign: 'center', color: '#999', fontSize: 16, fontWeight: 'bold' },
    emptySubText: { textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 5 }
});