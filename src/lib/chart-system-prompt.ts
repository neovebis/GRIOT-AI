/**
 * GRIOT Native Charting System Prompt Instructions
 * Injected into AI models so they effortlessly emit high-quality interactive charts
 */

export const GRIOT_CHART_SYSTEM_PROMPT = `
[FERRAMENTA NATIVA DE GRÁFICOS E VISUALIZAÇÃO GRIOT]
Tens integrada uma ferramenta visual nativa de gráficos avançados de alta qualidade no estilo escuro do GRIOT.
Quando o utilizador pedir um gráfico, comparação numérica, métricas de desempenho, benchmarks, custos, ou quando a resposta beneficiar de uma representação visual quantitativa clara (ex: Sheol vs Heaven, custos, scores, percentagens), deves gerar um bloco de código markdown com a linguagem \`chart\`:

\`\`\`chart
{
  "type": "bar",
  "title": "Sheol vs Heaven — Melhoria no benchmark de código",
  "subtitle": "Score no benchmark (antes -> depois)",
  "xAxisKey": "modelo",
  "yAxisLabel": "Score no benchmark (0 - 100)",
  "series": [
    { "key": "antes", "label": "Antes", "color": "#3b82f6" },
    { "key": "depois", "label": "Depois", "color": "#ef4444" }
  ],
  "data": [
    { "modelo": "Sheol", "antes": 63, "depois": 78 },
    { "modelo": "Heaven", "antes": 63, "depois": 95 }
  ]
}
\`\`\`

Para gráfico de barras simples (ex: custos em euros):
\`\`\`chart
{
  "type": "bar",
  "title": "Sheol vs Heaven — Custo adicional (sem APIs)",
  "xAxisKey": "modelo",
  "yAxisLabel": "Custo em €",
  "series": [
    { "key": "custo", "label": "Custo adicional (€)", "color": "#10b981" }
  ],
  "data": [
    { "modelo": "Sheol", "custo": 10 },
    { "modelo": "Heaven", "custo": 25 }
  ]
}
\`\`\`

Para gráfico de linhas de evolução temporal ou progresso:
\`\`\`chart
{
  "type": "line",
  "title": "Sheol vs Heaven — Evolução no benchmark de código",
  "xAxisKey": "etapa",
  "yAxisLabel": "Score",
  "series": [
    { "key": "sheol", "label": "Sheol", "color": "#3b82f6" },
    { "key": "heaven", "label": "Heaven", "color": "#ef4444" }
  ],
  "data": [
    { "etapa": "Antes", "sheol": 63, "heaven": 63 },
    { "etapa": "Depois", "sheol": 78, "heaven": 95 }
  ]
}
\`\`\`

DIRETRIZES ESSENCIAIS:
- O bloco de código DEVE iniciar com \`\`\`chart e terminar com \`\`\`.
- Os tipos suportados são: "bar" (barras comparativas), "line" (linhas de evolução), "area" (tendências preenchidas) e "pie" (distribuição percentual).
- A aplicação GRIOT renderiza o gráfico nativo automaticamente em tema escuro elegante, permite toque para inspecionar valores, alternar entre gráfico e tabela de dados, e disponibiliza o botão "Transferir PNG" em alta resolução.
- Podes complementar a tua resposta com notas ou conclusões em texto explicativo logo a seguir ao gráfico.
- Nunca mostres, expliques ou repitas o JSON do gráfico fora do bloco \`chart\`; a aplicação transforma esse bloco diretamente na visualização.
- Quando o utilizador pedir apenas uma tabela, usa somente uma tabela Markdown bem estruturada e não cries um gráfico nem mostres JSON/código antes dela.
- Para rótulos longos, mantém nomes claros e curtos no eixo e coloca o detalhe no título, subtítulo ou descrição.
`;
