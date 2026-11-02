# Motor Paramétrico de Caixilharias

Motor vetorial em TypeScript para gerar desenhos técnicos simplificados de caixilharias em SVG a partir de JSON.

## O que está incluído

- núcleo geométrico com `Rect`, `Point`, subdivisão e espelhamento
- registry de tipologias
- renderização SVG modular
- saída DXF para uso em AutoCAD
- tipologias obrigatórias da v1
- exemplos JSON
- demo HTML simples
- testes básicos
- integração com o configurador existente

## Estrutura

```text
src/
  core/
  models/
  render/
  symbols/
  engine/
  examples/
  tests/
public/
  joinery-engine/   <- saída compilada
  joinery-demo/
```

## Instalação

```bash
npm install
```

## Build

```bash
npm run build:joinery
```

## Testes

```bash
npm run test:joinery
```

## API principal

```ts
import { renderJoinery, renderJoineryDxf } from './public/joinery-engine/index.js'

const svg = renderJoinery({
  width: 1800,
  height: 1200,
  frame: 40,
  layout: {
    rows: [1200],
    cols: [600, 600, 600]
  },
  cells: [
    { row: 0, col: 0, type: 'fixed' },
    { row: 0, col: 1, type: 'casement_left' },
    { row: 0, col: 2, type: 'sliding_2' }
  ]
})

const dxf = renderJoineryDxf({
  width: 1000,
  height: 2200,
  layout: { rows: [2200], cols: [1000] },
  cells: [{ row: 0, col: 0, type: 'casement_right' }]
})
```

## Tipologias suportadas

- `fixed`
- `casement_left`
- `casement_right`
- `double_casement`
- `sliding_2`
- `sliding_3`
- `tilt_turn_left`
- `tilt_turn_right`
- `awning`
- `hopper`
- `pivot_vertical`

## Demo

Depois do build:

```text
http://localhost:3002/joinery-demo/index.html
```

## DXF no configurador

O configurador mantém preview em SVG para visualização imediata no browser, mas também pode gerar DXF a partir da mesma geometria paramétrica:

```text
POST /api/configurador/dxf
```

O painel lateral já expõe um botão para descarregar o DXF do desenho atual.

## Limitações atuais

- sem exportação DXF/PDF nesta v1
- ferragens ainda simplificadas
- trilhos e símbolos priorizam leitura de catálogo técnico, não detalhe de fabricante

## Próximos passos sugeridos

- adicionar montantes/travessas customizados
- suportar trilhos mais detalhados
- exportação PNG/PDF/DXF
- criar camada React/web component para embed
