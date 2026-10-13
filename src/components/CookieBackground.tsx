import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

interface CookieBackgroundProps {
  children?: React.ReactNode;
}

export const CookieBackground: React.FC<CookieBackgroundProps> = ({ children }) => {
  return (
    <View style={styles.container} pointerEvents="none">
      <ImageBackground
        source={require('../../assets/cookie-tile.png')}
        resizeMode="repeat"
        style={StyleSheet.absoluteFill}
        imageStyle={styles.tileImage}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#09090b',
  },
  tileImage: {
    opacity: 0.18, // Textura tenue y suave que no distrae la lectura
  },
});
