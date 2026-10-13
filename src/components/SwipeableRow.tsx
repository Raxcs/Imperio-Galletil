/* eslint-disable react-hooks/refs, react-hooks/exhaustive-deps */
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Text,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { THEME } from '../theme';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  children,
  onDelete,
  deleteLabel = 'Eliminar',
  disabled = false,
  style,
}) => {
  const [translateX] = useState(() => new Animated.Value(0));
  const isOpenRef = useRef(false);

  const snapTo = (toValue: number, callback?: () => void) => {
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 4,
      speed: 16,
    }).start(() => {
      isOpenRef.current = toValue < -20;
      if (callback) callback();
    });
  };

  const triggerFullDelete = () => {
    Animated.timing(translateX, {
      toValue: -380,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onDelete();
      // Reset inmediato para cuando se recupere con Deshacer
      translateX.setValue(0);
      isOpenRef.current = false;
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (disabled) return false;
          // Solo capturar gestos horizontales claros para no interferir con el scroll vertical
          return Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
        },
        onPanResponderMove: (_, gesture) => {
          const offset = isOpenRef.current ? -76 : 0;
          const nextX = gesture.dx + offset;
          // Solo permitir deslizar hacia la izquierda
          if (nextX <= 0) {
            translateX.setValue(nextX);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const currentPos = gesture.dx + (isOpenRef.current ? -76 : 0);
          if (currentPos < -130) {
            // Deslizado rápido completo: eliminar directamente
            triggerFullDelete();
          } else if (currentPos < -40) {
            // Revelar botón de eliminar
            snapTo(-76);
          } else {
            // Cerrar
            snapTo(0);
          }
        },
        onPanResponderTerminate: () => {
          snapTo(0);
        },
      }),
    [disabled, translateX]
  );

  return (
    <View style={[styles.container, style]}>
      {/* Acción oculta en el fondo rojo al deslizar */}
      <View style={styles.actionBackground}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={triggerFullDelete}
          activeOpacity={0.8}
        >
          <Trash2 size={16} color="#ffffff" strokeWidth={2.4} />
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Contenido deslizable */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: THEME.radius.lg,
  },
  actionBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderRadius: THEME.radius.lg,
  },
  deleteButton: {
    width: 76,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  deleteText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  content: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.radius.lg,
  },
});
