# Briefing do Sistema: AI Look

O **AI Look** é uma aplicação web de consultoria de estilo pessoal baseada em Inteligência Artificial, com design editorial e foco em experiência do usuário premium.

## 1. Funcionalidades Principais

### 📸 Upload e Gerenciamento de Imagens
- **Foto Principal (Obrigatória)**: O usuário envia sua foto base (corpo inteiro recomendado).
    - *Recursos*: Drag & drop, visualização imediata, efeito de "scan" a laser, botão de remoção.
- **Foto de Referência (Opcional)**: O usuário pode enviar uma imagem de roupa ou estilo para inspirar a IA.
    - *Recursos*: Miniatura de visualização, indicação visual de status.

### ⚙️ Modos de Geração
O sistema oferece 4 modos de operação para guiar a IA:
1.  **Gerar Look**: Cria um novo visual baseado na foto do usuário.
2.  **Combinar Peça**: Tenta integrar a peça de referência ao look do usuário.
3.  **Editar Cor/Tecido**: Altera materiais ou paleta de cores mantendo a estrutura.
4.  **Criar do Zero**: Gera uma imagem totalmente nova sem base (requer prompt detalhado).

### 💬 Assistente de Estilo (Chat IA)
Um chat integrado na interface para interação conversacional.
- **Envio de Texto**: Perguntas sobre moda, dicas, etc.
- **Envio de Imagens**: O usuário pode enviar fotos no chat para análise.
- **Histórico**: Interface com rolagem interna e balões de mensagem estilizados.
- **Feedback**: Indicadores de "digitando" e mensagens de erro amigáveis.
- **Integração**: Conectado via Webhook (`/webhook/webchat`).

### 🎨 Geração de Resultados
- **Processamento**: Envia todos os dados (imagens, prompt, modo) para um Webhook principal (`/webhook/gbdigital`).
- **Visualização**: Exibe a imagem gerada em destaque na parte inferior.
- **Ações**:
    - **Download**: Botão para baixar a imagem gerada.
    - **Regenerar**: Botão para tentar novamente com os mesmos parâmetros.

## 2. Aspectos Técnicos e UX

- **Design System**: Estética "Editorial" com fontes *Playfair Display* (serifada) e *DM Sans* (moderna), cores sofisticadas (Preto, Terracota, Off-white).
- **Layout Responsivo**:
    - **Desktop**: Grid de 2 colunas (Ferramentas + Chat) com altura sincronizada.
    - **Mobile**: Layout empilhado otimizado para toque.
- **Feedback Visual**: Loaders personalizados ("Fashion Loader"), transições suaves, estados de hover e disabled.
- **Validações**: Impede geração sem foto principal (exceto no modo "do zero"), alerta sobre arquivos grandes ou mensagens vazias.
