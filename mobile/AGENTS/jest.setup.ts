/**
 * Shared test setup: replaces the few native modules that cannot run in Node. Nothing here changes app behaviour;
 * each test still decides what the API, the store and the navigation do.
 */
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()) }));

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(() => Promise.resolve(null)), setItemAsync: jest.fn(() => Promise.resolve()), deleteItemAsync: jest.fn(() => Promise.resolve()) }));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context/jest/mock').default;
  return actual;
});



// Gesture Handler has no native side in Node. Gestures are recorded but never fire; components still render their children.
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual('react-native');
  const gesture = (): Record<string, unknown> => new Proxy({}, { get: () => () => gesture() });
  return { Gesture: { Pan: gesture, Tap: gesture, Pinch: gesture, LongPress: gesture }, GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: View };
});
