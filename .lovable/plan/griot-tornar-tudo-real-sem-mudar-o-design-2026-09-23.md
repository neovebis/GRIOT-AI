# GRIOT — tornar tudo real (sem mudar o design)

O pedido junta oito temas. Abaixo o que faço em cada um. O aspeto visual mantém-se; só acrescento comportamento.

## 1. Sandbox — confirmar ligação real
Faço um teste autenticado de ponta a ponta: arrancar o contentor do projeto, enviar um comando simples e ler o resultado devolvido. Depois digo claramente se envia e recebe comandos a sério, ou exatamente onde falha. Nada é alterado antes de eu mostrar o resultado.

## 2. Ficheiros ficam na barra de escrita (até 6)
Hoje, ao escolher um ficheiro, ele é enviado de imediato.
Passa a: o ficheiro fica em espera junto à caixa de texto, podes juntar mais (máximo 6), escrever texto e enviar tudo de uma vez. Cada ficheiro pode ser removido antes de enviar. Ao tentar passar dos 6 aparece um aviso curto.

## 3. Reações das IAs no Quick
No Quick (sala de deliberação), as IAs passam a poder reagir às mensagens umas das outras e às tuas com emojis reais, mostrados junto à mensagem. O utilizador não reage — é só leitura. Fora do Quick nada muda.

## 4. Voz estável (ler em voz alta e voz nos projetos)
Hoje a voz pode mudar entre falas porque é escolhida de novo a cada vez.
Passa a: a voz é escolhida uma vez, guardada, e reutilizada sempre — na leitura em voz alta e na conversa por voz. Preferência pela melhor voz disponível no telemóvel (Google/nativa) para o idioma em uso, com escolha manual nas definições a continuar a mandar.

## 5. Projetos: tarefas mesmo a funcionar
- A tarefa autónoma e a tarefa rápida passam a correr de verdade no servidor, com registo de estado, e continuam mesmo que feches o app.
- Os PRs mostram PRs reais do repositório ligado; sem ligação, aparece um convite a ligar em vez de lista vazia inventada.
- Os Logs mostram registos reais de execução.
- O botão de conversa deixa de abrir uma conversa ao acaso: abre a conversa do projeto, e se não existir ligação pede para ligar.

## 6. OPB sempre disponível à IA
A IA passa a saber, em todas as conversas, que pode consultar o OPB para recuperar contexto ou confirmar algo que lhe escapou, e passa a ter a forma de o fazer durante a resposta.

## 7. Notificações reais
Quando a resposta termina ou uma tarefa acaba, chega notificação ao telemóvel — mas só se não estiveres dentro do app nesse momento. Tocar na notificação abre a conversa ou a tarefa certa.

## Notas técnicas
- Anexos: fila de anexos no estado do compositor do chat, limite 6, enviados junto com a mensagem no mesmo fluxo atual.
- Quick: reações guardadas no estado da sala de deliberação e mostradas no balão; emissão só por participantes IA.
- TTS: seleção de voz resolvida uma vez e guardada nas definições locais, partilhada por `message-actions` e `voice-session`.
- Tarefas de projeto: execução no backend com estado persistido; o cliente passa a ler estado em vez de correr no browser.
- Notificações: usa o canal nativo já existente, disparado só com o app em segundo plano.
- Backend: alguns pontos (tarefas persistentes, PRs, logs, OPB) exigem mexer em funções do servidor. Peço confirmação antes de tocar no backend, conforme a tua regra.
