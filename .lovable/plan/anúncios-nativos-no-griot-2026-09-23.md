# Anúncios nativos no GRIOT

## Resultado
Adicionar ao fim de cada segunda resposta concluída uma faixa de anúncio nativo Google AdMob, compacta e elegante como a referência, integrada no tema atual e sem alterar o restante desenho do GRIOT.

## Implementação
1. Integrar o SDK oficial Google Mobile Ads no Android e preparar o identificador da app e da unidade de anúncio através de configuração pública substituível.
2. Usar os IDs oficiais de teste da Google enquanto a conta AdMob do GRIOT ainda não existe. Nenhum anúncio falso será mostrado no navegador.
3. Criar uma vista nativa compacta com imagem, ícone, anunciante, título, descrição, botão e identificação visível “Anúncio”, mantendo os cliques e a divulgação sob controlo do SDK da Google.
4. Ligar a vista nativa à conversa: aparece apenas depois de uma resposta terminar, a cada 2 respostas das IAs, nunca durante o processamento e nunca por cima da barra de escrita.
5. Libertar anúncios quando saem do ecrã ou muda a conversa, evitar carregamentos duplicados e tratar ausência de anúncio sem deixar espaço vazio.
6. Integrar o consentimento oficial da Google para regiões onde é necessário e respeitar a decisão antes de pedir anúncios personalizados.
7. Validar compilação, conversa longa, mudança de conversa, modo Main/Quick, tema claro/escuro e tamanhos móveis.

## Para ativar receita real
Depois de criares o GRIOT no AdMob, serão necessários apenas os dois identificadores públicos fornecidos pela Google: ID da app e ID da unidade de anúncio nativo. Até lá, a app fica segura em modo de teste e não gera receita nem cliques inválidos.
