---
name: taxgroup-funil
description: Tax Group — gera em PDF (padrão da marca) o funil de vendas do CRM, registra capturas de contatos em feiras/eventos enviadas pelo WhatsApp (texto, foto de crachá/cartão ou áudio) com ranking dos vendedores, e gera o mapa de leads em cards. Use para pedidos de funil, pipeline, feira, evento, captura de lead, ranking, minha lista ou mapa de leads.
metadata: {"openclaw": {"emoji": "📊", "requires": {"bins": ["python3"]}}}
---

# Tax Group · Funil, Feiras e Mapa de Leads

Toda a lógica está na CLI `python3 {baseDir}/cli.py`. Ela sempre responde **JSON** em stdout:
`{"ok": true, ...}` ou `{"ok": false, "erro": "..."}`. Nunca invente números: use só o que o JSON devolver.
Quando o JSON trouxer `"arquivo"` (um PDF), **envie o PDF como anexo** na mesma conversa (ferramenta de mensagem
do OpenClaw com o caminho do arquivo em `media`/`filePath`), com uma legenda curta.

`--remetente` é sempre o número de WhatsApp de quem escreveu (formato E.164, ex. `+5551999990002`). Ele define
quem é o vendedor e se a pessoa é gestor. Nunca use o número de outra pessoa.

## 1. Funil de vendas (CRM) — `/funil`

Quando pedirem "funil", "pipeline", "como está o funil do evento X":

```
python3 {baseDir}/cli.py funil [--pipeline "Nome ou id"] [--dias 90 | --inicio 2026-09-01 --fim 2026-10-31] [--titulo "Tax Summit 2026"] [--subtitulo "..."] [--tipo Evento|Negócios]
```
- Sem `--pipeline`, usa o pipeline padrão do config. Se a pessoa não souber o nome, rode `python3 {baseDir}/cli.py pipelines` e ofereça as opções.
- O PDF tem a página 1 (funil one page) e, a partir da página 2, todas as empresas por etapa, com cores por etapa.
- Responda com 2–3 linhas do `resumo` (conversão total, gargalo, receita fechada) + o PDF.

## 2. Captação em feiras — `/feira`

### 2.1 Abrir / encerrar a feira (gestor)
```
python3 {baseDir}/cli.py feira evento criar --nome "Expo Tributos 2026" --local "Porto Alegre/RS" --inicio 2026-11-10 --fim 2026-11-12 [--pipeline "Eventos 2026"]
python3 {baseDir}/cli.py feira evento listar | ativar --evento <id|nome> | encerrar
```
Só existe uma feira ativa por vez; as capturas vão para ela.

### 2.2 Registrar uma captura
Mensagens como "captura: João Pereira, CFO da Metalúrgica Alfa, 51 99812-4821, joao@metalfa.com.br, reforma
tributária, quente, reunião 28/10 10h, autorizou contato" — ou uma **foto de crachá/cartão** (leia os dados da
imagem) — ou um **áudio** (use a transcrição). Extraia os campos e chame:

```
python3 {baseDir}/cli.py feira capturar --remetente "<whatsapp>" --dados '<JSON>'
```
Campos do JSON (omita o que não foi dito; não invente):
`nome`, `cargo`, `empresa`, `telefone`, `email`, `site`, `interesse`, `temperatura` (quente|morno|frio),
`reuniao` (ex. "28/10 10h"), `origem` (texto|cracha|cartao|audio), `observacao`, `consentimento` (true se a pessoa
autorizou ser contatada).

Responda no formato (adapte, seja curto):
```
✅ Captura #<captura> registrada
👤 <nome> · <cargo>
🏢 <empresa>
📞 <telefone>  ✉️ <email>
🎯 <interesse> · <🔴 Quente | 🟡 Morno | ⚪ Frio>
📅 Reunião <reuniao>            (se houver)
📊 Você: <capturas> capturas · <posicao>º lugar (<pontos> pts)
```
- Se `status` = "pendente": pergunte **só** o que está em `pendencias` (ex. "Faltou telefone ou e-mail. Pode mandar?").
  Quando responderem, use `feira corrigir` (abaixo) com a mesma captura.
- Se `duplicado` = true: avise que o contato já tinha sido captado (use `mensagem_dica`).
- Se `mesma_empresa` não estiver vazio: avise quem já falou com alguém da empresa e quando.
- Se `crm` = "erro": diga que a captura está salva e será reenviada ao CRM depois (não é falha do vendedor).
- Se `pontos_para_subir` vier preenchido, incentive: "Faltam N pts para passar o próximo. Reunião vale +5!".
- Foto/áudio: antes de gravar, se algum dado lido estiver duvidoso, confirme com a pessoa ("Confirma? sim / corrigir").

### 2.3 Corrigir ou excluir
"corrige: é diretor financeiro", "na #27 o e-mail é ...":
```
python3 {baseDir}/cli.py feira corrigir --remetente "<whatsapp>" --captura 27 --dados '{"cargo": "Dir. Financeiro"}'
python3 {baseDir}/cli.py feira excluir  --remetente "<whatsapp>" --captura 27
```
Sem número explícito, use a última captura daquela pessoa nesta conversa.

### 2.4 Ranking, listas e relatório
- "/ranking", "como está o ranking": `python3 {baseDir}/cli.py feira ranking` → mostre 🥇🥈🥉, depois 4º em diante, marque "👈 você" na linha de quem perguntou e diga quantos pontos faltam para subir.
- "/minhalista", "minhas capturas": `python3 {baseDir}/cli.py feira minhalista --remetente "<whatsapp>"` → envie o PDF.
  Gestor pode pedir de outro vendedor: acrescente `--vendedor "Nome"`.
- "/relatorio feira" (só gestor): `python3 {baseDir}/cli.py feira relatorio --remetente "<whatsapp>"` → PDF com dashboard + ranking (pág. 1) e lista de cada vendedor (pág. 2+).
- "/sincronizar" (gestor): reenvia ao CRM capturas pendentes ou com erro: `python3 {baseDir}/cli.py feira sincronizar`.
- "/exportar" (gestor): CSV das capturas: `python3 {baseDir}/cli.py feira exportar --remetente "<whatsapp>"`.

Se a CLI responder erro de permissão, repasse a mensagem com educação; não tente contornar.

## 3. Mapa de leads — `/mapa`

Cards com logo da empresa, contato, telefone, e-mail, interesse, reunião e vendedor.
```
python3 {baseDir}/cli.py mapa [--fonte feira|crm] [--cards 20|16] [--vendedor "Bruno"] [--temperatura quente] [--etapa "Proposta"] [--evento ...] [--pipeline ...]
```
- Padrão: fonte = feira ativa, 20 cards por página. "/mapa quentes" → `--temperatura quente`; "/mapa Bruno" → `--vendedor Bruno`; "/mapa do funil" → `--fonte crm`.
- Na feira, a cor do card é a temperatura; no CRM, é a etapa do funil.

## Regras gerais
- Dados de contato são pessoais (LGPD): não repita listas de contatos no chat; mande o PDF.
- Relatórios completos e exportações só para gestores (a CLI valida).
- Se `layout_ok` vier false, envie o PDF mesmo assim e avise o gestor que alguma página pode ter texto cortado.
- Erros de configuração (token, pipeline): repasse o texto de `erro` e sugira rodar `python3 {baseDir}/cli.py verificar`.
