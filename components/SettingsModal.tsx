import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export const SettingsModal = ({ visible, onClose, onSave, currentConfig, activeWeather, filterUuid }: any) => {
    const [temp, setTemp] = useState<any>({});

    useEffect(() => {
        if (visible) setTemp({ ...currentConfig, filterUuid });
    }, [visible]);

    const weatherLabel = activeWeather === 'SUNNY' ? '晴天' : activeWeather === 'RAINY' ? '雨' : '霧';

    return (
        <Modal visible={visible} animationType="slide">
            <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={onClose} style={styles.headerSide}><Text style={styles.cancelText}>キャンセル</Text></TouchableOpacity>
                    <Text style={styles.modalTitle}>設定 ({weatherLabel})</Text>
                    <TouchableOpacity onPress={() => onSave(temp)} style={styles.headerSide}><Text style={styles.saveText}>保存</Text></TouchableOpacity>
                </View>
                <ScrollView style={styles.settingsScroll}>
                    <Text style={styles.sectionTitle}>— 警報閾値 —</Text>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>赤（危険）距離 (m):</Text>
                        <TextInput style={styles.input} value={String(temp.thresholdRed)} onChangeText={v => setTemp({ ...temp, thresholdRed: v })} keyboardType="numeric" />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>黄（警告）距離 (m):</Text>
                        <TextInput style={styles.input} value={String(temp.thresholdYellow)} onChangeText={v => setTemp({ ...temp, thresholdYellow: v })} keyboardType="numeric" />
                    </View>

                    <Text style={styles.sectionTitle}>— RSSI フィルターパラメータ —</Text>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>MeasuredPower (@1m):</Text>
                        <TextInput style={styles.input} value={String(temp.measuredPower)} onChangeText={v => setTemp({ ...temp, measuredPower: v })} keyboardType="numeric" />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>N値 (減衰係数):</Text>
                        <TextInput style={styles.input} value={String(temp.n)} onChangeText={v => setTemp({ ...temp, n: v })} keyboardType="numeric" />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>R値 (カルマン安定化):</Text>
                        <TextInput style={styles.input} value={String(temp.kalmanR)} onChangeText={v => setTemp({ ...temp, kalmanR: v })} keyboardType="numeric" />
                    </View>

                    <Text style={styles.sectionTitle}>— UUID フィルタ (共通) —</Text>
                    <TextInput style={styles.input} placeholder="UUIDの一部を入力" value={temp.filterUuid} onChangeText={v => setTemp({ ...temp, filterUuid: v })} autoCapitalize="none" />
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: { flex: 1, backgroundColor: '#FFF', paddingTop: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: '#EEE', alignItems: 'center' },
    headerSide: { width: 80 },
    modalTitle: { fontWeight: 'bold', fontSize: 18, textAlign: 'center', flex: 1 },
    cancelText: { color: '#FF3B30', fontSize: 16 },
    saveText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16, textAlign: 'right' },
    settingsScroll: { padding: 20 },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#666', marginTop: 20, marginBottom: 10, backgroundColor: '#F8F9FA', padding: 8 },
    inputGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
    label: { fontSize: 14, color: '#333' },
    input: { borderBottomWidth: 1, borderColor: '#CCC', paddingVertical: 5, fontSize: 16, width: 100, textAlign: 'right' }
});