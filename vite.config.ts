import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages（プロジェクトページ）配信のため、本番ビルドは
// リポジトリ名をベースパスにする。dev/preview はルート配信のまま。
//   公開URL: https://<user>.github.io/kuroji/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/kuroji/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
      '@data': fileURLToPath(new URL('./data', import.meta.url)),
    },
  },
  test: {
    // core/ は純粋関数なので node 環境。UI テストを足す時は per-file 上書き or 'jsdom' に変更。
    environment: 'node',
    globals: true,
    include: ['core/**/*.test.ts', 'app/**/*.test.{ts,tsx}'],
  },
}))
