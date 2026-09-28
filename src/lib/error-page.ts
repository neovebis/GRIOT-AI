export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <title>GRIOT Mobile</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #060608; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
      .card { max-width: 22rem; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
      h1 { font-size: 1.25rem; font-weight: 600; margin: 0; letter-spacing: -0.02em; }
      p { color: rgba(255, 255, 255, 0.5); font-size: 0.875rem; margin: 0 0 1rem; line-height: 1.5; }
      .actions { display: flex; flex-direction: column; width: 100%; gap: 0.5rem; }
      button, a { padding: 0.75rem 1.5rem; border-radius: 1rem; font: inherit; font-size: 0.9rem; cursor: pointer; text-decoration: none; border: none; text-align: center; }
      .primary { background: #fff; color: #000; font-weight: 600; }
      .secondary { background: rgba(255, 255, 255, 0.06); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Algo correu mal</h1>
      <p>Não foi possível carregar o ecossistema.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Tentar novamente</button>
        <a class="secondary" href="/home">Voltar ao Início</a>
      </div>
    </div>
  </body>
</html>`;
}
