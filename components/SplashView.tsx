import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export const SplashView = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.logoIcon}>📡</Text>
            <Text style={styles.appName}>iBeacon Distance Sensor</Text>
            <ActivityIndicator size="large" color="#3B82F6" style={styles.loader} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111827', // アプリのメインテーマである濃紺
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoIcon: {
        fontSize: 80,
    },
    appName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginTop: 10,
    },
    loader: {
        marginTop: 20,
    },
});