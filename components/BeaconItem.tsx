import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const BeaconItem = ({ item, now, n }: any) => {
    const diff = (now - item.lastSeen) / 1000;
    const isLost = diff >= 5; // 仕様 3.8

    // 距離計算 (MeasuredPower = -65 と仮定)
    const dist = Math.pow(10, ((-65) - item.rssi) / (10 * n));

    // 仕様 3.4 & 5.1: 枠色定義
    let borderColor = '#4CD964'; // Safe (青/緑)
    if (isLost) borderColor = '#9CA3AF';
    else if (dist < 5) borderColor = '#FF3B30'; // Danger (赤)
    else if (dist < 15) borderColor = '#FFCC00'; // Warn (黄)

    return (
        <View style={[styles.card, { borderColor, opacity: isLost ? 0.5 : 1 }]}>
            <View>
                <Text style={styles.name}>{item.id}</Text>
                <Text style={styles.sub}>
                    {isLost ? '⚠️ LOST' : `${diff.toFixed(1)}秒前`} | RSSI: {item.rssi}
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.dist}>{dist.toFixed(1)}</Text>
                <Text style={styles.unit}>m</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 15, borderRadius: 15, borderWidth: 4, marginBottom: 12, alignItems: 'center' },
    name: { fontSize: 18, fontWeight: 'bold' },
    sub: { fontSize: 12, color: '#666' },
    dist: { fontSize: 42, fontWeight: 'bold', color: '#000' },
    unit: { fontSize: 16, fontWeight: 'bold' }
});