import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';

export const CookieBackground: React.FC = memo(() => {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id="cookiePattern"
            width="72"
            height="72"
            patternUnits="userSpaceOnUse"
          >
            {/* Galleta principal centrada */}
            <Circle
              cx="22"
              cy="22"
              r="14"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4,2"
              opacity="0.04"
            />
            {/* Chispas de chocolate de la galleta principal */}
            <Circle cx="18" cy="18" r="1.8" fill="#f59e0b" opacity="0.05" />
            <Circle cx="26" cy="19" r="1.5" fill="#f59e0b" opacity="0.05" />
            <Circle cx="22" cy="27" r="1.6" fill="#f59e0b" opacity="0.05" />
            <Circle cx="16" cy="25" r="1.2" fill="#f59e0b" opacity="0.04" />
            <Circle cx="27" cy="25" r="1.3" fill="#f59e0b" opacity="0.04" />

            {/* Galleta secundaria escalonada en diagonal */}
            <Circle
              cx="58"
              cy="58"
              r="12"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="3,2"
              opacity="0.035"
            />
            {/* Chispas de chocolate de la segunda galleta */}
            <Circle cx="55" cy="55" r="1.5" fill="#f59e0b" opacity="0.045" />
            <Circle cx="61" cy="56" r="1.4" fill="#f59e0b" opacity="0.045" />
            <Circle cx="58" cy="62" r="1.5" fill="#f59e0b" opacity="0.045" />

            {/* Galleta pequena adicional para romper la cuadricula */}
            <Circle
              cx="58"
              cy="16"
              r="8"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="2.5,1.5"
              opacity="0.025"
            />
            <Circle cx="56" cy="15" r="1" fill="#f59e0b" opacity="0.035" />
            <Circle cx="60" cy="17" r="0.9" fill="#f59e0b" opacity="0.035" />

            {/* Mini migajas / chispas esparcidas */}
            <Circle cx="20" cy="56" r="0.9" fill="#f59e0b" opacity="0.03" />
            <Circle cx="38" cy="38" r="1.1" fill="#f59e0b" opacity="0.03" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#cookiePattern)" />
      </Svg>
    </View>
  );
});
