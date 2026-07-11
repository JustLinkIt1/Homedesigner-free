// Flat ESLint config: pragmatic rules for an existing codebase — catch real
// bugs (hooks misuse, unused code, sloppy equality) without fighting style.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'android/**', 'node_modules/**', 'tools/**', 'scripts/**', 'tests/**', '*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React-Compiler-era strictness disabled: react-three-fiber's core idiom
      // is mutating three.js objects (camera/materials) inside useFrame, and
      // this codebase intentionally seeds state from effects in a few places.
      // The classic rules-of-hooks + exhaustive-deps stay on.
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The three.js/r3f layer leans on `any` for renderer internals.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
