/**
 * Web stub for react-native-maps.
 * The map view is native-only; on web the map tab falls back to list-only mode.
 */
import React from 'react';
import { View } from 'react-native';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const MapView = React.forwardRef((_props: any, _ref: any) => <View />);
MapView.displayName = 'MapView';

export const Marker = (_props: any) => null;

export default MapView;
