module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Drawer (react-navigation/drawer) を動かすために必須のプラグイン
            'react-native-reanimated/plugin',
        ],
    };
};