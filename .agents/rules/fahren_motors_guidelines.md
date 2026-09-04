# Diretrizes de Desenvolvimento WMS (Fahren Motors)

## 1. Regra de Ouro do Escopo (Não quebre o que funciona)
- **NÃO refatore** ou altere código não relacionado ao pedido explícito do usuário.
- Se o usuário pedir para consertar "apenas X", mude apenas X. Não altere o layout global nem a estrutura a menos que instruído, para não correr o risco de quebrar designs ou funcionalidades preexistentes (como a logo da empresa).

## 2. Experiência de Usuário e Performance ("Liso e Sem Bugs")
- **Zero Flicker**: Use CSS e atributos de dados no HTML inicial (ex: `data-active-tab`) para que o layout surja correto desde o primeiro frame, antes da execução completa do JS. Evite usar apenas `classList.add` atrasado via JS se isso causar *flash* de conteúdo errado.
- **Renderização Otimista (Instantânea)**: Sempre que fizer *fetch* de dados em tela inicial (ex: no F5), carregue ANTES um cache salvo no `localStorage` para que a tela não fique "vazia". O fetch no background deve apenas atualizar o cache silenciosamente.
- **Feedback Visual Claro**: Ações interativas (como cópia para área de transferência) DEVEM ter micro-interações imediatas (ex: ícone mudando temporariamente para um check verde) e notificações Toast elegantes.

## 3. Otimização de Javascript e DOM
- **Nunca use `localStorage` (getItem/setItem) ou `JSON.parse`/`stringify` dentro de loops densos.** Acesse e processe os dados em variáveis de memória e salve/leia no `localStorage` apenas uma vez (antes ou depois do loop) para evitar travamentos da Main Thread.
- **Transições Diretas**: Animações de UI, como fade-ins nas abas principais, só devem existir se não causarem percepção de "lentidão" (delay). Caso o usuário exija carregamento "liso", remova os delays visuais em favor de transições de display instantâneas.
