# SmartMapper

SmartMapper automatically maps messy vendor/client spreadsheet columns onto a fixed target template. Upload a file with inconsistent headers (e.g. `Supplier Name`, `Mobile No.`, `GSTIN`, `Full Address`), and SmartMapper intelligently matches each column to your standard schema, normalizes the values, and exports a clean file ready to use.

## Features

- **Smart column matching** — matches arbitrary source headers to your target schema with a confidence score per match
- **Auto-derived fields** — extracts City, State, and Pincode from a single free-text Address column
- **Format normalization** — standardizes phone numbers, emails, and GST/GSTIN values
- **Guided 5-step workflow** — Template → Client File → AI Mapping → Preview → Export
- **CSV & Excel support** — import and export `.csv`, `.xlsx`, `.xls`

## Live Demo

Production (Vercel): https://smartmapper.vercel.app/

GitHub Pages mirror: https://labdhiongithub7.github.io/smartmapper/

Both deploy automatically from `main` (Pages via `.github/workflows/pages.yml`). The build uses a relative base path, so it works at a domain root and under `/smartmapper/`.

## Tech Stack

- React 19 + Vite
- Tailwind CSS v4
- TypeScript
- PapaParse (CSV) & SheetJS (Excel)

## Getting Started

```bash
git clone https://github.com/labdhiongithub7/smartmapper.git
cd smartmapper
pnpm install
pnpm dev
```

Build for production:

```bash
pnpm build
```
