# MAQUINÁRIO — hub de minijogos

## Como abrir

Não precisa de servidor nem de build: dê duplo clique em `index.html` e o
navegador abre o hub. As bibliotecas (`three.min.js`, `OrbitControls.js`)
já estão na pasta `vendor/`, então funciona até sem internet.

Se preferir hospedar (ex.: GitHub Pages, como no seu projeto do Hollow
Knight), basta subir a pasta inteira — é tudo estático.

## Estrutura

```
index.html          → página inicial (hub)
style.css            → tokens visuais compartilhados (cores, fontes) — COMENTADO
vendor/              → three.js + OrbitControls, usados pelo RÉPLICA
games/
  replica/
    index.html       → página do jogo
    game.css         → estilos do jogo — COMENTADO
    game.js          → lógica do jogo (cubo 3D, fases, pontuação) — COMENTADO
```

## Onde mexer nas cores

- **Cores da interface** (fundo, botões, textos, cores de feedback): topo
  de `style.css`, dentro de `:root { ... }`. Cada variável tem um
  comentário explicando o que ela controla.
- **Cor dos blocos do cubo 3D**: não fica no CSS (o cubo é desenhado em
  WebGL). Está em `games/replica/game.js`, logo no topo, na constante
  `COLOR_WOOD`. As cores de feedback do cubo (acerto/aviso/erro) também
  estão ali perto, em `COLOR_SUCCESS`, `COLOR_WARN` e `COLOR_DANGER`.
- **Fontes**: variáveis `--font-display` e `--font-body` em `style.css`.

## O jogo: RÉPLICA

Inspirado no minijogo de cubo do Machine Party.

1. O cubo aparece completo, depois algumas peças somem — esse é o padrão a
   memorizar. Elas simplesmente desaparecem, sem deixar contorno no lugar.
   Um anel no canto do palco marca o tempo de memorização, que diminui a
   cada nível.
2. O cubo volta a ficar completo. Toque nas peças certas para removê-las
   (também sem deixar contorno) e confirme.
3. Errou o caminho? O botão **Redefinir** desfaz tudo o que você já
   removeu na rodada, sem contar como erro — só confirmar é que vale.
4. Acertar em cheio avança de nível e soma pontos; errar custa uma vida
   (são 3). Nesse caso o jogo destaca por um instante o que faltou tirar
   (âmbar), o que foi tirado à toa (vermelho) e o que estava certo
   (verde), antes de continuar.
5. **Níveis 1 a 3:** o cubo fica parado (sem rotação) e as peças que somem
   são sempre as que já estão visíveis no ângulo inicial — não precisa
   girar para encontrá-las.
6. **A partir do nível 4:** o cubo volta a girar livremente e qualquer
   peça, inclusive nas faces escondidas, pode fazer parte do padrão.
7. Do nível 8 em diante o cubo cresce de 3×3×3 para 4×4×4.

## Estilo visual

Paleta quente (papel/madeira), sem elementos futuristas: fontes
arredondadas (Baloo 2 + Nunito Sans), todos os blocos num único tom bege
claro, cantos arredondados e sombras suaves em vez de brilho neon.

## Adicionando o próximo minijogo

Cada jogo mora em `games/<nome-do-jogo>/`, com seu próprio `index.html`
(referenciando `../../style.css` para herdar os tokens visuais). Depois é
só trocar um dos cards com `class="module-card locked"` no `index.html`
do hub por um `<a class="module-card active" href="games/<nome>/index.html">`,
seguindo o mesmo formato do card do RÉPLICA.
