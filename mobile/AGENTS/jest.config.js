/**
 * Component tests (Jest + React Native Testing Library). They run in Node with React Native mocked, so no phone or emulator is needed.
 *
 * The older plain-logic tests (`*.test.ts`) keep using Node's own runner (`npm test`); Jest only picks up `*.test.tsx`,
 * so the two never collide. Run the component tests with `npm run test:components`, everything with `npm run test:all`.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // npm keeps `expo-asset` inside expo's own node_modules, where Node's normal lookup from expo-font cannot see it; Metro finds it, Jest needs this hint.
  modulePaths: ['<rootDir>/node_modules/expo/node_modules'],
  // Reanimated 4 / Worklets: load their plain-JavaScript builds in Node instead of the native ones.
  resolver: 'react-native-reanimated/jest/resolver',
  clearMocks: true,
};
