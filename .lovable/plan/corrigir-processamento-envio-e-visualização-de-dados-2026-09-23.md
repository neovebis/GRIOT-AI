# Corrigir processamento, envio e visualização de dados

## Objetivo
Manter o desenho atual do GRIOT, corrigindo apenas o comportamento: mostrar comentários úteis durante o processamento, enviar mensagens imediatamente, usar Enter para criar parágrafos e apresentar somente o resultado visual de gráficos e tabelas.

## Alterações

### 1. Barra de processamento
- Manter a barra e os estados atuais (`A pensar`, leitura, pesquisa, comandos e escrita).
- Fazer os comentários de progresso recebidos do motor aparecerem dentro da área expansível já existente.
- Separar comentários legíveis de estados técnicos, evitando duplicações e atualizando o comentário em tempo real.
- Mostrar ações reais, como ficheiro lido, pesquisa feita, comando executado e resultado/erro da ação.
- Guardar esses comentários com a resposta para continuarem disponíveis ao reabrir a conversa.
- Não expor raciocínio interno privado; mostrar apenas resumos/comentários de progresso emitidos para a interface.

### 2. Envio e teclado
- Fazer o toque no botão enviar publicar a mensagem imediatamente, sem depender de o teclado desaparecer primeiro.
- Usar `Enter` para criar uma nova linha/parágrafo; o envio fica no botão dedicado.
- Impedir envios duplicados enquanto as validações iniciais ainda decorrem.
- Limpar corretamente o texto e a altura do campo após enviar, mantendo o foco e o teclado estáveis quando apropriado.
- Garantir feedback imediato no botão e preservar a mensagem se uma validação impedir o envio.

### 3. Gráficos
- Manter o cartão e os controlos atuais, refinando todos os tipos existentes: barras, linhas, áreas, circular e donut.
- Melhorar escalas, valores negativos, números grandes, rótulos longos, legendas, tooltips, margens e leitura em ecrãs pequenos.
- Tornar gráficos com muitas categorias navegáveis sem esmagar os dados.
- Melhorar contraste e distinção entre séries, preservando a identidade visual do GRIOT.
- Manter alternância gráfico/tabela e exportação, tornando ambas mais robustas.

### 4. Tabelas e ocultação do código gerador
- Reconhecer corretamente blocos de dados destinados a gráficos e tabelas.
- Nunca mostrar ao utilizador o JSON/código usado para gerar uma visualização válida.
- Quando o pedido for uma tabela, apresentar apenas uma tabela formatada, sem gráfico nem bloco de código antes dela.
- Melhorar cabeçalhos, alinhamento numérico, linhas extensas, rolagem horizontal e leitura móvel.
- Se os dados forem inválidos, mostrar um erro curto e seguro, sem revelar o JSON bruto.

## Validação
- Testar envio pelo botão com teclado aberto e confirmar que a mensagem aparece no primeiro toque.
- Confirmar que `Enter` cria parágrafos e não envia.
- Testar comentários de processamento, comandos, sucesso e erro na barra.
- Testar barras, linhas, áreas, circular, donut e tabelas com dados pequenos, extensos, negativos e rótulos longos.
- Confirmar que nenhum JSON/código gerador aparece antes das visualizações.
- Verificar em ecrã móvel e desktop, sem mudanças no desenho geral.
