// Web entry point — re-exports from the stub so react-native-maps is NEVER
// imported (and its native-only internals are never resolved) on web builds.
export { default, Marker } from './mocks/react-native-maps';
export type { Region } from './mocks/react-native-maps';
