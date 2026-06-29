# kuroji（黒字）

貸借対照表(BS)・損益計算書(PL) など**会計の仕組みとルールを学びながら会社を経営する**、ターン制の経営シミュレーションゲームです。
経営判断が財務諸表にどう反映されるかを体験し、会計恒等式や経営指標を理解しながら、黒字経営の戦略を磨くことを目的とします。

- 完全クライアントサイド（ブラウザ内で完結、データ送信なし）
- React 19 + TypeScript + Vite + Vitest
- 公開（予定）: `https://<user>.github.io/kuroji/`

> 学習用の簡略モデルであり、会計実務ツールや実在企業の財務再現ではありません。

## セットアップ

```bash
npm install
npm run dev        # http://localhost:5173
```

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（Vite） |
| `npm run test` | テスト（Vitest, 1回実行） |
| `npm run test:watch` | テスト（watch） |
| `npm run typecheck` | 型チェック（`tsc -b --noEmit`） |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run preview` | 本番ビルドのプレビュー |

## アーキテクチャ

| ディレクトリ | 役割 |
|---|---|
| `core/` | UI 非依存のゲーム/会計ドメイン層（純粋関数）。ターン解決・三表生成・指標計算 |
| `data/` | シナリオ別の初期条件・市況パラメータ・会計定数（出典コメント付き） |
| `app/` | React の UI。`core/` を呼ぶだけで計算は持たない |

開発規約は [`CLAUDE.md`](CLAUDE.md)、ロードマップは [`TODO.md`](TODO.md) を参照。

## デプロイ

`main` への push で GitHub Actions がテスト→ビルド→GitHub Pages へ自動デプロイします
（`.github/workflows/deploy.yml`）。本番ビルドのベースパスは `vite.config.ts` で `/kuroji/` に設定。
